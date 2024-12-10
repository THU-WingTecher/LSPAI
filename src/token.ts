import * as vscode from 'vscode';

interface DecodedToken {
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
            // not checked
            const start = editor.document.offsetAt(functionSymbol.range.start);
            const end = editor.document.offsetAt(functionSymbol.range.end);
            const filteredTokens = {
                resultId: alltokens.resultId,
                data: [] as number[],
            };

            for (let i = 0; i < alltokens.data.length; i += 5) {
                const tokenStart = editor.document.offsetAt(new vscode.Position(alltokens.data[i], alltokens.data[i + 1]));
                const tokenEnd = tokenStart + alltokens.data[i + 2];
                if (tokenStart >= start && tokenEnd <= end) {
                    filteredTokens.data.push(alltokens.data[i], alltokens.data[i + 1], alltokens.data[i + 2], alltokens.data[i + 3], alltokens.data[i + 4]);
                }
            }
            return decodeSemanticTokens(alltokens, tokensLegend);
        } else {
        vscode.window.showErrorMessage('Failed to get semantic tokens');
        }
    }

    return decodeSemanticTokens(tokens, tokensLegend);
}

function decodeSemanticTokens(encodedTokens: vscode.SemanticTokens, tokensLegend: vscode.SemanticTokensLegend): DecodedToken[] {
    const decodedTokens: DecodedToken[] = [];
    let currentLine = 0;
    let currentChar = 0;
    const data = encodedTokens.data;
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
