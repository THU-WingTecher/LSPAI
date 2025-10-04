import * as vscode from 'vscode';
import { removeComments } from './utils';
import { getAllSymbols, getShortestSymbol } from './symbol';
import { DecodedToken, getDecodedTokensFromSymbol } from './token';
import { VscodeRequestManager } from './vscodeRequestManager';

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
    // const content = document.getText();
    // const hasTestKeywords = (
    //     // Jest/Jasmine/Mocha patterns 
    //     content.includes('describe(') || 
    //     content.includes('it(') || 
    //     content.includes('test(') || 
    //     content.includes('beforeEach(') || 
    //     content.includes('afterEach(') ||
    //     // Other testing frameworks
    //     content.includes('@Test') || // JUnit style
    //     content.includes('assert.') || // Various assertion libraries
    //     content.includes('expect(')    // Jest/Chai assertions
    // );
    
    // return hasTestKeywords;
    return false;
}


export async function getReferenceInfo(
    document: vscode.TextDocument, 
    range: vscode.Range, 
    refWindow: number = 60, 
    skipTestCode: boolean = false
): Promise<string> {
    const targetToken = document.getText(range);
    const start = range.start;
    const end = range.end;
    
    console.log(`[getReferenceInfo] Starting reference search for token "${targetToken}" at position ${start.line}:${start.character}`);
    
    const references = await findReferences(document, start);
    if (!references || references.length === 0) {
        console.log('[getReferenceInfo] No references found');
        return '';
    }
    
    const referenceCodes = await processReferences(document, references, {
        targetToken,
        start,
        end,
        refWindow,
        skipTestCode
    });
    
    console.log(`[getReferenceInfo] Processed ${referenceCodes.length} valid reference codes`);
    return referenceCodes.join('\n');
}

interface ReferenceProcessingOptions {
    targetToken: string;
    start: vscode.Position;
    end: vscode.Position;
    refWindow: number;
    skipTestCode: boolean;
}

