# LLM Fix Workflow

A TypeScript workflow that uses LLM to analyze and fix assertion errors in unit tests.

## Overview

This workflow automatically:
1. Reads test cases with assertion errors from `examination_results.json`
2. Analyzes the source code, test code, and error messages
3. Uses LLM to suggest fixes for the test code
4. Replaces the test function with the fixed code
5. Reruns the test to verify the fix
6. Retries up to 3 times if the fix doesn't work
7. Saves the fix history

## Features

- **Automatic Error Analysis**: Extracts source code, test code, and assertion errors
- **LLM-Powered Fixing**: Uses LLM to suggest improved test code
- **Iterative Improvement**: Retries with updated error information if first attempt fails
- **History Tracking**: Saves all fix attempts with prompts and responses
- **Skip Already Examined**: Skips test cases that already have `hasRedefinedSymbols: true`
- **Reuses Existing Infrastructure**: Uses the same executor and LLM invocation as other workflows

## Input Format

The workflow expects an `examination_results.json` file with the following structure:

```json
{
  "summary": {
    "total_examined": 10,
    "with_redefined_symbols": 5,
    "examination_errors": 0
  },
  "tests": [
    {
      "test_case": "test_example_function",
      "test_file": "/path/to/test_file.py",
      "status": "Assertion Errors",
      "examination": {
        "hasRedefinedSymbols": false
      },
      "symbolName": "example_function",
      "sourceCode": "def example_function(x, y):\n    return x + y"
    }
  ]
}
```

## Usage

### Basic Usage

```typescript
import { runLLMFixWorkflow } from './ut_runner/analysis';

await runLLMFixWorkflow(
  '/path/to/examination_results.json',
  '/path/to/output',
  {
    language: 'python',
    pythonExe: 'python3'
  }
);
```

### Advanced Usage

```typescript
import { LLMFixWorkflow } from './ut_runner/analysis';

const workflow = new LLMFixWorkflow(
  inputJsonPath,
  outputDir,
  {
    language: 'python',
    pythonExe: '/usr/bin/python3',
    jobs: 16,
    timeoutSec: 30,
    pythonpath: ['/path/to/project']
  }
);

await workflow.run();
```

### Command Line

Run the provided example script:

```bash
npm run compile
node out/test/manual/run_llm_fix_workflow.js [input_json] [output_dir] [python_exe]
```

Example with default paths:
```bash
node out/test/manual/run_llm_fix_workflow.js
```

## Output

The workflow generates:

1. **Fixed Test Files**: Test files with fixed code (original backed up as `.backup`)
2. **Fix History**: `fix_history.json` containing:
   - All fix attempts for each test
   - Prompts sent to LLM
   - LLM responses
   - Test results (pass/fail)
   - Error messages

Example `fix_history.json`:

```json
{
  "test_example_function": [
    {
      "round": 1,
      "prompt": "{ ... }",
      "response": "def test_example_function(): ...",
      "fixedCode": "def test_example_function(): ...",
      "testResult": "fail",
      "errorMessage": "AssertionError: ..."
    }
  ]
}
```

## Workflow Steps

For each test case:

1. **Load Data**: Read source code, test code, and assertion errors
2. **Skip if Already Examined**: Skip if `examination.hasRedefinedSymbols === true`
3. **Create LLM Prompt**: Generate prompt with source code, test code, and errors
4. **Invoke LLM**: Get fixed test code from LLM
5. **Replace Test Function**: Update test file with fixed code (backup created)
6. **Run Test**: Execute test using existing executor infrastructure
7. **Check Result**: 
   - If passed: Move to next test case
   - If failed: Save attempt and retry with updated error message
8. **Save History**: After 3 attempts or success, save all attempts

## Configuration Options

The workflow accepts an options object similar to `runPipeline`:

- `language`: Language of tests (default: 'python')
- `pythonExe`: Python executable path (default: process.execPath)
- `jobs`: Number of parallel jobs (default: 16)
- `timeoutSec`: Timeout per test in seconds (default: 30)
- `pythonpath`: Array of paths to add to PYTHONPATH
- `env`: Environment variables

The workflow uses the same LLM configuration as other parts of the system:
- Configure in VSCode settings or via config
- Supports OpenAI, local LLM (Ollama), and DeepSeek
- Automatically handles token limits and retries

## Files

- `llm_fix_workflow.ts`: Main workflow implementation
- `examiner.ts`: Examination logic for redefined symbols
- `assertion_detector.ts`: Detection of assertion issues
- `index.ts`: Exports all analysis utilities

## Integration

This workflow integrates with:
- `src/invokeLLM.ts`: For LLM invocation
- `src/ut_runner/executor.ts`: For test execution
- `src/ut_runner/analyzer.ts`: For test analysis
- `src/ut_runner/types.ts`: For ExaminationResult types
- `src/test/suite/ut/execute.test.ts`: Configuration patterns

## Error Handling

The workflow handles:
- Missing source/test files gracefully
- LLM invocation failures
- Test execution errors
- Backups before modifying files
- Failed fixes with retry logic

## Limitations

- Currently supports Python and Go tests
- Maximum 3 retry attempts per test
- Requires examination_results.json format
- LLM responses must contain valid code in markdown blocks

## See Also

- `src/fix.ts`: Similar LLM-based fixing for generated code
- `src/ut_runner/runner.ts`: Test runner pipeline
- `src/experiment/runners/`: Experiment runners using similar patterns
