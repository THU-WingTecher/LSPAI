import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from '../../../ut_runner/runner';
import { getConfigInstance } from '../../../config';

suite('EXECUTE - Python (black)', () => {
  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const testsDir = '/LSPRAG/experiments/projects/black/src/lsprag_tests/gpt-4o-1';
  const outputDir = '/LSPRAG/experiments/projects/black/src/lsprag_tests/final-report';
  const testFileMapPath = '/LSPRAG/experiments/config/black_test_file_map.json';
  const projectPath = "/LSPRAG/experiments/projects/black";
  const currentConfig = {
      workspace: projectPath,
  };
  getConfigInstance().updateConfig({
    ...currentConfig
  });
  test('execute all python files and produce reports', async () => {
    await runPipeline(testsDir, outputDir, testFileMapPath, {
      language: 'python',
      pythonExe: pythonInterpreterPath,
      include: ['*.py'],          // run all .py files in the tree
      timeoutSec: 0,              // no per-file timeout
      jobs: 1,                    // keep CI stable; increase if needed
      pythonpath: [],             // add entries if imports require it
    });

    const logsDir = path.join(outputDir, 'logs');
    const junitDir = path.join(outputDir, 'junit');
    const unifiedLog = path.join(outputDir, 'pytest_output.log');
    const testResultsJson = path.join(outputDir, 'test_results.json');
    const fileResultsJson = path.join(outputDir, 'file_results.json');
    const examinationJson = path.join(outputDir, 'examination_results.json');
    const examinationSummaryMd = path.join(outputDir, 'examination_summary.md');
    const examinationDir = path.join(outputDir, 'examination');

    // Outputs exist
    assert.ok(fs.existsSync(logsDir), 'logs dir should exist');
    assert.ok(fs.existsSync(junitDir), 'junit dir should exist');
    assert.ok(fs.existsSync(unifiedLog), 'unified pytest log should exist');
    assert.ok(fs.existsSync(testResultsJson), 'test_results.json should exist');
    assert.ok(fs.existsSync(fileResultsJson), 'file_results.json should exist');

    // At least one log and junit file created
    const logFiles = fs.readdirSync(logsDir).filter(n => n.endsWith('.log'));
    const junitFiles = fs.readdirSync(junitDir).filter(n => n.endsWith('.xml'));
    assert.ok(logFiles.length > 0, 'should have at least one .log file');
    assert.ok(junitFiles.length > 0, 'should have at least one .xml file');

    // JSON payloads are non-empty and parseable
    const testResultsSize = fs.statSync(testResultsJson).size;
    const fileResultsSize = fs.statSync(fileResultsJson).size;
    assert.ok(testResultsSize > 0, 'test_results.json should be non-empty');
    assert.ok(fileResultsSize > 0, 'file_results.json should be non-empty');

    const testJson = JSON.parse(fs.readFileSync(testResultsJson, 'utf-8'));
    const fileJson = JSON.parse(fs.readFileSync(fileResultsJson, 'utf-8'));
    assert.ok(testJson && typeof testJson === 'object', 'test_results.json should be valid JSON');
    assert.ok(fileJson && typeof fileJson === 'object', 'file_results.json should be valid JSON');

    // Examination outputs (may or may not exist depending on whether there were assertion errors)
    console.log('[TEST] Checking examination outputs...');
    if (fs.existsSync(examinationJson)) {
      console.log('[TEST] Examination results found');
      const examJson = JSON.parse(fs.readFileSync(examinationJson, 'utf-8'));
      assert.ok(examJson && typeof examJson === 'object', 'examination_results.json should be valid JSON');
      assert.ok(examJson.summary, 'examination results should have summary');
      assert.ok(examJson.tests, 'examination results should have tests array');
      console.log(`[TEST] Examined ${examJson.summary.total_examined} test cases`);
      console.log(`[TEST] Found ${examJson.summary.with_redefined_symbols} with redefined symbols`);
      
      // Check examination summary markdown
      assert.ok(fs.existsSync(examinationSummaryMd), 'examination_summary.md should exist');
      
      // Check examination directory
      assert.ok(fs.existsSync(examinationDir), 'examination directory should exist');
    } else {
      console.log('[TEST] No examination results (no assertion errors found)');
    }
  });
});