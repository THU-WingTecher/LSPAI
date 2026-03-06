/**
 * Claude Code Experiment Runner (standalone)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Task, TestResult, ExperimentConfig, ExperimentResult, ExperimentOptions } from '../core/types';
import { generateTestsSequential, generateTestsParallel } from '../generators/claudeCodeGenerator';
import { assignTaskKeys, buildTaskKey } from '../utils/taskKey';
import {
    countFailedTasks,
    ensureContinuousModeOutputDir,
    loadExperimentSummary,
    mergeResultsInTaskOrder,
    parseFocusList,
    selectContinuousTasks,
    summarizeResults,
    warnIfConfigMismatch
} from './continuous';

/**
 * Run Claude Code unit test generation experiment
 */
export async function runClaudeCodeExperiment(
    config: ExperimentConfig,
    options: ExperimentOptions = {}
): Promise<ExperimentResult> {
    const startTime = Date.now();

    console.log('=== Claude Code Unit Test Generation Experiment ===\n');
    console.log('Configuration:');
    console.log(`  Task List: ${config.taskListPath}`);
    console.log(`  Project Root: ${config.projectRoot}`);
    console.log(`  Output Dir: ${config.outputDir}`);
    console.log(`  Model: ${config.model}`);
    console.log(`  Provider: ${config.provider}`);
    if (config.promptTemplate) {
        console.log(`  Prompt Template: ${config.promptTemplate}`);
    }
    if (config.taskLimit) {
        console.log(`  Task Limit: ${config.taskLimit}`);
    }
    console.log('');

    // Load task list
    console.log('Loading task list...');
    const tasks = await loadTaskList(config.taskListPath);
    console.log(`Loaded ${tasks.length} tasks\n`);
    const { duplicateBaseKeys } = assignTaskKeys(tasks);
    if (duplicateBaseKeys.length > 0) {
        const sample = duplicateBaseKeys.slice(0, 5);
        console.warn(
            `[taskList] Found ${duplicateBaseKeys.length} duplicate task keys (same file+symbol+line). ` +
            `They will be disambiguated. Sample: ${sample.join(', ')}`
        );
    }

    const allTasks = tasks;
    let tasksToRun = tasks;
    let existingSummary: ExperimentResult | null = null;
    const focusSet = parseFocusList(options.focusTask);

    if (options.continuous) {
        existingSummary = await loadExperimentSummary(config.outputDir);
        warnIfConfigMismatch(existingSummary, config);
        const failedCount = countFailedTasks(existingSummary);
        tasksToRun = selectContinuousTasks(allTasks, existingSummary, focusSet);
        console.log(`[continuous] Found ${failedCount} failed task(s) in summary.`);
        if (focusSet.size > 0) {
            console.log(`[continuous] Focus filter: ${Array.from(focusSet).join(', ')}`);
        }
        console.log(`[continuous] Rerunning ${tasksToRun.length} task(s).\n`);
        if (tasksToRun.length === 0) {
            return existingSummary;
        }
    }

    if (!options.continuous && focusSet.size > 0) {
        tasksToRun = tasksToRun.filter(task => {
            const key = task.taskKey ?? buildTaskKey(task);
            const name = task.symbolName;
            return focusSet.has(key) || focusSet.has(name);
        });
        console.log(`[focus] Running ${tasksToRun.length}/${allTasks.length} task(s): ${Array.from(focusSet).join(', ')}`);
    }

    if (options.taskLimit && options.taskLimit > 0) {
        tasksToRun = tasksToRun.slice(0, options.taskLimit);
        console.log(`Task limit enabled: running ${tasksToRun.length}/${allTasks.length} tasks.\n`);
    }

    // Ensure output directory exists
    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
    }

    // Setup Claude Code output directory
    const claudeCodeOutputDir = path.join(config.outputDir, config.model);
    if (!fs.existsSync(claudeCodeOutputDir)) {
        fs.mkdirSync(claudeCodeOutputDir, { recursive: true });
    }

    console.log('Claude Code setup:');
    console.log(`  Claude Code Output: ${claudeCodeOutputDir}`);
    console.log('  Note: Each task gets its own unique session ID\n');

    // Generate tests
    const useParallel = options.useParallel !== false;
    const concurrency = options.concurrency || 4;

    console.log(`Generating tests (${useParallel ? `parallel, concurrency=${concurrency}` : 'sequential'})...\n`);

    const results = useParallel
        ? await generateTestsParallel(
            tasksToRun,
            claudeCodeOutputDir,
            config.projectRoot,
            config.outputDir,
            config.model,
            concurrency,
            options.maxRetries ?? 0,
            (completed: number, total: number, taskName: string) => {
                console.log(`[${completed}/${total}] Completed: ${taskName}`);
            },
            options.promptTemplate ?? 'cfg'
        )
        : await generateTestsSequential(
            tasksToRun,
            claudeCodeOutputDir,
            config.projectRoot,
            config.outputDir,
            config.model,
            options.maxRetries ?? 0,
            (completed: number, total: number, taskName: string) => {
                console.log(`[${completed}/${total}] Completed: ${taskName}`);
            },
            options.promptTemplate ?? 'cfg'
        );

    const summaryPath = path.join(config.outputDir, 'experiment_summary.json');
    const mappingPath = path.join(config.outputDir, 'test_file_map.json');

    if (options.continuous && existingSummary) {
        const mergedResults = mergeResultsInTaskOrder(allTasks, existingSummary.results ?? [], results);
        const mergedStats = summarizeResults(mergedResults);
        const totalExecutionTimeMs = (existingSummary.totalExecutionTimeMs ?? 0) + (Date.now() - startTime);

        const mergedSummary: ExperimentResult = {
            ...existingSummary,
            config: existingSummary.config ?? config,
            totalTasks: existingSummary.totalTasks || allTasks.length,
            successCount: mergedStats.successCount,
            failureCount: mergedStats.failureCount,
            warningCount: mergedStats.warningCount,
            outputDir: config.outputDir,
            totalExecutionTimeMs,
            results: mergedResults,
            timestamp: new Date().toISOString()
        };

        await fs.promises.writeFile(
            summaryPath,
            JSON.stringify(mergedSummary, null, 2),
            'utf8'
        );

        const mergedMapping = buildTestFileMapping(allTasks, mergedResults, config.projectRoot);
        await fs.promises.writeFile(
            mappingPath,
            JSON.stringify(mergedMapping, null, 2),
            'utf8'
        );

        console.log('\n=== Experiment Complete ===');
        console.log(`Total Tasks: ${mergedSummary.totalTasks}`);
        console.log(`Successful: ${mergedSummary.successCount}`);
        console.log(`Failed: ${mergedSummary.failureCount}`);
        console.log(`Warnings: ${mergedSummary.warningCount}`);
        console.log(`Execution Time: ${Math.round(totalExecutionTimeMs / 1000)}s`);
        console.log(`Output Directory: ${config.outputDir}`);
        console.log(`Summary: ${summaryPath}`);
        console.log(`Test Mapping: ${mappingPath}\n`);

        return mergedSummary;
    }

    const stats = summarizeResults(results);
    const totalExecutionTimeMs = Date.now() - startTime;
    const tasksForSummary = tasksToRun;

    // Build experiment result
    const experimentResult: ExperimentResult = {
        config,
        totalTasks: tasksForSummary.length,
        successCount: stats.successCount,
        failureCount: stats.failureCount,
        warningCount: stats.warningCount,
        outputDir: config.outputDir,
        totalExecutionTimeMs,
        results,
        timestamp: new Date().toISOString()
    };

    // Save experiment summary
    await fs.promises.writeFile(
        summaryPath,
        JSON.stringify(experimentResult, null, 2),
        'utf8'
    );

    // Save test file mapping
    const mapping = buildTestFileMapping(tasksForSummary, results, config.projectRoot);
    await fs.promises.writeFile(
        mappingPath,
        JSON.stringify(mapping, null, 2),
        'utf8'
    );

    // Print summary
    console.log('\n=== Experiment Complete ===');
    console.log(`Total Tasks: ${experimentResult.totalTasks}`);
    console.log(`Successful: ${experimentResult.successCount}`);
    console.log(`Failed: ${experimentResult.failureCount}`);
    console.log(`Warnings: ${experimentResult.warningCount}`);
    console.log(`Execution Time: ${Math.round(totalExecutionTimeMs / 1000)}s`);
    console.log(`Output Directory: ${config.outputDir}`);
    console.log(`Summary: ${summaryPath}`);
    console.log(`Test Mapping: ${mappingPath}\n`);

    return experimentResult;
}

