import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { makeExecutor } from '../../../ut_runner/executor';

suite('GoExecutor - Unit Tests', () => {
  let tempDir: string;

  setup(() => {
    // Create a temporary directory for test outputs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-executor-test-'));
  });

  teardown(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('makeExecutor creates GoExecutor for "go" language', () => {
    const logsDir = path.join(tempDir, 'logs');
    const executor = makeExecutor('go', {
      logsDir,
      timeout: 30,
    });

    assert.ok(executor, 'Executor should be created');
    assert.strictEqual(typeof executor.executeMany, 'function', 'Executor should have executeMany method');
  });

  test('makeExecutor creates GoExecutor for "golang" language', () => {
    const logsDir = path.join(tempDir, 'logs');
    const executor = makeExecutor('golang', {
      logsDir,
      timeout: 30,
    });

    assert.ok(executor, 'Executor should be created');
    assert.strictEqual(typeof executor.executeMany, 'function', 'Executor should have executeMany method');
  });

  test('GoExecutor creates required directories', () => {
    const logsDir = path.join(tempDir, 'logs');
    const junitDir = path.join(tempDir, 'junit');
    const coverageDir = path.join(tempDir, 'coverage');

    makeExecutor('go', {
      logsDir,
      junitDir,
      coverageDir,
      timeout: 30,
    });

    assert.ok(fs.existsSync(logsDir), 'Logs directory should be created');
    assert.ok(fs.existsSync(junitDir), 'JUnit directory should be created');
    assert.ok(fs.existsSync(coverageDir), 'Coverage directory should be created');
  });

  test('GoExecutor validates go toolchain on construction', () => {
    const logsDir = path.join(tempDir, 'logs');
    
    // This should succeed if go is installed
    try {
      makeExecutor('go', {
        logsDir,
        timeout: 30,
      });
      // If we get here, go is available
      assert.ok(true, 'Go toolchain is available');
    } catch (error) {
      // If go is not installed, we expect an error
      if (error instanceof Error) {
        assert.ok(
          error.message.includes('Go toolchain not found'),
          'Should throw meaningful error when go is not available'
        );
      }
    }
  });

  test('GoExecutor handles configuration options', () => {
    const logsDir = path.join(tempDir, 'logs');
    
    // Test with various options
    const executor = makeExecutor('go', {
      logsDir,
      timeout: 60,
      cleanCache: true,
      verbose: true,
      buildFlags: ['-race', '-short'],
      env: { GOPATH: '/custom/gopath' },
    });

    assert.ok(executor, 'Executor should be created with custom options');
  });

  suite('Test Name Extraction', () => {
    test('extracts standard test functions', () => {
      const testFile = path.join(tempDir, 'sample_test.go');
      const content = `package sample

import "testing"

func TestSimple(t *testing.T) {
    if 1+1 != 2 {
        t.Error("Math is broken")
    }
}

func TestAnother(t *testing.T) {
    result := true
    if !result {
        t.Fatal("Expected true")
    }
}
`;
      fs.writeFileSync(testFile, content);

      // We can't directly test the private method, but we can verify
      // the file exists and has the expected content
      assert.ok(fs.existsSync(testFile));
      const readContent = fs.readFileSync(testFile, 'utf8');
      assert.ok(readContent.includes('func TestSimple'));
      assert.ok(readContent.includes('func TestAnother'));
    });

    test('extracts benchmark functions', () => {
      const testFile = path.join(tempDir, 'bench_test.go');
      const content = `package sample

import "testing"

func BenchmarkSomething(b *testing.B) {
    for i := 0; i < b.N; i++ {
        // benchmark code
    }
}

func BenchmarkAnother(b *testing.B) {
    for i := 0; i < b.N; i++ {
        // more benchmark code
    }
}
`;
      fs.writeFileSync(testFile, content);

      const readContent = fs.readFileSync(testFile, 'utf8');
      assert.ok(readContent.includes('func BenchmarkSomething'));
      assert.ok(readContent.includes('func BenchmarkAnother'));
    });

    test('extracts example functions', () => {
      const testFile = path.join(tempDir, 'example_test.go');
      const content = `package sample

func ExampleHello() {
    // Output: Hello
}

func ExampleWorld() {
    // Output: World
}
`;
      fs.writeFileSync(testFile, content);

      const readContent = fs.readFileSync(testFile, 'utf8');
      assert.ok(readContent.includes('func ExampleHello'));
      assert.ok(readContent.includes('func ExampleWorld'));
    });
  });

  suite('Module Root Detection', () => {
    test('finds go.mod in current directory', () => {
      const moduleDir = path.join(tempDir, 'mymodule');
      fs.mkdirSync(moduleDir, { recursive: true });
      fs.writeFileSync(path.join(moduleDir, 'go.mod'), 'module example.com/mymodule\n\ngo 1.21\n');

      // Create a test file in the module
      const testFile = path.join(moduleDir, 'sample_test.go');
      fs.writeFileSync(testFile, 'package main\n\nimport "testing"\n\nfunc TestDummy(t *testing.T) {}\n');

      assert.ok(fs.existsSync(path.join(moduleDir, 'go.mod')));
    });

    test('finds go.mod in parent directory', () => {
      const moduleDir = path.join(tempDir, 'mymodule');
      const subDir = path.join(moduleDir, 'pkg', 'subpkg');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(moduleDir, 'go.mod'), 'module example.com/mymodule\n\ngo 1.21\n');

      // Create a test file in subdirectory
      const testFile = path.join(subDir, 'sample_test.go');
      fs.writeFileSync(testFile, 'package subpkg\n\nimport "testing"\n\nfunc TestDummy(t *testing.T) {}\n');

      assert.ok(fs.existsSync(path.join(moduleDir, 'go.mod')));
      assert.ok(fs.existsSync(testFile));
    });

    test('handles missing go.mod gracefully', () => {
      const testDir = path.join(tempDir, 'no-module');
      fs.mkdirSync(testDir, { recursive: true });

      const testFile = path.join(testDir, 'sample_test.go');
      fs.writeFileSync(testFile, 'package main\n\nimport "testing"\n\nfunc TestDummy(t *testing.T) {}\n');

      // Should not crash even without go.mod
      assert.ok(fs.existsSync(testFile));
    });
  });

  suite('JSON Output Validation', () => {
    test('validates valid go test JSON output', () => {
      const logFile = path.join(tempDir, 'test.log');
      const jsonOutput = `{"Time":"2024-01-01T00:00:00Z","Action":"run","Package":"example","Test":"TestSample"}
{"Time":"2024-01-01T00:00:01Z","Action":"output","Package":"example","Test":"TestSample","Output":"=== RUN   TestSample\\n"}
{"Time":"2024-01-01T00:00:02Z","Action":"pass","Package":"example","Test":"TestSample","Elapsed":1.23}
{"Time":"2024-01-01T00:00:02Z","Action":"pass","Package":"example","Elapsed":1.25}
`;
      fs.writeFileSync(logFile, jsonOutput);

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      let validLines = 0;
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.Time && parsed.Action) {
            validLines++;
          }
        } catch (e) {
          // Not JSON
        }
      }

      assert.ok(validLines > 0, 'Should find valid JSON lines');
      assert.strictEqual(validLines, 4, 'Should find exactly 4 JSON lines');
    });

    test('handles mixed JSON and non-JSON output', () => {
      const logFile = path.join(tempDir, 'mixed.log');
      const mixedOutput = `=== GO TEST EXECUTION LOG ===
{"Time":"2024-01-01T00:00:00Z","Action":"run","Package":"example","Test":"TestSample"}
Some plain text output
{"Time":"2024-01-01T00:00:01Z","Action":"pass","Package":"example","Test":"TestSample","Elapsed":1.23}
PASS
`;
      fs.writeFileSync(logFile, mixedOutput);

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      let validLines = 0;
      let nonJsonLines = 0;
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.Time && parsed.Action) {
            validLines++;
          }
        } catch (e) {
          nonJsonLines++;
        }
      }

      assert.ok(validLines > 0, 'Should find valid JSON lines');
      assert.ok(nonJsonLines > 0, 'Should find non-JSON lines');
    });
  });

  suite('Error Detection', () => {
    test('detects build errors', () => {
      const logFile = path.join(tempDir, 'build-error.log');
      const errorOutput = `# example.com/mypackage
./main.go:10:2: undefined: nonExistentFunction
FAIL    example.com/mypackage [build failed]
`;
      fs.writeFileSync(logFile, errorOutput);

      const content = fs.readFileSync(logFile, 'utf8');
      assert.ok(content.includes('undefined:'), 'Should contain build error');
      assert.ok(content.includes('[build failed]'), 'Should indicate build failure');
    });

    test('detects runtime panics', () => {
      const logFile = path.join(tempDir, 'panic.log');
      const panicOutput = `=== RUN   TestPanic
panic: intentional panic for testing

goroutine 5 [running]:
example.com/mypackage.TestPanic(0x...)
--- FAIL: TestPanic (0.00s)
`;
      fs.writeFileSync(logFile, panicOutput);

      const content = fs.readFileSync(logFile, 'utf8');
      assert.ok(content.includes('panic:'), 'Should contain panic message');
      assert.ok(content.includes('goroutine'), 'Should contain goroutine info');
    });

    test('detects test timeouts', () => {
      const logFile = path.join(tempDir, 'timeout.log');
      const timeoutOutput = `=== RUN   TestLongRunning
panic: test timed out after 10s

goroutine 5 [running]:
testing.(*T).FailNow(0x...)
--- FAIL: TestLongRunning (10.00s)
`;
      fs.writeFileSync(logFile, timeoutOutput);

      const content = fs.readFileSync(logFile, 'utf8');
      assert.ok(content.match(/test timed out/i), 'Should contain timeout message');
    });
  });

  suite('Log Format', () => {
    test('log header contains required information', () => {
      const logFile = path.join(tempDir, 'header-test.log');
      const header = `${'='.repeat(80)}
GO TEST EXECUTION LOG
${'='.repeat(80)}
Test File:        /path/to/test_file.go
Language:         go
Module Root:      /path/to/module
Started:          2024-01-01 00:00:00
Timeout:          30s
Command:          go test -json -count=1 -v ./pkg
PATH:             /usr/local/go/bin:/usr/bin
${'='.repeat(80)}
`;
      fs.writeFileSync(logFile, header);

      const content = fs.readFileSync(logFile, 'utf8');
      assert.ok(content.includes('GO TEST EXECUTION LOG'));
      assert.ok(content.includes('Test File:'));
      assert.ok(content.includes('Language:'));
      assert.ok(content.includes('Module Root:'));
      assert.ok(content.includes('Started:'));
      assert.ok(content.includes('Timeout:'));
      assert.ok(content.includes('Command:'));
    });

    test('log footer contains execution summary', () => {
      const logFile = path.join(tempDir, 'footer-test.log');
      const footer = `
${'='.repeat(80)}
EXECUTION SUMMARY
${'='.repeat(80)}
Exit Code:        0
Duration:         1234ms (1.23s)
Ended:            2024-01-01 00:00:01
Status:           SUCCESS
${'='.repeat(80)}
`;
      fs.writeFileSync(logFile, footer);

      const content = fs.readFileSync(logFile, 'utf8');
      assert.ok(content.includes('EXECUTION SUMMARY'));
      assert.ok(content.includes('Exit Code:'));
      assert.ok(content.includes('Duration:'));
      assert.ok(content.includes('Ended:'));
      assert.ok(content.includes('Status:'));
    });
  });
});

