/**
 * Manual test script for GoExecutor
 * 
 * Usage:
 *   npm run compile
 *   node out/test/manual/test_go_executor.js
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { makeExecutor } from '../../ut_runner/executor';
import { TestFile } from '../../ut_runner/types';

async function main() {
  console.log('='.repeat(80));
  console.log('GoExecutor Manual Test');
  console.log('='.repeat(80));
  
  // Check if Go is installed
  try {
    const { execSync } = require('child_process');
    const version = execSync('go version', { encoding: 'utf8', timeout: 5000 });
    console.log(`✓ Go toolchain detected: ${version.trim()}`);
  } catch (error) {
    console.error('✗ Go toolchain not found. Please install Go to run this test.');
    process.exit(1);
  }
  
  // Create temporary directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-executor-manual-test-'));
  console.log(`✓ Created temp directory: ${tempDir}`);
  
  try {
    // Setup test fixtures
    const fixturesDir = path.join(tempDir, 'fixtures');
    fs.mkdirSync(fixturesDir, { recursive: true });
    
    // Create go.mod
    fs.writeFileSync(
      path.join(fixturesDir, 'go.mod'),
      'module github.com/lsprag/manual-test\n\ngo 1.21\n'
    );
    
    // Create passing test
    fs.writeFileSync(
      path.join(fixturesDir, 'pass_test.go'),
      `package test

import "testing"

func TestPass1(t *testing.T) {
	if 1+1 != 2 {
		t.Error("Math is broken")
	}
}

func TestPass2(t *testing.T) {
	result := "hello"
	if result != "hello" {
		t.Error("String comparison failed")
	}
}
`
    );
    
    // Create failing test
    fs.writeFileSync(
      path.join(fixturesDir, 'fail_test.go'),
      `package test

import "testing"

func TestFail(t *testing.T) {
	if 1+1 != 3 {
		t.Error("Expected 1+1 to equal 3 (intentional failure)")
	}
}
`
    );
    
    console.log('✓ Created test fixtures');
    
    // Setup output directories
    const logsDir = path.join(tempDir, 'logs');
    const coverageDir = path.join(tempDir, 'coverage');
    
    console.log('\n' + '='.repeat(80));
    console.log('Creating GoExecutor...');
    console.log('='.repeat(80));
    
    // Create executor
    const executor = makeExecutor('go', {
      logsDir,
      coverageDir,
      timeout: 10,
      verbose: true,
      cleanCache: false,
    });
    
    console.log('✓ Executor created successfully');
    
    // Prepare test files
    const testFiles: TestFile[] = [
      { path: path.join(fixturesDir, 'pass_test.go'), language: 'go' },
      { path: path.join(fixturesDir, 'fail_test.go'), language: 'go' },
    ];
    
    console.log('\n' + '='.repeat(80));
    console.log('Executing tests...');
    console.log('='.repeat(80));
    
    // Execute tests
    const startTime = Date.now();
    const results = await executor.executeMany(testFiles, 2);
    const duration = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(80));
    console.log('Test Results');
    console.log('='.repeat(80));
    
    console.log(`\nTotal execution time: ${duration}ms`);
    console.log(`Total tests executed: ${results.length}`);
    
    // Analyze results
    const passed = results.filter(r => r.exitCode === 0 && !r.timeout);
    const failed = results.filter(r => r.exitCode !== 0 && !r.timeout);
    const timedOut = results.filter(r => r.timeout);
    
    console.log(`\nPassed: ${passed.length}`);
    console.log(`Failed: ${failed.length}`);
    console.log(`Timed out: ${timedOut.length}`);
    
    // Display details for each result
    console.log('\n' + '-'.repeat(80));
    results.forEach((result, index) => {
      console.log(`\nTest ${index + 1}: ${path.basename(result.testFile.path)}`);
      console.log(`  Exit Code: ${result.exitCode}`);
      console.log(`  Timeout: ${result.timeout}`);
      console.log(`  Started: ${result.startedAt}`);
      console.log(`  Ended: ${result.endedAt}`);
      console.log(`  Log: ${result.logPath}`);
      
      if (fs.existsSync(result.logPath)) {
        const logSize = fs.statSync(result.logPath).size;
        console.log(`  Log Size: ${logSize} bytes`);
        
        // Show first few lines of log
        const logContent = fs.readFileSync(result.logPath, 'utf8');
        const lines = logContent.split('\n').slice(0, 10);
        console.log(`  Log Preview (first 10 lines):`);
        lines.forEach(line => console.log(`    ${line}`));
        if (logContent.split('\n').length > 10) {
          console.log(`    ... (${logContent.split('\n').length - 10} more lines)`);
        }
      }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('Validation');
    console.log('='.repeat(80));
    
    // Validate results
    let allPassed = true;
    
    // Check that we have correct number of results
    if (results.length !== 2) {
      console.error(`✗ Expected 2 results, got ${results.length}`);
      allPassed = false;
    } else {
      console.log('✓ Correct number of results');
    }
    
    // Check that pass_test.go passed
    const passResult = results.find(r => r.testFile.path.includes('pass_test.go'));
    if (!passResult) {
      console.error('✗ pass_test.go result not found');
      allPassed = false;
    } else if (passResult.exitCode !== 0) {
      console.error(`✗ pass_test.go should pass (exit code: ${passResult.exitCode})`);
      allPassed = false;
    } else {
      console.log('✓ pass_test.go passed as expected');
    }
    
    // Check that fail_test.go failed
    const failResult = results.find(r => r.testFile.path.includes('fail_test.go'));
    if (!failResult) {
      console.error('✗ fail_test.go result not found');
      allPassed = false;
    } else if (failResult.exitCode === 0) {
      console.error('✗ fail_test.go should fail');
      allPassed = false;
    } else {
      console.log('✓ fail_test.go failed as expected');
    }
    
    // Check that log files exist
    results.forEach(result => {
      if (!fs.existsSync(result.logPath)) {
        console.error(`✗ Log file missing: ${result.logPath}`);
        allPassed = false;
      } else {
        console.log(`✓ Log file exists: ${path.basename(result.logPath)}`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    if (allPassed) {
      console.log('✓ ALL VALIDATIONS PASSED');
      console.log('='.repeat(80));
      console.log('\nGoExecutor is working correctly!');
    } else {
      console.log('✗ SOME VALIDATIONS FAILED');
      console.log('='.repeat(80));
      console.log('\nPlease review the errors above.');
      process.exit(1);
    }
    
  } finally {
    // Cleanup (optional - comment out to inspect logs)
    console.log('\n' + '='.repeat(80));
    console.log(`Temp directory: ${tempDir}`);
    console.log('(Not cleaning up - you can inspect the logs manually)');
    console.log('='.repeat(80));
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

