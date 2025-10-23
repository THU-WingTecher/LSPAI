# GoExecutor Implementation Guide

## Overview

The `GoExecutor` is a robust implementation for executing Go test files and capturing their results. It follows the same interface as `PytestExecutor` and provides comprehensive test execution with detailed logging, error detection, and validation.

## Features

### ✅ Core Functionality
- **Module Root Detection**: Automatically finds `go.mod` in parent directories (up to 20 levels)
- **Test Name Extraction**: Supports `Test*`, `Benchmark*`, and `Example*` functions
- **JSON Output**: Uses `go test -json` for structured output
- **Timeout Handling**: Configurable per-test timeout with proper cleanup
- **Concurrent Execution**: Run multiple test files in parallel with configurable job count

### ✅ Enhanced Features
- **Build Cache Cleanup**: Optional `go clean -cache -testcache` before tests
- **Coverage Support**: Optional coverage profile generation
- **Custom Build Flags**: Pass additional flags to `go test`
- **Verbose Logging**: Detailed execution logs with structured headers/footers
- **JSON Validation**: Post-execution validation of JSON output
- **Error Detection**: Identifies build errors, panics, and timeouts

### ✅ Logging & Diagnostics
- Structured log format with:
  - Test file information
  - Module root and command executed
  - Execution timing and duration
  - Exit codes and status
- Post-execution validation with warnings and errors
- Detailed error classification (build errors, panics, timeouts)

## Usage

### Basic Usage

```typescript
import { makeExecutor } from './ut_runner/executor';

const executor = makeExecutor('go', {
  logsDir: '/path/to/logs',
  timeout: 30, // seconds
});

const testFiles = [
  { path: '/path/to/test1_test.go', language: 'go' },
  { path: '/path/to/test2_test.go', language: 'go' },
];

const results = await executor.executeMany(testFiles, 2); // 2 concurrent jobs
```

### Advanced Configuration

```typescript
const executor = makeExecutor('go', {
  logsDir: '/path/to/logs',
  junitDir: '/path/to/junit', // Optional (not currently used)
  timeout: 60,
  cleanCache: true, // Clean build cache before tests
  verbose: true, // Enable verbose logging
  coverageDir: '/path/to/coverage', // Optional coverage output
  buildFlags: ['-race', '-short'], // Additional go test flags
  env: {
    GOPATH: '/custom/gopath',
    // ... other environment variables
  },
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logsDir` | `string` | **required** | Directory for test log files |
| `junitDir` | `string?` | `null` | Directory for JUnit XML (not currently used) |
| `timeout` | `number` | `0` | Timeout in seconds (0 = no timeout) |
| `cleanCache` | `boolean` | `false` | Clean build cache before tests |
| `verbose` | `boolean` | `false` | Enable verbose logging |
| `coverageDir` | `string?` | `null` | Directory for coverage profiles |
| `buildFlags` | `string[]` | `[]` | Additional go test flags |
| `env` | `ProcessEnv` | `process.env` | Environment variables |

## Output Format

### Execution Result

```typescript
interface ExecutionResult {
  testFile: TestFile;
  exitCode: number; // 0 = success, 1 = failure, 124 = timeout
  logPath: string; // Path to log file
  junitPath: string | null; // Not used for Go (always null)
  startedAt: string; // ISO timestamp
  endedAt: string; // ISO timestamp
  timeout: boolean; // true if test timed out
}
```

### Log File Structure

```
================================================================================
GO TEST EXECUTION LOG
================================================================================
Test File:        /path/to/test_file.go
Language:         go
Module Root:      /path/to/module
Started:          2024-01-01 00:00:00
Timeout:          30s
Command:          go test -json -count=1 -v ./pkg
PATH:             /usr/local/go/bin:/usr/bin
================================================================================

{"Time":"2024-01-01T00:00:00Z","Action":"run","Package":"pkg","Test":"TestName"}
{"Time":"2024-01-01T00:00:01Z","Action":"pass","Package":"pkg","Test":"TestName"}
...

================================================================================
EXECUTION SUMMARY
================================================================================
Exit Code:        0
Duration:         1234ms (1.23s)
Ended:            2024-01-01 00:00:01
Status:           SUCCESS
================================================================================
```

## Error Detection

The executor automatically detects and reports:

### Build Errors
- Undefined functions/variables
- Type mismatches
- Import errors

