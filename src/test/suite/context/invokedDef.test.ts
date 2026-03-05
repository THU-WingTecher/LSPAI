import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { LLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';
import { getConfigInstance } from '../../../config';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../helper';
import { activate } from '../../../lsp/helper';

suite('Context: invoked definitions', () => {
  const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
  const pythonProjectPath = path.join(fixturesDir, 'python');
  const sourceFile = path.join(pythonProjectPath, 'invoked_def_test.py');
  const symbolKindsSourceFile = path.join(pythonProjectPath, 'invoked_def_symbol_kinds.py');

  test('returns full definitions for invoked class/method/function/constant symbols', async function() {
    this.timeout(60000);

    getConfigInstance().updateConfig({
      workspace: pythonProjectPath
    });

    const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
    await updateWorkspaceFolders(workspaceFolders);

    await activate(vscode.Uri.file(sourceFile));
    await new Promise(resolve => setTimeout(resolve, 2500));

    const workflow = new LLMFixWorkflow('', pythonProjectPath, { language: 'python' });
    const definitions = await workflow.getInvokedFunctionSignatures({
      symbol_name: 'compute_total',
      source_file: sourceFile
    });

    assert.ok(definitions.length > 0, 'Expected invoked symbol definitions to be collected');
    const combined = definitions.join('\n\n');
    assert.ok(
      combined.includes('class ScaleHelper'),
      `ScaleHelper class definition missing: ${combined}`
    );
    assert.ok(
      combined.includes('def scale'),
      `ScaleHelper.scale method definition missing: ${combined}`
    );
    assert.ok(
      combined.includes('def add_offset'),
      `add_offset function definition missing: ${combined}`
    );
    assert.ok(
      combined.includes('DEFAULT_MULTIPLIER'),
      `DEFAULT_MULTIPLIER constant definition missing: ${combined}`
    );
    assert.ok(
      !combined.includes('def compute_total'),
      'Focal symbol definition should not be included in invoked definitions'
    );
  });

  test('captures broader python symbol-kind fixtures', async function() {
    this.timeout(60000);

    getConfigInstance().updateConfig({
      workspace: pythonProjectPath
    });

    const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
    await updateWorkspaceFolders(workspaceFolders);

    await activate(vscode.Uri.file(symbolKindsSourceFile));
    await new Promise(resolve => setTimeout(resolve, 2500));

    const workflow = new LLMFixWorkflow('', pythonProjectPath, { language: 'python' });
    const definitions = await workflow.getInvokedFunctionSignatures({
      symbol_name: 'use_symbol_kinds',
      source_file: symbolKindsSourceFile
    });

    assert.ok(definitions.length > 0, 'Expected invoked symbol definitions to be collected');

    const combined = definitions.join('\n\n');
    const kinds = new Set(
      definitions
        .map((entry) => entry.match(/^\[([^\]]+)\]/)?.[1])
        .filter((kind): kind is string => Boolean(kind))
        .map((kind) => kind.toLowerCase())
    );

    assert.ok(combined.includes('class GenericBox'), `GenericBox class definition missing: ${combined}`);
    assert.ok(combined.includes('def set_value'), `GenericBox.set_value method definition missing: ${combined}`);
    assert.ok(combined.includes('class RunMode'), `RunMode enum definition missing: ${combined}`);
    assert.ok(combined.includes('def build_payload'), `build_payload function definition missing: ${combined}`);
    assert.ok(combined.includes('GLOBAL_LIMIT'), `GLOBAL_LIMIT constant definition missing: ${combined}`);
    assert.ok(combined.includes('class EventHub'), `EventHub definition missing: ${combined}`);

    assert.ok(kinds.has('class'), `Expected class kind in extracted definitions. Got: ${Array.from(kinds).join(', ')}`);
    assert.ok(kinds.has('method') || kinds.has('function'), `Expected method/function kinds in extracted definitions. Got: ${Array.from(kinds).join(', ')}`);
    assert.ok(kinds.has('variable') || kinds.has('constant'), `Expected variable/constant kinds in extracted definitions. Got: ${Array.from(kinds).join(', ')}`);
    assert.ok(!kinds.has('variable'), `Variable kind should be skipped. Got: ${Array.from(kinds).join(', ')}`);
    assert.ok(
      !combined.includes('def use_symbol_kinds'),
      'Focal symbol definition should not be included in invoked definitions'
    );
  });
});
