# Baseline CC Unit Test Generation Experiment

**A standalone baseline experiment runner for unit test generation using Claude Code Router.**

This module is **completely independent** of VSCode and LSPRAG-specific features. It's designed for baseline comparison experiments.

## Key Differences from LSPRAG Experiment

| Feature | LSPRAG Experiment | Baseline Experiment |
|---------|-------------------|---------------------|
| VSCode Dependency | ✅ Required | ❌ None |
| Symbol Loading | ✅ LSP-based | ❌ Not needed |
| Configuration | `generation_type`, `fix_type`, `prompt_type` | Just `model` + `provider` |
| Context | Rich (dependencies, references, CFG) | Simple (source code only) |
| Purpose | Full LSPRAG system testing | Baseline comparison |
| Complexity | High | Low |

## What It Does

1. **Reads task list JSON** (symbolName, sourceCode, etc.)
2. **Generates prompts** from templates
3. **Sends to Claude Code Router**
4. **Extracts code** from responses
5. **Saves test files**

**No LSP, no symbol interpretation, no VSCode required!**

## Quick Start

### 1. Prepare Task List

Create a JSON file with functions to test:

```json
[
    {
        "symbolName": "add_numbers",
        "relativeDocumentPath": "src/utils.py",
        "sourceCode": "def add_numbers(a, b):\n    return a + b",
        "importString": "",
        "lineNum": 2
    }
]
```

### 2. Run Experiment

```bash
npm run baseline-experiment -- \
  --task-list /path/to/taskList.json \
  --project-root /path/to/project \
  --model deepseek-chat \
  --provider deepseek
```

### 3. Check Results

```bash
# View summary
cat cc-tests/deepseek-chat/*/experiment_summary.json

# View generated tests
ls cc-tests/deepseek-chat/*/test_*
```

## CLI Options

### Required

- `--task-list <path>` - Task list JSON file
- `--project-root <path>` - Project root directory
- `--model <model>` - Model name (e.g., `deepseek-chat`)
- `--provider <provider>` - Provider (e.g., `deepseek`, `anthropic`)

### Optional

- `--output-dir <path>` - Custom output directory
- `--parallel <bool>` - Use parallel execution (default: `true`)
- `--concurrency <num>` - Concurrency level (default: `4`)

## Examples

### Basic Usage

```bash
npm run baseline-experiment -- \
  --task-list experiments/config/black-taskList.json \
  --project-root experiments/projects/black \
  --model deepseek-chat \
  --provider deepseek
```

### Custom Output Directory

```bash
npm run baseline-experiment -- \
  --task-list experiments/config/black-taskList.json \
  --project-root experiments/projects/black \
  --model deepseek-chat \
  --provider deepseek \
  --output-dir my-baseline-results
```

### Sequential Execution (Debugging)

```bash
npm run baseline-experiment -- \
  --task-list experiments/config/black-taskList.json \
  --project-root experiments/projects/black \
  --model deepseek-chat \
  --provider deepseek \
  --parallel false
```

### High Concurrency

```bash
npm run baseline-experiment -- \
  --task-list experiments/config/black-taskList.json \
  --project-root experiments/projects/black \
  --model deepseek-chat \
  --provider deepseek \
  --concurrency 8
```

## Programmatic Usage

```typescript
import { runBaselineExperiment, BaselineConfig } from './experiment';

const config: BaselineConfig = {
    taskListPath: '/path/to/taskList.json',
    projectRoot: '/path/to/project',
    outputDir: './cc-tests/deepseek-chat/20241016',
    model: 'deepseek-chat',
    provider: 'deepseek'
};

const result = await runBaselineExperiment(config, {
    useParallel: true,
    concurrency: 4
});

console.log(`Success: ${result.successCount}/${result.totalTasks}`);
```

## Output Structure

```
cc-tests/
└── {model}/
    └── {timestamp}/
        ├── test_*.py           # Generated test files
        ├── test_*.java
        ├── test_*.go
        ├── experiment_summary.json
        ├── test_file_map.json
        └── ccr-outputs/        # Raw CC responses
            ├── *.json
            └── *.txt
```

## Task List Format

Each task in the JSON file should have:

```json
{
    "symbolName": "function_name",           // Function/method name
    "relativeDocumentPath": "src/file.py",  // Source file path
    "sourceCode": "def function_name...",   // Complete function source
    "importString": "from module import",   // Imports (can be empty)
    "lineNum": 10                           // Number of lines
}
```

## Language Support

| Language | Framework | Test File Pattern |
|----------|-----------|-------------------|
| Python | unittest | `test_{source}_{symbol}.py` |
| Java | JUnit 5 + Mockito | `{Symbol}Test.java` |
| Go | testing | `{source}_{symbol}_test.go` |
| C++ | Google Test | `test_{source}_{symbol}.cpp` |

