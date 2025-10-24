/**
 * OpenCode Experiment Runner (independent of VSCode/LSPRAG)
 * 
 * This is a standalone experiment runner for unit test generation using OpenCode SDK.
 * It mirrors the baseline experiment structure but uses OpenCode instead of CCR.
 * 
 * It does NOT depend on:
 * - VSCode API
 * - LSPRAG configuration (generation_type, fix_type, etc.)
 * - Symbol loading/interpretation
 * 
 * It simply:
 * 1. Reads task list JSON
 * 2. Generates prompts from templates
 * 3. Sends to OpenCode
 * 4. Extracts and saves generated tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaselineConfig, BaselineTask, BaselineExperimentResult } from './baselineTypes';
import { generateTestsSequential, generateTestsParallel } from './opencodeTestGenerator';
import { getCost } from './openaiOrgCost';

/**
 * Options for OpenCode experiment
 */
export interface OpencodeRunOptions {
    useParallel?: boolean;
    concurrency?: number;
}

/**
 * Run OpenCode unit test generation experiment
 * 
 * @param config - Baseline configuration (reused for compatibility)
 * @param options - Execution options
 * @returns Experiment results
 */
export async function runOpencodeExperiment(
    config: BaselineConfig,
    options: OpencodeRunOptions = {}
): Promise<BaselineExperimentResult> {
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

    // Setup OpenCode output directory (each task will get its own session)
    const opencodeOutputDir = path.join(config.outputDir, 'opencode-outputs');
    if (!fs.existsSync(opencodeOutputDir)) {
        fs.mkdirSync(opencodeOutputDir, { recursive: true });
    }

    console.log('OpenCode SDK setup:');
    console.log(`  OpenCode Output: ${opencodeOutputDir}`);
    console.log(`  Note: Each task gets its own unique session ID\n`);

    // Initialize shared OpenCode server/client (to avoid port conflicts)
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
    const useParallel = options.useParallel !== false; // Default true
    const concurrency = options.concurrency || 4;

    // ========== GET INITIAL COST ==========
    let beforeCost: number | undefined;
    let finalCost: number | undefined;
    let experimentCost: number | undefined;
    
    // try {
    //     console.log('Querying initial cost...');
    //     beforeCost = await getCost();
    //     console.log(`Initial cost: $${beforeCost.toFixed(4)}\n`);
    // } catch (error) {
    //     console.warn('Failed to query initial cost:', error);
    //     console.log('Continuing without cost tracking...\n');
    // }

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
                (completed, total, taskName) => {
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
                (completed, total, taskName) => {
                    console.log(`[${completed}/${total}] Completed: ${taskName}`);
                },
                sharedClient
            );
    } finally {
        // Cleanup: close the shared OpenCode server
        if (serverCleanup) {
            console.log('\nCleaning up shared OpenCode server...');
            serverCleanup();
            console.log('✓ Shared OpenCode server closed\n');
        }
    }

    // ========== GET FINAL COST ==========
    // try {
    //     console.log('\nQuerying final cost...');
    //     finalCost = await getCost();
    //     console.log(`Final cost: $${finalCost.toFixed(4)}`);
        
    //     if (beforeCost !== undefined) {
    //         experimentCost = finalCost - beforeCost;
    //         console.log(`Experiment cost: $${experimentCost.toFixed(4)}\n`);
    //     }
    // } catch (error) {
    //     console.warn('Failed to query final cost:', error);
    // }
    // ====================================

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
        beforeCost,
        finalCost,
        experimentCost,
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
    if (experimentCost !== undefined) {
        console.log(`Experiment Cost: $${experimentCost.toFixed(4)}`);
    }
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
export async function runOpencodeFromArgs(
    taskListPath: string,
    projectRoot: string,
    model: string,
    provider: string,
    outputDir?: string,
    options: OpencodeRunOptions = {}
): Promise<BaselineExperimentResult> {
    // Generate output directory if not provided
    if (!outputDir) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        outputDir = path.join(
            process.cwd(),
            'opencode-tests',
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

    return await runOpencodeExperiment(config, options);
}

