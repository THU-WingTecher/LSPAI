import * as vscode from 'vscode';
import { getAllSymbols, getFunctionSymbol, getSymbolWithNeighborBoundedRange, getSymbolDetail, getSymbolRange, getSymbolByLocation } from './symbol';
import { classifyTokenByUri, DpendenceAnalysisResult, getMethodOrFunctionsParamTokens, getReturnTokens, processAndGenerateHierarchy, retrieveDef, retrieveDefs } from './definition';
import { VscodeRequestManager } from './vscodeRequestManager';
import { DecodedToken } from './types';


export async function getDependentContext(
    document: vscode.TextDocument,
    tokens: DecodedToken[],
    functionSymbol: vscode.DocumentSymbol,
    summarizeContext: boolean = true // New parameter with default value
): Promise<DpendenceAnalysisResult> { 

    const processedTokenMap = await processTokenDefinitions(document, tokens, functionSymbol);
    const result = await processAndGenerateHierarchy(document, functionSymbol, processedTokenMap);
    // console.log('collectinfo::result', result);
    return result;
}


/**
 * Traverses the tokenMap to load definitions and handle tokens without definitions
 * @param tokenMap - Map containing tokens grouped by URI
 * @returns Processed tokens with their definitions
 */
export async function processTokenDefinitions(document: vscode.TextDocument, tokens: DecodedToken[], parentSymbol: vscode.DocumentSymbol | null = null): Promise<Map<string, DecodedToken[]>> {
    const tokenMap = await classifyTokenByUri(document, tokens, parentSymbol);
    // console.log('collectinfo::tokenMap', Array.from(tokenMap.values()).map(t => t.map(t => t.word)));
    // Use the summarizeContext parameter to determine whether to summarize or provide full context
    const processedTokenMap = await _processTokenDefinitions(tokenMap);
    return processedTokenMap;
}
/**
 * Traverses the tokenMap to load definitions and handle tokens without definitions
 * @param tokenMap - Map containing tokens grouped by URI
 * @returns Processed tokens with their definitions
 */

export async function _processTokenDefinitions(tokenMap: Map<string, DecodedToken[]>): Promise<Map<string, DecodedToken[]>> {
    const processedMap = new Map<string, DecodedToken[]>();
    
    // Iterate through each URI in the tokenMap
    for (const [uri, tokens] of tokenMap.entries()) {
        let symbols: vscode.DocumentSymbol[] = [];
        let childDoc: vscode.TextDocument;
        const validTokens: DecodedToken[] = [];
        symbols = await getAllSymbols(vscode.Uri.parse(uri));
        childDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
        for (const token of tokens) {
            console.log(`#### Getting symbol for token: ${token.word} in ${uri}`);
            if (!token.definition || token.definition.length === 0) {
                continue;
            }
            const {symbol: defSymbol, boundedRange} = await getSymbolWithNeighborBoundedRange(childDoc, token.definition[0].range, symbols);
            // const defSymbol = await getSymbolByLocation(childDoc, token.definition[0].range.start, symbols);
            try {
                // Try to open the document containing the token
                const document = childDoc;
                // const defSymbol = symbols.find(s => s.range.contains(new vscode.Position(token.line, token.startChar))) || null;
                if (defSymbol) {
                    // const boundedRange = getSymbolRange(defSymbol);
                    token.document = document;
                    token.defSymbol = defSymbol;
                    token.defSymbolRange = boundedRange;
                    console.log(`### definition context: ${document.getText(boundedRange!)}`);
                    // 1. Load its definition and code using getSymbolDetail
                    const symbolDetail = await getSymbolDetail(document, token.defSymbol!, true);
                    token.context = symbolDetail;
                    validTokens.push(token);
                } else {
                    console.log(`No symbol found for token: ${token.word} in ${uri}`);
                }
            } catch (error) {
                // Handle errors during processing
                console.error(`Error processing token ${token.word} in ${uri}:`, error);
                // 2. Log error and remove from data structure
                console.log(`Removing token due to error: ${token.word} in ${uri}`);
            }
        }
        
        // Only add to processed map if there are valid tokens
        if (validTokens.length > 0) {
            processedMap.set(uri, validTokens);
        }
    }
    
    console.log(`Processed ${processedMap.size} URIs with valid definitions`);
    return processedMap;
}

