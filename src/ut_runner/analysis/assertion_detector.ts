import * as vscode from 'vscode';
import * as path from 'path';
import { getAllSymbols } from '../../lsp/symbol';
import { getSymbolFromDocument } from '../../lsp/symbol';
import { buildDefTree, DefinitionTreeNode, prettyPrintDefTree } from '../../lsp/tree';
import { getHover, extractHoverText } from '../../lsp/hover';
export { prettyPrintDefTree };

export interface RedefinedSymbol {
    name: string;
    symbolKind: string | null;
    symbolType?: string | null;
    // Source (original) side
    sourceFile: string | null;
    sourceLoc: string | null;
    sourceImplementation: string | null;
    sourceHoverText: string | null;
    sourceTrailingContext: string | null;
    // Test (redefined) side
    testFile: string | null;
    testLoc: string | null;
    // testImplementation: string | null;
    // testHoverText: string | null;
    // testTrailingContext: string | null;
}

export interface AssertionDetectionResult {
    hasRedefinedSymbols: boolean;
    redefinedSymbols: RedefinedSymbol[];
    definitionTree: DefinitionTreeNode;
    testFileSymbols: vscode.DocumentSymbol[];
}

/**
 * Detects likely wrong assertions by analyzing symbol redefinitions between test and source files
 * This algorithm identifies symbols that are redefined in test files but also exist in the source dependency tree
 */
export async function detectRedefinedAssertions(
    testFile: string,
    sourceFile: string,
    symbolName: string
): Promise<AssertionDetectionResult> {
    if (!testFile || !sourceFile || !symbolName) {
        throw new Error('Missing required parameters: testFile, sourceFile, and symbolName must be provided');
    }

    // Get symbols from test file
    const testFileUri = vscode.Uri.file(testFile);
    const testFileDoc = await vscode.workspace.openTextDocument(testFileUri);
    const testFileSymbols = await getAllSymbols(testFileUri);
    console.log(`#### Test File Symbols: ${testFileSymbols.length}`);

    // Get source symbol and build dependency tree
    const srcDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(sourceFile));
    const symbol = await getSymbolFromDocument(srcDoc, symbolName);

    if (!symbol) {
        throw new Error(`Symbol '${symbolName}' not found in source file: ${sourceFile}`);
    }

    console.log(`#### Source Symbol: ${symbol.name}`);
    const tree = await buildDefTree(srcDoc, symbol, 5);
    console.log('#### Definition Tree: ', prettyPrintDefTree(tree));
    // Collect all referenced names from the dependency tree
    const referencedNames = collectReferencedNames(tree);
    // console.log(`### Referenced Names: ${Array.from(referencedNames).map(n => n.name).join(', ')}`);

    // Build symbol map from test file
    const testNameToSymbols = buildTestSymbolMap(testFileSymbols);
    // console.log('#### TestNameToSymbols: ', Array.from(testNameToSymbols));
    // Find redefined symbols
    const redefinedSymbols = await findRedefinedSymbols(referencedNames, testNameToSymbols, testFileDoc, testFile, sourceFile);

    // Print results
    if (redefinedSymbols.length > 0) {
        console.log('#### Symbols redefined in test file (also defined in source):');
        for (const r of redefinedSymbols) {
            console.log(` - ${r.name}: source=${r.sourceLoc ?? 'unknown'}`);
        }
        // console.log('#### TestFile absolute path: ', testFile);
        // console.log('#### SourceFile absolute path: ', sourceFile);
        // console.log('#### TestFile SourceCodes: ', testFileDoc.getText());
        // console.log('#### SourceFile SourceCodes: ', srcDoc.getText());
    } else {
        console.log('#### No redefined symbols found in test file (w.r.t. source dependency tree).');
    }

    return {
        hasRedefinedSymbols: redefinedSymbols.length > 0,
        redefinedSymbols,
        definitionTree: tree,
        testFileSymbols
    };
}

/**
 * Collects all referenced names from a dependency tree
 */
function collectReferencedNames(node: DefinitionTreeNode): Set<DefinitionTreeNode> {
    const referencedNames = new Set<DefinitionTreeNode>();

    function collectNames(node: DefinitionTreeNode, acc: Set<DefinitionTreeNode>) {
        if (node && typeof node.name === 'string') {
            acc.add(node);
        }
        if (node && Array.isArray(node.children)) {
            for (const child of node.children) {
                collectNames(child, acc);
            }
        }
    }

    collectNames(node, referencedNames);
    return referencedNames;
}

/**
 * Builds a map from symbol name to symbols defined in the test file
 */
function buildTestSymbolMap(testFileSymbols: vscode.DocumentSymbol[]): Map<string, vscode.DocumentSymbol[]> {
    const testNameToSymbols = new Map<string, vscode.DocumentSymbol[]>();

    for (const sym of testFileSymbols) {
        const arr = testNameToSymbols.get(sym.name) || [];
        arr.push(sym);
        testNameToSymbols.set(sym.name, arr);
    }

    return testNameToSymbols;
}

