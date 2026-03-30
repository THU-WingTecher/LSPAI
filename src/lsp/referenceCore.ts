export interface ReferencePosition {
    line: number;
    character: number;
}

export interface ReferenceRange {
    start: ReferencePosition;
    end: ReferencePosition;
}

export interface ReferenceLocation {
    uri: string;
    range: ReferenceRange;
}

export interface ReferenceDocument {
    uri: string;
    languageId?: string;
    getText(range?: ReferenceRange): string;
}

export interface ReferenceSymbol {
    name: string;
    range: ReferenceRange;
    selectionRange: ReferenceRange;
    children?: ReferenceSymbol[];
}

export interface ReferenceProvider {
    getReferences(document: ReferenceDocument, position: ReferencePosition): Promise<ReferenceLocation[]>;
    openDocument(uri: string): Promise<ReferenceDocument>;
    getSymbols(uri: string): Promise<ReferenceSymbol[]>;
    isTestFile?: (uri: string, document: ReferenceDocument) => boolean;
    log?: (message: string) => void;
}

export interface ReferenceInfoOptions {
    refWindow?: number;
    skipTestCode?: boolean;
}

interface ReferenceProcessingOptions {
    targetToken: string;
    start: ReferencePosition;
    end: ReferencePosition;
    refWindow: number;
    skipTestCode: boolean;
}

function comparePosition(a: ReferencePosition, b: ReferencePosition): number {
    if (a.line !== b.line) {
        return a.line - b.line;
    }
    return a.character - b.character;
}

function positionIsBefore(a: ReferencePosition, b: ReferencePosition): boolean {
    return comparePosition(a, b) < 0;
}

function positionIsAfter(a: ReferencePosition, b: ReferencePosition): boolean {
    return comparePosition(a, b) > 0;
}

function rangeContains(range: ReferenceRange, target: ReferenceRange | ReferencePosition): boolean {
    if ('line' in target) {
        return comparePosition(range.start, target) <= 0 && comparePosition(range.end, target) >= 0;
    }
    return rangeContains(range, target.start) && rangeContains(range, target.end);
}

function rangesIntersect(a: ReferenceRange, b: ReferenceRange): boolean {
    return !(positionIsAfter(a.start, b.end) || positionIsBefore(a.end, b.start));
}

function rangeLineSpan(range: ReferenceRange): number {
    return range.end.line - range.start.line;
}

function defaultIsTestFile(uri: string): boolean {
    const normalized = uri.toLowerCase();
    return (
        normalized.includes('/test/') ||
        normalized.includes('/tests/') ||
        normalized.includes('/spec/') ||
        normalized.includes('/__tests__/') ||
        /\.(test|spec)\.(js|ts|jsx|tsx)$/.test(normalized)
    );
}

function removeComments(code: string): string {
    const commentRegex = [
        /\/\/[^\n]*\n/g,
        /\/\*[\s\S]*?\*\//g,
        /'''[\s\S]*?'''/g,
        /"""[\s\S]*?"""/g,
        /#.*$/gm
    ];

    const withoutComments = commentRegex.reduce((codeWithoutComments, regex) => {
        return codeWithoutComments.replace(regex, '');
    }, code);

    return withoutComments
        .split('\n')
        .filter(line => line.trim().length > 0)
        .join('\n');
}

function getShortestSymbol(symbols: ReferenceSymbol[], range: ReferenceRange): ReferenceSymbol | null {
    let shortestSymbol: ReferenceSymbol | null = null;
    for (const symbol of symbols) {
        const isContainedInFullRange = rangeContains(symbol.range, range);
        const isContainedInSelectionRange = rangeContains(symbol.selectionRange, range);
        const rangeStartInSymbol = rangeContains(symbol.range, range.start);
        const intersectsWithRange = rangesIntersect(symbol.range, range);

        if (isContainedInFullRange || isContainedInSelectionRange || rangeStartInSymbol || intersectsWithRange) {
            if (!shortestSymbol || rangeLineSpan(symbol.range) < rangeLineSpan(shortestSymbol.range)) {
                shortestSymbol = symbol;
            }
        }
    }
    return shortestSymbol;
}