export function getTokensFromStr(str: string): string[] {
    const tokens: string[] = [];
    const lines = str.split('\n');
    
    // Simple regex to match identifiers, including common programming language tokens
    const tokenRegex = /[a-zA-Z_]\w*/g;
    
    lines.forEach((line, lineIndex) => {
        let match;
        while ((match = tokenRegex.exec(line)) !== null) {
            tokens.push(match[0]);
        }
    });
    
    return tokens;
}
export function countUniqueDefinitions(tokens: DecodedToken[]): number {
        // Create a Set to store unique definition URIs
    const uniqueDefinitions = new Set<string>();
    
    for (const token of tokens) {
        if (token.definition) {
            // For each definition in the token's definition array
            for (const def of token.definition) {
                // Use URI + range start position as unique identifier
                const uniqueKey = `${def.uri.toString()}:${def.range.start.line}:${def.range.start.character}`;
                uniqueDefinitions.add(uniqueKey);
            }
        }
    }
    
    return uniqueDefinitions.size;
}

export async function extractRangeTokensFromAllTokens(document: vscode.TextDocument, startPosition: vscode.Position, endPosition: vscode.Position): Promise<DecodedToken[]>  {

    const start = document.offsetAt(startPosition);
    const end = document.offsetAt(endPosition);
    const alltokens = await VscodeRequestManager.semanticTokens(document.uri);
    if (alltokens) {
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

            const tokenStart = document.offsetAt(new vscode.Position(currentLine, currentChar));
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

        const tokensLegend = await VscodeRequestManager.semanticTokensLegend(document.uri);
        return decodeSemanticTokens(document, filteredTokens.data, tokensLegend, savedLine, savedChar);
    }
    return [];
}

export async function getDecodedTokensFromRange(document: vscode.TextDocument, startPosition: vscode.Position, endPosition: vscode.Position): Promise<DecodedToken[]> {
    
    const tokens = await VscodeRequestManager.semanticTokensRange(document.uri, new vscode.Range(startPosition, endPosition));
    const tokensLegend = await VscodeRequestManager.semanticTokensLegendRange(document.uri, new vscode.Range(startPosition, endPosition));
    if (!tokens) {
        return await extractRangeTokensFromAllTokens(document, startPosition, endPosition);
    } else { 
        return decodeSemanticTokens(document, Array.from(tokens.data), tokensLegend);
    }
    vscode.window.showErrorMessage('Failed to get semantic tokens');
    return [];
}

export async function getDecodedTokensFromSymbol(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol): Promise<DecodedToken[]> {
    const allTokens = await extractRangeTokensFromAllTokens(document, functionSymbol.range.start, functionSymbol.range.end);
    // exclude the functionsymbol itself :
    const filteredTokens = allTokens.filter(token => token.word !== functionSymbol.name);
    return filteredTokens;
}

export async function getDecodedTokensFromLine(document: vscode.TextDocument, lineNumber: number): Promise<DecodedToken[]> {
    // Define the range for the entire line
    const line = document.lineAt(lineNumber);
    const range = new vscode.Range(line.range.start, line.range.end);
    const tokens = await VscodeRequestManager.semanticTokensRange(document.uri, range);
    const tokensLegend = await VscodeRequestManager.semanticTokensLegendRange(document.uri, range);
    if (!tokens) {
        return await extractRangeTokensFromAllTokens(document, range.start, range.end);
    } else { 
        return decodeSemanticTokens(document, Array.from(tokens.data), tokensLegend);
    }
    vscode.window.showErrorMessage('Failed to get semantic tokens');
    return [];
}

