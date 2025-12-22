import * as vscode from 'vscode';
import * as path from 'path';
import { TestCaseResult, ExaminationResult, FileAnalysis } from '../types';
import { detectRedefinedAssertions, prettyPrintDefTree } from './assertion_detector';

/**
 * Examines a single test case for redefined symbols
 * @param testCase The test case to examine
 * @param sourceFile The source file path resolved from test-to-source mapping
 * @param symbolName The focal function/symbol name
 * @returns Examination result with redefined symbols
 */
export async function examineTestCase(
  testCase: TestCaseResult
): Promise<ExaminationResult> {
  const result: ExaminationResult = {
    testCaseName: testCase.codeName,
    examined: false,
    hasRedefinedSymbols: false,
    redefinedSymbols: [],
    examinationError: null,
    definitionTreeSummary: null
  };

  // Skip if no source file or symbol name
  if (!testCase.sourceFile || !testCase.symbolName) {
    result.examinationError = 'Missing source file or symbol name for examination';
    return result;
  }

  try {
    console.log(`[EXAMINER] Examining ${testCase.codeName}`);
    console.log(`[EXAMINER]   Test file: ${testCase.testFile}`);
    console.log(`[EXAMINER]   Source file: ${testCase.sourceFile}`);
    console.log(`[EXAMINER]   Symbol name: ${testCase.symbolName}`);

    // Run the assertion detection analysis
    const detection = await detectRedefinedAssertions(
      testCase.testFile,
      testCase.sourceFile,
      testCase.symbolName
    );

    // Build definition tree summary
    const treeSummary = prettyPrintDefTree(detection.definitionTree);

    result.examined = true;
    result.hasRedefinedSymbols = detection.hasRedefinedSymbols;
    result.redefinedSymbols = detection.redefinedSymbols;
    result.definitionTreeSummary = treeSummary;

    console.log(`[EXAMINER] Examination complete for ${testCase.codeName}`);
    console.log(`[EXAMINER]   Redefined symbols found: ${result.redefinedSymbols.length}`);

  } catch (error) {
    result.examinationError = error instanceof Error ? error.message : String(error);
    console.error(`[EXAMINER] Examination failed for ${testCase.codeName}:`, error);
  }

  return result;
}

/**
 * Examines multiple test cases in batch with concurrency control
 * @param testCases Array of test cases to examine
 * @param sourceFileResolver Function to resolve source file for a test case
 * @param symbolNameResolver Function to resolve symbol name for a test case
 * @param concurrency Maximum number of parallel examinations (default: 5)
 * @returns Array of examination results
 */
export async function examineTestCasesBatch(
  testCases: TestCaseResult[],
  sourceFileResolver: (tc: TestCaseResult) => string | null,
  symbolNameResolver: (tc: TestCaseResult) => string | null,
  concurrency: number = 5
): Promise<ExaminationResult[]> {
  console.log(`[EXAMINER] Starting batch examination of ${testCases.length} test cases`);
  console.log(`[EXAMINER] Concurrency limit: ${concurrency}`);

  const results: ExaminationResult[] = [];
  const queue = [...testCases];
  const inProgress: Promise<void>[] = [];

  const processOne = async (tc: TestCaseResult) => {
    tc.sourceFile = sourceFileResolver(tc);
    tc.symbolName = symbolNameResolver(tc);
    const result = await examineTestCase(tc);
    results.push(result);
  };

  while (queue.length > 0 || inProgress.length > 0) {
    // Fill up to concurrency limit
    while (queue.length > 0 && inProgress.length < concurrency) {
      const tc = queue.shift()!;
      const promise = processOne(tc).then(() => {
        const idx = inProgress.indexOf(promise);
        if (idx !== -1) {
          inProgress.splice(idx, 1);
        }
      });
      inProgress.push(promise);
    }

    // Wait for at least one to complete
    if (inProgress.length > 0) {
      await Promise.race(inProgress);
    }
  }

  console.log(`[EXAMINER] Batch examination complete`);
  console.log(`[EXAMINER]   Total examined: ${results.filter(r => r.examined).length}`);
  console.log(`[EXAMINER]   With redefined symbols: ${results.filter(r => r.hasRedefinedSymbols).length}`);
  console.log(`[EXAMINER]   Errors: ${results.filter(r => r.examinationError).length}`);

  return results;
}

/**
 * Filter test cases that should be examined (Assertion Errors only)
 * @param testCases All test cases
 * @returns Filtered test cases for examination
 */
export function filterTestCasesForExamination(testCases: TestCaseResult[]): TestCaseResult[] {
  const filtered = testCases.filter(tc => tc.status === 'Assertion Errors');
  console.log(`[EXAMINER] Filtered ${filtered.length} test cases for examination (out of ${testCases.length})`);
  return filtered;
}

