import * as vscode from 'vscode';
import { activate } from './helper';
import { getConstructorDetail, getFieldDetail, removeComments } from './utils';
import { getPackageStatement } from './definition';
import { VscodeRequestManager } from './vscodeRequestManager';


export function getSymbolRange(symbol: vscode.DocumentSymbol): vscode.Range {
    
    switch (symbol.kind) {
        case vscode.SymbolKind.Class:
        case vscode.SymbolKind.Interface:
        case vscode.SymbolKind.Struct:
        case vscode.SymbolKind.Enum:
        case vscode.SymbolKind.Function:
        case vscode.SymbolKind.Method:
        case vscode.SymbolKind.Constructor:
        case vscode.SymbolKind.Namespace:
        case vscode.SymbolKind.Module:
            return symbol.range;

        case vscode.SymbolKind.Variable:
            return symbol.range; // TODO : need to handle this

        case vscode.SymbolKind.Property:
        case vscode.SymbolKind.Field:
        case vscode.SymbolKind.Constant:
        case vscode.SymbolKind.EnumMember:
            return new vscode.Range(symbol.range.start.line, symbol.range.start.character, symbol.range.end.line, symbol.range.end.character);

        default:
            return symbol.range;
    }
}


export async function getSymbolWithNeighborBoundedRange(
    document: vscode.TextDocument,
    range: vscode.Range,
    symbols: vscode.DocumentSymbol[]
): Promise<{ symbol: vscode.DocumentSymbol | null; boundedRange: vscode.Range | null }> {
    // Load once: get hierarchical roots (keeps structure)

    // Flatten without new LSP calls
    // const flat: vscode.DocumentSymbol[] = await getAllSymbols(document.uri);
    const flat: vscode.DocumentSymbol[] = symbols;

    // Smallest containing symbol (by total lines)
    const sorted_flat = flat.sort((a, b) => {
        // First sort by line number
        const lineDiff = a.range.start.line - b.range.start.line;
        if (lineDiff !== 0) {
            return lineDiff;
        }
        // Then sort by character position
        return a.range.start.character - b.range.start.character;
    });
    const docStart = new vscode.Position(0, 0);
    const docEnd = document.lineAt(document.lineCount - 1).range.end;
    const targetIdx = getShortestSymbolIdx(sorted_flat, range);
    if (targetIdx === -1) {
        return { symbol: null, boundedRange: null};
    }
    const symbol = sorted_flat[targetIdx];
    // const rightBefore = targetIdx > 0 ? sorted_flat[targetIdx - 1].range.end : docStart; //TODO : except for import statements?
    const rightBefore = range.end; //TODO : except for import statements?
    const rightAfter = targetIdx < sorted_flat.length - 1 ? sorted_flat[targetIdx + 1].range.start : docEnd;
    return { symbol: symbol ?? null, boundedRange: new vscode.Range(rightBefore, rightAfter) };
}

export async function getSymbolByLocation(document: vscode.TextDocument, location: vscode.Position): Promise<vscode.DocumentSymbol | null> {
    const symbols = await getAllSymbols(document.uri);
    const shortestSymbol = getShortestSymbol(symbols, new vscode.Range(location, location));
    if (shortestSymbol) {
        return shortestSymbol;
    }
    return null;

}

export async function getSymbolFromDocument(document: vscode.TextDocument, symbolName: string): Promise<vscode.DocumentSymbol | null> {
    const symbols = await getAllSymbols(document.uri);
    const symbol = symbols.find(s => s.name.toLocaleLowerCase().includes(symbolName.toLowerCase()));
    return symbol || null;
}