async function followSymbolDataFlowAndCollectDependency(AllTokens: DecodedToken[], targetToken: DecodedToken): Promise<DecodedToken[]> {
    // by traversing every token in function(AllTokens) and check if the token is in the same line as the targetToken
    // if it is, then add it to the collectedDependencies
    // if the token is a declaration, then add it to the collectedDependencies
    // return the collectedDependencies
    const collectedDependencies: DecodedToken[] = [];
    for (const token of AllTokens) {
        if (token.line === targetToken.line) {
            collectedDependencies.push(token);
        }
        if (token.modifiers && token.modifiers[0] === "declaration") {
            collectedDependencies.push(token);
        }
    }
    return collectedDependencies;
}

async function distilateTokens(document: vscode.TextDocument, decodedTokens: DecodedToken[], functionSymbol: vscode.DocumentSymbol): Promise<DecodedToken[]> {
    const [methodOrFunctionParamTokens, returnTokens] = await Promise.all([
        getMethodOrFunctionsParamTokens(document, decodedTokens, functionSymbol),
        getReturnTokens(document, decodedTokens, functionSymbol)
    ]);

    // Combine the token arrays
    const combinedTokens = [...methodOrFunctionParamTokens, ...returnTokens];

    // Remove duplicate tokens based on a unique key (e.g., word, line, startChar)
    const uniqueTokensMap = new Map<string, DecodedToken>();
    for (const token of combinedTokens) {
        if (!uniqueTokensMap.has(token.id)) {
            uniqueTokensMap.set(token.id, token);
        }
    }
    const uniqueTokens = Array.from(uniqueTokensMap.values());
    const dependenciesArrays = await Promise.all(uniqueTokens.map(token => 
        followSymbolDataFlowAndCollectDependency(decodedTokens, token) 
    ));
    // console.log('collectinfo::dependenciesArrays', dependenciesArrays);
    // Flatten the array of dependencies
    const dependenciesArray = dependenciesArrays.flat();

    const uniqueDependenciesMap = new Map<string, DecodedToken>();
    // console.log('collectinfo::DefUseMap', DefUseMap);
    for (const token of dependenciesArray) {
        if (!uniqueDependenciesMap.has(token.id)) {
            uniqueDependenciesMap.set(token.id, token);
        }
    }
    // Classify tokens by URI and generate the hierarchy
    const uniqueDependencies = Array.from(uniqueDependenciesMap.values());
    return uniqueDependencies;
}

export async function extractUseDefInfo(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol): Promise<DecodedToken[]>  {
    const decodedTokens = await getDecodedTokensFromSymbol(document, functionSymbol);
    const distilatedTokens = await distilateTokens(document, decodedTokens, functionSymbol);
	return retrieveDefs(document, distilatedTokens);
}

async function decodeSemanticTokens(document: vscode.TextDocument, data: number[], tokensLegend: vscode.SemanticTokensLegend, initialLine: number = 0, initialChar: number = 0): Promise<DecodedToken[]> {
    const decodedTokens: DecodedToken[] = [];
    let currentLine = initialLine;
    let currentChar = initialChar;
        for (let i = 0; i < data.length; i += 5) {
            try {
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
                    word: document.getText(new vscode.Range(currentLine, currentChar, currentLine, currentChar + length)),
                    line: currentLine,
                    startChar: currentChar,
                    length: length,
                    type: typeName,
                    modifiers: modifiers,
                    definition: [],
                    context: "",
                    document: document,
                    defSymbol: null,
                    defSymbolRange: null,
                });
                } catch (error) {
                console.error('Error decoding token type:', error);
                }
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

export async function getSourceFromDefinition(token: DecodedToken): Promise<string | null> {
    const definitions = token.definition;

    if (definitions && definitions.length > 0) {
        const definition = definitions[0];
        const definitionDocument = await vscode.workspace.openTextDocument(definition.uri); // Await the promise
        const symbols = await VscodeRequestManager.documentSymbols(definition.uri);
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

export async function loadDefAndSaveToDefSymbol(token: DecodedToken) {
    if (!token.definition || token.definition.length === 0) {
        await retrieveDef(token.document, token);
    }
    
    if (token.definition && token.definition[0] && token.definition[0].range && token.definition.length > 0) {
        const defSymbolDoc = await vscode.workspace.openTextDocument(token.definition[0].uri);
        token.defSymbol = await getSymbolByLocation(defSymbolDoc, token.definition[0].range.start);
    }
}
