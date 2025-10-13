import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from '../../../ut_runner/runner';
import { getConfigInstance } from '../../../config';

suite('EXECUTE - Go (Cobra)', function() {
  // Increase timeout for actual test execution
  this.timeout(300000); // 5 minutes for full pipeline
  
  const testsDir = '/LSPRAG/experiments/data/main_result/cobra/lsprag/1/deepseek-chat/results/final-clean';
  const outputDir = '/LSPRAG/experiments/data/main_result/cobra/lsprag/1/deepseek-chat/results/pipeline-output';
  const testFileMapPath = '/LSPRAG/experiments/config/cobra_test_file_map.json';
  const projectPath = '/LSPRAG/experiments/data/main_result/cobra/lsprag/1/deepseek-chat/results/final-clean';
  
  test('execute all Go test files and produce reports', async function() {
    // Check if Go is installed
    try {
      const { execSync } = require('child_process');
      execSync('go version', { timeout: 5000 });
    } catch (error) {
      console.log('Go toolchain not available, skipping Cobra test');
      this.skip();
      return;
    }
    
    // Check if test directory exists
    if (!fs.existsSync(testsDir)) {
      console.log(`Test directory not found: ${testsDir}, skipping test`);
      this.skip();
      return;
    }
    
    // Check if test file map exists
    if (!fs.existsSync(testFileMapPath)) {
      console.log(`Test file map not found: ${testFileMapPath}, skipping test`);
      this.skip();
      return;
    }
    
    console.log('[TEST] Starting Cobra pipeline execution');
    console.log(`[TEST] Tests directory: ${testsDir}`);
    console.log(`[TEST] Output directory: ${outputDir}`);
    
    // Update config
    const currentConfig = {
      workspace: projectPath,
    };
    getConfigInstance().updateConfig({
      ...currentConfig
    });
    console.log(`[TEST] Updated config with workspace: ${projectPath}`);
    
    // Count test files before execution
    const { execSync } = require('child_process');
    const testFileCount = parseInt(
      execSync(`find "${testsDir}" -name "*_test.go" | wc -l`, { encoding: 'utf8' }).trim()
    );
    const sourceFileCount = parseInt(
      execSync(`find "${testsDir}" -name "*.go" -not -name "*_test.go" | wc -l`, { encoding: 'utf8' }).trim()
    );
    
    console.log(`[TEST] Found ${testFileCount} test files and ${sourceFileCount} source files`);
    console.log(`[TEST] Collector should filter and only run test files`);
    
    // Run the pipeline
    await runPipeline(testsDir, outputDir, testFileMapPath, {
      language: 'go',
      include: ['*_test.go'], // Only collect test files
      timeoutSec: 30, // 30 second timeout per test
      jobs: 4, // Run 4 tests concurrently
    });
    
    console.log('[TEST] Pipeline execution completed');
    
    // Verify outputs
    const logsDir = path.join(outputDir, 'logs');
    const junitDir = path.join(outputDir, 'junit');
    const unifiedLog = path.join(outputDir, 'pytest_output.log');
    const testResultsJson = path.join(outputDir, 'test_results.json');
    const fileResultsJson = path.join(outputDir, 'file_results.json');
    
    // Check directories exist
    assert.ok(fs.existsSync(logsDir), 'logs dir should exist');
    console.log('[TEST] ✓ Logs directory exists');
    
    assert.ok(fs.existsSync(junitDir), 'junit dir should exist');
    console.log('[TEST] ✓ JUnit directory exists');
    
    assert.ok(fs.existsSync(unifiedLog), 'unified log should exist');
    console.log('[TEST] ✓ Unified log exists');
    
    assert.ok(fs.existsSync(testResultsJson), 'test_results.json should exist');
    console.log('[TEST] ✓ test_results.json exists');
    
    assert.ok(fs.existsSync(fileResultsJson), 'file_results.json should exist');
    console.log('[TEST] ✓ file_results.json exists');
    
    // Count log files
    const logFiles = fs.readdirSync(logsDir).filter(n => n.endsWith('.log'));
    console.log(`[TEST] Found ${logFiles.length} log files`);
    assert.ok(logFiles.length > 0, 'should have at least one .log file');
    assert.ok(logFiles.length <= testFileCount, 'should not have more log files than test files');
    
    // Verify no source files were executed (log files should only be for test files)
    logFiles.forEach(logFile => {
      assert.ok(logFile.includes('_test.go'), `Log file should be for a test file: ${logFile}`);
    });
    console.log('[TEST] ✓ All log files are for test files (no source files executed)');
    
    // Check JSON payloads
    const testResultsSize = fs.statSync(testResultsJson).size;
    const fileResultsSize = fs.statSync(fileResultsJson).size;
    assert.ok(testResultsSize > 0, 'test_results.json should be non-empty');
    assert.ok(fileResultsSize > 0, 'file_results.json should be non-empty');
    
    const testJson = JSON.parse(fs.readFileSync(testResultsJson, 'utf-8'));
    const fileJson = JSON.parse(fs.readFileSync(fileResultsJson, 'utf-8'));
    assert.ok(testJson && typeof testJson === 'object', 'test_results.json should be valid JSON');
    assert.ok(fileJson && typeof fileJson === 'object', 'file_results.json should be valid JSON');
    
    // Analyze results
    const testCount = Object.keys(testJson.tests || {}).length;
    const fileCount = Object.keys(fileJson.files || {}).length;
    
    console.log(`[TEST] Analyzed ${testCount} test cases from ${fileCount} test files`);
    
    // Calculate statistics
    let totalPassed = 0;
    let totalFailed = 0;
    let totalErrors = 0;
    
    Object.values(fileJson.files || {}).forEach((file: any) => {
      totalPassed += file.counts['Passed'] || 0;
      totalFailed += file.counts['Assertion Errors'] || 0;
      Object.entries(file.counts).forEach(([key, value]) => {
        if (key !== 'Passed' && key !== 'Assertion Errors') {
          totalErrors += (value as number) || 0;
        }
      });
    });
    
    console.log(`[TEST] Overall Statistics:`);
    console.log(`[TEST]   Passed: ${totalPassed}`);
    console.log(`[TEST]   Failed: ${totalFailed}`);
    console.log(`[TEST]   Errors: ${totalErrors}`);
    console.log(`[TEST]   Total: ${totalPassed + totalFailed + totalErrors}`);
    
    if (totalPassed + totalFailed + totalErrors > 0) {
      const successRate = (totalPassed / (totalPassed + totalFailed + totalErrors) * 100).toFixed(1);
      console.log(`[TEST]   Success Rate: ${successRate}%`);
    }
    
    // Verify test file mapping worked
    console.log('\n[TEST] Checking test file mappings...');
    let mappedFiles = 0;
    Object.values(fileJson.files || {}).forEach((file: any) => {
      if (file.note && file.note.includes('Matched source:')) {
        mappedFiles++;
      }
    });
    console.log(`[TEST] ${mappedFiles} out of ${fileCount} test files have source mappings`);
    
    // Sample some test results
    console.log('\n[TEST] Sample test results:');
    const sampleTests = Object.entries(testJson.tests || {}).slice(0, 5);
    sampleTests.forEach(([name, result]: [string, any]) => {
      console.log(`[TEST]   - ${name}: ${result.status}`);
    });
    
    console.log('\n[TEST] ✓ Cobra pipeline execution completed successfully');
  });
});

