import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { makeExecutor } from '../../../ut_runner/executor';
import { getConfigInstance, getProjectPythonExe, getProjectPythonPath, Provider } from '../../../config';
import { getProjectWorkspace } from '../../../config';
import { config } from 'process';
import { TestFile } from '../../../ut_runner/types';
import { Analyzer } from '../../../ut_runner/analyzer';

suite('JavaExecutor - Unit Tests', () => {
  const projectName = "commons-csv";
  
  // Directory containing multiple test files
  const testDir = "/LSPRAG/experiments/projects/commons-csv/lsprag-workspace/20251222_143650/commons-csv/lsprag_withcontext_/gpt-4o-mini/results/final";
  const testFileMapPath = "/LSPRAG/experiments/projects/commons-csv/lsprag-workspace/20251222_143650/commons-csv/lsprag_withcontext_/gpt-4o-mini/results/test_file_map.json"
  const testLogDir = testDir + "-analysis"
  // Function to recursively get all test files from directory
  function getTestFiles(dir: string): TestFile[] {
    const testFiles: TestFile[] = [];
    
    function walkDirectory(currentDir: string) {
      if (!fs.existsSync(currentDir)) {
        return;
      }
      
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively search subdirectories
          walkDirectory(fullPath);
        } else if (entry.isFile()) {
          // Only include Java test files
          if (entry.name.endsWith('Test.java') || entry.name.endsWith('Tests.java')) {
            testFiles.push({
              path: fullPath,
              language: 'java'
            });
          }
        }
      }
    }
    
    walkDirectory(dir);
    return testFiles;
  }
  
  setup(() => {
    // Create a temporary directory for test outputs
    const projectPath = getProjectWorkspace(projectName);
    const currentConfig = {
      workspace: projectPath,
      model: 'gpt-5',
      provider: 'openai' as Provider,
    };
    getConfigInstance().updateConfig({
      ...currentConfig
    });
  });

  // teardown(() => {
  //   // Clean up temporary directory
  //   if (fs.existsSync(tempDir)) {
  //     fs.rmSync(tempDir, { recursive: true, force: true });
  //   }
  // });

  test('JavaExecutor executes multiple test files and shows results', async () => {
    const logsDir = path.join(testLogDir, 'logs');
    const junitDir = path.join(testLogDir, 'junit');
    const outputDir = path.join(testLogDir, 'output');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(junitDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    // Get all test files from directory
    const testFiles = getTestFiles(testDir);
    
    console.log('\n=== Java Test Execution (Multiple Files) ===');
    console.log('Test directory:', testDir);
    console.log('Number of test files found:', testFiles.length);
    console.log('Logs dir:', logsDir);
    console.log('JUnit dir:', junitDir);
    console.log('\nTest files to execute:');
    testFiles.forEach((tf, idx) => {
      console.log(`  ${idx + 1}. ${path.basename(tf.path)}`);
    });
    
    assert.ok(testFiles.length > 0, 'Should find at least one test file');
    
    try {
      const executor = makeExecutor('java', {
        logsDir,
        junitDir,
        timeout: 32, // 2 minutes per test
        verbose: true
      });
      
      console.log('\n--- Executing tests ---');
      const startTime = Date.now();
      
      // Execute all test files with concurrency of 2
      const results = await executor.executeMany(testFiles, 2);
      const duration = Date.now() - startTime;
      
      const analyzer = new Analyzer('java');
      const report = await analyzer.analyze(results, testDir, outputDir, testFileMapPath);
      console.log('Analysis Report:', report);
      console.log('\n=== Execution Results Summary ===');
      console.log('Total Duration:', duration + 'ms', `(${(duration / 1000).toFixed(2)}s)`);
      console.log('Number of results:', results.length);
      
      assert.ok(results.length > 0, 'Should have at least one result');
      assert.strictEqual(results.length, testFiles.length, 'Should have result for each test file');
      
      // Calculate statistics
      const passed = results.filter(r => r.exitCode === 0 && !r.timeout);
      const failed = results.filter(r => r.exitCode !== 0);
      const timedOut = results.filter(r => r.timeout);
      
      console.log('\n--- Overall Statistics ---');
      console.log('Total Tests:', results.length);
      console.log('Passed:', passed.length, `(${((passed.length / results.length) * 100).toFixed(1)}%)`);
      console.log('Failed:', failed.length, `(${((failed.length / results.length) * 100).toFixed(1)}%)`);
      console.log('Timed Out:', timedOut.length);
      
      // Print detailed results for each test
      console.log('\n--- Individual Test Results ---');
      results.forEach((result, idx) => {
        console.log(`\n${idx + 1}. ${path.basename(result.testFile.path)}`);
        console.log('   Exit Code:', result.exitCode);
        console.log('   Status:', result.exitCode === 0 ? '✓ PASSED' : '✗ FAILED');
        console.log('   Timeout:', result.timeout ? 'YES' : 'NO');
        console.log('   Started:', result.startedAt);
        console.log('   Ended:', result.endedAt);
        console.log('   Log:', result.logPath);
        console.log('   Log Exists:', fs.existsSync(result.logPath));
        
        // For failed tests, show last 20 lines of log
        if (result.exitCode !== 0 && fs.existsSync(result.logPath)) {
          const logContent = fs.readFileSync(result.logPath, 'utf-8');
          const logLines = logContent.split('\n');
          console.log('   Last 20 log lines:');
          logLines.slice(-20).forEach(line => console.log('     ' + line));
        }
      });
      
      // Assertions
      results.forEach(result => {
        assert.ok(result.logPath, 'Log path should be set');
        assert.ok(result.startedAt, 'Started at should be set');
        assert.ok(result.endedAt, 'Ended at should be set');
        assert.ok(typeof result.timeout === 'boolean', 'Timeout should be boolean');
      });
      
      console.log('\n=== Test Complete ===\n');
      
    } catch (error) {
      console.error('\n=== Error During Execution ===');
      if (error instanceof Error) {
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
      } else {
        console.error('Unknown error:', error);
      }
      throw error;
    }
  });
});

