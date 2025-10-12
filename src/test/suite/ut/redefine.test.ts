import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from '../../../ut_runner/runner';
import { getConfigInstance } from '../../../config';
import * as vscode from 'vscode';
import { setupPythonLSP } from '../../../lsp/helper';
import { getDecodedTokensFromSymbol, processTokenDefinitions } from '../../../lsp/token';
import { getAllSymbols } from '../../../lsp/symbol';
import { getSymbolFromDocument } from '../../../lsp/symbol';
import { extractRangeTokensFromAllTokens } from '../../../lsp/token';
import { Cached, DecodedToken } from '../../../lsp/types';
import { retrieveDefs } from '../../../lsp/definition';


async function buildDefTree(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, maxDepth: number = 3) {
  const visited = new Set<string>();
  const cached = new Map<string, Cached>();
  const root: any = { name: symbol.name, uri: document.uri.toString(), children: [] as any[] };
  visited.add(`${document.uri.toString()}#${symbol.name}`);
  const queue: { doc: vscode.TextDocument; sym: vscode.DocumentSymbol; depth: number; node: any; range: vscode.Range }[] = [
    { doc: document, sym: symbol, depth: 0, node: root, range: symbol.range } // [27:3 -> 31:0)
  ];
  // root.children = queue.map(q => q.node);
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
        const childNode: any = { name: childToken.word, uri: uri.toString(), detail: childToken.word, children: [] as any[] };
        node.children.push(childNode);
        if (childToken.defSymbol) {
          const key = `${childToken.document.uri.toString()}#${childToken.word}`;
          console.log(`#### Key: ${key}, tok.word: ${childToken.word}`);
          if (childToken.word.includes("DFA")) {
            console.log(`${childToken.word}`);
          }
          if (visited.has(key)) {
            console.log(`#### Skip visited: ${key}`);
            continue;
          }
          visited.add(key);
          queue.push({ doc: childToken.document, sym: childToken.defSymbol, depth: depth + 1, node: childNode, range: childToken.defSymbolRange! });
        }
      }
    }
  }

  console.log(`#### Built tree for: ${symbol.name}`);
  return root;
}


function prettyPrintDefTree(node: any, prefix: string = '', isLast: boolean = true, visited: Set<string> = new Set()): string {
  // Create a unique identifier for this node to detect cycles
  // parent
  // -- child
  // ---- child
  const nodeId = `${node.name}|${node.uri}|${node.edge?.via || ''}|${node.edge?.loc || ''}`;
  const connector = prefix === '' ? '' : (isLast ? '└─ ' : '├─ ');
  
  // Check for circular reference
  if (visited.has(nodeId)) {
    return '';
    // return `${prefix}${connector}${node.name} [circular reference]`;
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
  const groups = new Map<GroupKey, { base: any; count: number }>();
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

  groupedChildren.forEach((child: any, index: number) => {
    const childIsLast = index === groupedChildren.length - 1;
    const childPrefix = prefix + nextPrefixBase;
    lines.push(prettyPrintDefTree(child, childPrefix, childIsLast, visited));
  });

  // Clean up visited set before returning
  visited.delete(nodeId);
  return lines.join('\n');
}


async function setupDetect(testFile: string, sourceFile: string, symbolName: string) {
  if (!testFile || !sourceFile || !symbolName) {
    return true;
  }
  const testFileSymbols = await getAllSymbols(vscode.Uri.file(testFile));
  console.log(`#### Test File Symbols: ${testFileSymbols.length}`);

  const srcDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(sourceFile));
  const symbol = await getSymbolFromDocument(srcDoc, symbolName)!;
  console.log(`#### Symbol: ${symbol}`);
  const tree = await buildDefTree(srcDoc, symbol!);
  const printed = prettyPrintDefTree(tree);
  console.log(`\n#### Definition Tree for ${symbol!.name}:\n${printed}\n`);
  return true;
}

