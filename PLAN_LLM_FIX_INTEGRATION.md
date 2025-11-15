# Plan: Integration of LLM Fix Workflow into Test Pipeline

## Overview
Integrate the LLM fix workflow into the existing test pipeline (`src/ut_runner/runner.ts`) to automatically attempt fixing assertion errors after examination phase.

## Current Pipeline Flow

```
1. Collection Phase
   - Collect test files from directory
   
2. Cache Analysis Phase  
   - Check if results are cached
   
3. Execution Phase
   - Run tests in parallel
   
4. Analysis Phase
   - Extract test results from logs
   - **Examination sub-phase**: Check for redefined symbols in assertion errors
   
5. Writing Phase
   - Write analysis reports
   - Write examination results (if available)
   
6. Pipeline completion
```

## Proposed Integration

### Option A: Add as Phase 6 (NEW PHASE) ⭐ RECOMMENDED

**When**: After Writing Phase, before Pipeline completion  
**Trigger**: New `enableLLMFix?: boolean` option in `RunOptions`  
**Input**: Analysis report with examination results  
**Output**: LLM fix results, fix history, modified test files (in temp dir)

```
Current Flow:
  1 → 2 → 3 → 4 (includes examination) → 5 → Complete

New Flow:
  1 → 2 → 3 → 4 (includes examination) → 5 → **6: LLM Fix** → Complete
```

**Pros**:
- Clean separation of concerns
- LLM fix is optional and doesn't affect main pipeline
- Easy to enable/disable
- Can reuse all examination data already computed

**Cons**:
- Runs even for test cases that already passed redefined symbol examination
- Need to filter test cases appropriately

### Option B: Integrate into Examination Phase

**When**: During Analysis Phase, after examination  
**Trigger**: Conditional on examination results  
**Input**: Individual test case examination results  
**Output**: Fix attempts inline

**Pros**:
- More fine-grained control
- Can fix immediately after examination

**Cons**:
- Mixes concerns (examination + fixing)
- Harder to enable/disable independently
- More complex implementation

## Recommendation: **Option A**

---

## Detailed Implementation Plan

### Step 1: Update `RunOptions` Interface

**File**: `src/ut_runner/runner.ts`

```typescript
export interface RunOptions {
  language?: string;
  pythonExe?: string;
  include?: string[] | null;
  timeoutSec?: number;
  jobs?: number;
  pythonpath?: string[];
  enableLLMFix?: boolean;  // NEW OPTION
}
```

### Step 2: Create Examination Results Exporter

**File**: `src/ut_runner/analysis/exporter.ts` (NEW)

```typescript
export async function exportExaminationResults(
  report: AnalysisReport,
  outputPath: string
): Promise<void>
```

**Purpose**: Convert the analysis report into the JSON format expected by `LLMFixWorkflow`

**Functionality**:
1. Filter test cases with assertion errors that haven't been examined for redefined symbols
2. For each test case:
   - Get test file path
   - Get test case name
   - Get examination result (if any)
   - **NOT include sourceCode and symbolName yet** - these are already in the examination results

**Input Format (AnalysisReport)**:
```typescript
{
  tests: Record<string, TestCaseResult>,
  files: Record<string, FileAnalysis>,
  meta: Record<string, string>
}
```

**Output Format (ExaminationResults JSON)**:
```typescript
{
  summary: {
    total_examined: number,
    with_redefined_symbols: number,
    examination_errors: number
  },
  tests: [{
    test_case: string,
    test_file: string,
    status: string,
    examination?: ExaminationResult,
    symbolName?: string,
    sourceCode?: string
  }]
}
```

**Note**: The `LLMFixWorkflow` expects `sourceCode` and `symbolName` in the JSON, but these should be extracted **inside** the workflow itself from the source files, not in the exporter. The exporter only needs to provide the test case info and examination results.

### Step 3: Integrate LLM Fix Phase into Pipeline

**File**: `src/ut_runner/runner.ts`

Add after Writing Phase (after line ~442):

```typescript
// LLM Fix Phase (optional)
if (options.enableLLMFix) {
  console.log(`[RUNNER] Phase 6: LLM Fix`);
  const llmFixStartTime = new Date();
  
  try {
    const { exportExaminationResults } = require('./analysis/exporter');
    const { runLLMFixWorkflow } = require('./analysis/llm_fix_workflow');
    
    // Export examination results to JSON
    const examinationResultsPath = path.join(outputDir, 'examination_results.json');
    await exportExaminationResults(report, examinationResultsPath);
    
    // Run LLM fix workflow
    await runLLMFixWorkflow(examinationResultsPath, outputDir, {
      language,
      pythonExe,
      jobs,
      timeoutSec: timeout,
      pythonpath: options.pythonpath || [],
      env
    });
    
    const llmFixDuration = new Date().getTime() - llmFixStartTime.getTime();
    console.log(`[RUNNER] LLM Fix completed in ${llmFixDuration}ms`);
    
  } catch (error) {
    console.error(`[RUNNER] LLM Fix phase failed:`, error);
    // Don't throw - let the pipeline complete even if LLM fix fails
  }
}
```

