import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { makeExecutor } from '../../../ut_runner/executor';
import { TestFile } from '../../../ut_runner/types';

suite('GoExecutor - Integration Tests', () => {
  let tempDir: string;
  const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures/go');

  setup(() => {
    // Create a temporary directory for test outputs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-executor-integration-'));
  });

  teardown(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('executes passing Go tests and produces valid logs', async function() {
    // Increase timeout for actual test execution
    this.timeout(30000);

    // Check if Go is installed
    try {
      const { execSync } = require('child_process');
      execSync('go version', { timeout: 5000 });
    } catch (error) {
      console.log('Go toolchain not available, skipping integration test');
      this.skip();
      return;
    }

    // Check if fixtures exist
    const passTestFile = path.join(fixturesDir, 'sample_pass_test.go');
    if (!fs.existsSync(passTestFile)) {
      console.log('Test fixtures not found, skipping integration test');
      this.skip();
      return;
    }

    const logsDir = path.join(tempDir, 'logs');
    const executor = makeExecutor('go', {
      logsDir,
      timeout: 10,
      verbose: true,
    });

    const testFiles: TestFile[] = [
      { path: passTestFile, language: 'go' },
    ];

    const results = await executor.executeMany(testFiles, 1);

    // Verify results structure
    assert.strictEqual(results.length, 1, 'Should return one result');
    const result = results[0];

    // Verify log file exists
    assert.ok(fs.existsSync(result.logPath), 'Log file should exist');
    
    // Verify log file is not empty
    const logStats = fs.statSync(result.logPath);
    assert.ok(logStats.size > 0, 'Log file should not be empty');

    // Read and verify log content
    const logContent = fs.readFileSync(result.logPath, 'utf8');
    
    // Check for header
    assert.ok(logContent.includes('GO TEST EXECUTION LOG'), 'Should have log header');
    assert.ok(logContent.includes('Test File:'), 'Should specify test file');
    assert.ok(logContent.includes('Module Root:'), 'Should specify module root');
    assert.ok(logContent.includes('Command:'), 'Should specify command');
    
    // Check for JSON output
    assert.ok(logContent.includes('"Action"'), 'Should contain JSON output');
    assert.ok(logContent.includes('"Test"'), 'Should contain test information');
    
    // Check for footer
    assert.ok(logContent.includes('EXECUTION SUMMARY'), 'Should have execution summary');
    assert.ok(logContent.includes('Exit Code:'), 'Should report exit code');
    assert.ok(logContent.includes('Duration:'), 'Should report duration');
    
    // Verify test passed (exit code 0)
    assert.strictEqual(result.exitCode, 0, 'Tests should pass with exit code 0');
    assert.strictEqual(result.timeout, false, 'Should not timeout');
    
    console.log(`[TEST] Successfully executed Go tests`);
    console.log(`[TEST] Log file: ${result.logPath}`);
    console.log(`[TEST] Exit code: ${result.exitCode}`);
    console.log(`[TEST] Duration: ${result.endedAt}`);
  });

  test('handles failing Go tests correctly', async function() {
    // Increase timeout for actual test execution
    this.timeout(30000);

    // Check if Go is installed
    try {
      const { execSync } = require('child_process');
      execSync('go version', { timeout: 5000 });
    } catch (error) {
      console.log('Go toolchain not available, skipping integration test');
      this.skip();
      return;
    }

    // Check if fixtures exist
    const failTestFile = path.join(fixturesDir, 'sample_fail_test.go');
    if (!fs.existsSync(failTestFile)) {
      console.log('Test fixtures not found, skipping integration test');
      this.skip();
      return;
    }

    const logsDir = path.join(tempDir, 'logs');
    const executor = makeExecutor('go', {
      logsDir,
      timeout: 10,
      verbose: true,
    });

    const testFiles: TestFile[] = [
      { path: failTestFile, language: 'go' },
    ];

    const results = await executor.executeMany(testFiles, 1);

    // Verify results structure
    assert.strictEqual(results.length, 1, 'Should return one result');
    const result = results[0];

    // Verify log file exists
    assert.ok(fs.existsSync(result.logPath), 'Log file should exist');
    
    // Read and verify log content
    const logContent = fs.readFileSync(result.logPath, 'utf8');
    
    // Check for failure indicators
    assert.ok(
      logContent.includes('FAIL') || logContent.includes('panic'),
      'Should contain failure indicators'
    );
    
    // Verify test failed (exit code != 0)
    assert.notStrictEqual(result.exitCode, 0, 'Tests should fail with non-zero exit code');
    assert.strictEqual(result.timeout, false, 'Should not timeout');
    
    console.log(`[TEST] Successfully detected failing Go tests`);
    console.log(`[TEST] Exit code: ${result.exitCode}`);
  });

  test('executes multiple Go test files concurrently', async function() {
    // Increase timeout for actual test execution
    this.timeout(30000);

    // Check if Go is installed
    try {
      const { execSync } = require('child_process');
      execSync('go version', { timeout: 5000 });
    } catch (error) {
      console.log('Go toolchain not available, skipping integration test');
      this.skip();
      return;
    }

    // Check if fixtures exist
    const passTestFile = path.join(fixturesDir, 'sample_pass_test.go');
    const failTestFile = path.join(fixturesDir, 'sample_fail_test.go');
    
    if (!fs.existsSync(passTestFile) || !fs.existsSync(failTestFile)) {
      console.log('Test fixtures not found, skipping integration test');
      this.skip();
      return;
    }

    const logsDir = path.join(tempDir, 'logs');
    const executor = makeExecutor('go', {
      logsDir,
      timeout: 10,
      verbose: true,
    });

    const testFiles: TestFile[] = [
      { path: passTestFile, language: 'go' },
      { path: failTestFile, language: 'go' },
    ];

    const startTime = Date.now();
    const results = await executor.executeMany(testFiles, 2);
    const duration = Date.now() - startTime;

    // Verify results structure
    assert.strictEqual(results.length, 2, 'Should return two results');

    // Verify both log files exist
    results.forEach(result => {
      assert.ok(fs.existsSync(result.logPath), `Log file should exist: ${result.logPath}`);
      const logStats = fs.statSync(result.logPath);
      assert.ok(logStats.size > 0, 'Log file should not be empty');
    });

    // Verify one passed and one failed
    const passedResults = results.filter(r => r.exitCode === 0);
    const failedResults = results.filter(r => r.exitCode !== 0);
    
    assert.strictEqual(passedResults.length, 1, 'Should have one passing test');
    assert.strictEqual(failedResults.length, 1, 'Should have one failing test');
    
    console.log(`[TEST] Successfully executed ${results.length} test files concurrently`);
    console.log(`[TEST] Total duration: ${duration}ms`);
    console.log(`[TEST] Passed: ${passedResults.length}, Failed: ${failedResults.length}`);
  });

  test('respects timeout configuration', async function() {
    // Increase timeout for this test
    this.timeout(20000);

    // Check if Go is installed
    try {
      const { execSync } = require('child_process');
      execSync('go version', { timeout: 5000 });
    } catch (error) {
      console.log('Go toolchain not available, skipping integration test');
      this.skip();
      return;
    }

    // Create a test file that sleeps longer than the timeout
    const timeoutTestDir = path.join(tempDir, 'timeout-test');
    fs.mkdirSync(timeoutTestDir, { recursive: true });
    
    const goModContent = 'module github.com/lsprag/timeout-test\n\ngo 1.21\n';
    fs.writeFileSync(path.join(timeoutTestDir, 'go.mod'), goModContent);
    
    const timeoutTestFile = path.join(timeoutTestDir, 'timeout_test.go');
    const testContent = `package main

import (
	"testing"
	"time"
)

func TestTimeout(t *testing.T) {
	time.Sleep(10 * time.Second) // Sleep longer than timeout
	t.Log("This should not print")
}
`;
    fs.writeFileSync(timeoutTestFile, testContent);

    const logsDir = path.join(tempDir, 'logs');
    const executor = makeExecutor('go', {
      logsDir,
      timeout: 2, // 2 second timeout
      verbose: true,
    });

    const testFiles: TestFile[] = [
      { path: timeoutTestFile, language: 'go' },
    ];

    const results = await executor.executeMany(testFiles, 1);

    // Verify timeout was triggered
    assert.strictEqual(results.length, 1, 'Should return one result');
    const result = results[0];
    
    assert.strictEqual(result.timeout, true, 'Should report timeout');
    assert.strictEqual(result.exitCode, 124, 'Should have timeout exit code (124)');
    
    // Verify log contains timeout information
    const logContent = fs.readFileSync(result.logPath, 'utf8');
    assert.ok(
      logContent.includes('TIMEOUT'),
      'Log should mention timeout'
    );
    
    console.log(`[TEST] Successfully detected and handled timeout`);
  });

  test('handles test with build errors', async function() {
    // Increase timeout for actual test execution
    this.timeout(20000);

    // Check if Go is installed
    try {
      const { execSync } = require('child_process');
      execSync('go version', { timeout: 5000 });
    } catch (error) {
      console.log('Go toolchain not available, skipping integration test');
      this.skip();
      return;
    }

    // Create a test file with build errors
    const buildErrorTestDir = path.join(tempDir, 'build-error-test');
    fs.mkdirSync(buildErrorTestDir, { recursive: true });
    
    const goModContent = 'module github.com/lsprag/build-error-test\n\ngo 1.21\n';
    fs.writeFileSync(path.join(buildErrorTestDir, 'go.mod'), goModContent);
    
    const buildErrorTestFile = path.join(buildErrorTestDir, 'builderror_test.go');
    const testContent = `package main

import "testing"

func TestBuildError(t *testing.T) {
	// Call a function that doesn't exist
	result := nonExistentFunction()
	if result != "expected" {
		t.Error("Should not reach here")
	}
}
`;
    fs.writeFileSync(buildErrorTestFile, testContent);

    const logsDir = path.join(tempDir, 'logs');
    const executor = makeExecutor('go', {
      logsDir,
      timeout: 10,
      verbose: true,
    });

    const testFiles: TestFile[] = [
      { path: buildErrorTestFile, language: 'go' },
    ];

    const results = await executor.executeMany(testFiles, 1);

    // Verify build error was captured
    assert.strictEqual(results.length, 1, 'Should return one result');
    const result = results[0];
    
    // Build errors typically result in non-zero exit code
    assert.notStrictEqual(result.exitCode, 0, 'Should have non-zero exit code');
    
    // Verify log contains build error information
    const logContent = fs.readFileSync(result.logPath, 'utf8');
    assert.ok(
      logContent.includes('undefined:') || logContent.includes('undeclared') || logContent.includes('build failed'),
      'Log should contain build error details'
    );
    
    console.log(`[TEST] Successfully detected build error`);
    console.log(`[TEST] Exit code: ${result.exitCode}`);
  });
});

