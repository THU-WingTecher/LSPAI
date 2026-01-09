import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { LLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';
import { getConfigInstance } from '../../../config';
import { setupPythonLSP } from '../../../lsp/helper';
import { detectRedefinedAssertions } from '../../../ut_runner/analysis/assertion_detector';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../helper';

suite('EXECUTE - Python (black)', () => {
  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const projectPath = "/LSPRAG/experiments/projects/black";
  const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src")];
  const currentConfig = {
      workspace: projectPath,
  };
  const testFile = "/LSPRAG/experiments/data/main_result/black/lsprag/1/gpt-4o/results/final/parse_push_8719_test.py";
  const sourceFile = "/LSPRAG/experiments/projects/black/src/blib2to3/pgen2/parse.py";
  
  if (!fs.existsSync(testFile) || !fs.existsSync(sourceFile)) {
    console.log('Skipping test: Required files not found.');
    console.log('You may need to download baseline dataset, which is specified at ArtifactEvaluation.md');
    return;
  }

  getConfigInstance().updateConfig({
    ...currentConfig
  });

  test('Setup for experiment', async () => {
    const workspaceFolders = setWorkspaceFolders(projectPath);
    try {
        await updateWorkspaceFolders(workspaceFolders);
        console.log('Workspace folders updated to:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
    } catch (error) {
        console.error('Error updating workspace folders:', error);
    }
    assert.ok(vscode.workspace.workspaceFolders, 'Workspace folders should be set');
    assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, projectPath, 'Workspace folder should match project path');
    console.log('Setting up Python LSP');
    await setupPythonLSP(blackModuleImportPath, pythonInterpreterPath);
  });

  test('execute all python files and produce reports', async () => {
    
    const symbolName = "push";
    const result = await detectRedefinedAssertions(testFile, sourceFile, symbolName);
    console.log("result", result);
    assert.ok(result.hasRedefinedSymbols, 'Should have redefined symbols');
  });

  test('extractContextForSentinelRedefinitionMismatch uses examination data', async () => {
    const workflow = new LLMFixWorkflow('/tmp/nonexistent.json', path.join('/tmp', 'llm-fix-redefine'), {});
    const ctx = await workflow.extractContextForSentinelRedefinitionMismatch({
      examination: {
        redefinedSymbols: [
          {
            name: 'DUMMY_NODE',
            symbolType: 'Constant',
            originalLocation: 'src/blib2to3/pgen2/parse.py@38:0',
            sourceLoc: 'src/blib2to3/pgen2/parse.py@38:0',
            testLoc: 'parse_push_8719_test.py@7:0',
            hoverText: 'hover info',
            trailingSourceContext: 'context line 1\ncontext line 2',
            sourceImplementation: 'impl'
          }
        ]
      }
    });

    assert.strictEqual(ctx.length, 1);
    const entry = ctx[0];
    console.log("entry", entry);
    assert.ok(entry.includes('Symbol: DUMMY_NODE'));
    assert.ok(entry.includes('Type: Constant'));
    assert.ok(entry.includes('Source:'));
    assert.ok(entry.includes('Location: src/blib2to3/pgen2/parse.py@38:0'));
    assert.ok(entry.includes('Hover: hover info'));
    assert.ok(entry.includes('Context:\ncontext line 1\ncontext line 2'));
    assert.ok(entry.includes('Test:'));
    assert.ok(entry.includes('Location: parse_push_8719_test.py@7:0'));
    assert.ok(!entry.includes('Implementation:'), 'Context should be preferred over implementation');
  });
});