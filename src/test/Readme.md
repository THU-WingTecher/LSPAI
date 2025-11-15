# Test Suite Documentation

This directory contains comprehensive test suites for LSPRAG functionality. The tests are organized into three main categories: **AST** (Abstract Syntax Tree), **LSP** (Language Server Protocol), and **LLM** (Large Language Model) integration tests.

## Table of Contents

- [Running Tests](#running-tests)
- [Test File Naming Convention](#test-file-naming-convention)
- [Test Suites Overview](#test-suites-overview)
- [Known Issues and Troubleshooting](#known-issues-and-troubleshooting)

## Running Tests

### Basic Command

```bash
npm run test --testfile="{testfile rule}"
```

### Examples

```bash
# Run a specific test file
npm run test --testfile=ast.ast

# Run all tests matching a pattern
npm run test --testfile=ast.java      # Runs java.cfg.test.ts and java.path.test.ts
npm run test --testfile=lsp.python    # Runs python.test.ts

# Run all tests in a directory
npm run test --testfile=ast            # Runs all AST tests
npm run test --testfile=lsp            # Runs all LSP tests

# Run multiple test files
npm run test --testfile=ast.ast,lsp.symbol
```

## Test File Naming Convention

The test file naming follows a pattern based on the file location:

- **Pattern**: `{suite}.{filename}` (without `.test.ts` extension)
- **Example**: `src/test/suite/ast/ast.test.ts` → use `ast.ast`
- **Example**: `src/test/suite/ast/java.cfg.test.ts` → use `ast.java.cfg`
- **Pattern matching**: `ast.java` matches all files starting with `java` in the `ast` directory

## Test Suites Overview

### `suite/ast/` - Abstract Syntax Tree and Control Flow Graph Tests

Tests for AST parsing and Control Flow Graph (CFG) construction across multiple languages.

#### Test Files

| File | Description |
|------|-------------|
| `ast.test.ts` | **Basic AST Parsing Tests**<br>Tests AST parsing for all supported languages (Python, Java, Go, C++). Validates that control flow statements (if-else, loops, try-catch) are correctly parsed. |
| `py.cfg.test.ts` | **Python Control Flow Graph Tests**<br>Tests CFG construction for Python code. Validates if-else branches, while/for loops, try-except blocks, and complex control flow structures. |
| `java.cfg.test.ts` | **Java Control Flow Graph Tests**<br>Tests CFG construction for Java code. Validates traditional and enhanced for loops, switch statements, try-catch-finally blocks. |
| `go.cfg.test.ts` | **Go Control Flow Graph Tests**<br>Tests CFG construction for Go code. Validates for loop variations, switch statements, and Go-specific control flow patterns. |
| `py.path.test.ts` | **Python Path Collection Tests**<br>Tests path extraction from Python CFGs. Validates that execution paths through control flow are correctly identified and collected. |
| `java.path.test.ts` | **Java Path Collection Tests**<br>Tests path extraction from Java CFGs. Validates path conditions and code segments for each execution path. |
| `go.path.test.ts` | **Go Path Collection Tests**<br>Tests path extraction from Go CFGs. Validates path collection for Go-specific control structures. |

#### When to Run AST Tests

Run AST tests when you:
- Modify code in `src/ast.ts` or `src/cfg/` directory
- Add support for a new language's AST parsing
- Change CFG construction logic
- Modify path collection algorithms

**Recommended command for regression testing:**
```bash
xvfb-run -a npm run test --testfile=ast
```

### `suite/lsp/` - Language Server Protocol Tests

Tests for LSP integration and semantic code analysis features.

#### Test Files

| File | Description |
|------|-------------|
| `symbol.test.ts` | **Symbol Discovery Tests**<br>Tests symbol finding across Python, Java, and Go. Validates that functions, classes, methods, and types are correctly discovered via LSP. |
| `token.test.ts` | **Token Extraction Tests**<br>Tests token extraction from symbols. Validates that identifiers, keywords, and function calls within code blocks are correctly identified. |
| `python.test.ts` | **Complete Python LSP Workflow**<br>End-to-end test demonstrating the full LSP workflow for Python: symbol discovery → token extraction → definition lookup → reference finding → diagnostics. |
| `context.test.ts` | **Context Collection Tests**<br>Tests context gathering for test generation. Validates that relevant code context (dependencies, references, definitions) is correctly collected. |
| `context.py.test.ts` | **Python-Specific Context Tests**<br>Tests context collection specifically for Python projects, including import resolution and module dependencies. |

#### Additional Documentation

For detailed information about LSP tests, see [`suite/lsp/Readme.md`](./suite/lsp/Readme.md).

#### When to Run LSP Tests

Run LSP tests when you:
- Modify code in `src/lsp/` directory
- Change symbol discovery logic
- Update token extraction algorithms
- Modify context collection strategies
- Add new LSP features

**Recommended command:**
```bash
npm run test --testfile=lsp.symbol
```

### `suite/llm/` - Large Language Model Integration Tests

Tests for LLM provider integration and prompt generation (to be expanded).

#### Current Status

This test suite is planned for future expansion to test:
- LLM API integration (OpenAI, DeepSeek, Ollama)
- Prompt generation and formatting
- Response parsing and validation
- Error handling and retry logic

## Known Issues and Troubleshooting

### Remote SSH Testing

**Issue**: Tests may fail when running on remote SSH connections due to display requirements.

**Solution**: Use `xvfb-run` to provide a virtual display:

```bash
xvfb-run -a npm run test --testfile=ast.ast
```

**Example for full test suite:**
```bash
xvfb-run -a npm run test --testfile=ast
```

### Go Language Server (gopls)

**Issue**: Go tests may fail if `gopls` (Go language server) is not installed.

**Solution**: 

1. First, verify the language server status:
   ```bash
   npm run test --testfile=lsp.symbol
   ```

2. If Go tests fail, manually install `gopls`:
   ```bash
   go install golang.org/x/tools/gopls@latest
   ```

3. Re-run the test:
   ```bash
   npm run test --testfile=lsp.symbol
   ```

**Note**: Other language servers (Python, Java) are automatically installed by the test runner. Only Go requires manual installation.

### Language Server Initialization

**Issue**: Tests may fail if language servers haven't fully initialized.

**Solution**: Tests include automatic waiting mechanisms, but if you encounter timing issues:

- Increase timeout in test files: `this.timeout(60000);`
- Add explicit waits: `await new Promise(resolve => setTimeout(resolve, 5000));`
- Check VS Code Developer Console for language server errors

### Test Environment Variables

Some tests require API keys for LLM providers. Set environment variables:

```bash
export DEEPSEEK_API_KEY="your-key"
export OPENAI_API_KEY="your-key"
export LOCAL_LLM_URL="http://localhost:11434"
```

Or create a `.env.sh` file and source it before running tests.

## Test Structure

```
src/test/
├── Readme.md              # This file
├── runTest.ts             # Test runner entry point
├── suite/                 # Test suites
│   ├── ast/              # AST and CFG tests
│   ├── lsp/              # LSP integration tests
│   └── llm/              # LLM integration tests (to be expanded)
└── fixtures/             # Test data and sample code
    ├── python/
    ├── java/
    └── go/
```

## Best Practices

1. **Run relevant tests after code changes**: If you modify AST parsing, run `ast` tests. If you modify LSP integration, run `lsp` tests.

2. **Use specific test files for debugging**: Instead of running entire suites, run individual test files to isolate issues:
   ```bash
   npm run test --testfile=ast.py.cfg
   ```

3. **Check test fixtures**: Test data is in `src/test/fixtures/`. Ensure fixtures are up-to-date when adding new test cases.

4. **Read test code as documentation**: Test files serve as examples of how to use LSPRAG APIs and features.

5. **Use VS Code debugger**: Set breakpoints in test files and use VS Code's debugger for detailed investigation.

## Contributing Tests

When adding new tests:

1. **Follow naming convention**: `{feature}.test.ts` or `{language}.{feature}.test.ts`
2. **Use Mocha TDD style**: Use `suite()` and `test()`, not `describe()` and `it()`
3. **Add to appropriate suite**: Place tests in `ast/`, `lsp/`, or `llm/` directories
4. **Update this README**: Document new test files in the appropriate section
5. **Use fixtures**: Place test data in `src/test/fixtures/` when possible

For more information on writing tests, see the main [Contributing Guide](../../CONTRIBUTING.md).

---

**Questions or issues?** Open an issue on GitHub or check the main [Contributing Guide](../../CONTRIBUTING.md) for more details.
