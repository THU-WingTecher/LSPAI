import * as assert from 'assert';
import * as path from 'path';
import { Analyzer } from '../../../ut_runner/analyzer';
import { Collector } from '../../../ut_runner/collector';
import { Provider, PromptType, getConfigInstance } from '../../../config';

suite('Analyzer - Unit test to source mapping coverage (python/black)', () => {
  const pythonInterpreterPath = "/root/miniconda3/envs/LSPRAG/bin/python";
  const projectPath = "/LSPRAG/experiments/projects/black";
  const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src")];
  const sampleNumber = -1;
  const languageId = "python";
  const blackImportTestPath = "../../../resources/black_module_import_test.py"
  const currentConfig = {
      model: 'gpt-4o-mini',
      provider: 'openai' as Provider,
      expProb: 1,
      promptType: PromptType.DETAILED,
      workspace: projectPath,
  }
  // let testFilesPath = "/LSPRAG/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
  getConfigInstance().updateConfig({
      ...currentConfig
  });
  const testsDir = '/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1';
  const outputDir = '/LSPRAG/experiments/projects/black/src/lsprag_tests/final-report';
  const testFileMapPath = '/LSPRAG/experiments/config/black_test_file_map.json';

  test('all collected unit tests resolve to a source file', async () => {
    const analyzer = new Analyzer('python');

    // Initialize analyzer state (loads map and discovers source files)
    analyzer.analyze([], testsDir, outputDir, testFileMapPath);

    const collector = new Collector('python');
    const testFiles = collector.collect(testsDir);

    const unmatched: string[] = [];

    for (const tf of testFiles) {
      const src = analyzer.findSourceFileForTest(tf.path, null);
      if (!src) {
        unmatched.push(path.basename(tf.path));
      }
    }

    assert.strictEqual(
      unmatched.length,
      0,
      `Some unit tests have no source mapping: ${unmatched.join(', ')}`
    );
  });
});
