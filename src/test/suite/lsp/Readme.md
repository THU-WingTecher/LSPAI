These test files are built for testing language-agnostic functionality through language server protocols.

## Test Coverage

The test suite covers the following LSP features:
- **Symbol** - Symbol discovery and navigation
- **Token** - Token analysis and extraction
- **Definition** - Definition lookup
- **Reference** - Reference finding
- **Diagnostic** - Error and warning diagnostics

## Test Structure Example

For example, let's examine the `python.test.ts` test code. This file demonstrates how to test LSP features in a language-agnostic way. The test suite follows a sequential flow where each test builds upon the previous one, sharing state through variables like `fileUri`, `targetSymbol`, and `targetToken`.

### Test Flow Overview

The test file contains five test cases that work together to validate LSP functionality:

1. **Symbol Collecting Test** - Discovers all symbols (functions, classes, methods) in a Python file
2. **Token Collecting Test** - Extracts tokens (identifiers, keywords) from a selected symbol
3. **Definition Collecting Test** - Locates the definition of a token and retrieves its source code
4. **Reference Collecting Test** - Finds all references to a symbol across the workspace
5. **Diagnostic Test** - Checks for errors and warnings in the code

### Detailed Test Breakdown

#### 1. Symbol Collecting Test
This test initializes the workspace and collects all symbols from `calculator.py`. It verifies that:
- Symbols can be discovered (functions like `logger`, `compute`, `sum_list`, and the `Calculator` class)
- The LSP symbol provider is working correctly
- The workspace configuration is properly set up

#### 2. Token Collecting Test
Using the `compute` function symbol from the previous test, this test extracts all tokens (identifiers, function calls, etc.) from that symbol. It verifies that:
- Tokens like `add` and `multiply` are correctly identified
- The token extraction process works for function bodies

#### 3. Definition Collecting Test
This test takes a token (e.g., `add`) and:
- Locates its definition in the codebase (in `math_utils.py`)
- Retrieves the full source code of the definition
- Verifies that the definition contains expected code (e.g., `return a + b`)

#### 4. Reference Collecting Test
This test finds all places where a symbol (e.g., the `add` function) is used:
- Searches across the entire workspace
- Returns all reference locations
- Useful for understanding code dependencies

#### 5. Diagnostic Test
This test checks for language server diagnostics (errors, warnings):
- Verifies that import errors are correctly detected
- Tests that the language server can validate code structure
- Ensures proper module resolution

### Adapting Tests for Other Languages

To create tests for other languages (C++, Java, Go, etc.), you can follow the same pattern:
1. Set up the workspace path for your language's test fixtures
2. Use the same LSP functions (`getAllSymbols`, `getDecodedTokensFromSymbol`, etc.)
3. Adjust assertions based on your test file's structure
4. The LSP functions are language-agnostic, so the same code works across languages

The key is that all these functions use the Language Server Protocol, which provides a standardized interface regardless of the programming language.
For detailed explanations of these features, please refer to our paper:
**LSPRAG: LSP-Guided RAG for Language-Agnostic Real-Time Unit Test Generation**

## Setup and Troubleshooting

### Language Server Installation

In our test scripts, language servers are automatically installed for most languages. However, for **Go**, you may need to manually install the language server backend.

### Verifying Language Server Status

To check if the language server is working correctly, run:

```bash
npm run test --testFile=suite.lsp.symbol
```

### Manual Go Language Server Installation

If the Go tests fail, manually install `gopls` (the Go language server) by running:

```bash
go install golang.org/x/tools/gopls@latest
```

After installation, rerun the test file:

```bash
npm run test --testFile=suite.lsp.symbol
```

This should resolve the issue. If you still encounter errors, please file an issue.