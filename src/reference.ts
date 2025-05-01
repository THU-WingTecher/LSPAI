import * as vscode from 'vscode';
import { removeComments } from './utils';
import { getAllSymbols, getSymbolByLocation } from './lsp';
import { DecodedToken, getDecodedTokensFromSybol } from './token';
import { retrieveDef } from './retrieve';

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

/**
 * Determines if a file is a test file based on its path and content
 * @param uri The URI of the file to check
 * @param document The TextDocument to examine
 * @returns Boolean indicating whether this is a test file
 */
export function isTestFile(uri: vscode.Uri, document: vscode.TextDocument): boolean {
    // Check path patterns common for test files
    const path = uri.fsPath.toLowerCase();
    
    // Check file path patterns
    if (
        path.includes('/test/') || 
        path.includes('/tests/') || 
        path.includes('/spec/') || 
        path.includes('/__tests__/') ||
        path.match(/\.(test|spec)\.(js|ts|jsx|tsx)$/)
    ) {
        return true;
    }
    
    // Check file content for test frameworks
    const content = document.getText();
    const hasTestKeywords = (
        // Jest/Jasmine/Mocha patterns 
        content.includes('describe(') || 
        content.includes('it(') || 
        content.includes('test(') || 
        content.includes('beforeEach(') || 
        content.includes('afterEach(') ||
        // Other testing frameworks
        content.includes('@Test') || // JUnit style
        content.includes('assert.') || // Various assertion libraries
        content.includes('expect(')    // Jest/Chai assertions
    );
    
    return hasTestKeywords;
}


export async function getReferenceInfo(document: vscode.TextDocument, range: vscode.Range, refWindow: number = 60, skipTestCode: boolean = true): Promise<string> {
    const targetToken = document.getText(range)
    const position = range.start;
    const refes = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        document.uri,
        position,
    );
    // console.log('References:', refes);

    const referenceCodes: string[] = [];
    for (const ref of refes) {
        const refDocument = await vscode.workspace.openTextDocument(ref.uri);
        // Skip test files if requested
        if (skipTestCode && isTestFile(ref.uri, refDocument)) {
            // console.log(`Skipping test file: ${ref.uri.fsPath}`);
            continue;
        // console.log('symbolUsage', symbolUsage);
        }
        const symbols = await getAllSymbols(ref.uri);
        const shortestSymbol = getShortestSymbol(symbols, ref.range);
        const targetTokenUsages = await determineTargetTokenUsageByLocation(ref.uri, ref.range, targetToken);

        if (shortestSymbol) {
            if (ref.uri.toString() === document.uri.toString() && shortestSymbol.range.start.isBeforeOrEqual(position) && shortestSymbol.range.end.isAfterOrEqual(position)) {
                continue; // Skip the reference at the same position and URI
            }
            const allAreParameters = targetTokenUsages.every(usage => usage === "parameters");
            if (allAreParameters) {
                // console.log("All targetTokenUsage values are 'parameters'.");
                continue;
            } 
            const refText = removeComments(refDocument.getText(shortestSymbol.range)).trim();
            if (refWindow === -1) {
                referenceCodes.push(refText);
            } else {
                const refTextLines = refText.split('\n').length;
                const currentTotalLines = referenceCodes.reduce((acc, code) => acc + code.split('\n').length, 0);
                if (currentTotalLines + refTextLines <= refWindow) {
                    referenceCodes.push(refText);
                } else {
                    break;
                }
            }
        }
    }
    // console.log('Reference Codes:', referenceCodes.join('\n'));
    return referenceCodes.join('\n');
}

async function determineTargetTokenUsageByLocation(uri: vscode.Uri, location: vscode.Range, targetToken: string): Promise<string[]> {
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const allSymbols = await getAllSymbols(uri);
        const shortestSymbol = getShortestSymbol(allSymbols, location)!;
        const allTokens = await getDecodedTokensFromSybol(document, shortestSymbol);
        const finalTokens = allTokens.filter(token => token.word === targetToken);
        if (!finalTokens) {
            return [];
        }
        return finalTokens.map(token => token.modifiers).flat();
    } catch (error) {
        console.error('Error determining target token usage:', error);
        return [];
    }
    // if (targetToken.modifiers.includes('parameter')) {
    //     return 'static';
    // }
    // // const targetTokenWithDef = retrieveDef(document, targetToken);
    // if (!targetTokenWithDef) {
    //     return '';
    // }

    // if (targetTokenWithDef.definition[0]) {
    // const symbol = await getSymbolByLocation(document, targetToken.range.start);
    // if (!symbol) {
    //     return '';
    // }
    // const symbolUsage = await getSymbolUsage(document, symbol);
    // return symbolUsage;
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
        if (firstDefinition.range){
            const refInfo = await getReferenceInfo(refDocument, firstDefinition.range, 15);
            referenceCodes.push(refInfo);
        }
    }

    // Return the combined reference codes
    return referenceCodes.join('\n');
}
