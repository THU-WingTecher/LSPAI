/**
 * OpenCode Experiment Runner (standalone)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Task, ExperimentConfig, ExperimentResult, ExperimentOptions } from '../core/types';
import { generateTestsSequential, generateTestsParallel } from '../generators/opencodeGenerator';

/**
 * Run OpenCode unit test generation experiment
 */
export async function runOpencodeExperiment(
    config: ExperimentConfig,
    options: ExperimentOptions = {}
): Promise<ExperimentResult> {
    const startTime = Date.now();

    console.log('=== OpenCode Unit Test Generation Experiment ===\n');
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

    // Setup OpenCode output directory
    const opencodeOutputDir = path.join(config.outputDir, config.model);
    if (!fs.existsSync(opencodeOutputDir)) {
        fs.mkdirSync(opencodeOutputDir, { recursive: true });
    }

    console.log('OpenCode SDK setup:');
    console.log(`  OpenCode Output: ${opencodeOutputDir}`);
    console.log(`  Note: Each task gets its own unique session ID\n`);

    // Initialize shared OpenCode server/client
    console.log('Initializing shared OpenCode server...');
    let sharedClient: any = null;
    let serverCleanup: (() => void) | null = null;
    
    try {
        const sdk = await (eval('import("@opencode-ai/sdk")') as Promise<any>);
        const result = await sdk.createOpencode({
            workspaceDir: config.projectRoot
        });
        sharedClient = result.client;
        serverCleanup = result.server.close;
        console.log('✓ Shared OpenCode server initialized\n');
    } catch (error: any) {
        console.error('✗ Failed to initialize shared OpenCode server:', error.message);
        throw new Error(`Failed to initialize shared OpenCode server: ${error.message}`);
    }

    // Generate tests
    const useParallel = options.useParallel !== false;
    const concurrency = options.concurrency || 4;

    console.log(`Generating tests (${useParallel ? `parallel, concurrency=${concurrency}` : 'sequential'})...\n`);

    let results: any[];
    try {
        results = useParallel
            ? await generateTestsParallel(
                tasks,
                opencodeOutputDir,
                config.projectRoot,
                config.outputDir,
                config.model,
                concurrency,
                (completed: number, total: number, taskName: string) => {
                    console.log(`[${completed}/${total}] Completed: ${taskName}`);
                },
                sharedClient
            )
            : await generateTestsSequential(
                tasks,
                opencodeOutputDir,
                config.projectRoot,
                config.outputDir,
                config.model,
                (completed: number, total: number, taskName: string) => {
                    console.log(`[${completed}/${total}] Completed: ${taskName}`);
                },
                sharedClient
            );
    } finally {
        if (serverCleanup) {
            console.log('\nCleaning up shared OpenCode server...');
            serverCleanup();
            console.log('✓ Shared OpenCode server closed\n');
        }
    }

    // Calculate statistics
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const warningCount = results.filter(r => r.success && r.warnings && r.warnings.length > 0).length;
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
export async function runOpencodeFromArgs(
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
            'opencode-tests',
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

    return await runOpencodeExperiment(config, options);
}

