# Experiment Framework

A unified, clean, and extensible framework for running unit test generation experiments using both baseline (Claude Code Router) and OpenCode approaches.

## Structure

```
src/experiment/
├── cli.ts                    # Unified CLI entry point
├── core/
│   └── types.ts             # Shared types and interfaces
├── runners/
│   ├── baselineRunner.ts    # Baseline experiment runner
│   ├── opencodeRunner.ts    # OpenCode experiment runner
│   ├── opencodeManager.ts   # OpenCode SDK manager
│   └── claudeCodeRouter.ts  # Claude Code Router manager
├── generators/
│   ├── baselineGenerator.ts # Baseline test generator
│   └── opencodeGenerator.ts # OpenCode test generator
├── prompts/
│   └── templates.ts         # Prompt templates and language detection
└── utils/
    ├── logger.ts            # Comprehensive logging system
    ├── codeExtractor.ts     # Code extraction and validation
    ├── fileNameGenerator.ts # Test file name generation
    └── costTracker.ts       # OpenAI cost tracking
```

## Features

### Unified CLI
- Single entry point for both experiment types
- Comprehensive argument parsing and validation
- Detailed help and usage information

### Comprehensive Logging
- Tracks all actions including tool usage and chat messages
- Multiple log levels (DEBUG, INFO, WARN, ERROR)
- Detailed action tracking (experiment start/end, task progress, etc.)
- Automatic log flushing and summary generation

### Clean Architecture
- Modular design with clear separation of concerns
- Shared types and utilities
- Easy to extend and modify
- No redundant code

### Multi-language Support
- Python, Java, Go, C++ support
- Language-specific prompt templates
- Automatic language detection

## Usage

### Basic Usage

```bash
# Baseline experiment
npm run experiment -- --type baseline --task-list /path/to/taskList.json --project-root /path/to/project --model deepseek-chat --provider deepseek

# OpenCode experiment
npm run experiment -- --type opencode --task-list /path/to/taskList.json --project-root /path/to/project --model gpt-4 --provider openai
```

### Advanced Usage

```bash
# With custom settings
npm run experiment -- \
  --type opencode \
  --task-list /LSPRAG/experiments/config/black-taskList.json \
  --project-root /LSPRAG/experiments/projects/black \
  --model gpt-5-mini \
  --provider openai \
  --output-dir output/open-code-test \
  --concurrency 8 \
  --log-level debug \
  --verbose

# Sequential execution (for debugging)
npm run experiment -- \
  --type opencode \
  --task-list /LSPRAG/experiments/config/black-taskList.json \
  --project-root /LSPRAG/experiments/projects/black \
  --model gpt-5-mini \
  --provider openai \
  --output-dir output/open-code-test \
  --log-level debug \
  --parallel false \
  --verbose
```

## Arguments

### Required
- `--type`: Experiment type (`baseline` or `opencode`)
- `--task-list`: Path to task list JSON file
- `--project-root`: Path to project root directory
- `--model`: Model name (e.g., `gpt-4`, `deepseek-chat`, `claude-3-5-sonnet`)
- `--provider`: Provider name (e.g., `openai`, `deepseek`, `anthropic`)

### Optional
- `--output-dir`: Output directory (default: `./{type}-tests/{model}/{timestamp}`)
- `--parallel`: Use parallel execution (default: `true`)
- `--concurrency`: Concurrency level (default: `4`)
- `--log-level`: Log level (`debug`, `info`, `warn`, `error`, default: `info`)
- `--verbose`: Enable verbose output

## Output Structure

```
{output-dir}/
├── experiment_summary.json     # Experiment results summary
├── test_file_map.json          # Test file mapping
├── logs/                       # Detailed logs
│   ├── {experiment-id}_detailed.log
│   └── {experiment-id}_summary.json
└── {type}-outputs/            # Generated test files
    └── {date}/
        ├── logs/               # LLM interaction logs
        └── codes/              # Generated test files
```

## Logging

The framework provides comprehensive logging of all actions:

- **Experiment lifecycle**: Start, end, configuration
- **Task progress**: Individual task start/end, success/failure
- **LLM interactions**: Prompt sent, response received, duration
- **Code processing**: Extraction, validation, file saving
- **Tool usage**: All tool calls with parameters and results
- **Chat messages**: Multi-turn conversations
- **Errors**: Detailed error logging with context
- **Cost tracking**: API cost queries and calculations

## Extending the Framework

### Adding New Experiment Types

1. Create a new runner in `runners/`
2. Create a new generator in `generators/`
3. Update the CLI to support the new type
4. Add any new utilities to `utils/`

### Adding New Languages

1. Update language detection in `prompts/templates.ts`
2. Add language-specific templates
3. Update validation rules in `utils/codeExtractor.ts`
4. Update file name generation in `utils/fileNameGenerator.ts`

### Adding New Logging Actions

1. Add new action types to `utils/logger.ts`
2. Use the logger in your code to track specific actions
3. The logger will automatically handle flushing and summarization

## Migration from Old Structure

The old verbose structure has been completely replaced. All functionality has been preserved and enhanced:

- `opencodeCli.ts` → `cli.ts` (unified)
- `baselineCli.ts` → `cli.ts` (unified)
- `opencodeManager.ts` → `runners/opencodeManager.ts`
- `baselineRunner.ts` → `runners/baselineRunner.ts`
- `baselineTypes.ts` → `core/types.ts`
- All utilities consolidated in `utils/`

The new structure is cleaner, more maintainable, and provides comprehensive logging capabilities.
