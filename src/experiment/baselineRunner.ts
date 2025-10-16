/**
 * Baseline Experiment Runner (independent of VSCode/LSPRAG)
 * 
 * This is a standalone baseline for unit test generation using Claude Code Router.
 * It does NOT depend on:
 * - VSCode API
 * - LSPRAG configuration (generation_type, fix_type, etc.)
 * - Symbol loading/interpretation
 * 
 * It simply:
 * 1. Reads task list JSON
 * 2. Generates prompts from templates
 * 3. Sends to Claude Code Router
 * 4. Extracts and saves generated tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaselineConfig, BaselineTask, BaselineExperimentResult } from './baselineTypes';
import { generateTestsSequential, generateTestsParallel } from './baselineTestGenerator';

/**
 * Options for baseline experiment
 */
export interface BaselineRunOptions {
    useParallel?: boolean;
    concurrency?: number;
}

/**
 * Run baseline unit test generation experiment
 * 
 * @param config - Baseline configuration
 * @param options - Execution options
 * @returns Experiment results
 */
export async function runBaselineExperiment(
    config: BaselineConfig,
    options: BaselineRunOptions = {}
): Promise<BaselineExperimentResult> {
    const startTime = Date.now();

    console.log('=== Baseline CC Unit Test Generation Experiment ===\n');
    console.log('Configuration:');
    console.log(`  Task List: ${config.taskListPath}`);
    console.log(`  Project Root: ${config.projectRoot}`);
    console.log(`  Output Dir: ${config.outputDir}`);
    console.log(`  Model: ${config.model}`);
    console.log(`  Provider: ${config.provider}`);
    console.log('');

    // Load task list
    console.log('Loading task list...');
    const tasks = await loadTaskList(config.taskListPath);
    console.log(`Loaded ${tasks.length} tasks\n`);

    // Ensure output directory exists
    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true });
    }

    // Setup CCR output directory (each task will get its own session)
    const ccrOutputDir = path.join(config.outputDir, 'ccr-outputs');
    if (!fs.existsSync(ccrOutputDir)) {
        fs.mkdirSync(ccrOutputDir, { recursive: true });
    }

    console.log('Claude Code Router setup:');
    console.log(`  CCR Output: ${ccrOutputDir}`);
    console.log(`  Note: Each task gets its own unique session ID\n`);

    // Generate tests
    const useParallel = options.useParallel !== false; // Default true
    const concurrency = options.concurrency || 4;

    console.log(`Generating tests (${useParallel ? `parallel, concurrency=${concurrency}` : 'sequential'})...\n`);

    const results = useParallel
        ? await generateTestsParallel(
            tasks,
            ccrOutputDir,
            config.projectRoot,
            config.outputDir,
            config.model,
            concurrency,
            (completed, total, taskName) => {
                console.log(`[${completed}/${total}] Completed: ${taskName}`);
            }
        )
        : await generateTestsSequential(
            tasks,
            ccrOutputDir,
            config.projectRoot,
            config.outputDir,
            config.model,
            (completed, total, taskName) => {
                console.log(`[${completed}/${total}] Completed: ${taskName}`);
            }
        );

    // Calculate statistics
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const warningCount = results.filter(r => r.success && r.warnings && r.warnings.length > 0).length;
    const totalExecutionTimeMs = Date.now() - startTime;

    // Build experiment result
    const experimentResult: BaselineExperimentResult = {
        config,
        totalTasks: tasks.length,
        successCount,
        failureCount,
        warningCount,
        outputDir: config.outputDir,
        totalExecutionTimeMs,
        results,
        timestamp: new Date().toISOString()
    };

    // Save experiment summary
    const summaryPath = path.join(config.outputDir, 'experiment_summary.json');
    await fs.promises.writeFile(
        summaryPath,
        JSON.stringify(experimentResult, null, 2),
        'utf8'
    );

    // Save test file mapping
    const mappingPath = path.join(config.outputDir, 'test_file_map.json');
    const mapping: any = {};
    results.forEach(result => {
        if (result.success && result.outputFilePath) {
            const testFileName = path.basename(result.outputFilePath);
            const task = tasks.find(t => t.symbolName === result.taskName);
            if (task) {
                mapping[testFileName] = {
                    project_name: path.basename(config.projectRoot),
                    file_name: task.relativeDocumentPath,
                    symbol_name: task.symbolName
                };
            }
        }
    });
    await fs.promises.writeFile(
        mappingPath,
        JSON.stringify(mapping, null, 2),
        'utf8'
    );

    // Print summary
    console.log('\n=== Experiment Complete ===');
    console.log(`Total Tasks: ${experimentResult.totalTasks}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Warnings: ${warningCount}`);
    console.log(`Execution Time: ${Math.round(totalExecutionTimeMs / 1000)}s`);
    console.log(`Output Directory: ${config.outputDir}`);
    console.log(`Summary: ${summaryPath}`);
    console.log(`Test Mapping: ${mappingPath}\n`);

    return experimentResult;
}

/**
 * Load task list from JSON file
 */
async function loadTaskList(taskListPath: string): Promise<BaselineTask[]> {
    if (!fs.existsSync(taskListPath)) {
        throw new Error(`Task list file not found: ${taskListPath}`);
    }

    const content = await fs.promises.readFile(taskListPath, 'utf8');
    const tasks = JSON.parse(content) as BaselineTask[];

    // Validate tasks
    for (const task of tasks) {
        if (!task.symbolName || !task.relativeDocumentPath || !task.sourceCode) {
            throw new Error(`Invalid task format: missing required fields`);
        }
    }

    return tasks;
}

/**
 * Quick helper function to run experiment from CLI-style arguments
 */
export async function runBaselineFromArgs(
    taskListPath: string,
    projectRoot: string,
    model: string,
    provider: string,
    outputDir?: string,
    options: BaselineRunOptions = {}
): Promise<BaselineExperimentResult> {
    // Generate output directory if not provided
    if (!outputDir) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        outputDir = path.join(
            process.cwd(),
            'cc-tests',
            model,
            timestamp
        );
    }

    const config: BaselineConfig = {
        taskListPath,
        projectRoot,
        outputDir,
        model,
        provider
    };

    return await runBaselineExperiment(config, options);
}

