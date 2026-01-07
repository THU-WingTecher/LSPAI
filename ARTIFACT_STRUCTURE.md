# LSPRAG Artifact Structure

This document provides a detailed overview of the LSPRAG codebase structure, explaining the purpose of each component and how they interact.

## Directory Overview

- `/src/` - Core extension implementation (see detailed structure below)
- `/src/test/suite/` - Test suites for all components
- `/docs/` - Documentation (setup, usage, API)
- `REPRODUCTION.md` - Step-by-step reproduction guide

## Detailed `/src/` Directory Structure

```
src/
├── extension.ts                    # VSCode extension entry point
│
├── lsp/                           # LSP Integration Layer
│   ├── definition.ts              # Navigate to symbol definitions
│   ├── reference.ts               # Find all symbol references
│   ├── hover.ts                   # Retrieve type/documentation info
│   ├── symbol.ts                  # Extract symbol information
│   ├── diagnostic.ts              # Collect compiler/linter errors
│   ├── codeaction.ts              # Quick fix suggestions
│   ├── token.ts                   # Token-level analysis
│   ├── tree.ts                    # Symbol tree construction
│   └── vscodeRequestManager.ts    # Manages LSP requests to VSCode
│
├── cfg/                           # Control Flow Graph (CFG) Construction
│   ├── cfg.ts                     # Core CFG data structures
│   ├── builder.ts                 # Generic CFG builder
│   ├── builderFactory.ts          # Factory for language-specific builders
│   ├── python.ts                  # Python-specific CFG construction
│   ├── java.ts                    # Java-specific CFG construction
│   ├── golang.ts                  # Go-specific CFG construction
│   ├── languageAgnostic.ts        # Language-agnostic CFG fallback
│   └── path.ts                    # Path analysis on CFG
│
├── strategy/                      # Test Generation Strategies
│   ├── generators/
│   │   ├── lsprag.ts              # LSPRAG strategy (LSP + CFG)
│   │   ├── cfg.ts                 # CFG-based generation
│   │   ├── symPrompt.ts           # Symbol-based prompting
│   │   ├── naive.ts               # Naive baseline strategy
│   │   ├── agent.ts               # Agent-based generation
│   │   └── factory.ts             # Strategy factory
│   └── types.ts                   # Strategy type definitions
│
├── ut_runner/                     # Unit Test Execution & Analysis
│   ├── runner.ts                  # Test execution orchestrator
│   ├── executor.ts                # Language-specific test executors
│   ├── analyzer.ts                # Test result analyzer
│   ├── collector.ts               # Collect test execution data
│   ├── writer.ts                  # Write generated tests to disk
│   ├── types.ts                   # Type definitions
│   └── analysis/
│       ├── mut_analyzer.ts        # Method Under Test (MUT) analysis
│       ├── examiner.ts            # Test quality examination
│       ├── assertion_detector.ts  # Detect assertion patterns
│       ├── categorizer.ts         # Categorize test failures
│       ├── llm_fix_workflow.ts    # LLM-based test fixing
│       └── fix_diff_reporter.ts   # Report fix differences
│
├── prompts/                       # Prompt Management
│   ├── promptBuilder.ts           # Build context-aware prompts
│   ├── template.ts                # Prompt templates
│   ├── languageTemplateManager.ts # Language-specific templates
│   └── ChatMessage.ts             # Chat message data structures
│
├── agents/                        # AI Agents for Test Fixing
│   ├── assertionFixers.ts         # Fix assertion errors
│   ├── mockFixers.ts              # Fix mocking issues
│   └── contextSelector.ts         # Select relevant context
│
├── experiment/                    # Experiment Framework
│   ├── cli.ts                     # Command-line interface
│   ├── core/
│   │   └── types.ts               # Experiment type definitions
│   ├── generators/
│   │   ├── baselineGenerator.ts   # Baseline test generators
│   │   └── opencodeGenerator.ts   # OpenCode integration
│   ├── runners/
│   │   ├── baselineRunner.ts      # Run baseline experiments
│   │   ├── opencodeRunner.ts      # Run OpenCode experiments
│   │   └── claudeCodeRouter.ts    # Claude API integration
│   ├── prompts/
│   │   └── templates.ts           # Experiment-specific templates
│   └── utils/
│       ├── costTracker.ts         # Track LLM API costs
│       ├── logger.ts              # Experiment logging
│       └── helper.ts              # Utility functions
│
├── test/                          # Test Suites
│   ├── suite/
│   │   ├── lsp/                   # LSP functionality tests
│   │   ├── ast/                   # CFG construction tests
│   │   ├── exp/                   # End-to-end experiment tests
│   │   ├── ut/                    # Unit test runner tests
│   │   └── utills/                # Utility function tests
│   ├── fixtures/                  # Test fixtures
│   │   ├── python/                # Python test projects
│   │   ├── java/                  # Java test projects
│   │   └── go/                    # Go test projects
│   └── runTest.ts                 # Test runner entry point
│
└── Core Utilities
    ├── invokeLLM.ts               # LLM API integration
    ├── generate.ts                # Main test generation logic
    ├── fix.ts                     # Test fixing logic
    ├── language.ts                # Language detection/config
    ├── fileHandler.ts             # File I/O operations
    ├── config.ts                  # Configuration management
    └── log.ts                     # Logging utilities
```

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      VSCode Extension                           │
│                      (extension.ts)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────┐
        │     Test Generation Pipeline               │
        │        (generate.ts)                       │
        └──┬──────────────┬──────────────┬──────────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────────┐
    │   LSP    │   │   CFG    │   │  Strategy    │
    │  Layer   │   │ Builder  │   │  Selection   │
    │          │   │          │   │  (factory)   │
    └────┬─────┘   └────┬─────┘   └──────┬───────┘
         │              │                 │
         │  Symbols,    │  Control Flow   │  Context
         │  Types,      │  Paths,         │  Selection
         │  Refs        │  Dependencies   │
         │              │                 │
         └──────────────┴─────────┬───────┘
                                  │
                                  ▼
                        ┌────────────────────┐
                        │  Prompt Builder    │
                        │  + Templates       │
                        └─────────┬──────────┘
                                  │
                                  ▼
                        ┌────────────────────┐
                        │    LLM API         │
                        │  (invokeLLM.ts)    │
                        └─────────┬──────────┘
                                  │
                                  ▼
                        ┌────────────────────┐
                        │  Generated Tests   │
                        │   (writer.ts)      │
                        └─────────┬──────────┘
                                  │
                                  ▼
        ┌─────────────────────────────────────────────┐
        │         Test Execution Pipeline             │
        │            (ut_runner/)                     │
        └──┬──────────────┬──────────────┬───────────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────────┐
    │ Executor │   │ Analyzer │   │ Categorizer  │
    │ (pytest, │   │ (results │   │ (failures)   │
    │  maven,  │   │  parser) │   │              │
    │  go test)│   │          │   │              │
    └────┬─────┘   └────┬─────┘   └──────┬───────┘
         │              │                 │
         └──────────────┴─────────┬───────┘
                                  │
                        ┌─────────▼─────────┐
                        │  Fix if needed?   │
                        └─────────┬─────────┘
                                  │
                                  ▼
                        ┌────────────────────┐
                        │  Agents + LLM      │
                        │  Fix Workflow      │
                        └─────────┬──────────┘
                                  │
                                  ▼
                        ┌────────────────────┐
                        │  Final Results     │
                        │  + Metrics         │
                        └────────────────────┘