**Language auto-detected from file extension.**

## Experiment Summary

After running, `experiment_summary.json` contains:

```json
{
  "config": {
    "model": "deepseek-chat",
    "provider": "deepseek",
    "taskListPath": "...",
    "projectRoot": "...",
    "outputDir": "..."
  },
  "totalTasks": 100,
  "successCount": 95,
  "failureCount": 5,
  "warningCount": 2,
  "totalExecutionTimeMs": 180000,
  "timestamp": "2024-10-16T12:00:00.000Z",
  "results": [
    {
      "taskName": "function1",
      "success": true,
      "outputFilePath": "test_function1.py",
      "executionTimeMs": 12000
    },
    ...
  ]
}
```

## Architecture

```
baselineCli.ts
    ↓
baselineRunner.ts
    ↓
baselineTestGenerator.ts
    ↓
baselineTemplateBuilder.ts + codeExtractor.ts
    ↓
ClaudeCodeRouterManager
```

**No VSCode, no LSPRAG config, no symbol loading!**

## Module Files

| File | Purpose | Dependencies |
|------|---------|--------------|
| `baselineTypes.ts` | Type definitions | None |
| `baselineTemplateBuilder.ts` | Prompt templates | None |
| `baselineTestGenerator.ts` | Test generation | `claudeCodeRouter`, `codeExtractor` |
| `baselineRunner.ts` | Main orchestrator | `baselineTestGenerator` |
| `baselineCli.ts` | CLI interface | `baselineRunner` |

**All files are VSCode-independent!**

## Comparison with LSPRAG Experiment

### LSPRAG Experiment (For LSPRAG System Testing)

```typescript
runCCExperiment(
    GenerationType.CFG,     // Use CFG for context
    FixType.ORIGINAL,       // Use fix strategies
    PromptType.DETAILED,    // Detailed prompts
    'deepseek-chat',
    Provider.DEEPSEEK,
    symbolPairs,            // From VSCode LSP
    'python'
);
```

- ✅ Rich context (dependencies, references, CFG)
- ✅ Fix strategies
- ✅ Multiple generation types
- ❌ Requires VSCode
- ❌ Complex setup

### Baseline Experiment (For Baseline Comparison)

```typescript
runBaselineExperiment({
    taskListPath: 'tasks.json',
    projectRoot: '/project',
    outputDir: './results',
    model: 'deepseek-chat',
    provider: 'deepseek'
});
```

- ✅ Simple, standalone
- ✅ No VSCode required
- ✅ Easy to run multiple times
- ❌ No rich context
- ❌ No fix strategies

## Use Cases

### 1. Baseline Comparison

Compare LSPRAG results against simple prompt-based generation:

```bash
# Run baseline
npm run baseline-experiment -- --task-list tasks.json ...

# Run LSPRAG (separately)
# Compare results
```

### 2. Model Comparison

Test different models easily:

```bash
# DeepSeek
npm run baseline-experiment -- --model deepseek-chat --provider deepseek ...

# Claude
npm run baseline-experiment -- --model claude-3-5-sonnet-20241022 --provider anthropic ...

# Compare experiment_summary.json files
```

### 3. Quick Testing

Test prompts/templates quickly without LSPRAG overhead:

```bash
# Small test set
npm run baseline-experiment -- --task-list small_test.json --parallel false ...
```

## Tips

1. **Start Small**: Test with 2-3 functions first
2. **Use Sequential for Debugging**: `--parallel false`
3. **Compare with LSPRAG**: Run both and compare outputs
4. **Check Raw Outputs**: Look in `ccr-outputs/` for CC responses
5. **Validate Tests**: Manually check generated tests for correctness

## Troubleshooting

### No code extracted

Check `ccr-outputs/*.txt` for raw CC response

### Invalid task list

Ensure JSON has all required fields (`symbolName`, `relativeDocumentPath`, `sourceCode`)

### Module not found

Run `npm run compile` first to build TypeScript

## Performance

| Tasks | Concurrency | Est. Time |
|-------|-------------|-----------|
| 10 | 4 | ~2-3 min |
| 50 | 4 | ~12-15 min |
| 100 | 4 | ~25-30 min |
| 100 | 8 | ~15-20 min |

## Future Enhancements

- [ ] Automatic test execution
- [ ] Coverage measurement
- [ ] Multi-model batch runs
- [ ] Result comparison tools
- [ ] Web UI for monitoring

---

**This is a pure baseline experiment runner. For full LSPRAG features, use the main experiment modules.**

