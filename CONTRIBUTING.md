# Contributing to LSPRAG

Thank you for your interest in contributing to LSPRAG! This guide will help you get started with the project and understand how to contribute effectively.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Multi-Language Support](#multi-language-support)
- [Submitting Contributions](#submitting-contributions)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20 or higher ([Download](https://nodejs.org/))
- **VS Code**: Version 1.95.0 or higher ([Download](https://code.visualstudio.com/))
- **Git**: For version control
- **npm**: Comes with Node.js

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd LSPRAG
   ```

2. **Install dependencies**
   ```bash
   npm install --force
   ```

3. **Compile the project**
   ```bash
   npm run compile
   ```

4. **Open in VS Code**
   ```bash
   code .
   ```

5. **Run the extension**
   - Press `F5` or go to Run → Start Debugging
   - Select "VS Code Extension Development"
   - A new VS Code window will open with the extension loaded

## Development Setup

### Initial Configuration

1. **Install Language Server Extensions**

   The extension requires language servers for semantic analysis. Install the following:

   - **Python**: Install "Pylance" and "Python" extensions
   - **Java**: Install "Oracle Java Extension Pack"
   - **Go**: Install "Go" extension and enable semantic tokens:
     ```json
     {
       "gopls": {
         "ui.semanticTokens": true
       }
     }
     ```

2. **Configure LLM Provider**

   In the new VS Code window (Extension Development Host), configure your LLM settings:

   - Open Settings (`Ctrl/Cmd + ,`)
   - Search for "LSPRAG"
   - Configure provider, model, and API keys

   Or edit `settings.json` directly:
   ```json
   {
     "LSPRAG.provider": "deepseek",
     "LSPRAG.model": "deepseek-chat",
     "LSPRAG.deepseekApiKey": "your-api-key",
     "LSPRAG.savePath": "lsprag-tests"
   }
   ```

3. **Set Up Test Projects (Optional)**

   For testing with real projects:
   ```bash
   cd experiments
   mkdir projects
   cd projects
   git clone https://github.com/psf/black.git  # Python example
   ```

### Development Scripts

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch mode for continuous compilation |
| `npm run lint` | Run ESLint to check code style |
| `npm run test` | Run all tests |
| `npm run test:util` | Run utility tests only |
| `npm run build` | Full build (TypeScript compilation) |
| `npm run lightWeightBuild` | Optimized build for publishing |

## Project Structure

```
LSPRAG/
├── src/                    # Source code
│   ├── extension.ts        # Main extension entry point
│   ├── generate.ts         # Test generation logic
│   ├── config.ts           # Configuration management
│   ├── invokeLLM.ts        # LLM integration
│   ├── lsp/                # Language Server Protocol integration
│   ├── agents/             # Agent-based generation strategies
│   ├── cfg/                # Control flow graph analysis
│   ├── strategy/           # Generation strategies
│   ├── prompts/            # Prompt templates
│   ├── ut_runner/          # Unit test runner and analysis
│   ├── experiment/         # Experiment scripts
│   └── test/               # Test files
├── out/                    # Compiled JavaScript (generated)
├── test/                   # Test runner configuration
├── experiments/            # Experiment projects and results
├── templates/              # Template files
├── docs/                   # Documentation
├── scripts/                # Build and utility scripts
└── package.json            # Project configuration
```

### Key Components

- **`extension.ts`**: Registers commands and activates the extension
- **`generate.ts`**: Core test generation orchestration
- **`lsp/`**: LSP client integration for semantic analysis
- **`language.ts`**: Language-specific utilities (Python, Java, Go)
- **`strategy/`**: Different generation strategies (naive, original, agent, cfg)

## Development Workflow

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write code following the [Code Style](#code-style) guidelines
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**
   ```bash
   npm run compile
   npm run lint
   npm run test
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "Description of your changes"
   ```

### Testing Your Changes

1. **Run the extension in debug mode**
   - Press `F5` in VS Code
   - Use the new Extension Development Host window to test

2. **Run unit tests**
   ```bash
   npm run test
   ```

3. **Test with real projects**
   - Open a project in the Extension Development Host
   - Use the "LSPRAG: Generate Unit Test" command
   - Verify generated tests are correct

## Testing

### Test Framework

We use **Mocha** for testing. Test files are located in `src/test/suite/`.

### Writing Tests

**Important**: Do NOT use `describe`, `it`, or `beforeEach` in test files. All tests are run through `test/runTest.ts`.

Example test structure:
```typescript
// src/test/suite/example.test.ts
import * as assert from 'assert';
import { someFunction } from '../../someModule';

export function testSomeFunction() {
    // Test case 1
    const result = someFunction('input');
    assert.strictEqual(result, 'expected');
    
    // Test case 2
    const result2 = someFunction('another');
    assert.strictEqual(result2, 'expected2');
}
```

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test src/test/suite/example.test.ts

# Run utility tests
npm run test:util
```

### Test Organization

- Tests should be small and focused
- Each test file should test one module or feature
- Use descriptive function names: `testFeatureName()`
- Keep tests independent (no shared state)

## Code Style

### TypeScript Guidelines

- **Write minimal code**: Keep functions small and focused
- **Use strict TypeScript**: The project uses `strict: true`
- **Follow existing patterns**: Match the style of existing code
- **Prefer readability**: Clear code over clever optimizations

### Function Design

- **Small functions**: Each function should do one thing
- **Easy to test**: Functions should be testable in isolation
- **Clear naming**: Use descriptive names for functions and variables

### Example

```typescript
// Good: Small, focused, testable
export function extractFunctionName(code: string): string {
    const match = code.match(/function\s+(\w+)/);
    return match ? match[1] : '';
}

// Avoid: Large, complex, hard to test
export function processEverything(input: any): any {
    // 100+ lines of mixed logic
}
```

## Multi-Language Support

LSPRAG currently supports:
- **Python** (pytest)
- **Java** (JUnit 4/5)
- **Go** (Go testing framework)
- **C++** (experimental)

### Adding Language Support

To add support for a new language:

1. **Create language module**
   - Add file in `src/language.ts` or create `src/languages/`
   - Implement language-specific utilities

2. **Add AST parsing**
   - Use tree-sitter parsers (see `src/ast.ts`)
   - Add parser configuration

3. **Add test framework integration**
   - Implement test file generation
   - Add import/dependency handling

4. **Add LSP integration**
   - Configure language server client
   - Add semantic token support

5. **Add tests**
   - Create test cases for the new language
   - Test with real projects

### Language-Specific Notes

**Python**:
- Requires Pylance extension
- Supports type hints and async functions
- Uses pytest fixtures

**Java**:
- Requires Java Extension Pack
- Supports JUnit 4 and 5
- Handles Maven/Gradle dependencies

**Go**:
- Requires Go extension
- Semantic tokens must be enabled
- Handles Go modules

## Submitting Contributions

### Before Submitting

1. **Ensure code compiles**
   ```bash
   npm run compile
   ```

2. **Run linter**
   ```bash
   npm run lint
   ```

3. **Run tests**
   ```bash
   npm run test
   ```

4. **Test manually**
   - Test in Extension Development Host
   - Verify with multiple languages if applicable

### Pull Request Process

1. **Create a clear PR description**
   - What changes were made
   - Why the changes were needed
   - How to test the changes

2. **Keep PRs focused**
   - One feature or fix per PR
   - Keep changes small when possible

3. **Update documentation**
   - Update README if needed
   - Add comments for complex logic
   - Update CHANGELOG.md for user-facing changes

### Code Review Guidelines

- Be open to feedback
- Respond to review comments promptly
- Make requested changes or discuss alternatives
- Keep discussions constructive

## Troubleshooting

### Common Issues

**Extension not activating**
- Check VS Code version (must be 1.95.0+)
- Verify `package.json` activation events
- Check Output panel for errors

**Language server not working**
- Ensure language server extension is installed
- Check language server is running (Output panel)
- Verify workspace has valid project structure

**LLM not responding**
- Check API key configuration
- Verify network connectivity
- Test with "LSPRAG: Test LLM" command
- Check provider/model settings

**Tests not generating**
- Verify function is selected correctly
- Check language server is active
- Review Output panel for errors
- Ensure LLM configuration is correct

**Compilation errors**
- Run `npm install --force` to reinstall dependencies
- Delete `node_modules` and `out` folders, then reinstall
- Check TypeScript version compatibility

### Getting Help

- Check existing issues on GitHub
- Review documentation in `docs/` folder
- Ask questions in discussions or issues
- Review code examples in `src/examples/`

## Additional Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Mocha Testing Framework](https://mochajs.org/)

---

Thank you for contributing to LSPRAG! Your efforts help make unit test generation more accessible and powerful for developers worldwide.

