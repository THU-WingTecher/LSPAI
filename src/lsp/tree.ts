import * as vscode from 'vscode';
import { DecodedToken, Cached } from './types';
import { extractRangeTokensFromAllTokens, processTokenDefinitions } from './token';
import { retrieveDefs } from './definition';

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
    symbol?: vscode.DocumentSymbol;
}

export async function buildDefTree(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
    maxDepth: number = 3
): Promise<DefinitionTreeNode> {
    const visited = new Set<string>();
    const cached = new Map<string, Cached>();
    const root: DefinitionTreeNode = {
        name: symbol.name,
        uri: document.uri.toString(),
        children: [],
        symbol: symbol
    };

    visited.add(`${document.uri.toString()}#${symbol.name}`);

    const queue: {
        doc: vscode.TextDocument;
        sym: vscode.DocumentSymbol;
        depth: number;
        node: DefinitionTreeNode;
        range: vscode.Range
    }[] = [
        {
            doc: document,
            sym: symbol,
            depth: 0,
            node: root,
            range: symbol.range
        }
    ];

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    while (queue.length > 0) {
        const { doc: currDoc, sym: currSym, depth, node, range: currRange } = queue.shift()!;

        if (depth >= maxDepth) {
            console.log(`#### Depth limit reached at ${currDoc.uri.fsPath} :: ${currSym.name} (depth=${depth})`);
            node.truncated = true;
            continue;
        }

        console.log(`#### Visiting: ${currDoc.uri.fsPath} :: ${currSym.name}`);

        const tokensofSymbols = await extractRangeTokensFromAllTokens(currDoc, currRange.start, currRange.end);
        const childDefTokens: DecodedToken[] = await retrieveDefs(currDoc, tokensofSymbols, false);
        const uriTokenMap = await processTokenDefinitions(currDoc, childDefTokens, currSym);

        for (const [uri, childTokens] of uriTokenMap.entries()) {
            for (const childToken of childTokens) {
                const childNode: DefinitionTreeNode = {
                    name: childToken.word,
                    uri: uri.toString(),
                    detail: childToken.word,
                    children: [],
                    symbol: childToken.defSymbol || undefined
                };
                node.children.push(childNode);

                if (childToken.defSymbol) {
                    const key = `${childToken.document.uri.toString()}#${childToken.word}`;
                    console.log(`#### Key: ${key}, tok.word: ${childToken.word}`);

                    if (visited.has(key)) {
                        console.log(`#### Skip visited: ${key}`);
                        continue;
                    }

                    visited.add(key);
                    queue.push({
                        doc: childToken.document,
                        sym: childToken.defSymbol,
                        depth: depth + 1,
                        node: childNode,
                        range: childToken.defSymbolRange!
                    });
                }
            }
        }
    }

    console.log(`#### Built tree for: ${symbol.name}`);
    return root;
}

export function prettyPrintDefTree(
    node: DefinitionTreeNode,
    prefix: string = '',
    isLast: boolean = true,
    visited: Set<string> = new Set()
): string {
    // Create a unique identifier for this node to detect cycles
    const nodeId = `${node.name}|${node.uri}|${node.edge?.via || ''}|${node.edge?.loc || ''}`;
    const connector = prefix === '' ? '' : (isLast ? '└─ ' : '├─ ');

    // Check for circular reference
    if (visited.has(nodeId)) {
        return '';
    }

    // Add current node to visited set
    visited.add(nodeId);

    const edgeInfo = node.edge ? ` ← ${node.edge.via} @ ${node.edge.loc}` : '';
    const detailInfo = node.detail && !node.external ? ` : ${String(node.detail).split('\n')[0]}` : '';
    const labelBase = node.external ? `${node.name} [external]${edgeInfo}` : `${node.name}${edgeInfo}${detailInfo}`;
    const label = node.truncated ? `${labelBase} [max-depth]` : labelBase;
    const lines: string[] = [`${prefix}${connector}${label}`];

    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const nextPrefixBase = isLast ? '   ' : '│  ';

    // For external nodes, append brief detail one level below and stop
    if (node.external && node.detail) {
        lines.push(`${prefix}${nextPrefixBase}${String(node.detail).trim()}`);
        visited.delete(nodeId); // Clean up visited set
        return lines.join('\n');
    }

    // Group duplicate children (by name + uri + external/detail) and count occurrences
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
            // Annotate grouped node label with count multiplier
            const annotated = { ...base };
            annotated.name = `${base.name} ×${count}`;
            return annotated;
        }
        return base;
    });

    groupedChildren.forEach((child: DefinitionTreeNode, index: number) => {
        const childIsLast = index === groupedChildren.length - 1;
        const childPrefix = prefix + nextPrefixBase;
        lines.push(prettyPrintDefTree(child, childPrefix, childIsLast, visited));
    });

    // Clean up visited set before returning
    visited.delete(nodeId);
    return lines.join('\n');
}