export async function findReferences(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Location[]> {
    return await VscodeRequestManager.references(document.uri, position);
}

// async function processReferences(
//     document: vscode.TextDocument,
//     references: vscode.Location[],
//     options: ReferenceProcessingOptions
// ): Promise<string[]> {
//     const referenceCodes: string[] = [];
//     let totalLines = 0;

//     for (const ref of references) {
//         console.log(`[processReferences] Processing reference in file: ${ref.uri.fsPath}`);
        
//         const refDocument = await vscode.workspace.openTextDocument(ref.uri);
        
//         if (options.skipTestCode && isTestFile(ref.uri, refDocument)) {
//             console.log(`[processReferences] Skipping test file: ${ref.uri.fsPath}`);
//             continue;
//         }

//         const processedCode = await processReference(document, refDocument, ref, options);
//         if (!processedCode) {
//             continue;
//         }

//         const newLines = processedCode.split('\n').length;
//         if (options.refWindow !== -1 && totalLines + newLines > options.refWindow) {
//             console.log(`[processReferences] Reached reference window limit of ${options.refWindow} lines`);
//             break;
//         }

//         referenceCodes.push(processedCode);
//         totalLines += newLines;
//         console.log(`[processReferences] Added reference code (${newLines} lines). Total lines: ${totalLines}`);
//     }

//     return referenceCodes;
// }
async function processReferences(
    document: vscode.TextDocument,
    references: vscode.Location[],
    options: ReferenceProcessingOptions
): Promise<string[]> {
    const retreiveTime = Date.now();
    
    // Filter out unwanted references by URI before processing
    const filteredReferences = references.filter(ref => !isNoNeedLocation(ref));
    console.log(`[processReferences] Filtered ${references.length} references to ${filteredReferences.length} valid references`);
    
    const referenceCodes: string[] = [];
    let totalLines = 0;
    
    const testFileMap = new Map<string, boolean>();
    for (const ref of filteredReferences) {
        const refDocument = await vscode.workspace.openTextDocument(ref.uri);
        testFileMap.set(ref.uri.toString(), isTestFile(ref.uri, refDocument));
    }

    // Sort references by test files first, then by range size
    filteredReferences.sort((a, b) => {
        const aIsTest = testFileMap.get(a.uri.toString()) || false;
        const bIsTest = testFileMap.get(b.uri.toString()) || false;
        
        // If one is a test file and the other isn't, prioritize the test file
        if (aIsTest && !bIsTest) {
            return -1;
        }
        if (!aIsTest && bIsTest) {
            return 1;
        }
        
        // If both are test files or both are not test files, sort by range size
        const rangeA = a.range.end.line - a.range.start.line;
        const rangeB = b.range.end.line - b.range.start.line;
        return rangeA - rangeB;
    });
    console.log("sort references time:", (Date.now() - retreiveTime).toString());
    const processTime = Date.now();
    // Process references in order
    for (const ref of filteredReferences) {
        // Early exit if we've hit the window limit
        if (options.refWindow !== -1 && totalLines >= options.refWindow) {
            break;
        }

        const refDocument = await vscode.workspace.openTextDocument(ref.uri);
        
        // Skip test files if requested
        if (options.skipTestCode && isTestFile(ref.uri, refDocument)) {
            continue;
        }
        const processTime2 = Date.now();
        const processedCode = await processReference(document, refDocument, ref, options);
        console.log("process reference time:", (Date.now() - processTime2).toString());
        if (!processedCode) {
            continue;
        }

        const newLines = processedCode.split('\n').length;
        if (options.refWindow !== -1 && totalLines + newLines > options.refWindow) {
            break;
        }

        referenceCodes.push(processedCode);
        totalLines += newLines;
        console.log(`[processReferences] Added reference code (${newLines} lines). Total lines: ${totalLines}`);
    }
    console.log("process references time:", (Date.now() - processTime).toString());
    return referenceCodes;
}

async function processReference(
    originalDocument: vscode.TextDocument,
    refDocument: vscode.TextDocument,
    ref: vscode.Location,
    options: ReferenceProcessingOptions
): Promise<string | null> {
    const symbols = await getAllSymbols(ref.uri);
    const refSymbol = getShortestSymbol(symbols, ref.range);
    
    if (!refSymbol) {
        console.log(`[processReference] No matching symbol found in ${ref.uri.fsPath}`);
        return null;
    }

    // Check if this is the original reference location
    if (isSameLocation(ref, originalDocument, options.start, options.end, refSymbol)) {
        console.log('[processReference] Skipping original reference location');
        return null;
    }
    // const refDocument = await vscode.workspace.openTextDocument(ref.uri);
    // await activate(uri);
    // const allSymbols = await getAllSymbols(ref.uri);
    
    console.log("determineTargetTokenUsageByLocation:", ref.uri.fsPath, ref.range, options.targetToken);
    // const shortestSymbol = getShortestSymbol(allSymbols, ref.range)!;

    console.log("document.getText(location):\n", refDocument.getText(refSymbol.range));
    // const targetTokenUsages = await determineTargetTokenUsageByLocation(
    //     ref.uri,
    //     ref.range,
    //     options.targetToken
    // );

    // if (targetTokenUsages.every(usage => usage === "parameters")) {
    //     console.log('[processReference] Skipping parameter-only usage');
    //     return null;
    // }

    const refText = removeComments(refDocument.getText(refSymbol.range)).trim();
    
    // Skip if the reference is only one line
    if (!refText.includes('\n')) {
        console.log('[processReference] Skipping single-line reference');
        return null;
    }

    console.log(`[processReference] Extracted reference code of ${refText.split('\n').length} lines`);
    return refText;
}

function isSameLocation(
    ref: vscode.Location,
    originalDocument: vscode.TextDocument,
    start: vscode.Position,
    end: vscode.Position,
    refSymbol: vscode.DocumentSymbol
): boolean {
    // overlap
    return ref.uri.toString() === originalDocument.uri.toString() &&
           !(refSymbol.range.end.isBefore(start) || refSymbol.range.start.isAfter(end));
}

    const noNeedLocation = "/lsprag"; // "lsprag-workspace", "lsprag"

function isNoNeedLocation(ref: vscode.Location): boolean {
    return ref.uri.toString().includes(noNeedLocation);
}

async function determineTargetTokenUsageByLocation(uri: vscode.Uri, location: vscode.Range, targetToken: string): Promise<string[]> {
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        // await activate(uri);
        const allSymbols = await getAllSymbols(uri);
        
        console.log("determineTargetTokenUsageByLocation:", uri.fsPath, location, targetToken);
        const shortestSymbol = getShortestSymbol(allSymbols, location)!;

        console.log("document.getText(location):\n", document.getText(shortestSymbol.range));
        const allTokens = await getDecodedTokensFromSymbol(document, shortestSymbol);
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
