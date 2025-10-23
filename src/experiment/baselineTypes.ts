/**
 * Types for baseline CC experiment (independent of VSCode/LSPRAG)
 */

/**
 * Task from task list JSON
 */
export interface BaselineTask {
    symbolName: string;
    relativeDocumentPath: string;
    sourceCode: string;
    importString: string;
    lineNum: number;
}

/**
 * Configuration for baseline experiment
 */
export interface BaselineConfig {
    projectRoot: string;
    taskListPath: string;
    outputDir: string;
    model: string;
    provider: string;
    dateStamp?: string;
}

/**
 * Result of generating a single test
 */
export interface BaselineTestResult {
    taskName: string;
    success: boolean;
    testCode?: string;
    outputFilePath?: string;
    warnings?: string[];
    error?: string;
    executionTimeMs?: number;
}

/**
 * Summary of entire experiment
 */
export interface BaselineExperimentResult {
    config: BaselineConfig;
    totalTasks: number;
    successCount: number;
    failureCount: number;
    warningCount: number;
    outputDir: string;
    totalExecutionTimeMs: number;
    beforeCost?: number;        // ← Add
    finalCost?: number;         // ← Add
    experimentCost?: number;    // ← Add (final - before)
    results: BaselineTestResult[];
    timestamp: string;
}
