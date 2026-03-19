import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { LLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';
import { getConfigInstance } from '../../../config';
import { setWorkspaceFolders } from '../../../helper';
import { activate } from '../../../lsp/helper';

suite('Context: invoked function signatures', () => {
  const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
  const pythonProjectPath = path.join(fixturesDir, 'python');
  const sourceFile = path.join(pythonProjectPath, 'dependency_test.py');

  test('returns signatures of called helpers', async function() {
    this.timeout(30000);

    getConfigInstance().updateConfig({
      workspace: pythonProjectPath
    });

    const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
    console.log(`Python workspace path: ${workspaceFolders[0].uri.fsPath}`);

    await activate(vscode.Uri.file(sourceFile));
    await new Promise(resolve => setTimeout(resolve, 2000));

    const workflow = new LLMFixWorkflow('', pythonProjectPath, { language: 'python' });
    const signatures: any = workflow.getInvokedFunctionContext({
      symbol_name: 'target_function',
      source_file: sourceFile
    });

    console.log('Signatures: ', signatures);
    assert.ok(
      signatures.some((sig: string) => sig.includes('dependency_one')),
      `dependency_one signature missing: ${JSON.stringify(signatures)}`
    );
    assert.ok(
      signatures.some((sig: string) => sig.includes('dependency_two')),
      `dependency_two signature missing: ${JSON.stringify(signatures)}`
    );
    assert.ok(
      !signatures.some((sig: string) => sig.includes('target_function')),
      'Focal function should not appear in dependency signatures'
    );
  });
});

