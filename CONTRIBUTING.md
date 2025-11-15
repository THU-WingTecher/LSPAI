# Contributing Guide

Welcome to LSPRAG! This guide will help you understand the codebase and get started with contributing. We're excited to have you here! 🎉

## Table of Contents

- [Understanding the Project](#understanding-the-project)
- [Project Structure](#project-structure)
- [Getting Started with Tests](#getting-started-with-tests)
- [Development Workflow](#development-workflow)
- [Code Architecture](#code-architecture)
- [Testing Guide](#testing-guide)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

## Understanding the Project

LSPRAG (Language Server Protocol-based AI Generation) is a VS Code extension that automatically generates unit tests using:
- **Language Server Protocol (LSP)**: For semantic code analysis
- **Abstract Syntax Trees (AST)**: For code structure parsing
- **Control Flow Graphs (CFG)**: For understanding program flow
- **Large Language Models (LLMs)**: For intelligent test generation

The extension supports multiple languages (Python, Java, Go, C++) and multiple LLM providers (OpenAI, DeepSeek, Ollama).
For quick start, please refer [Quick Start Guide](./QUICKSTART.md).

## Project Structure

```
LSPRAG/
├── src/                          # Main source code
│   ├── extension.ts             # Extension entry point
│   ├── generate.ts              # Test generation orchestration
│   ├── fix.ts                   # Iterative test refinement
│   ├── invokeLLM.ts             # LLM provider integration
│   ├── config.ts                # Configuration management
│   ├── ast.ts                   # AST parsing utilities
│   ├── cfg/                     # Control Flow Graph builders
│   │   ├── python.ts
│   │   ├── java.ts
│   │   ├── go.ts
│   │   └── cpp.ts
│   ├── lsp/                     # Language Server Protocol integration
│   │   ├── symbol.ts            # Symbol discovery
│   │   ├── token.ts             # Token extraction
│   │   ├── reference.ts         # Reference finding
│   │   ├── diagnostic.ts        # Error diagnostics
│   │   └── helper.ts            # LSP initialization
│   ├── strategy/                # Generation strategies
│   │   ├── naive.ts
│   │   ├── original.ts
│   │   ├── agent.ts
│   │   └── cfg.ts
│   ├── prompts/                 # Prompt templates
│   ├── agents/                  # Agent-based generation
│   └── test/                    # Test files
│       ├── runTest.ts           # Test runner
│       ├── suite/               # Test suites
│       │   ├── ast/            # AST parsing tests
│       │   ├── lsp/            # LSP feature tests
│       │   └── llm/            # LLM integration tests (to be created)
│       └── fixtures/           # Test data
├── package.json                 # Project configuration
├── tsconfig.json               # TypeScript configuration
└── README.md                   # Project documentation
```

## Getting Started with Tests

**The best way to start contributing is by working with our test files!** Our test suites are designed to be learning tools and starting points for new features.

### Test Suites Overview

We have three main test suites:

1. **`suite/ast/`** - Abstract Syntax Tree parsing tests
2. **`suite/lsp/`** - Language Server Protocol feature tests
3. **`suite/llm/`** - LLM integration tests (to be expanded)

### Why Start with Tests?

- **Learn by doing**: Tests show how each component works
- **Safe experimentation**: Modify tests without breaking production code
- **Clear examples**: Each test demonstrates a specific feature
- **Easy debugging**: Run individual tests to understand behavior

### Running Tests

```bash
# Run all tests
npm run test

# Run a specific test suite
npm run test --testfile=ast.ast
npm run test --testfile=lsp.symbol
npm run test --testfile=lsp.python

# Run multiple test files
npm run test --testfile=ast,lsp.symbol
```

## Development Workflow

### Step 1: Explore Existing Tests

Start by reading and running existing tests:

1. **AST Tests** (`src/test/suite/ast/`)
   - `ast.test.ts` - Basic AST parsing for all languages
   - `py.cfg.test.ts` - Python control flow graph tests
   - `java.cfg.test.ts` - Java CFG tests
   - `go.cfg.test.ts` - Go CFG tests

2. **LSP Tests** (`src/test/suite/lsp/`)
   - `symbol.test.ts` - Symbol discovery across languages
   - `token.test.ts` - Token extraction
   - `python.test.ts` - Complete Python LSP workflow
   - `context.test.ts` - Context collection

3. **Read the LSP README** (`src/test/suite/lsp/Readme.md`)
   - Explains the LSP test structure
   - Shows how tests build upon each other
   - Provides examples for adapting to other languages

### Step 2: Reproduce a Test

Choose a test file and run it:

```bash
# Example: Run Python LSP test
npm run test --testfile=lsp.python
```

**What to observe:**
- How the test sets up the workspace
- How it initializes language servers
- What assertions it makes
- What output it produces

### Step 3: Modify and Experiment

Once you understand a test, try modifying it:

**Example: Add a new assertion to `symbol.test.ts`**

```typescript
// In src/test/suite/lsp/symbol.test.ts
test('Python - Symbol Finding All Test', async function() {
    // ... existing code ...
    
    // Add your own assertion
    const customSymbol = symbols.find(s => s.name === 'your_function');
    assert.ok(customSymbol, 'Should find your_function');
});
```

**Example: Create a new test case**

```typescript
test('Python - Custom Feature Test', async function() {
    // Copy setup from existing test
    getConfigInstance().updateConfig({
        workspace: pythonProjectPath
    });
    
    // Add your test logic
    // ...
});
```

### Step 4: Debug Your Changes

#### Launch Debugger

We provide sample debugger configurations to help you debug the extension and tests. The sample file is located at `docs/sample_debugger_settings.json`.

**Setting up the debugger:**

1. **Copy the sample configuration** to your VS Code settings:
   - Create or open `.vscode/launch.json` in the project root
   - Copy the contents from `docs/sample_debugger_settings.json`
   - Adjust configurations as needed

2. **Available debug configurations:**

   - **"Run Extension"**: Launches the extension in a new VS Code window for debugging the extension itself
     - Useful for debugging extension commands and features
     - Automatically compiles before launching
   
   - **"Run Extension Tests"**: Runs the test suite with debugging support
     - Set `npm_config_testfile` in the `env` section to specify which tests to run
     - Example: `"npm_config_testfile": "lsp.symbol"` runs only symbol tests
     - Enables breakpoints in test files

3. **Using the debugger:**

   ```bash
   # Method 1: Use VS Code Debug Panel
   # 1. Set breakpoints in your test file or source code
   # 2. Open Run and Debug panel (Ctrl+Shift+D / Cmd+Shift+D)
   # 3. Select a configuration from the dropdown
   # 4. Press F5 or click the green play button
   
   # Method 2: Quick Debug
   # 1. Set breakpoints
   # 2. Press F5
   # 3. Select the appropriate configuration
   ```
   
## Code Architecture

### Core Components

#### 1. Extension Entry Point (`extension.ts`)

Registers VS Code commands and initializes the extension:

```typescript
export async function activate(context: vscode.ExtensionContext) {
    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.generateUnitTest', ...)
    );
}
```

#### 2. Generation Pipeline (`generate.ts`)

Orchestrates test generation:

- `generateUnitTestForSelectedRange()` - Main entry point
- `collectInfo()` - Gathers context (symbols, references, dependencies)
- Delegates to strategy generators

#### 3. LSP Integration (`lsp/`)

Language-agnostic LSP features:

- **`symbol.ts`**: `getAllSymbols()` - Discover functions, classes, methods
- **`token.ts`**: `getDecodedTokensFromSymbol()` - Extract tokens from code
- **`reference.ts`**: `findReferences()` - Find all usages of a symbol
- **`diagnostic.ts`**: `getDiagnosticsForFilePath()` - Get errors/warnings

#### 4. AST Parsing (`ast.ts`, `cfg/`)

Parse code structure:

- `ASTParser` - Tree-sitter based parser
- `CFGBuilder` - Build control flow graphs
- Language-specific builders in `cfg/` directory

#### 5. LLM Integration (`invokeLLM.ts`)

Unified interface for LLM providers:

- Supports OpenAI, DeepSeek, Ollama
- Handles API calls, token counting, error handling

### Data Flow

```
User Action
    ↓
extension.ts (command handler)
    ↓
generate.ts (orchestration)
    ↓
lsp/ (collect context) + ast.ts (parse structure)
    ↓
strategy/ (select generation approach)
    ↓
invokeLLM.ts (call LLM)
    ↓
fix.ts (iterative refinement)
    ↓
userInteraction.ts (present results)
```

## Testing Guide

### Test Structure

All tests use **Mocha** framework with **TDD** style (no `describe`, `it`, `beforeEach`):

```typescript
import { strict as assert } from 'assert';

suite('Test Suite Name', () => {
    test('Test Case Name', async function() {
        // Test code here
        assert.equal(actual, expected);
    });
});
```

### Writing New Tests

1. **Choose the right location**
   - AST tests → `src/test/suite/ast/`
   - LSP tests → `src/test/suite/lsp/`
   - LLM tests → `src/test/suite/llm/` (create if needed)

2. **Follow existing patterns**
   - Look at similar tests for structure
   - Use fixtures from `src/test/fixtures/`
   - Set up workspace properly

3. **Example: New LSP Test**

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { getAllSymbols } from '../../../lsp/symbol';
import { getConfigInstance } from '../../../config';
import { setWorkspaceFolders } from '../../../helper';

suite('LSP-Features: My New Test', () => {
    const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
    const projectPath = path.join(fixturesDir, 'python');
    
    test('My Test Case', async function() {
        // Setup
        getConfigInstance().updateConfig({
            workspace: projectPath
        });
        const workspaceFolders = setWorkspaceFolders(projectPath);
        
        // Test
        const fileUri = vscode.Uri.file(path.join(projectPath, 'file.py'));
        const symbols = await getAllSymbols(fileUri);
        
        // Assert
        assert.ok(symbols.length > 0, 'Should find symbols');
    });
});
```

### Test Fixtures

Test data is in `src/test/fixtures/`:

```
fixtures/
├── python/
│   ├── calculator.py
│   └── math_utils.py
├── java/
│   └── src/main/java/com/example/
│       └── Calculator.java
└── go/
    └── calculator.go
```

You can add your own fixtures for testing new features.

## Common Tasks

### Adding Support for a New Language

1. **Add AST parser support**
   - Install tree-sitter grammar: `npm install tree-sitter-<language>`
   - Add to `ast.ts` language mapping

2. **Create CFG builder** (optional)
   - Create `src/cfg/<language>.ts`
   - Implement `CFGBuilder` interface
   - Add tests in `src/test/suite/ast/<language>.cfg.test.ts`

3. **Add LSP support**
   - Install language server extension
   - Test with `src/test/suite/lsp/<language>.test.ts`

4. **Add prompt templates**
   - Create templates in `src/prompts/`
   - Add language-specific formatting

### Adding a New LLM Provider

1. **Extend `invokeLLM.ts`**
   - Add provider to `Provider` type in `config.ts`
   - Implement API call logic
   - Add error handling

2. **Update configuration**
   - Add provider to `package.json` configuration
   - Update `config.ts` to handle new provider

3. **Add tests**
   - Create tests in `src/test/suite/llm/`

### Adding a New Generation Strategy

1. **Create strategy file**
   - Create `src/strategy/<strategy-name>.ts`
   - Implement generation logic

2. **Register strategy**
   - Add to `GenerationType` in `config.ts`
   - Wire up in `generate.ts`

3. **Add tests**
   - Test the strategy with various inputs

## Troubleshooting

### Tests Fail to Run

**Problem**: Language server not initialized
```bash
# Solution: Wait longer or manually activate
await activate(); // In test setup
await new Promise(resolve => setTimeout(resolve, 5000));
```

**Problem**: Missing API keys
```bash
# Solution: Set environment variables
export DEEPSEEK_API_KEY="your-key"
export OPENAI_API_KEY="your-key"
```

### Go Tests Fail

**Problem**: `gopls` not installed
```bash
# Solution: Install Go language server
go install golang.org/x/tools/gopls@latest
```

### TypeScript Compilation Errors

**Problem**: Type errors after changes
```bash
# Solution: Recompile
npm run compile
```

### Extension Not Activating

**Problem**: Extension doesn't load in VS Code
- Check `package.json` activation events
- Verify `out/extension.js` exists
- Check VS Code Developer Console for errors

## Next Steps

1. ✅ Run existing tests to understand the system
2. ✅ Modify a test to see how it works
3. ✅ Create a new test case
4. ✅ Read source code for components you're interested in
5. ✅ Pick a small feature to implement
6. ✅ Ask questions in issues or discussions

## Getting Help

- **Read the code**: Most questions are answered in the source
- **Check test files**: They're excellent documentation
- **Read `src/test/suite/lsp/Readme.md`**: Detailed LSP test guide
- **Open an issue**: We're happy to help!

## Code Style

- **TypeScript**: Use strict typing
- **Testing**: Use Mocha TDD style (no `describe`, `it`)
- **Functions**: Keep functions small and focused
- **Comments**: Explain "why", not "what"
- **Multi-language**: Consider all supported languages

---

**Happy coding!** We're excited to see what you build! 🚀

