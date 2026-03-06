/**
 * OpenCode Experiment Runner (standalone)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { Task, TestResult, ExperimentConfig, ExperimentResult, ExperimentOptions } from '../core/types';
import { generateTestsSequential, generateTestsParallel } from '../generators/opencodeGenerator';
import { detectLanguage } from '../prompts/templates';
import { generateFileNameCore } from '../utils/fileNameGenerator';
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
import {
    getProviderApiKeyFromEnv,
    normalizeOpencodeProviderID,
    syncAnthropicCredentials
} from '../utils/providerAuth';

function withCwd<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
    const prev = process.cwd();
    process.chdir(cwd);
    return fn().finally(() => process.chdir(prev));
}

function makeBasicAuthHeader(password: string | undefined): string | undefined {
    const pw = password?.trim();
    if (!pw) return undefined;
    return `Basic ${Buffer.from(`opencode:${pw}`).toString('base64')}`;
}

function makeFetchWithAuth(authHeader: string | undefined): typeof fetch | undefined {
    if (!authHeader) return undefined;
    if (typeof globalThis.fetch !== 'function') {
        throw new Error('globalThis.fetch is not available; cannot inject OPENCODE_SERVER_PASSWORD auth header');
    }
    return (input: any, init?: any) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const headers = new Headers(req.headers);
        headers.set('Authorization', authHeader);
        const authedReq = new Request(req, { headers });
        return globalThis.fetch(authedReq);
    };
}

async function ensureProviderAuth(sharedClient: any, providerID: string, directory?: string): Promise<void> {
    const normalizedProviderID = normalizeOpencodeProviderID(providerID);
    if (normalizedProviderID === 'anthropic') {
        const credential = syncAnthropicCredentials();
        if (!credential) {
            throw new Error(
                "Anthropic API key is missing. Set ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY before running opencode."
            );
        }
    }

    const skipAuthSet = process.env.OPENCODE_SKIP_AUTH_SET === '1';
    if (skipAuthSet) {
        return;
    }

    const apiKey = getProviderApiKeyFromEnv(normalizedProviderID);
    if (!apiKey) {
        return;
    }

    try {
        const result = await sharedClient.auth.set({
            path: { id: normalizedProviderID },
            query: directory ? { directory } : undefined,
            body: { type: 'api', key: apiKey }
        });
        if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
            const msg = `[opencode] auth.set returned error: ${JSON.stringify((result as any).error)}`;
            if (normalizedProviderID === 'anthropic') {
                throw new Error(msg);
            }
            console.warn(`${msg} set OPENCODE_SKIP_AUTH_SET=1 to skip.`);
        }
    } catch (e) {
        if (normalizedProviderID === 'anthropic') {
            throw e;
        }
        console.warn('[opencode] auth.set threw; set OPENCODE_SKIP_AUTH_SET=1 to skip.', e);
    }
}

async function tryCreateClient(sdk: any, baseUrl: string, authedFetch: typeof fetch | undefined): Promise<any> {
    const client = sdk.createOpencodeClient({
        baseUrl,
        fetch: authedFetch,
        throwOnError: true
    });
    // SDK v0.15.x does not expose client.global.health(); use an always-present endpoint as a smoke test.
    // Will throw if server is not reachable / unauthorized / unhealthy.
    await client.config.get();
    return client;
}

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
    const baseUrl = process.env.OPENCODE_BASE_URL;
    console.log('baseUrl', baseUrl);
    console.log('process.env.OPENCODE_BASE_URL', process.env.OPENCODE_BASE_URL);
    console.log('process.env.OPENCODE_SERVER_PASSWORD', process.env.OPENCODE_SERVER_PASSWORD);
    try {
        const sdk = await (eval('import("@opencode-ai/sdk")') as Promise<any>);
        const basicAuth = makeBasicAuthHeader(process.env.OPENCODE_SERVER_PASSWORD);
        const authedFetch = makeFetchWithAuth(basicAuth);

        if (baseUrl) {
            console.log(`Connecting to existing OpenCode server at ${baseUrl}...`);
            try {
                sharedClient = await tryCreateClient(sdk, baseUrl, authedFetch);
                console.log('✓ Connected to existing OpenCode server\n');
            } catch (e: any) {
                console.warn(
                    `[opencode] Failed to connect to OPENCODE_BASE_URL (${baseUrl}). Auto-starting a local server instead. ` +
                        `Set OPENCODE_BASE_URL to a reachable server to disable this fallback.`,
                    e?.message ?? e
                );
            }
        }

        if (!sharedClient) {
            const port = await getAvailablePort(4096);
            const hostname = '127.0.0.1';
            const result = await withCwd<any>(config.projectRoot, () =>
                sdk.createOpencode({
                    hostname,
                    port,
                    // Let opencode pick up opencode.json from cwd; we only override inline config if needed.
                    timeout: 30000
                })
            );
            sharedClient = await tryCreateClient(sdk, result.server.url, authedFetch);
            serverCleanup = result.server.close;
            console.log(`✓ OpenCode server auto-started at ${result.server.url}\n`);
        }
    } catch (error: any) {
        console.error('✗ Failed to initialize shared OpenCode server:', error.message);
        throw new Error(`Failed to initialize shared OpenCode server: ${error.message}`);
    }

    // If provider credentials are supplied via env, push them into the opencode server (best-effort).
    // If this fails (server version/schema differs), set OPENCODE_SKIP_AUTH_SET=1 and rely on env/config.
    await ensureProviderAuth(sharedClient, config.provider, config.projectRoot);

    // Generate tests
    const useParallel = options.useParallel !== false;
    const concurrency = options.concurrency || 4;

    console.log(`Generating tests (${useParallel ? `parallel, concurrency=${concurrency}` : 'sequential'})...\n`);

    let existingFileNames: Map<string, string> | undefined;
    if (options.continuous && existingSummary) {
        existingFileNames = buildExistingFileNameMap(tasksToRun, existingSummary, opencodeOutputDir);
        if (existingFileNames.size > 0) {
            console.log(`[continuous] Reusing ${existingFileNames.size} existing test file name(s).`);
        }
        const missingCount = tasksToRun.length - existingFileNames.size;
        if (missingCount > 0) {
            console.warn(`[continuous] ${missingCount} task(s) have no prior log file; new filenames will be generated.`);
        }
    }

    let results: TestResult[];
    try {
        results = useParallel
        ? await generateTestsParallel(
            tasksToRun,
            opencodeOutputDir,
            config.projectRoot,
            config.outputDir,
            config.model,
            config.provider,
            concurrency,
            options.maxRetries ?? 0,
            (completed: number, total: number, taskName: string) => {
                console.log(`[${completed}/${total}] Completed: ${taskName}`);
            },
            sharedClient,
            existingFileNames,
            options.promptTemplate ?? 'cfg'
        )
        : await generateTestsSequential(
            tasksToRun,
            opencodeOutputDir,
            config.projectRoot,
            config.outputDir,
            config.model,
            config.provider,
            options.maxRetries ?? 0,
            (completed: number, total: number, taskName: string) => {
                console.log(`[${completed}/${total}] Completed: ${taskName}`);
            },
            sharedClient,
            existingFileNames,
            options.promptTemplate ?? 'cfg'
        );
    } finally {
        if (serverCleanup) {
            console.log('\nCleaning up shared OpenCode server...');
            serverCleanup();
            console.log('✓ Shared OpenCode server closed\n');
        }
    }

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

        const mapping = buildTestFileMapping(allTasks, mergedResults, config.projectRoot);
        await fs.promises.writeFile(
            mappingPath,
            JSON.stringify(mapping, null, 2),
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

    await fs.promises.writeFile(
        summaryPath,
        JSON.stringify(experimentResult, null, 2),
        'utf8'
    );

    const mapping = buildTestFileMapping(tasksForSummary, results, config.projectRoot);
    await fs.promises.writeFile(
        mappingPath,
        JSON.stringify(mapping, null, 2),
        'utf8'
    );

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
                        `add taskKey to resolve.`
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

function buildExistingFileNameMap(
    tasks: Task[],
    summary: ExperimentResult,
    opencodeOutputDir: string
): Map<string, string> {
    const existing = new Map<string, string>();

    if (summary.results) {
        for (const result of summary.results) {
            if (result.taskKey && result.outputFilePath) {
                existing.set(result.taskKey, path.basename(result.outputFilePath));
            }
        }
    }

    const logsDir = path.join(opencodeOutputDir, 'logs');
    if (!fs.existsSync(logsDir)) {
        return existing;
    }

    const logFiles = fs.readdirSync(logsDir).filter(file => file.endsWith('.log.json'));
    if (logFiles.length === 0) {
        return existing;
    }

    const logStats = new Map<string, number>();
    for (const file of logFiles) {
        try {
            const stat = fs.statSync(path.join(logsDir, file));
            logStats.set(file, stat.mtimeMs);
        } catch {
            // ignore stat errors
        }
    }

    for (const task of tasks) {
        const taskKey = task.taskKey ?? buildTaskKey(task);
        if (existing.has(taskKey)) {
            continue;
        }

        const languageId = detectLanguage(task.relativeDocumentPath);
        const baseName = generateFileNameCore({
            sourceFileName: path.basename(task.relativeDocumentPath),
            symbolName: task.symbolName,
            languageId,
            packageString: '',
            relativeFilePath: task.relativeDocumentPath
        });
        const prefix = `${baseName}_`;
        const candidates = logFiles.filter(file => file.startsWith(prefix) && file.endsWith('.log.json'));

        if (candidates.length === 0) {
            continue;
        }

        let chosen: string | undefined;
        if (candidates.length === 1) {
            chosen = candidates[0];
        } else {
            const matchedBySource = candidates.filter(file =>
                logFileContainsSourceCode(path.join(logsDir, file), task.sourceCode)
            );
            if (matchedBySource.length === 1) {
                chosen = matchedBySource[0];
            } else {
                chosen = pickMostRecentLogFile(candidates, logStats);
                console.warn(
                    `[continuous] Multiple log matches for ${task.symbolName}; using ${chosen}`
                );
            }
        }

        if (chosen) {
            existing.set(taskKey, chosen.replace(/\.log\.json$/, ''));
        }
    }

    return existing;
}

function logFileContainsSourceCode(logPath: string, sourceCode: string): boolean {
    try {
        const raw = fs.readFileSync(logPath, 'utf8');
        const data = JSON.parse(raw);
        const prompt = data?.prompt;
        return typeof prompt === 'string' && prompt.includes(sourceCode);
    } catch {
        return false;
    }
}

function pickMostRecentLogFile(files: string[], logStats: Map<string, number>): string {
    let best = files[0];
    let bestTime = logStats.get(best) ?? 0;
    for (let i = 1; i < files.length; i++) {
        const file = files[i];
        const time = logStats.get(file) ?? 0;
        if (time >= bestTime) {
            best = file;
            bestTime = time;
        }
    }
    return best;
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
    if (options.continuous) {
        ensureContinuousModeOutputDir(outputDir);
    }
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
        provider,
        promptTemplate: options.promptTemplate,
        taskLimit: options.taskLimit
    };

    return await runOpencodeExperiment(config, options);
}

/**
 * Find an available port, preferring the provided one
 */
async function getAvailablePort(preferredPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const tryPreferred = net.createServer();
        tryPreferred.once('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                const fallback = net.createServer();
                fallback.listen(0, '127.0.0.1', () => {
                    const address = fallback.address() as net.AddressInfo;
                    fallback.close(() => resolve(address.port));
                });
                fallback.on('error', reject);
            } else {
                reject(err);
            }
        });
        tryPreferred.listen(preferredPort, '127.0.0.1', () => {
            const address = tryPreferred.address() as net.AddressInfo;
            tryPreferred.close(() => resolve(address.port));
        });
    });
}