suite('EXECUTE - Python (black)', () => {
  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const testsDir = '/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1';
  const outputDir = '/LSPRAG/experiments/projects/black/src/lsprag_tests/final-report';
  const testFileMapPath = '/LSPRAG/experiments/config/black_test_file_map.json';
  const blackImportTestPath = "/LSPRAG/src/test/resources/black_module_import_test.py";
  const projectPath = "/LSPRAG/experiments/projects/black";
  const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src")];
  const currentConfig = {
      workspace: projectPath,
  };
  
  getConfigInstance().updateConfig({
    ...currentConfig
  });

  test('config workspace', async () => {
    // const targetUri = vscode.Uri.file(projectPath);

    // // Make sure the EDH has exactly this one root, without triggering a reload
    // await ensureSingleRoot(targetUri, 'black');
    // // await ensureWorkspaceFolders(workspaceFolders);
    // await new Promise(r => setTimeout(r, 250));

    await setupPythonLSP(blackModuleImportPath, pythonInterpreterPath);

  });
  // vscode.workspace.updateWorkspaceFolders(0, 1, { uri: vscode.Uri.file(projectPath), name: path.basename(projectPath) })
  // test('push method definition retreival', async () => {
  //   // const workspaceFolders = setWorkspaceFolders(projectPath);
  //   // await updateWorkspaceFolders(workspaceFolders);

  //   // const testFile = "/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1/strings_replace_3505_test.py";
  //   // const sourceFile = "/LSPRAG/experiments/projects/black/src/black/strings.py";
  //   // const symbolName = "replace";
  //   // const symbolName = "normalize_fstring_quotes";

  //   const testFile = "/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1/parse_push_8719_test.py";
  //   const sourceFile = "/LSPRAG/experiments/projects/black/src/blib2to3/pgen2/parse.py";
  //   const symbolName = "push";
  
  //   const document = await vscode.workspace.openTextDocument(vscode.Uri.file(sourceFile));
  //   const symbol = await getSymbolFromDocument(document, symbolName)!;
  //   console.log(`#### Symbol: ${symbol}`);
  //   const cached = new Map<string, Cached>();
  //   const tokensofSymbols = await getDecodedTokensFromSymbol(document, symbol!);
  //   // filter out tokens based on .word property

  //   const filterOutRedundantTokens = tokensofSymbols.filter(token => token.word !== symbolName);
  //   const childDefTokens: DecodedToken[] = await retrieveDefs(document, tokensofSymbols, false);
  //   const uriTokenMap = await processTokenDefinitions(document, childDefTokens, symbol, cached);

  //   // uriTokenMap should include [is_backtracking, DUMMY_NODE, DFAS, Context, RawNode], and should not include other words.
  //   const expectedSymbols = new Set(['is_backtracking', 'DUMMY_NODE', 'DFAS', 'Context', 'RawNode']);
  //   console.log()
  //   const actualSymbols = new Set<string>();

  //   for (const [uri, tokens] of uriTokenMap.entries()) {
  //     for (const token of tokens) {
  //       actualSymbols.add(token.word);
  //     }
  //   }

  //   // Check that all expected symbols are present
  //   for (const expectedSymbol of expectedSymbols) {
  //     assert.ok(actualSymbols.has(expectedSymbol), `Expected symbol '${expectedSymbol}' not found in uriTokenMap`);
  //   }

  //   // Check that no unexpected symbols are present
  //   for (const actualSymbol of actualSymbols) {
  //     assert.ok(expectedSymbols.has(actualSymbol), `Unexpected symbol '${actualSymbol}' found in uriTokenMap`);
  //   }

  // });

  test('execute all python files and produce reports', async () => {
    // const workspaceFolders = setWorkspaceFolders(projectPath);
    // await updateWorkspaceFolders(workspaceFolders);

    // const testFile = "/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1/strings_replace_3505_test.py";
    // const sourceFile = "/LSPRAG/experiments/projects/black/src/black/strings.py";
    // const symbolName = "replace";
    // const symbolName = "normalize_fstring_quotes";

    const testFile = "/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1/parse_push_8719_test.py";
    const sourceFile = "/LSPRAG/experiments/projects/black/src/blib2to3/pgen2/parse.py";
    const symbolName = "push";
    await setupDetect(testFile, sourceFile, symbolName);
  });

  // test('test buildDefTree with DFAS symbol', async () => {
  //   // Test with DFAS symbol that should have DFA children
  //   const sourceFile = "/LSPRAG/experiments/projects/black/src/blib2to3/pgen2/parse.py";
  //   const symbolName = "DFAS";

  //   const srcDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(sourceFile));
  //   const symbol = await getSymbolFromDocument(srcDoc, symbolName)!;

  //   if (symbol) {
  //     console.log(`#### Testing buildDefTree with symbol: ${symbol.name}`);
  //     const tree = await buildDefTree(srcDoc, symbol, 3); // Limit depth for testing
  //     const printed = prettyPrintDefTree(tree);
  //     console.log(`\n#### Definition Tree for ${symbol.name}:\n${printed}\n`);

  //     // Verify that DFA appears as children
  //     let hasDFAChildren = false;
  //     function checkForDFAChildren(node: any) {
  //       if (node.children && Array.isArray(node.children)) {
  //         for (const child of node.children) {
  //           if (child.name && child.name.includes('DFA')) {
  //             hasDFAChildren = true;
  //             console.log(`#### Found DFA child: ${child.name}`);
  //           }
  //           checkForDFAChildren(child);
  //         }
  //       }
  //     }
  //     checkForDFAChildren(tree);

  //     if (hasDFAChildren) {
  //       console.log('#### SUCCESS: DFAS symbol has DFA children as expected');
  //     } else {
  //       console.log('#### WARNING: No DFA children found in DFAS symbol tree');
  //     }
  //   } else {
  //     console.log(`#### Symbol ${symbolName} not found in ${sourceFile}`);
  //   }
  // });
});