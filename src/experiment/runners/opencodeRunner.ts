/**
 * OpenCode Experiment Runner (standalone)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { Task, ExperimentConfig, ExperimentResult, ExperimentOptions } from '../core/types';
import { generateTestsSequential, generateTestsParallel } from '../generators/opencodeGenerator';

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

function getProviderApiKey(providerID: string): string {
    const p = providerID.toLowerCase();
    if (p === 'openai') return process.env.OPENAI_API_KEY ?? '';
    if (p === 'deepseek') return process.env.DEEPSEEK_API_KEY ?? '';
    if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY ?? '';
    return process.env.OPENAI_API_KEY ?? '';
}

async function ensureProviderAuth(sharedClient: any, providerID: string): Promise<void> {
    const skipAuthSet = process.env.OPENCODE_SKIP_AUTH_SET === '1';
    if (skipAuthSet) return;

    const apiKey = getProviderApiKey(providerID);
    if (!apiKey) return;

    try {
        const result = await sharedClient.auth.set({
            path: { id: providerID },
            body: { type: 'api', key: apiKey }
        });
        if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
            console.warn('[opencode] auth.set returned error; set OPENCODE_SKIP_AUTH_SET=1 to skip.', (result as any).error);
        }
    } catch (e) {
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
    await ensureProviderAuth(sharedClient, config.provider);

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
                config.provider,
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
                config.provider,
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

