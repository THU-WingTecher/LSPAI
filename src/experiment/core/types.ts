/**
 * Core types for experiment framework
 * Shared types used across baseline and opencode experiments
 */

/**
 * Task from task list JSON
 */
export interface Task {
    symbolName: string;
    relativeDocumentPath: string;
    sourceCode: string;
    importString: string;
    lineNum: number;
}

/**
 * Configuration for experiments
 */
export interface ExperimentConfig {
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
export interface TestResult {
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
export interface ExperimentResult {
    config: ExperimentConfig;
    totalTasks: number;
    successCount: number;
    failureCount: number;
    warningCount: number;
    outputDir: string;
    totalExecutionTimeMs: number;
    beforeCost?: number;
    finalCost?: number;
    experimentCost?: number;
    results: TestResult[];
    timestamp: string;
}

/**
 * Options for experiment execution
 */
export interface ExperimentOptions {
    useParallel?: boolean;
    concurrency?: number;
}

/**
 * Log entry with metadata (for OpenCode)
 */
export interface LogEntry {
    prompt: string;
    name: string;
    response: string;
    sessionId: string;
    /** Remote OpenCode session id */
    opencodeSessionId?: string;
    /** Optional raw session details from OpenCode SDK */
    opencodeSessionDetails?: any;
    startTime: string;
    endTime: string;
    durationMs: number;
    timestamp: number;
    model: string;
}

/**
 * Extracted code result
 */
export interface ExtractedCode {
    code: string;
    language: string;
    blockIndex: number;
}

/**
 * File name generation parameters
 */
export interface FileNameParams {
    sourceFileName: string;
    symbolName: string;
    languageId: string;
    packageString: string;
    relativeFilePath: string;
}

