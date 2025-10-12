# CLAUDE.md

The primary objective is to always provide responses that are truthful, accurate, and well-supported by facts. The system should prioritize correctness and clarity in all its answers. If the user presents a claim or argument that is factually incorrect or based on misunderstanding, the system should not hesitate to offer a reasoned, evidence-based critique. It should aim to clarify, correct, and educate without being dismissive.

The system should never engage in 'forced agreement' or superficially agree with the user's opinions or statements when they are inaccurate or misleading. Instead, it should engage in respectful disagreement when appropriate, presenting counterarguments in a calm, rational manner.

## Overall Tone

Try to be critic, do not say poti
## Project Overview

LSPRAG (Language Server Protocol-based AI Generation) is a VS Code extension that generates unit tests using Language Server Protocol (LSP) integration and Large Language Models (LLMs). It provides language-agnostic test generation for Java, Python, Go, and other languages.

## Development Commands

### Environment Setup
- Load environment variables: `source .env.sh`

### Testing
- ALWAYS USE following commands : `source .env.sh && $NPMTEST --testFile=<filename>`
- Note: Tests can take longer than expected, allow sufficient time

## Architecture

### Core Components

**Language Server Protocol Integration** (`src/lsp/`)
- `definition.ts`: Symbol definition analysis and package/import extraction
- `reference.ts`: Reference tracking and usage analysis
- `symbol.ts`: Symbol management and function detection
- `token.ts`: Token analysis and use-def information extraction
- `vscodeRequestManager.ts`: LSP request coordination

**Control Flow Analysis** (`src/cfg/`)
- Language-specific CFG builders for Java, Python, Go
- Path analysis and code structure extraction
- Language-agnostic CFG framework

**Configuration & Context** (`src/config.ts`)
- Singleton configuration management
- LLM provider settings (OpenAI, DeepSeek, Ollama)
- Generation type mapping (naive, original, agent, cfg)
- Prompt type management (basic, detailed, withcontext)

### Key Workflow

1. **Symbol Analysis**: Extract function symbols using LSP
2. **Context Collection**: Gather dependencies, references, and imports
3. **Test Generation**: Use selected strategy (naive, original, agent, cfg)
4. **Test Fixing**: Apply diagnostic-based fixes
5. **Output**: Save generated tests with user interaction

### Multi-Language Support

- **Java**: JUnit framework with package/import analysis
- **Python**: pytest integration with type hints and async support
- **Go**: Native testing framework with package management
- **Extensible**: Easy to add new language support

## Development Guidelines

### Testing Framework
- Use Mocha framework for tests
- Test files should be saved under `src/test/suite/`
- All tests run through `test/runTest.ts`
- Prefer running single tests over full test suite for performance

### Code Style
- Implement small, testable functions
- Focus on readability over performance
- Consider multi-language scenarios (Python, C++, Java, Golang)
- When finding inefficient or incorrect implementations, advise user to modify

### Extension Development
- Primary entry point: `src/extension.ts`
- Commands registered in package.json
- Configuration through VS Code settings
- Language server activation through `src/lsp/helper.ts`

## Key Technologies

- **Language Server Protocol**: Language-agnostic def-use and reference extraction
- **Abstract Syntax Tree**: Language-agnostic code structure analysis
- **Multiple LLM Providers**: OpenAI, DeepSeek, Ollama support
- **VS Code Extension API**: Integration with editor ecosystem