/**
 * Finds symbols that are redefined in test file but also exist in source dependency tree
 */
async function findRedefinedSymbols(
    referencedNames: Set<DefinitionTreeNode>,
    testNameToSymbols: Map<string, vscode.DocumentSymbol[]>,
    testFileDoc: vscode.TextDocument,
    testFile: string,
    sourceFile: string
): Promise<RedefinedSymbol[]> {
    const redefined: RedefinedSymbol[] = [];

    for (const node of referencedNames) {
        const syms = testNameToSymbols.get(node.name) || [];
        if (syms.length > 0) {
            // Skip variable symbols as they are less likely to indicate wrong assertions
            if (syms[0].kind === vscode.SymbolKind.Variable) {
                continue;
            }

            const testLoc = `${syms[0].name}@${syms[0].selectionRange.start.line + 1}:${syms[0].selectionRange.start.character}`;
            const sourceDetails = await findSourceSymbolDetails(node);
            const testDetails = await findTestSymbolDetails(syms[0], testFileDoc);
            const symbolKind = sourceDetails.kind ?? symbolKindToString(syms[0].kind);
            redefined.push({
                name: node.name,
                symbolKind,
                symbolType: symbolKind,
                // Source (original) side
                sourceFile: sourceDetails.file ?? sourceFile,
                sourceLoc: sourceDetails.loc,
                sourceImplementation: sourceDetails.implementation,
                sourceHoverText: sourceDetails.hoverText,
                sourceTrailingContext: sourceDetails.trailingSourceContext,
                // // Test (redefined) side
                testFile,
                testLoc,
                // testImplementation: testDetails.implementation,
                // testHoverText: testDetails.hoverText,
                // testTrailingContext: testDetails.trailingContext
            });
        }
    }

    return redefined;
}

/**
 * Converts a SymbolKind number to a readable string
 */
function symbolKindToString(kind?: vscode.SymbolKind): string | null {
    if (typeof kind !== 'number') {
        return null;
    }
    const label = (vscode.SymbolKind as unknown as Record<number, string>)[kind];
    return label ?? null;
}

interface SourceSymbolDetails {
    file: string | null;
    loc: string | null;
    implementation: string | null;
    kind: string | null;
    hoverText: string | null;
    trailingSourceContext: string | null;
}

/**
 * Finds the source location, implementation, and symbol kind for a given node in the dependency tree
 */
async function findSourceSymbolDetails(node: DefinitionTreeNode): Promise<SourceSymbolDetails> {
    try {
        const uri = vscode.Uri.parse(node.uri);
        const doc = await vscode.workspace.openTextDocument(uri);
        const syms = await getAllSymbols(uri);
        const match = syms.find(s => s.name === node.name);
        if (match) {
            const file = uri.fsPath;
            const loc = `${path.relative(vscode.workspace.rootPath || '', uri.fsPath)}@${match.selectionRange.start.line + 1}:${match.selectionRange.start.character}`;
            const implementation = doc.getText(match.range) || null;
            const kind = symbolKindToString(match.kind);
            const hoverResults = await getHover(doc, match, false);
            const hoverText = extractHoverText(hoverResults) || null;

            const startLine = match.selectionRange.start.line;
            const endLine = Math.min(doc.lineCount - 1, startLine + 20);
            const trailingRange = new vscode.Range(
                new vscode.Position(startLine, 0),
                doc.lineAt(endLine).range.end
            );
            const trailingSourceContext = doc.getText(trailingRange) || null;

            return { file, loc, implementation, kind, hoverText, trailingSourceContext };
        }
    } catch (error) {
        console.log(`#### Error finding source location for ${node.name}: ${error}`);
    }
    return { file: null, loc: null, implementation: null, kind: null, hoverText: null, trailingSourceContext: null };
}

interface TestSymbolDetails {
    implementation: string | null;
    hoverText: string | null;
    trailingContext: string | null;
}

/**
 * Finds the test implementation, hover text, and trailing context for a test symbol
 */
async function findTestSymbolDetails(
    symbol: vscode.DocumentSymbol,
    testFileDoc: vscode.TextDocument
): Promise<TestSymbolDetails> {
    try {
        const implementation = testFileDoc.getText(symbol.range) || null;
        
        const hoverResults = await getHover(testFileDoc, symbol, false);
        const hoverText = extractHoverText(hoverResults) || null;

        const startLine = symbol.selectionRange.start.line;
        const endLine = Math.min(testFileDoc.lineCount - 1, startLine + 20);
        const trailingRange = new vscode.Range(
            new vscode.Position(startLine, 0),
            testFileDoc.lineAt(endLine).range.end
        );
        const trailingContext = testFileDoc.getText(trailingRange) || null;

        return { implementation, hoverText, trailingContext };
    } catch (error) {
        console.log(`#### Error finding test symbol details for ${symbol.name}: ${error}`);
    }
    return { implementation: null, hoverText: null, trailingContext: null };
}