export async function getOuterSymbols(uri: vscode.Uri, retries = 10, delayMs = 500): Promise<vscode.DocumentSymbol[]> {
    return await VscodeRequestManager.documentSymbols(uri);
    let syms: vscode.DocumentSymbol[] = [];
    for (let i = 0; i < retries; i++) {
        const newSyms = await VscodeRequestManager.documentSymbols(uri);

        if (newSyms && newSyms.length) {
            console.log(`found ${newSyms.length} symbols for ${uri.path}`);
            syms.push(...newSyms);
            break;
        }
        console.log(`waiting for symbols... ${i + 1}th attempt`);
        await new Promise(r => setTimeout(r, delayMs));
    }
    return syms;
}
export async function getAllSymbols(uri: vscode.Uri, retries = 10, delayMs = 500): Promise<vscode.DocumentSymbol[]> {

    // console.log(`uri = ${uri}, symbols = ${symbols}`);
    let syms: vscode.DocumentSymbol[] = [];
    syms.push(...await getOuterSymbols(uri, retries, delayMs));
    const flat: vscode.DocumentSymbol[] = [];
    function collectSymbols(list: vscode.DocumentSymbol[]) {
        for (const symbol of list) {
            flat.push(symbol);
            if (symbol.children && symbol.children.length > 0) {
                collectSymbols(symbol.children);
            }
        }
    }
    if (syms && syms.length) {
        collectSymbols(syms);
    }
    return flat;
}
export function getShortestSymbol(symbols: vscode.DocumentSymbol[], range: vscode.Range): vscode.DocumentSymbol | null {
    return symbols[getShortestSymbolIdx(symbols, range)];
    // let shortestSymbol: vscode.DocumentSymbol | null = null;
    // for (const symbol of symbols) {
    //     if (symbol.range.contains(range)) {
    //         if (!shortestSymbol || (symbol.range.end.line - symbol.range.start.line) < (shortestSymbol.range.end.line - shortestSymbol.range.start.line)) {
    //             shortestSymbol = symbol;
    //         }
    //     }
    // }
    // return shortestSymbol;
}
export function getShortestSymbolIdx(symbols: vscode.DocumentSymbol[], range: vscode.Range): number {
    let shortestSymbolIdx: number = -1;
    for (let idx = 0; idx < symbols.length; idx++) {
        const symbol = symbols[idx];
        if (symbol.selectionRange.contains(range)) {
            // console.log(`shortestSymbolIdx: ${shortestSymbolIdx}, symbol: ${symbols[shortestSymbolIdx]}`);
            if (shortestSymbolIdx === -1 || 
                (symbol.range.end.line - symbol.range.start.line) < (symbols[shortestSymbolIdx].range.end.line - symbols[shortestSymbolIdx].range.start.line)) {
                shortestSymbolIdx = idx;
            }
        }
    }
    return shortestSymbolIdx;
}
export function getFunctionSymbol(symbols: vscode.DocumentSymbol[], functionPosition: vscode.Position): vscode.DocumentSymbol | null {
    for (const symbol of symbols) {
        if (symbol.children.length > 0) {
            const innerSymbol = getFunctionSymbol(symbol.children, functionPosition);
            if (innerSymbol) {
                return innerSymbol;
            }
        }
        if (symbol.range.contains(functionPosition)) {
            return symbol;
        }
    }
    return null;
}
export function getFunctionSymbolWithItsParents(symbols: vscode.DocumentSymbol[], functionPosition: vscode.Position): vscode.DocumentSymbol[] {
    const result: vscode.DocumentSymbol[] = [];

    function findSymbolWithParents(symbols: vscode.DocumentSymbol[], functionPosition: vscode.Position, parents: vscode.DocumentSymbol[]): boolean {
        for (const symbol of symbols) {
            const currentParents = [...parents, symbol];
            if (symbol.children.length > 0) {
                if (findSymbolWithParents(symbol.children, functionPosition, currentParents)) {
                    return true;
                }
            }
            if (symbol.range.contains(functionPosition)) {
                result.push(...currentParents);
                return true;
            }
        }
        return false;
    }

    findSymbolWithParents(symbols, functionPosition, []);
    return result;
}
/**
 * Retrieves summarized information of a given symbol.
 * For classes, includes constructor information.
 * @param document - The text document containing the symbol.
 * @param symbol - The DocumentSymbol to summarize.
 * @returns A string summarizing the symbol's details.
 */
export function getSymbolDetail(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, getFullInfo: boolean = false): string {
    // symbol.kind >= vscode.SymbolKind.Variable  MEANS that the symbol is a variable, constant, ... other no need to summarize symbols
    // if (symbol.kind >= vscode.SymbolKind.Variable){
    //     return '';
    // }
    let detail = '';

    if (getFullInfo) {
        return document.getText(symbol.range);
    }
    if (symbol.kind === vscode.SymbolKind.Class) {
        // Retrieve the line text where the class is defined
        const packageStatement = getPackageStatement(document, document.languageId);
        detail += packageStatement ? packageStatement[0] + '\n' : '';
        detail += document.lineAt(symbol.selectionRange.start.line).text.trim() + '\n';

        // Initialize an array to hold constructor details
        const constructorsInfo: string[] = [];
        const fieldsInfo: string[] = [];
        let classDetail = '';
        // Check if the class has children symbols
        if (symbol.children && symbol.children.length > 0) {
            // Iterate over the children to find constructors
            for (const childSymbol of symbol.children) {
                // if (!isPublic(childSymbol, document)) {
                //     continue;
                // }
                if (childSymbol.kind === vscode.SymbolKind.Constructor) {
                    // Extract constructor details
                    const constructorDetail = getConstructorDetail(document, childSymbol);
                    if (constructorDetail) {
                        constructorsInfo.push(constructorDetail);
                    }
                }
                if (childSymbol.kind === vscode.SymbolKind.Property || childSymbol.kind === vscode.SymbolKind.Field) {
                    // Extract constructor details
                    const fieldDetail = getFieldDetail(document, childSymbol);
                    if (fieldDetail) {
                        fieldsInfo.push(fieldDetail);
                    }
                }
                if (childSymbol.kind === vscode.SymbolKind.Class) {
                    // Extract constructor details
                    classDetail = getSymbolDetail(document, childSymbol);
                }
            }
        }

        // Append field information if available
        if (fieldsInfo.length > 0) {
            // detail += '\n  Constructors:\n';
            for (const fieldInfo of fieldsInfo) {
                detail += `    ${fieldInfo}\n`;
            }
        }

        // Append constructor information if available
        if (constructorsInfo.length > 0) {
            // detail += '\n  Constructors:\n';
            for (const constructorInfo of constructorsInfo) {
                detail += `    ${constructorInfo}\n`;
            }
        }

        if (classDetail) {
            detail += `    ${classDetail}\n`;
        }


    } else if (symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Function) {
        // For methods and functions, include name and detail (e.g., parameters)
        detail = symbol.name;
        if (symbol.detail) {
            detail += ` ${symbol.detail}`;
        }

        // } else if (symbol.kind === vscode.SymbolKind.Property || symbol.kind === vscode.SymbolKind.Field) {
        //     // For properties and fields, retrieve the line text
        //     detail = document.lineAt(symbol.selectionRange.start.line).text.trim();
    } else {
        // For other symbol kinds, retrieve the line text
        detail = document.lineAt(symbol.selectionRange.start.line).text.trim();
    }

    return removeComments(detail);
    ;
}

export function isFunctionSymbol(symbol: vscode.DocumentSymbol): boolean {
    return symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method;
}

export function generateSymbolKey(symbol: vscode.DocumentSymbol): string {
    const { start, end } = symbol.selectionRange;
    return `${symbol.name}-${start.line}:${start.character}-${end.line}:${end.character}`;
}

