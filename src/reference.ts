import * as vscode from 'vscode';
import { getAllSymbols, removeComments } from './utils';
import { DecodedToken } from './token';

function getShortestSymbol(symbols: vscode.DocumentSymbol[], range: vscode.Range): vscode.DocumentSymbol | null {
    let shortestSymbol: vscode.DocumentSymbol | null = null;
    for (const symbol of symbols) {
        if (symbol.range.contains(range)) {
            if (!shortestSymbol || (symbol.range.end.line - symbol.range.start.line) < (shortestSymbol.range.end.line - shortestSymbol.range.start.line)) {
                shortestSymbol = symbol;
            }
        }
    }
    return shortestSymbol;
}

export async function getReferenceInfo(document: vscode.TextDocument, range: vscode.Range, refWindow: number = 60): Promise<string> {
    const position = range.start;
    const refes = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        document.uri,
        position,
    );
    console.log('References:', refes);

    const referenceCodes: string[] = [];
    for (const ref of refes) {
        const refDocument = await vscode.workspace.openTextDocument(ref.uri);
        const symbols = await getAllSymbols(ref.uri);
        const shortestSymbol = getShortestSymbol(symbols, ref.range);

        if (shortestSymbol) {
            if (ref.uri.toString() === document.uri.toString() && shortestSymbol.range.start.isBeforeOrEqual(position) && shortestSymbol.range.end.isAfterOrEqual(position)) {
                continue; // Skip the reference at the same position and URI
            }
            const refText = removeComments(refDocument.getText(shortestSymbol.range)).trim();
            const refTextLines = refText.split('\n').length;
            const currentTotalLines = referenceCodes.reduce((acc, code) => acc + code.split('\n').length, 0);
            if (currentTotalLines + refTextLines <= refWindow) {
                referenceCodes.push(refText);
            } else {
                break;
            }
        }
    }
    console.log('Reference Codes:', referenceCodes.join('\n'));
    return referenceCodes.join('\n');
}

export async function getSymbolUsageInfo(document: vscode.TextDocument, decodedTokens: DecodedToken[]): Promise<string> {
    const uniqueTokens: DecodedToken[] = [];
    const seenRanges = new Set<string>();

    // Step 1: Filter out redundant tokens based on the definition's range
    for (const token of decodedTokens) {
        if (token.definition[0]) {
            const rangeKey = `${token.definition[0].range.start.line}:${token.definition[0].range.start.character}-${token.definition[0].range.end.line}:${token.definition[0].range.end.character}`;
            if (!seenRanges.has(rangeKey)) {
                seenRanges.add(rangeKey);
                uniqueTokens.push(token);
            }
        }
    }

    // Step 2: For each unique token, retrieve its reference info
    const referenceCodes: string[] = [];
    for (const token of uniqueTokens) {
        const [firstDefinition] = token.definition;

        if (!firstDefinition) {
            continue; // Skip if there's no definition
        }

        const refDocument = await vscode.workspace.openTextDocument(firstDefinition.uri);
        const refInfo = await getReferenceInfo(refDocument, firstDefinition.range, 15);
        referenceCodes.push(refInfo);
    }

    // Return the combined reference codes
    return referenceCodes.join('\n');
}
