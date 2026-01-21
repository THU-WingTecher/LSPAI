/**
 * Claude Code Experiment Runner (standalone)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Task, ExperimentConfig, ExperimentResult, ExperimentOptions } from '../core/types';
import { generateTestsSequential, generateTestsParallel } from '../generators/claudeCodeGenerator';

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
    console.log('');

    // Load task list
    console.log('Loading task list...');
    const tasks = await loadTaskList(config.taskListPath);
    console.log(`Loaded ${tasks.length} tasks\n`);

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
    console.log(`  Note: Each task gets its own unique session ID\n`);

    // Generate tests
    const useParallel = options.useParallel !== false;
    const concurrency = options.concurrency || 4;

    console.log(`Generating tests (${useParallel ? `parallel, concurrency=${concurrency}` : 'sequential'})...\n`);

    const results = useParallel
        ? await generateTestsParallel(
            tasks,
            claudeCodeOutputDir,
            config.projectRoot,
            config.outputDir,
            config.model,
            concurrency,
            (completed: number, total: number, taskName: string) => {
                console.log(`[${completed}/${total}] Completed: ${taskName}`);
            }
        )
        : await generateTestsSequential(
            tasks,
            claudeCodeOutputDir,
            config.projectRoot,
            config.outputDir,
            config.model,
            (completed: number, total: number, taskName: string) => {
                console.log(`[${completed}/${total}] Completed: ${taskName}`);
            }
        );

    // Calculate statistics
    const successCount = results.filter((r: any) => r.success).length;
    const failureCount = results.filter((r: any) => !r.success).length;
    const warningCount = results.filter((r: any) => r.success && r.warnings && r.warnings.length > 0).length;
    const totalExecutionTimeMs = Date.now() - startTime;

    // Build experiment result
    const experimentResult: ExperimentResult = {
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
    results.forEach((result: any) => {
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
async function loadTaskList(taskListPath: string): Promise<Task[]> {
    if (!fs.existsSync(taskListPath)) {
        throw new Error(`Task list file not found: ${taskListPath}`);
    }

    const content = await fs.promises.readFile(taskListPath, 'utf8');
    const tasks = JSON.parse(content) as Task[];

    // Validate tasks
    for (const task of tasks) {
        if (!task.symbolName || !task.relativeDocumentPath || !task.sourceCode) {
            throw new Error(`Invalid task format: missing required fields`);
        }
    }

    return tasks;
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
        provider
    };

    return await runClaudeCodeExperiment(config, options);
}



