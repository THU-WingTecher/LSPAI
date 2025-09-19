import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from '../../ut_runner/runner';

suite('UT Runner - Python (black)', () => {
  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const testsDir = '/LSPAI/experiments/projects/black/src/lsprag_tests/gpt-4o-1';
  const outputDir = '/LSPAI/experiments/projects/black/src/lsprag_tests/final-report';

  test('execute all python files and produce reports', async () => {
    await runPipeline(testsDir, outputDir, {
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
  });
});