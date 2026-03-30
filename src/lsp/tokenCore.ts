import {
    CoreDecodedToken,
    LspDocument,
    LspPosition,
    LspRange,
    LspSemanticTokens,
    LspSemanticTokensLegend,
    LspSymbol
} from './coreTypes';
import { createTextIndex } from './coreText';
import { classifyTokenByUri, DefinitionProvider } from './definitionCore';
import { getSymbolWithNeighborBoundedRange } from './symbolCore';

export interface TokenProvider extends DefinitionProvider {
    openDocument(uri: string): Promise<LspDocument>;
    getDocumentSymbols(uri: string): Promise<LspSymbol[]>;
    getSemanticTokensRange(document: LspDocument, range: LspRange): Promise<LspSemanticTokens | null>;
    getSemanticTokensLegendRange(document: LspDocument, range: LspRange): Promise<LspSemanticTokensLegend | null>;
    getSemanticTokens?(document: LspDocument): Promise<LspSemanticTokens | null>;
    getSemanticTokensLegend?(document: LspDocument): Promise<LspSemanticTokensLegend | null>;
    getSymbolDetail?(document: LspDocument, symbol: LspSymbol, getFullInfo?: boolean): Promise<string>;
    log?: (message: string) => void;
}

export async function processTokenDefinitions(
    document: LspDocument,
    tokens: CoreDecodedToken[],
    provider: TokenProvider,
    parentSymbol: LspSymbol | null = null
): Promise<Map<string, CoreDecodedToken[]>> {
    const tokenMap = await classifyTokenByUri(document, tokens, provider, parentSymbol);
    return _processTokenDefinitions(tokenMap, provider);
}

export async function _processTokenDefinitions(
    tokenMap: Map<string, CoreDecodedToken[]>,
    provider: TokenProvider
): Promise<Map<string, CoreDecodedToken[]>> {
    const processedMap = new Map<string, CoreDecodedToken[]>();

    for (const [uri, tokens] of tokenMap.entries()) {
        let symbols: LspSymbol[] = [];
        let childDoc: LspDocument;
        const validTokens: CoreDecodedToken[] = [];
        symbols = await provider.getDocumentSymbols(uri);
        childDoc = await provider.openDocument(uri);
        for (const token of tokens) {
            if (!token.definition || token.definition.length === 0) {
                continue;
            }
            const { symbol: defSymbol, boundedRange } = getSymbolWithNeighborBoundedRange(
                childDoc,
                token.definition[0].range,
                symbols
            );
            if (!defSymbol) {
                provider.log?.(`No symbol found for token: ${token.word} in ${uri}`);
                continue;
            }

            token.document = childDoc;
            token.defSymbol = defSymbol;
            token.defSymbolRange = boundedRange;
            if (provider.getSymbolDetail) {
                try {
                    token.context = await provider.getSymbolDetail(childDoc, defSymbol, true);
                } catch (error) {
                    provider.log?.(`Error getting symbol detail for ${token.word} in ${uri}: ${String(error)}`);
                }
            }
            validTokens.push(token);
        }

        if (validTokens.length > 0) {
            processedMap.set(uri, validTokens);
        }
    }

    provider.log?.(`Processed ${processedMap.size} URIs with valid definitions`);
    return processedMap;
}

export async function extractRangeTokensFromAllTokens(
    provider: TokenProvider,
    document: LspDocument,
    startPosition: LspPosition,
    endPosition: LspPosition
): Promise<CoreDecodedToken[]> {
    const textIndex = createTextIndex(document);
    const start = textIndex.offsetAt(startPosition);
    const end = textIndex.offsetAt(endPosition);
    const allTokens = provider.getSemanticTokens ? await provider.getSemanticTokens(document) : null;
    if (allTokens) {
        const filteredTokens = {
            resultId: allTokens.resultId,
            data: [] as number[]
        };
        let currentLine = 0;
        let currentChar = 0;
        let savedLine = 0;
        let savedChar = 0;
        for (let i = 0; i < allTokens.data.length; i += 5) {
            const deltaLine = allTokens.data[i];
            const deltaStart = allTokens.data[i + 1];
            const length = allTokens.data[i + 2];
            currentLine += deltaLine;
            currentChar = deltaLine > 0 ? deltaStart : currentChar + deltaStart;

            const tokenStart = textIndex.offsetAt({ line: currentLine, character: currentChar });
            const tokenEnd = tokenStart + length;

            if (tokenStart < start) {
                savedLine = currentLine;
                savedChar = currentChar;
            } else if (tokenStart >= start && tokenEnd <= end) {
                filteredTokens.data.push(
                    allTokens.data[i],
                    allTokens.data[i + 1],
                    allTokens.data[i + 2],
                    allTokens.data[i + 3],
                    allTokens.data[i + 4]
                );
            } else {
                break;
            }
        }

        const tokensLegend = provider.getSemanticTokensLegend ? await provider.getSemanticTokensLegend(document) : null;
        if (!tokensLegend) {
            return [];
        }
        return decodeSemanticTokens(document, filteredTokens.data, tokensLegend, savedLine, savedChar);
    }
    return [];
}

export async function getDecodedTokensFromRange(
    provider: TokenProvider,
    document: LspDocument,
    startPosition: LspPosition,
    endPosition: LspPosition
): Promise<CoreDecodedToken[]> {
    const range: LspRange = { start: startPosition, end: endPosition };
    const tokens = await provider.getSemanticTokensRange(document, range);
    const tokensLegend = await provider.getSemanticTokensLegendRange(document, range);
    if (!tokens || !tokensLegend) {
        return extractRangeTokensFromAllTokens(provider, document, startPosition, endPosition);
    }
    return decodeSemanticTokens(document, Array.from(tokens.data), tokensLegend);
}

export async function getDecodedTokensFromSymbol(
    provider: TokenProvider,
    document: LspDocument,
    functionSymbol: LspSymbol
): Promise<CoreDecodedToken[]> {
    const allTokens = await extractRangeTokensFromAllTokens(provider, document, functionSymbol.range.start, functionSymbol.range.end);
    return allTokens.filter(token => token.word !== functionSymbol.name);
}

function decodeSemanticTokens(
    document: LspDocument,
    data: number[],
    tokensLegend: LspSemanticTokensLegend,
    initialLine: number = 0,
    initialChar: number = 0
): CoreDecodedToken[] {
    const decodedTokens: CoreDecodedToken[] = [];
    let currentLine = initialLine;
    let currentChar = initialChar;
    for (let i = 0; i < data.length; i += 5) {
        const deltaLine = data[i];
        const deltaStart = data[i + 1];
        const length = data[i + 2];
        const tokenTypeIndex = data[i + 3];
        const tokenModifiersBitset = data[i + 4];

        currentLine += deltaLine;
        currentChar = deltaLine > 0 ? deltaStart : currentChar + deltaStart;

        const typeName = tokensLegend.tokenTypes[tokenTypeIndex];
        const modifiers: string[] = [];
        tokensLegend.tokenModifiers.forEach((modifier: string, index: number) => {
            if ((tokenModifiersBitset & (1 << index)) !== 0) {
                modifiers.push(modifier);
            }
        });

        const range: LspRange = {
            start: { line: currentLine, character: currentChar },
            end: { line: currentLine, character: currentChar + length }
        };

        decodedTokens.push({
            id: `${currentLine}:${currentChar}`,
            word: document.getText(range),
            line: currentLine,
            startChar: currentChar,
            length,
            type: typeName,
            modifiers,
            definition: [],
            context: '',
            defSymbol: null,
            defSymbolRange: null
        });
    }
    return decodedTokens;
}