```

## Key Component Descriptions

| Component | Purpose | Key Files |
|-----------|---------|-----------|
| **LSP Layer** | Interfaces with language servers to extract semantic information (definitions, references, types, diagnostics) in a language-agnostic way | `lsp/*.ts` |
| **CFG Builder** | Constructs control flow graphs for different languages to understand program structure and dependencies | `cfg/*.ts` |
| **Strategy** | Implements different test generation approaches (LSPRAG, naive baseline, CFG-only, etc.) for comparison | `strategy/generators/*.ts` |
| **UT Runner** | Executes generated tests, analyzes results, categorizes failures, and manages the test-fix-rerun cycle | `ut_runner/*.ts` |
| **Agents** | AI-powered fixing agents that automatically repair common test issues (assertions, imports, mocks) | `agents/*.ts` |
| **Prompts** | Manages prompt construction with language-specific templates and context selection strategies | `prompts/*.ts` |
| **Experiment** | Framework for running large-scale experiments, tracking costs, and comparing different strategies | `experiment/*.ts` |

## Language-Agnostic Design

LSPRAG achieves language-agnostic test generation through:

1. **LSP Abstraction**: Uses standardized LSP protocol to extract semantic information regardless of the underlying language
2. **Modular CFG Builders**: Language-specific CFG construction with a unified interface
3. **Extensible Executors**: Test execution abstracted through language-specific runners (pytest, maven, go test)
4. **Template System**: Language-specific prompt templates that adapt to different testing frameworks

## Supported Languages

Currently tested and supported:
- **Python** (pytest framework)
- **Java** (JUnit + Maven)
- **Go** (go test)
- **C++** (in development)

Adding support for a new language requires:
1. Implementing a CFG builder in `cfg/<language>.ts`
2. Adding executor logic in `ut_runner/executor.ts`
3. Creating language-specific prompt templates in `prompts/languageTemplateManager.ts`
4. Adding test fixtures in `test/fixtures/<language>/`


