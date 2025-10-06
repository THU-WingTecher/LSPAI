import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from '../../../ut_runner/runner';
import { getConfigInstance } from '../../../config';
import * as vscode from 'vscode';
import { setupPythonLSP } from '../../../lsp/helper';
import { isBetweenFocalMethod, isInWorkspace } from '../../../lsp/definition';
import { getAllSymbols } from '../../../lsp/symbol';
import { getSymbolFromDocument } from '../../../lsp/symbol';
import { getSymbolByLocation, getSymbolDetail } from '../../../lsp/symbol';
import { DecodedToken, getDecodedTokensFromSymbol } from '../../../lsp/token';
import { retrieveDef, retrieveDefs } from '../../../lsp/definition';

async function buildDefTree(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, maxDepth: number = 5) {
  const visited = new Set<string>();

  const root: any = { name: symbol.name, uri: document.uri.toString(), children: [] as any[] };
  const queue: { doc: vscode.TextDocument; sym: vscode.DocumentSymbol; depth: number; node: any }[] = [
    { doc: document, sym: symbol, depth: 0, node: root }
  ];

  while (queue.length > 0) {
    const { doc: currDoc, sym: currSym, depth, node } = queue.shift()!;
    if (depth >= maxDepth) {
      console.log(`#### Depth limit reached at ${currDoc.uri.fsPath} :: ${currSym.name} (depth=${depth})`);
      node.truncated = true;
      continue;
    }

    console.log(`#### Visiting: ${currDoc.uri.fsPath} :: ${currSym.name}`);
    const tokens: DecodedToken[] = await getDecodedTokensFromSymbol(currDoc, currSym);
    const defTokens: DecodedToken[] = await retrieveDefs(currDoc, tokens, false);
    console.log(`#### Tokens: ${tokens.length}, DefTokens: ${defTokens.length}`);
    console.log(`#### DefTokens: ${defTokens.map(tok => tok.defSymbol ? tok.defSymbol.name : '')}`);

    for (const tok of defTokens) {
      if (!tok.definition || tok.definition.length === 0) {
        continue;
      }
      for (const defLoc of tok.definition) {
        const key = `${defLoc.uri.toString()}#${defLoc.range.start.line}:${defLoc.range.start.character}-${defLoc.range.end.line}:${defLoc.range.end.character}`;
        if (visited.has(key)) {
          console.log(`#### Skip visited: ${key}`);
          continue;
        }
        visited.add(key);
        try {
          const defDoc = await vscode.workspace.openTextDocument(defLoc.uri);
          const defSym = await getSymbolByLocation(defDoc, defLoc.range.start);
          if (!defSym) {
            console.log(`#### No symbol at def for token '${tok.word}' in ${defLoc.uri.fsPath}`);
            continue;
          }
          if (!isBetweenFocalMethod(defLoc.range, currSym)) {
            console.log(`#### Definition is within focal method: ${defSym.name}`);
            continue;
          }
          if (!isInWorkspace(defLoc.uri.fsPath)) {
            const brief = defSym.detail || getSymbolDetail(defDoc, defSym, false);
            console.log(`#### External: ${defSym.name} :: ${brief}`);
            node.children.push({ name: defSym.name, uri: defLoc.uri.toString(), external: true, detail: brief });
            continue;
          }

          const childNode: any = { name: defSym.name, uri: defLoc.uri.toString(), children: [] as any[] };
          node.children.push(childNode);
          queue.push({ doc: defDoc, sym: defSym, depth: depth + 1, node: childNode });
        } catch (e) {
          console.log(`#### Error processing definition for '${tok.word}': ${e}`);
        }
      }
    }
  }

  console.log(`#### Built tree for: ${symbol.name}`);
  return root;
}


function prettyPrintDefTree(node: any, prefix: string = '', isLast: boolean = true): string {
  const connector = prefix ? (isLast ? '└─ ' : '├─ ') : '';
  const labelBase = node.external ? `${node.name} [external]` : node.name;
  const label = node.truncated ? `${labelBase} [max-depth]` : labelBase;
  const lines: string[] = [`${prefix}${connector}${label}`];

  const children = Array.isArray(node.children) ? node.children : [];
  const nextPrefixBase = prefix ? (isLast ? '   ' : '│  ') : '';

  // For external nodes, append brief detail one level below and stop
  if (node.external && node.detail) {
    lines.push(`${prefix}${nextPrefixBase}${String(node.detail).trim()}`);
    return lines.join('\n');
  }

  children.forEach((child: any, index: number) => {
    const childIsLast = index === children.length - 1;
    const childPrefix = prefix + nextPrefixBase;
    lines.push(prettyPrintDefTree(child, childPrefix, childIsLast));
  });

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
  test('execute all python files and produce reports', async () => {
    // const workspaceFolders = setWorkspaceFolders(projectPath);
    // await updateWorkspaceFolders(workspaceFolders);

    const testFile = "/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1/strings_replace_3505_test.py";
    const sourceFile = "/LSPRAG/experiments/projects/black/src/black/strings.py";
    // const symbolName = "replace";
    const symbolName = "normalize_fstring_quotes";

    // const testFile = "/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1/parse_push_8719_test.py";
    // const sourceFile = "/LSPRAG/experiments/projects/black/src/blib2to3/pgen2/parse.py";
    // const symbolName = "push";
    await setupDetect(testFile, sourceFile, symbolName);
  });
});