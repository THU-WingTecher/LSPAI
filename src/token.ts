import * as vscode from 'vscode';
import { getFunctionSymbol, isValidFunctionSymbol } from './utils';

export interface DecodedToken {
    id: string;
    word: string;
    line: number;
    startChar: number;
    length: number;
    type: string;
    modifiers: string[];
    definition: vscode.Location[];
}

export async function getDecodedTokens(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol): Promise<DecodedToken[]> {
    const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
        'vscode.provideDocumentRangeSemanticTokens',
        editor.document.uri,
        functionSymbol.range,
    );
    const tokensLegend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
        'vscode.provideDocumentRangeSemanticTokensLegend',
        editor.document.uri,
        functionSymbol.range,
    );
    if (!tokens) {
        const alltokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
            'vscode.provideDocumentSemanticTokens',
            editor.document.uri,
        );
        if (alltokens) {
            const start = editor.document.offsetAt(functionSymbol.range.start);
            const end = editor.document.offsetAt(functionSymbol.range.end);
            const filteredTokens = {
            resultId: alltokens.resultId,
            data: [] as number[],
            };
            let currentLine = 0;
            let currentChar = 0;
            let savedLine = 0;
            let savedChar = 0;
            for (let i = 0; i < alltokens.data.length; i += 5) {
                // Update position
                const deltaLine = alltokens.data[i];
                const deltaStart = alltokens.data[i + 1];
                const length = alltokens.data[i + 2];
                currentLine += deltaLine;
                currentChar = deltaLine > 0 ? deltaStart : currentChar + deltaStart;

                const tokenStart = editor.document.offsetAt(new vscode.Position(currentLine, currentChar));
                const tokenEnd = tokenStart + length;

                if (tokenStart < start) {
                    savedLine = currentLine;
                    savedChar = currentChar;
                } else if (tokenStart >= start && tokenEnd <= end) {
                    filteredTokens.data.push(alltokens.data[i], alltokens.data[i + 1], alltokens.data[i + 2], alltokens.data[i + 3], alltokens.data[i + 4]);
                } else { // tokenStart >= end
                    break;
                }

            }

            const tokensLegend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
                'vscode.provideDocumentSemanticTokensLegend',
                editor.document.uri,
            );
            return decodeSemanticTokens(filteredTokens.data, tokensLegend, savedLine, savedChar);
        } 
    } else { 
        return decodeSemanticTokens(Array.from(tokens.data), tokensLegend);
    }
    vscode.window.showErrorMessage('Failed to get semantic tokens');
    return [];
}

async function decodeSemanticTokens(data: number[], tokensLegend: vscode.SemanticTokensLegend, initialLine: number = 0, initialChar: number = 0): Promise<DecodedToken[]> {
    const decodedTokens: DecodedToken[] = [];
    let currentLine = initialLine;
    let currentChar = initialChar;
    for (let i = 0; i < data.length; i += 5) {
        const deltaLine = data[i];
        const deltaStart = data[i + 1];
        const length = data[i + 2];
        const tokenTypeIndex = data[i + 3];
        const tokenModifiersBitset = data[i + 4];

        // Update position
        currentLine += deltaLine;
        currentChar = deltaLine > 0 ? deltaStart : currentChar + deltaStart;

        // Decode token type
        const typeName = tokensLegend.tokenTypes[tokenTypeIndex];

        // Decode token modifiers using bit masking
        const modifiers: string[] = [];
        tokensLegend.tokenModifiers.forEach((modifier: string, index: number) => {
            if ((tokenModifiersBitset & (1 << index)) !== 0) {
                modifiers.push(modifier);
            }
        });

        // Append decoded token
        decodedTokens.push({
            id: `${currentLine}:${currentChar}`,
            word: "",
            line: currentLine,
            startChar: currentChar,
            length: length,
            type: typeName,
            modifiers: modifiers,
            definition: [],
        });
    }

    return decodedTokens;
}


// Decode the tokens
// const decodedTokens = decodeSemanticTokens(encodedTokens, tokensLegend);

// // Print the decoded tokens
// console.log(JSON.stringify(decodedTokens, null, 2));

export async function createSystemPromptWithDefUseMap(editor: vscode.TextEditor, tokens: DecodedToken[]): Promise<string[]> {
    const types = ["method", "function", "variable", "field", "parameter"];
    const filteredTokens = getTokensByTypes(filterTokens(tokens), types);

    let template: string[] = [];

    for (const token of filteredTokens) {
        // const line = getLineContextFromToken(editor, token);
        const sourceCode = await getSourceFromDefinition(token); // Await the asynchronous function
        if (!sourceCode) {
            throw new Error(`Source code not found for token: ${token.word}`);
        }
        template.push(`${token.word} from:\n${sourceCode}`);
    }

    return template;
}

function correctBrackets(line: string): string {
    const stack: { char: string, index: number }[] = [];
    const brackets: { [key: string]: string } = {
        '(': ')',
        '{': '}',
        '[': ']',
    };
    const toRemove: Set<number> = new Set();

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (brackets[char]) {
            stack.push({ char, index: i });
        } else if (Object.values(brackets).includes(char)) {
            if (stack.length === 0 || brackets[stack.pop()!.char] !== char) {
                toRemove.add(i);
            }
        }
    }

    while (stack.length > 0) {
        toRemove.add(stack.pop()!.index);
    }

    return line.split('').filter((_, i) => !toRemove.has(i)).join('');
}


function getLineContextFromToken(editor: vscode.TextEditor, token: DecodedToken): string {
    const document = editor.document;
    const position = new vscode.Position(token.line, token.startChar);
    const lineText = document.lineAt(position).text;
    return correctBrackets(lineText);
}


export async function getSourceFromDefinition(token: DecodedToken): Promise<string | null> {
    const definitions = token.definition;

    if (definitions && definitions.length > 0) {
        const definition = definitions[0];
        const definitionDocument = await vscode.workspace.openTextDocument(definition.uri); // Await the promise
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            definition.uri
        );
        const functionSymbol = getFunctionSymbol(symbols, definition.range.start);
		if (!functionSymbol) {
            console.log(`No overlapping symbol found for token: ${token.word}`);
        } else {
            const text = definitionDocument.getText(functionSymbol.range);
            return text;
            }
    } else {
        console.log(`No definition found for token: ${token.word}`);
    }

    return null;
}
// export function getTokensByContext(tokens: DecodedToken[], type: string): DecodedToken[] {
    
//     return tokens
//         .map(token => token.type === type ? token : null)
//         .filter((token): token is DecodedToken => token !== null);
// }

export function getTokensByType(tokens: DecodedToken[], type: string): DecodedToken[] {
    return tokens
        .map(token => token.type === type ? token : null)
        .filter((token): token is DecodedToken => token !== null);
}

export function getTokensByTypes(tokens: DecodedToken[], types: string[]): DecodedToken[] {
    return tokens
        .map(token => types.includes(token.type) ? token : null)
        .filter((token): token is DecodedToken => token !== null);
}
export function getTokensByWord(tokens: DecodedToken[], word: string): DecodedToken[] {
    return tokens
        .map(token => token.word === word ? token : null)
        .filter((token): token is DecodedToken => token !== null);
}

export function filterTokens(tokens: DecodedToken[]): DecodedToken[] {
    return tokens.filter(token => {
        const isValid = token.word !== null && token.word !== "" && token.definition.length > 0;
        if (!isValid) {
            console.log(`Filtered out token: ${JSON.stringify(token)}`);
        }
        return isValid;
    });
}