/**
 * Load task list from JSON file
 */
async function loadTaskList(taskListPath: string): Promise<Task[]> {
    if (!fs.existsSync(taskListPath)) {
        throw new Error(`Task list file not found: ${taskListPath}`);
    }

    const content = await fs.promises.readFile(taskListPath, 'utf8');
    const tasks = JSON.parse(content) as Task[];

    // Validate tasks
    for (const task of tasks) {
        if (!task.symbolName || !task.relativeDocumentPath || !task.sourceCode) {
            throw new Error('Invalid task format: missing required fields');
        }
    }

    return tasks;
}

function buildTestFileMapping(tasks: Task[], results: TestResult[], projectRoot: string): Record<string, any> {
    const mapping: Record<string, any> = {};
    const taskByKey = new Map<string, Task>();
    for (const task of tasks) {
        const key = task.taskKey ?? buildTaskKey(task);
        taskByKey.set(key, task);
    }
    const tasksBySymbol = new Map<string, Task[]>();
    for (const task of tasks) {
        const list = tasksBySymbol.get(task.symbolName) ?? [];
        list.push(task);
        tasksBySymbol.set(task.symbolName, list);
    }

    results.forEach(result => {
        if (result.success && result.outputFilePath) {
            const testFileName = path.basename(result.outputFilePath);
            let task: Task | undefined;
            if (result.taskKey) {
                task = taskByKey.get(result.taskKey);
            }
            if (!task && result.taskName) {
                const matches = tasksBySymbol.get(result.taskName) ?? [];
                if (matches.length === 1) {
                    task = matches[0];
                } else if (matches.length > 1) {
                    console.warn(
                        `[mapping] Ambiguous taskName '${result.taskName}' for ${testFileName}; ` +
                        'add taskKey to resolve.'
                    );
                }
            }
            if (task) {
                mapping[testFileName] = {
                    project_name: path.basename(projectRoot),
                    file_name: task.relativeDocumentPath,
                    symbol_name: task.symbolName,
                    location: task.location,
                    task_key: task.taskKey
                };
            } else {
                console.warn(`[mapping] No task match for ${testFileName}; skipping mapping entry.`);
            }
        }
    });

    return mapping;
}

/**
 * Helper function to run experiment from CLI-style arguments
 */
export async function runClaudeCodeFromArgs(
    taskListPath: string,
    projectRoot: string,
    model: string,
    provider: string,
    outputDir?: string,
    options: ExperimentOptions = {}
): Promise<ExperimentResult> {
    if (options.continuous) {
        ensureContinuousModeOutputDir(outputDir);
    }
    if (!outputDir) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        outputDir = path.join(
            process.cwd(),
            'claudecode-tests',
            model,
            timestamp
        );
    }

    const config: ExperimentConfig = {
        taskListPath,
        projectRoot,
        outputDir,
        model,
        provider,
        promptTemplate: options.promptTemplate,
        taskLimit: options.taskLimit
    };

    return await runClaudeCodeExperiment(config, options);
}