function isSameLocation(
    ref: ReferenceLocation,
    originalUri: string,
    start: ReferencePosition,
    end: ReferencePosition,
    refSymbol: ReferenceSymbol
): boolean {
    return ref.uri === originalUri &&
        !(positionIsBefore(refSymbol.range.end, start) || positionIsAfter(refSymbol.range.start, end));
}

async function processReference(
    provider: ReferenceProvider,
    originalDocument: ReferenceDocument,
    refDocument: ReferenceDocument,
    ref: ReferenceLocation,
    options: ReferenceProcessingOptions
): Promise<string | null> {
    const symbols = await provider.getSymbols(ref.uri);
    const refSymbol = getShortestSymbol(symbols, ref.range);

    if (!refSymbol) {
        provider.log?.(`[processReference] No matching symbol found in ${ref.uri}`);
        return null;
    }

    if (isSameLocation(ref, originalDocument.uri, options.start, options.end, refSymbol)) {
        provider.log?.('[processReference] Skipping original reference location');
        return null;
    }

    const refText = removeComments(refDocument.getText(refSymbol.range)).trim();
    if (!refText.includes('\n')) {
        provider.log?.('[processReference] Skipping single-line reference');
        return null;
    }

    provider.log?.(`[processReference] Extracted reference code of ${refText.split('\n').length} lines`);
    return refText;
}

async function processReferences(
    provider: ReferenceProvider,
    document: ReferenceDocument,
    references: ReferenceLocation[],
    options: ReferenceProcessingOptions
): Promise<string[]> {
    const referenceCodes: string[] = [];
    let totalLines = 0;
    const isTestFile = provider.isTestFile ?? ((uri: string) => defaultIsTestFile(uri));

    const testFileMap = new Map<string, boolean>();
    for (const ref of references) {
        const refDocument = await provider.openDocument(ref.uri);
        testFileMap.set(ref.uri, isTestFile(ref.uri, refDocument));
    }

    references.sort((a, b) => {
        const aIsTest = testFileMap.get(a.uri) || false;
        const bIsTest = testFileMap.get(b.uri) || false;
        if (aIsTest && !bIsTest) {
            return -1;
        }
        if (!aIsTest && bIsTest) {
            return 1;
        }
        return rangeLineSpan(a.range) - rangeLineSpan(b.range);
    });

    for (const ref of references) {
        if (options.refWindow !== -1 && totalLines >= options.refWindow) {
            break;
        }

        const refDocument = await provider.openDocument(ref.uri);
        if (options.skipTestCode && isTestFile(ref.uri, refDocument)) {
            continue;
        }

        const processedCode = await processReference(provider, document, refDocument, ref, options);
        if (!processedCode) {
            continue;
        }

        const newLines = processedCode.split('\n').length;
        if (options.refWindow !== -1 && totalLines + newLines > options.refWindow) {
            break;
        }

        referenceCodes.push(processedCode);
        totalLines += newLines;
    }

    return referenceCodes;
}

export async function getReferenceInfo(
    document: ReferenceDocument,
    range: ReferenceRange,
    provider: ReferenceProvider,
    options: ReferenceInfoOptions = {}
): Promise<string> {
    const targetToken = document.getText(range);
    const start = range.start;
    const end = range.end;
    const refWindow = options.refWindow ?? 60;
    const skipTestCode = options.skipTestCode ?? false;

    provider.log?.(
        `[getReferenceInfo] Starting reference search for token "${targetToken}" at position ${start.line}:${start.character}`
    );

    const references = await provider.getReferences(document, start);
    if (!references || references.length === 0) {
        provider.log?.('[getReferenceInfo] No references found');
        return '';
    }

    const referenceCodes = await processReferences(provider, document, references, {
        targetToken,
        start,
        end,
        refWindow,
        skipTestCode
    });

    provider.log?.(`[getReferenceInfo] Processed ${referenceCodes.length} valid reference codes`);
    return referenceCodes.join('\n');
}
