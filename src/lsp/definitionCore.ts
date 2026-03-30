import { CoreDecodedToken, LspDocument, LspLocation, LspPosition, LspRange, LspSymbol, comparePosition } from './coreTypes';

export interface DefinitionProvider {
    getDefinitions(document: LspDocument, position: LspPosition): Promise<LspLocation[]>;
    isInWorkspace?: (uri: string) => boolean;
    log?: (message: string) => void;
}

export function isBetweenFocalMethod(tokenRange: LspRange, focalMethodSymbol: LspSymbol | null): boolean {
    if (!focalMethodSymbol) {
        return false;
    }

    return (
        comparePosition(tokenRange.start, focalMethodSymbol.range.start) > 0 &&
        comparePosition(tokenRange.end, focalMethodSymbol.range.end) < 0
    );
}

export async function classifyTokenByUri(
    _document: LspDocument,
    tokens: CoreDecodedToken[],
    provider: DefinitionProvider,
    parentSymbol: LspSymbol | null = null
): Promise<Map<string, CoreDecodedToken[]>> {
    const tokenMap = new Map<string, CoreDecodedToken[]>();
    const isInWorkspace = provider.isInWorkspace ?? (() => true);

    for (const token of tokens) {
        const uri = token.definition?.[0]?.uri;
        if (!uri || !isInWorkspace(uri)) {
            provider.log?.(`collectinfo::${token.word} is not in workspace: ${uri ?? 'unknown'}`);
            continue;
        }

        if (parentSymbol && token.definition?.[0]?.range && isBetweenFocalMethod(token.definition[0].range, parentSymbol)) {
            provider.log?.(`collectinfo::${token.word} is within parent symbol: ${parentSymbol.name}`);
            continue;
        }

        if (!tokenMap.has(uri)) {
            tokenMap.set(uri, []);
        }
        const tokensForUri = tokenMap.get(uri)!;
        if (token.line !== undefined && token.startChar !== undefined) {
            if (!tokensForUri.some(t => t.line === token.line && t.startChar === token.startChar)) {
                tokensForUri.push(token);
            }
        } else {
            provider.log?.(`Token has undefined line or startChar: ${JSON.stringify(token)}`);
        }
    }

    return tokenMap;
}

export async function retrieveDefs(
    document: LspDocument,
    decodedTokens: CoreDecodedToken[],
    provider: DefinitionProvider,
    skipDefinition: boolean = false
): Promise<CoreDecodedToken[]> {
    const defTokens: CoreDecodedToken[] = [];
    for (const token of decodedTokens) {
        const defToken = await retrieveDef(document, token, provider, skipDefinition);
        defTokens.push(defToken);
    }
    return defTokens;
}

export async function retrieveDef(
    document: LspDocument,
    decodedToken: CoreDecodedToken,
    provider: DefinitionProvider,
    skipDefinition: boolean = false
): Promise<CoreDecodedToken> {
    const startPos: LspPosition = { line: decodedToken.line, character: decodedToken.startChar };
    const endPos: LspPosition = { line: decodedToken.line, character: decodedToken.startChar + decodedToken.length };
    const range: LspRange = { start: startPos, end: endPos };
    decodedToken.word = document.getText(range);
    if (skipDefinition) {
        decodedToken.definition = [];
    } else {
        decodedToken.definition = await provider.getDefinitions(document, startPos);
    }
    return decodedToken;
}
