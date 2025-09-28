// src/ut_runner/types.ts
export interface TestFile {
    path: string;
    language: string; // e.g., "python"
  }
  
  export interface ExecutionResult {
    testFile: TestFile;
    exitCode: number;
    logPath: string;
    junitPath?: string | null;
    startedAt: string;
    endedAt: string;
    timeout: boolean;
  }
  
  export interface TestCaseResult {
    codeName: string;
    status: string; // "Passed" | "Assertion Errors" | other classifier names
    errorType?: string | null;
    detail: string;
    testFile: string;
    logPath: string;
  
    focalModule?: string | null;
    focalFunction?: string | null;
    focalRandom?: string | null;
    implementationOrigin?: string | null;
    importLine?: string | null;
    modulePath?: string | null;
    sourceFile?: string | null;
  
    testSource?: string | null;
    functionSource?: string | null;
  }
  
  export interface FileAnalysis {
    counts: Record<string, number>;
    testcases: TestCaseResult[];
    note?: string | null;
  }
  
  export interface AnalysisReport {
    tests: Record<string, TestCaseResult>;
    files: Record<string, FileAnalysis>;
    meta: Record<string, string>;
  }
  
  export function makeEmptyFileAnalysis(): FileAnalysis {
    return {
      counts: { Passed: 0, 'Assertion Errors': 0, Error: 0 },
      testcases: [],
      note: null,
    };
  }