### Step 4: Update LLMFixWorkflow to Work with Report Data

**File**: `src/ut_runner/analysis/llm_fix_workflow.ts`

**Changes needed**:
1. The `loadExaminationResults()` method already exists and works with the expected JSON format
2. The `getAssertionErrors()` method needs to be updated to work with the new format
3. The `extractSourceCode()` method already handles getting source code from VS Code documents

**Key consideration**: The workflow currently extracts `sourceCode` from the source document inside the workflow. This is correct and should remain as is.

### Step 5: Export Exporter Functions

**File**: `src/ut_runner/analysis/index.ts`

```typescript
export * from './examiner';
export * from './assertion_detector';
export * from './llm_fix_workflow';
export * from './exporter';  // NEW
```

### Step 6: Update Test Usage

**File**: `src/test/suite/ut/execute.test.ts`

```typescript
await runPipeline(testsDir, outputDir, testFileMapPath, {
  language: 'python',
  pythonExe: pythonInterpreterPath,
  include: ['*.py'],
  timeoutSec: 30,
  jobs: 16,
  pythonpath: pythonExtraPaths,
  enableLLMFix: true,  // NEW: Enable LLM fix workflow
});
```

---

## Data Flow

### Input to LLM Fix
- Analysis report from Phase 4
- Contains all test cases with examination results
- Test file paths
- Test case names and status

### Output from LLM Fix
- `{outputDir}/examination_results.json` - Input JSON for LLM fix
- `{outputDir}/fix_history.json` - History of fix attempts
- `{outputDir}/fix_process.log` - Human-readable log
- `{outputDir}/temp_work/` - Temporary copies of modified test files
- `{outputDir}/llm_logs/` - LLM invocation logs

---

## Implementation Order

1. ✅ Create `exporter.ts` with `exportExaminationResults` function
2. ✅ Update `RunOptions` interface to add `enableLLMFix`
3. ✅ Integrate LLM fix phase into `runPipeline` function
4. ✅ Update `analysis/index.ts` to export exporter
5. ✅ Test integration with a simple test case
6. ✅ Update documentation (README.md for runner)

---

## Key Design Decisions

### 1. **When to Run LLM Fix**
- **Decision**: After the Writing Phase (Phase 6)
- **Reasoning**: All examination results are complete and written out. LLM fix is a separate concern and should be optional.

### 2. **What Test Cases to Fix**
- **Decision**: Only fix assertion errors that **don't** have redefined symbols
- **Reasoning**: If redefined symbols are found, that's the actual cause and we already know the fix (update import). If no redefined symbols, then the test logic itself might be wrong - this is what LLM should fix.

### 3. **Source Code Extraction**
- **Decision**: Extract inside the workflow, not in the exporter
- **Reasoning**: The workflow has VS Code API access and can open documents. The exporter runs in the pipeline context and may not have direct access to source files.

### 4. **Error Handling**
- **Decision**: Don't fail the pipeline if LLM fix fails
- **Reasoning**: LLM fix is experimental and optional. The main pipeline results are more important.

---

## Testing Strategy

### Unit Tests
- Test `exportExaminationResults` with mock analysis report
- Verify JSON output format matches expected structure
- Test with empty examination results
- Test with test cases that have/ don't have examinations

### Integration Tests
- Run pipeline with `enableLLMFix: true`
- Verify that LLM fix phase executes
- Check that output files are created
- Verify that original files are not modified (temp dir check)

### Edge Cases
- Test with no assertion errors
- Test with all assertion errors having redefined symbols
- Test with missing examination results
- Test with large number of test cases

---

## Files to Modify

### New Files
- `src/ut_runner/analysis/exporter.ts` - Create examination results exporter

### Modified Files  
- `src/ut_runner/runner.ts` - Add Phase 6 integration
- `src/ut_runner/analysis/index.ts` - Export exporter
- `PLAN_LLM_FIX_INTEGRATION.md` - This file

### Optional Files
- `src/test/suite/ut/execute.test.ts` - Add example usage
- `src/ut_runner/README.md` - Document new option

---

## Success Criteria

✅ Can enable LLM fix with single option  
✅ LLM fix runs after all other phases  
✅ Original test files are not modified  
✅ Fix history and logs are properly saved  
✅ Pipeline completes even if LLM fix fails  
✅ Works with parallel execution  
✅ Test cases are filtered correctly  

---

## Questions to Clarify

1. **Should LLM fix run for ALL assertion errors or only those WITHOUT redefined symbols?**
   - **Answer**: Only those WITHOUT redefined symbols (as already filtered in the workflow)

2. **Should we modify the original test files or always use temp copies?**
   - **Answer**: Always use temp copies (already implemented)

3. **What should happen if examination phase is skipped?**
   - **Answer**: LLM fix should still run but won't filter based on examination results

4. **Should LLM fix results be included in the main analysis report?**
   - **Answer**: No, they are saved separately in fix_history.json