### Runtime Errors
- Panics with stack traces
- Nil pointer dereferences
- Test timeouts

### Validation Warnings
- Empty or missing log files
- Invalid JSON output
- Suspiciously small log files

## Test Execution Flow

1. **Module Root Detection**: Find `go.mod` in current or parent directories
2. **Test Name Extraction**: Parse test file for `Test*`, `Benchmark*`, `Example*` functions
3. **Build Cache Cleanup**: Optional `go clean -cache -testcache`
4. **Command Building**: Construct `go test` command with flags and filters
5. **Process Spawning**: Execute `go test` with timeout and I/O capture
6. **Output Streaming**: Stream stdout/stderr to log file
7. **Timeout Monitoring**: Kill process if timeout is exceeded
8. **Post-Execution Validation**: Validate JSON output and detect issues
9. **Result Reporting**: Return execution result with metrics

## Integration with runPipeline

The `GoExecutor` integrates seamlessly with the existing pipeline:

```typescript
import { runPipeline } from './ut_runner/runner';

await runPipeline(testsDir, outputDir, testFileMapPath, {
  language: 'go', // or 'golang'
  include: ['*_test.go'],
  timeoutSec: 30,
  jobs: 4,
});
```

## Testing

### Unit Tests

Run unit tests:
```bash
npm test -- --grep "GoExecutor - Unit Tests"
```

### Integration Tests

Run integration tests (requires Go installed):
```bash
npm test -- --grep "GoExecutor - Integration"
```

### Manual Testing

Run manual test script:
```bash
npm run compile
node out/test/manual/test_go_executor.js
```

## Troubleshooting

### Go toolchain not found
**Error**: `Go toolchain not found in PATH (need 'go' command)`

**Solution**: Install Go and ensure `go` command is in your PATH:
```bash
go version  # Should print Go version
```

### Module root not found
**Warning**: `No go.mod found within 20 levels, using directory: ...`

**Solution**: Ensure your test files are in a Go module with `go.mod`:
```bash
cd /path/to/your/project
go mod init github.com/your/module
```

### Build cache issues
**Issue**: Tests using stale cached results

**Solution**: Enable cache cleaning:
```typescript
const executor = makeExecutor('go', {
  logsDir: '/path/to/logs',
  cleanCache: true, // This will run 'go clean -cache -testcache'
});
```

### No JSON output in logs
**Warning**: `No valid JSON output found in log`

**Cause**: Test may have failed to compile or had import errors

**Solution**: Check log file for build errors. The executor will still capture and report these errors.

## Future Enhancements

Potential improvements for future versions:

- [ ] JUnit XML output generation (currently null)
- [ ] Subtest filtering support
- [ ] Coverage aggregation across multiple test files
- [ ] Table-driven test detection and filtering
- [ ] Benchmark result parsing
- [ ] Fuzzing support (`-fuzz` flag)
- [ ] Race detector results parsing

## Architecture

```
makeExecutor('go', opts)
    ↓
GoExecutor
    ├── Constructor
    │   ├── Validate Go toolchain
    │   ├── Create output directories
    │   └── Set configuration
    │
    ├── executeMany(testFiles, jobs)
    │   └── runWithLimit → runOne for each test
    │
    └── runOne(testFile)
        ├── findModuleRoot()
        ├── cleanBuildCache() [optional]
        ├── buildTestCommand()
        │   ├── listTestNamesInFile()
        │   └── construct args with flags
        ├── spawn('go', args)
        │   ├── writeLogHeader()
        │   ├── stream stdout/stderr
        │   ├── monitor timeout
        │   └── writeLogFooter()
        └── postExecutionValidation()
            ├── validateJsonOutput()
            └── detectExecutionIssues()
```

## Related Files

- `/LSPRAG/src/ut_runner/executor.ts` - Main executor implementation
- `/LSPRAG/src/test/suite/ut/executor.go.test.ts` - Unit tests
- `/LSPRAG/src/test/suite/ut/executor.go.integration.test.ts` - Integration tests
- `/LSPRAG/src/test/manual/test_go_executor.ts` - Manual test script
- `/LSPRAG/src/test/fixtures/go/` - Test fixtures

## See Also

- [Python Executor](./PytestExecutor.md) - Similar implementation for Python
- [Pipeline Documentation](./Pipeline.md) - Complete pipeline documentation
- [Go Testing Documentation](https://pkg.go.dev/testing) - Official Go testing package

