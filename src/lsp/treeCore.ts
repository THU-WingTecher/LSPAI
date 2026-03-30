import { CoreDecodedToken, LspDocument, LspRange, LspSymbol } from './coreTypes';
import { retrieveDefs } from './definitionCore';
import { extractRangeTokensFromAllTokens, processTokenDefinitions, TokenProvider } from './tokenCore';

export interface DefinitionTreeNode {
    name: string;
    uri: string;
    detail?: string;
    children: DefinitionTreeNode[];
    truncated?: boolean;
    external?: boolean;
    edge?: {
        via: string;
        loc: string;
    };
    symbol?: LspSymbol;
}

export async function buildDefTree(
    document: LspDocument,
    symbol: LspSymbol,
    provider: TokenProvider,
    maxDepth: number = 3
): Promise<DefinitionTreeNode> {
    const visited = new Set<string>();
    const root: DefinitionTreeNode = {
        name: symbol.name,
        uri: document.uri,
        children: [],
        symbol
    };

    visited.add(`${document.uri}#${symbol.name}`);

    const queue: {
        doc: LspDocument;
        sym: LspSymbol;
        depth: number;
        node: DefinitionTreeNode;
        range: LspRange;
    }[] = [
        {
            doc: document,
            sym: symbol,
            depth: 0,
            node: root,
            range: symbol.range
        }
    ];

    while (queue.length > 0) {
        const { doc: currDoc, sym: currSym, depth, node, range: currRange } = queue.shift()!;

        if (depth >= maxDepth) {
            provider.log?.(`#### Depth limit reached at ${currDoc.uri} :: ${currSym.name} (depth=${depth})`);
            node.truncated = true;
            continue;
        }

        provider.log?.(`#### Visiting: ${currDoc.uri} :: ${currSym.name}`);

        const tokensofSymbols = await extractRangeTokensFromAllTokens(provider, currDoc, currRange.start, currRange.end);
        const childDefTokens: CoreDecodedToken[] = await retrieveDefs(currDoc, tokensofSymbols, provider, false);
        const uriTokenMap = await processTokenDefinitions(currDoc, childDefTokens, provider, currSym);

        for (const [uri, childTokens] of uriTokenMap.entries()) {
            for (const childToken of childTokens) {
                const childNode: DefinitionTreeNode = {
                    name: childToken.word,
                    uri,
                    detail: childToken.word,
                    children: [],
                    symbol: childToken.defSymbol || undefined
                };
                node.children.push(childNode);

                if (childToken.defSymbol && childToken.document && childToken.defSymbolRange) {
                    const key = `${childToken.document.uri}#${childToken.word}`;
                    if (visited.has(key)) {
                        continue;
                    }

                    visited.add(key);
                    queue.push({
                        doc: childToken.document,
                        sym: childToken.defSymbol,
                        depth: depth + 1,
                        node: childNode,
                        range: childToken.defSymbolRange
                    });
                }
            }
        }
    }

    provider.log?.(`#### Built tree for: ${symbol.name}`);
    return root;
}

export function prettyPrintDefTree(
    node: DefinitionTreeNode,
    prefix: string = '',
    isLast: boolean = true,
    visited: Set<string> = new Set()
): string {
    const nodeId = `${node.name}|${node.uri}|${node.edge?.via || ''}|${node.edge?.loc || ''}`;
    const connector = prefix === '' ? '' : (isLast ? '└─ ' : '├─ ');

    if (visited.has(nodeId)) {
        return '';
    }

    visited.add(nodeId);

    const edgeInfo = node.edge ? ` <- ${node.edge.via} @ ${node.edge.loc}` : '';
    const detailInfo = node.detail && !node.external ? ` : ${String(node.detail).split('\n')[0]}` : '';
    const labelBase = node.external ? `${node.name} [external]${edgeInfo}` : `${node.name}${edgeInfo}${detailInfo}`;
    const label = node.truncated ? `${labelBase} [max-depth]` : labelBase;
    const lines: string[] = [`${prefix}${connector}${label}`];

    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const nextPrefixBase = isLast ? '   ' : '│  ';

    if (node.external && node.detail) {
        lines.push(`${prefix}${nextPrefixBase}${String(node.detail).trim()}`);
        visited.delete(nodeId);
        return lines.join('\n');
    }

    type GroupKey = string;
    const groups = new Map<GroupKey, { base: DefinitionTreeNode; count: number }>();
    for (const child of rawChildren) {
        const key = `${child.name}|${child.uri}|${child.external ? 'ext' : 'int'}|${child.external ? (child.detail ?? '') : ''}`;
        const existing = groups.get(key);
        if (existing) {
            existing.count += 1;
        } else {
            groups.set(key, { base: child, count: 1 });
        }
    }

    const groupedChildren = Array.from(groups.values()).map(({ base, count }) => {
        if (count > 1) {
            const annotated = { ...base };
            annotated.name = `${base.name} x${count}`;
            return annotated;
        }
        return base;
    });

    groupedChildren.forEach((child: DefinitionTreeNode, index: number) => {
        const childIsLast = index === groupedChildren.length - 1;
        const childPrefix = prefix + nextPrefixBase;
        lines.push(prettyPrintDefTree(child, childPrefix, childIsLast, visited));
    });

    visited.delete(nodeId);
    return lines.join('\n');
}
