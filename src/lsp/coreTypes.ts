export interface LspPosition {
    line: number;
    character: number;
}

export interface LspRange {
    start: LspPosition;
    end: LspPosition;
}

export interface LspLocation {
    uri: string;
    range: LspRange;
}

export interface LspDocument {
    uri: string;
    languageId?: string;
    getText(range?: LspRange): string;
}

export interface LspSymbol {
    name: string;
    range: LspRange;
    selectionRange?: LspRange;
    kind?: number;
    children?: LspSymbol[];
}

export interface LspSemanticTokens {
    data: number[];
    resultId?: string;
}

export interface LspSemanticTokensLegend {
    tokenTypes: string[];
    tokenModifiers: string[];
}

export interface CoreDecodedToken {
    id: string;
    word: string;
    line: number;
    startChar: number;
    length: number;
    type: string;
    modifiers: string[];
    definition: LspLocation[];
    context?: string;
    defSymbol?: LspSymbol | null;
    defSymbolRange?: LspRange | null;
    document?: LspDocument;
}

export function comparePosition(a: LspPosition, b: LspPosition): number {
    if (a.line !== b.line) {
        return a.line - b.line;
    }
    return a.character - b.character;
}

export function positionIsBefore(a: LspPosition, b: LspPosition): boolean {
    return comparePosition(a, b) < 0;
}

export function positionIsAfter(a: LspPosition, b: LspPosition): boolean {
    return comparePosition(a, b) > 0;
}

export function rangeContains(range: LspRange, target: LspRange | LspPosition): boolean {
    if ('line' in target) {
        return comparePosition(range.start, target) <= 0 && comparePosition(range.end, target) >= 0;
    }
    return rangeContains(range, target.start) && rangeContains(range, target.end);
}

export function rangesIntersect(a: LspRange, b: LspRange): boolean {
    return !(positionIsAfter(a.start, b.end) || positionIsBefore(a.end, b.start));
}

export function rangeLineSpan(range: LspRange): number {
    return range.end.line - range.start.line;
}
