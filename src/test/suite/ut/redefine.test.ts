import * as assert from 'assert';
import * as path from 'path';
import { getConfigInstance } from '../../../config';
import { setupPythonLSP } from '../../../lsp/helper';
import { detectRedefinedAssertions } from '../../../ut_runner/analysis/assertion_detector';

suite('EXECUTE - Python (black)', () => {
  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const projectPath = "/LSPRAG/experiments/projects/black";
  const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src")];
  const currentConfig = {
      workspace: projectPath,
  };
  
  getConfigInstance().updateConfig({
    ...currentConfig
  });

  test('config workspace', async () => {
    await setupPythonLSP(blackModuleImportPath, pythonInterpreterPath);
  });

  test('execute all python files and produce reports', async () => {
    const testFile = "/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1/parse_push_8719_test.py";
    const sourceFile = "/LSPRAG/experiments/projects/black/src/blib2to3/pgen2/parse.py";
    const symbolName = "push";
    const result = await detectRedefinedAssertions(testFile, sourceFile, symbolName);
    assert.ok(result.hasRedefinedSymbols, 'Should have redefined symbols');
  });
});