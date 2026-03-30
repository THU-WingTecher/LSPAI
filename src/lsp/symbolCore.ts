import { LspDocument, LspRange, LspSymbol, comparePosition, rangeContains, rangesIntersect } from './coreTypes';
import { createTextIndex } from './coreText';

export function flattenSymbols(symbols: LspSymbol[]): LspSymbol[] {
    const flat: LspSymbol[] = [];
    function collect(list: LspSymbol[]) {
        for (const symbol of list) {
            flat.push(symbol);
            if (symbol.children && symbol.children.length > 0) {
                collect(symbol.children);
            }
        }
    }
    collect(symbols);
    return flat;
}

export function getShortestSymbolIdx(symbols: LspSymbol[], range: LspRange): number {
    let shortestSymbolIdx = -1;
    for (let idx = 0; idx < symbols.length; idx++) {
        const symbol = symbols[idx];
        const selectionRange = symbol.selectionRange ?? symbol.range;
        const isContainedInFullRange = rangeContains(symbol.range, range);
        const isContainedInSelectionRange = rangeContains(selectionRange, range);
        const rangeStartInSymbol = rangeContains(symbol.range, range.start);
        const intersectsWithRange = rangesIntersect(symbol.range, range);

        if (isContainedInFullRange || isContainedInSelectionRange || rangeStartInSymbol || intersectsWithRange) {
            if (
                shortestSymbolIdx === -1 ||
                (symbol.range.end.line - symbol.range.start.line) <
                    (symbols[shortestSymbolIdx].range.end.line - symbols[shortestSymbolIdx].range.start.line)
            ) {
                shortestSymbolIdx = idx;
            }
        }
    }
    return shortestSymbolIdx;
}

export function getSymbolWithNeighborBoundedRange(
    document: LspDocument,
    range: LspRange,
    symbols: LspSymbol[]
): { symbol: LspSymbol | null; boundedRange: LspRange | null } {
    const flat = flattenSymbols(symbols);
    const sorted = flat.slice().sort((a, b) => {
        const lineDiff = comparePosition(a.range.start, b.range.start);
        if (lineDiff !== 0) {
            return lineDiff;
        }
        return a.range.start.character - b.range.start.character;
    });

    const targetIdx = getShortestSymbolIdx(sorted, range);
    if (targetIdx === -1) {
        return { symbol: null, boundedRange: null };
    }

    const textIndex = createTextIndex(document);
    const docEndLine = Math.max(textIndex.lineCount - 1, 0);
    const docEnd = textIndex.lineAt(docEndLine).range.end;

    const symbol = sorted[targetIdx];
    const rightBefore = range.end;
    const rightAfter = targetIdx < sorted.length - 1 ? sorted[targetIdx + 1].range.start : docEnd;
    const boundedRange =
        comparePosition(rightBefore, rightAfter) <= 0 ? { start: rightBefore, end: rightAfter } : { start: rightBefore, end: rightBefore };

    return { symbol, boundedRange };
}
