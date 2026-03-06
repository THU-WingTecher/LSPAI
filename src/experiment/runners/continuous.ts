import * as fs from 'fs';
import * as path from 'path';
import { ExperimentConfig, ExperimentResult, Task, TestResult } from '../core/types';
import { buildTaskKey } from '../utils/taskKey';

export interface ResultStats {
    successCount: number;
    failureCount: number;
    warningCount: number;
}

export function ensureContinuousModeOutputDir(outputDir?: string): asserts outputDir is string {
    if (!outputDir) {
        throw new Error('[continuous] --output-dir is required to reuse an existing experiment_summary.json');
    }
}

export function parseFocusList(raw?: string): Set<string> {
    if (!raw) return new Set();
    const items = raw
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    return new Set(items);
}

export async function loadExperimentSummary(outputDir: string): Promise<ExperimentResult> {
    const summaryPath = path.join(outputDir, 'experiment_summary.json');
    if (!fs.existsSync(summaryPath)) {
        throw new Error(`[continuous] experiment_summary.json not found in ${outputDir}`);
    }
    const content = await fs.promises.readFile(summaryPath, 'utf8');
    return JSON.parse(content) as ExperimentResult;
}

export function warnIfConfigMismatch(summary: ExperimentResult, config: ExperimentConfig): void {
    if (!summary?.config) return;
    if (summary.config.taskListPath && summary.config.taskListPath !== config.taskListPath) {
        console.warn(
            `[continuous] Task list mismatch: summary=${summary.config.taskListPath} current=${config.taskListPath}`
        );
    }
    if (summary.config.projectRoot && summary.config.projectRoot !== config.projectRoot) {
        console.warn(
            `[continuous] Project root mismatch: summary=${summary.config.projectRoot} current=${config.projectRoot}`
        );
    }
    if (summary.config.model && summary.config.model !== config.model) {
        console.warn(
            `[continuous] Model mismatch: summary=${summary.config.model} current=${config.model}`
        );
    }
    if (summary.config.provider && summary.config.provider !== config.provider) {
        console.warn(
            `[continuous] Provider mismatch: summary=${summary.config.provider} current=${config.provider}`
        );
    }
    if (summary.config.promptTemplate && summary.config.promptTemplate !== config.promptTemplate) {
        console.warn(
            `[continuous] Prompt template mismatch: summary=${summary.config.promptTemplate} current=${config.promptTemplate}`
        );
    }
    if (summary.config.taskLimit && summary.config.taskLimit !== config.taskLimit) {
        console.warn(
            `[continuous] Task limit mismatch: summary=${summary.config.taskLimit} current=${config.taskLimit}`
        );
    }
}

export function countFailedTasks(summary: ExperimentResult): number {
    return summary.results?.filter(result => !result.success).length ?? 0;
}

export function selectContinuousTasks(
    tasks: Task[],
    summary: ExperimentResult,
    focusSet: Set<string>
): Task[] {
    const failedResults = summary.results?.filter(result => !result.success) ?? [];
    const failedTaskKeys = new Set<string>();
    const failedTaskNames = new Set<string>();
    for (const result of failedResults) {
        if (result.taskKey) {
            failedTaskKeys.add(result.taskKey);
        } else if (result.taskName) {
            failedTaskNames.add(result.taskName);
        }
    }

    const hasFocus = focusSet.size > 0;

    return tasks.filter(task => {
        const key = task.taskKey ?? buildTaskKey(task);
        const name = task.symbolName;
        const failedByKey = failedTaskKeys.has(key);
        const failedByName = failedTaskNames.has(name);
        if (!failedByKey && !failedByName) return false;
        if (!hasFocus) return true;
        return focusSet.has(key) || focusSet.has(name);
    });
}

export function mergeResultsInTaskOrder(
    tasks: Task[],
    existingResults: TestResult[],
    newResults: TestResult[]
): TestResult[] {
    const mergedByKey = new Map<string, TestResult>();
    for (const result of existingResults) {
        if (result.taskKey) {
            mergedByKey.set(result.taskKey, result);
        }
    }
    for (const result of newResults) {
        if (result.taskKey) {
            mergedByKey.set(result.taskKey, result);
        }
    }

    const merged: TestResult[] = [];
    for (const task of tasks) {
        const key = task.taskKey ?? buildTaskKey(task);
        const result = mergedByKey.get(key);
        if (result) {
            merged.push(result);
        }
    }

    const extras = [...existingResults, ...newResults].filter(result => !result.taskKey || !mergedByKey.has(result.taskKey));
    merged.push(...extras);
    return merged;
}

export function summarizeResults(results: TestResult[]): ResultStats {
    const successCount = results.filter(result => result.success).length;
    const failureCount = results.filter(result => !result.success).length;
    const warningCount = results.filter(result => result.success && result.warnings && result.warnings.length > 0).length;
    return { successCount, failureCount, warningCount };
}
