#!/usr/bin/env node

/**
 * Unified CLI for Experiment Framework
 * 
 * Single entry point for both baseline and opencode experiments
 * 
 * Usage:
 *   npm run experiment -- --type <baseline|opencode|claudecode> --task-list <path> --project-root <path> --model <model> --provider <provider>
 *   
 * Examples:
 *   # Baseline experiment
 *   npm run experiment -- --type baseline --task-list /path/to/taskList.json --project-root /path/to/project --model deepseek-chat --provider deepseek
 *   
 *   # OpenCode experiment
 *   move to project directory & run the command
 *   npm run experiment -- --type opencode --task-list /path/to/taskList.json --project-root /path/to/project --model gpt-4 --provider openai
 *   
 *   # Claude Code experiment
 *   npm run experiment -- --type claudecode --task-list /path/to/taskList.json --project-root /path/to/project --model claude-3-5-sonnet-20241022 --provider claude
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ExperimentLogger, LogLevel, createExperimentLogger } from './utils/logger';
import { runBaselineFromArgs } from './runners/baselineRunner';
import { runOpencodeFromArgs } from './runners/opencodeRunner';
import { runClaudeCodeFromArgs } from './runners/claudeCodeRunner';
import { PromptTemplate } from './core/types';
import { ensureAnthropicCredentials, normalizeProviderForType, normalizeToken } from './utils/providerAuth';

/**
 * Supported experiment types
 */
type ExperimentType = 'baseline' | 'opencode' | 'claudecode';

/**
 * CLI arguments interface
 */
interface CLIArgs {
    type: ExperimentType;
    taskList: string;
    projectRoot: string;
    model: string;
    provider: string;
    promptTemplate?: PromptTemplate;
    taskLimit?: number;
    outputDir?: string;
    outputName?: string;
    parallel?: boolean;
    concurrency?: number;
    maxRetries?: number;
    continuous?: boolean;
    focusTask?: string;
    logLevel?: string;
    verbose?: boolean;
}

function ensureAnthropicCredentialsOrExit(context: 'opencode' | 'claudecode'): void {
    try {
        ensureAnthropicCredentials(context);
    } catch (error: any) {
        console.error(`Error: ${error?.message || String(error)}\n`);
        printUsage();
        process.exit(1);
    }
}

function validateOutputName(rawValue?: string): string | undefined {
    const value = rawValue?.trim();
    if (!value) {
        return undefined;
    }
    if (value === '.' || value === '..' || /[\\/]/.test(value)) {
        console.error(`Error: Invalid output directory name '${rawValue}'. Use a single directory name without path separators.\n`);
        printUsage();
        process.exit(1);
    }
    return value;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIArgs {
    const args = process.argv.slice(2);
    const parsed: any = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const keyValue = arg.slice(2);
            const equalsIndex = keyValue.indexOf('=');
            if (equalsIndex >= 0) {
                const key = keyValue.slice(0, equalsIndex);
                const value = keyValue.slice(equalsIndex + 1);
                parsed[key] = value;
                continue;
            }

            const key = keyValue;
            const value = args[i + 1];
            if (value !== undefined && !value.startsWith('--')) {
                parsed[key] = value;
                i++; // Skip next arg as it's the value
            } else {
                parsed[key] = true;
            }
        }
    }

    // Validate required arguments
    const required = ['type', 'task-list', 'project-root', 'model', 'provider'];
    const missing = required.filter(key => !parsed[key]);
    
    if (missing.length > 0) {
        console.error(`Error: Missing required arguments: ${missing.join(', ')}\n`);
        printUsage();
        process.exit(1);
    }

    // Validate experiment type
    if (!['baseline', 'opencode', 'claudecode'].includes(parsed.type)) {
        console.error(`Error: Invalid experiment type '${parsed.type}'. Must be 'baseline', 'opencode', or 'claudecode'\n`);
        printUsage();
        process.exit(1);
    }

    const type = parsed.type as ExperimentType;
    const originalProvider = String(parsed.provider);
    const normalizedProvider = normalizeProviderForType(originalProvider, type);
    if (normalizedProvider !== originalProvider.toLowerCase()) {
        console.log(`[provider] '${originalProvider}' is treated as '${normalizedProvider}' for ${type} experiments.`);
    }
    parsed.provider = normalizedProvider;

    if (parsed.type === 'opencode' && parsed.provider === 'anthropic') {
        ensureAnthropicCredentialsOrExit('opencode');
    }

    // Validate Claude Code specific requirements
    if (parsed.type === 'claudecode') {
        if (parsed.provider === 'deepseek') {
            const deepseekApiKey = normalizeToken(process.env.DEEPSEEK_API_KEY);
            if (!deepseekApiKey) {
                console.error('Error: DeepSeek API key is not set. Please set DEEPSEEK_API_KEY.\n');
                printUsage();
                process.exit(1);
            }

            // Claude Agent SDK expects Anthropic-compatible env names, even when targeting DeepSeek.
            process.env.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic';
            process.env.ANTHROPIC_AUTH_TOKEN = deepseekApiKey;
            process.env.ANTHROPIC_API_KEY = deepseekApiKey;
            process.env.API_TIMEOUT_MS = '600000';
            process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';

            console.log('[claudecode] using deepseek endpoint');
            console.log(`[claudecode] ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL}`);
            console.log(`[claudecode] API_TIMEOUT_MS=${process.env.API_TIMEOUT_MS}`);
            console.log(`[claudecode] ANTHROPIC_AUTH_TOKEN_SET=${Boolean(process.env.ANTHROPIC_AUTH_TOKEN)}`);
        } else if (parsed.provider === 'anthropic') {
            ensureAnthropicCredentialsOrExit('claudecode');
        }
        // if (parsed.provider !== 'anthropic') {
        //     console.error(`Error: Claude Code experiments require provider 'anthropic', but got '${parsed.provider}'\n`);
        //     printUsage();
        //     process.exit(1);
        // }
        
        // Validate that model is a Claude model (starts with 'claude-')
        // if (!parsed.model || !parsed.model.startsWith('claude-')) {
        //     console.error(`Error: Claude Code experiments require a Claude model (must start with 'claude-'), but got '${parsed.model}'\n`);
        //     console.error(`Examples of valid Claude models: claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-haiku-20240307\n`);
        //     printUsage();
        //     process.exit(1);
        // }
    }

    const defaultPromptTemplate: PromptTemplate = 'default';
    const promptTemplate = validatePromptTemplate(parsed['prompt-template'] || defaultPromptTemplate);

    const taskLimitRaw = parsed['task-limit'] ?? parsed['task-number'] ?? parsed['task-num'];
    const taskLimit = taskLimitRaw !== undefined ? parseInt(taskLimitRaw, 10) : undefined;
    if (taskLimit !== undefined && (isNaN(taskLimit) || taskLimit <= 0)) {
        console.error(`Error: Invalid task limit '${taskLimitRaw}'. Must be a positive integer.\n`);
        printUsage();
        process.exit(1);
    }
    const outputName = validateOutputName(parsed['output-name'] ?? parsed['experiment-name']);
    if (parsed['output-dir'] && outputName) {
        console.warn('[output] --output-name is ignored when --output-dir is provided.');
    }

    const concurrencyRaw = parsed['concurrency'] ?? parsed['parallelCount'] ?? parsed['parallel-count'] ?? '4';
    const concurrency = parseInt(String(concurrencyRaw), 10);
    if (isNaN(concurrency) || concurrency <= 0) {
        console.error(`Error: Invalid concurrency '${concurrencyRaw}'. Must be a positive integer.\n`);
        printUsage();
        process.exit(1);
    }

    return {
        type: parsed.type as ExperimentType,
        taskList: parsed['task-list'],
        projectRoot: parsed['project-root'],
        model: parsed.model,
        provider: parsed.provider,
        promptTemplate,
        taskLimit,
        outputDir: parsed['output-dir'],
        outputName,
        parallel: parsed['parallel'] !== 'false',
        concurrency,
        maxRetries: parseInt(parsed['max-retries'] || '5'),
        continuous: parsed['continuous'] === 'true' || parsed['continuous'] === true,
        focusTask: parsed['focus'] || parsed['focus-task'],
        logLevel: parsed['log-level'] || 'info',
        verbose: parsed['verbose'] === 'true' || parsed['verbose'] === true
    };
}

/**
 * Print usage information
 */
function printUsage() {
    console.log('Unified Experiment Framework CLI');
    console.log('');
    console.log('Usage:');
    console.log('  npm run experiment -- [options]');
    console.log('');
    console.log('Required Options:');
    console.log('  --type <type>            Experiment type: baseline, opencode, or claudecode');
    console.log('  --task-list <path>       Path to task list JSON file');
    console.log('  --project-root <path>   Path to project root directory');
    console.log('  --model <model>          Model name (e.g., gpt-4, deepseek-chat, claude-3-5-sonnet)');
    console.log('  --provider <provider>    Provider name (e.g., openai, deepseek, anthropic, claude)');
    console.log('');
    console.log('Optional Options:');
    console.log('  --output-dir <path>      Output directory (default: ./{type}-tests/{model}/{timestamp})');
    console.log('  --output-name <name>     Output directory name under default path (alias: --experiment-name)');
    console.log('  --parallel <bool>        Use parallel execution (default: true)');
    console.log('  --concurrency <num>      Concurrency level (default: 4, aliases: --parallelCount, --parallel-count)');
    console.log('  --max-retries <num>      Retry failed tasks up to N times (default: 5)');
    console.log('  --continuous <bool>      Rerun only failed tasks from existing experiment_summary.json (requires --output-dir)');
    console.log('  --focus <name|key>       Focus on a specific taskName or taskKey (comma-separated)');
    console.log('  --prompt-template <mode> Prompt template: cfg or default (default: cfg for claudecode/opencode, default for baseline)');
    console.log('  --task-limit <num>       Limit number of tasks to run (e.g., 1 to run a single task)');
    console.log('  --log-level <level>      Log level: debug, info, warn, error (default: info)');
    console.log('  --verbose               Enable verbose output');
    console.log('');
    console.log('Examples:');
    console.log('  # Baseline experiment with DeepSeek');
    console.log('  npm run experiment -- \\');
    console.log('    --type baseline \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model deepseek-chat \\');
    console.log('    --provider deepseek');
    console.log('');
    console.log('  # OpenCode experiment with OpenAI');
    console.log('  npm run experiment -- \\');
    console.log('    --type opencode \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model gpt-4 \\');
    console.log('    --provider openai');
    console.log('');
    console.log('  # With custom settings');
    console.log('  npm run experiment -- \\');
    console.log('    --type baseline \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model gpt-4 \\');
    console.log('    --provider openai \\');
    console.log('    --output-dir ./my-results \\');
    console.log('    --concurrency 8 \\');
    console.log('    --log-level debug \\');
    console.log('    --verbose');
    console.log('');
    console.log('  # Claude Code experiment (provider can be anthropic or claude)');
    console.log('  npm run experiment -- \\');
    console.log('    --type claudecode \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model claude-3-5-sonnet-20241022 \\');
    console.log('    --provider claude');
    console.log('');
    console.log('  # Named default output directory');
    console.log('  npm run experiment -- \\');
    console.log('    --type opencode \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model gpt-4 \\');
    console.log('    --provider openai \\');
    console.log('    --output-name black-run-01');
    console.log('');
    console.log('  # Sequential execution (for debugging)');
    console.log('  npm run experiment -- \\');
    console.log('    --type opencode \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model gpt-4 \\');
    console.log('    --provider openai \\');
    console.log('    --parallel false');
}

// Helper function to validate prompt template
function validatePromptTemplate(value: string): PromptTemplate {
    if (value === 'default' || value === 'cfg') {
        return value;
    }
    console.warn(`Invalid prompt template: ${value}. Using default: default`);
    return 'default';
}

/**
 * Convert log level string to enum
 */
function parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
        case 'debug': return LogLevel.DEBUG;
        case 'info': return LogLevel.INFO;
        case 'warn': return LogLevel.WARN;
        case 'error': return LogLevel.ERROR;
        default: return LogLevel.INFO;
    }
}

/**
 * Main CLI function
 */
async function main() {
    const args = parseArgs();
    const sessionId = randomUUID();
    const experimentId = `${args.type}_${args.model}_${Date.now()}`;

    console.log(`=== ${args.type.toUpperCase()} Experiment Framework ===\n`);

    // Validate paths
    if (!fs.existsSync(args.taskList)) {
        console.error(`Error: Task list file not found: ${args.taskList}`);
        process.exit(1);
    }

    if (!fs.existsSync(args.projectRoot)) {
        console.error(`Error: Project root not found: ${args.projectRoot}`);
        process.exit(1);
    }

    // Generate output directory if not provided
    if (!args.outputDir) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const outputDirectoryName = args.outputName || timestamp;
        args.outputDir = path.join(
            process.cwd(),
            `${args.type}-tests`,
            args.model,
            outputDirectoryName
        );
    }

    // Create logger
    const logDir = path.join(args.outputDir, 'logs');
    const logger = createExperimentLogger(
        logDir,
        sessionId,
        experimentId,
        parseLogLevel(args.logLevel || 'info')
    );

    console.log('Configuration:');
    console.log(`  Type: ${args.type}`);
    console.log(`  Task List: ${args.taskList}`);
    console.log(`  Project Root: ${args.projectRoot}`);
    console.log(`  Model: ${args.model}`);
    console.log(`  Provider: ${args.provider}`);
    console.log(`  Prompt Template: ${args.promptTemplate}`);
    if (args.taskLimit !== undefined) {
        console.log(`  Task Limit: ${args.taskLimit}`);
    }
    if (args.outputName) {
        console.log(`  Output Name: ${args.outputName}`);
    }
    console.log(`  Output Dir: ${args.outputDir}`);
    console.log(`  Parallel: ${args.parallel}`);
    if (args.parallel) {
        console.log(`  Concurrency: ${args.concurrency}`);
    }
    console.log(`  Max Retries: ${args.maxRetries}`);
    console.log(`  Continuous: ${args.continuous}`);
    if (args.focusTask) {
        console.log(`  Focus Task: ${args.focusTask}`);
    }
    console.log(`  Log Level: ${args.logLevel}`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Experiment ID: ${experimentId}`);
    console.log('');

    try {
        // Log experiment start
        logger.logExperimentStart({
            type: args.type,
            taskList: args.taskList,
            projectRoot: args.projectRoot,
            model: args.model,
            provider: args.provider,
            promptTemplate: args.promptTemplate,
            taskLimit: args.taskLimit,
            outputDir: args.outputDir || '',
            parallel: args.parallel,
            concurrency: args.concurrency,
            sessionId,
            experimentId
        });

        const runExperiment = async (continuousOverride?: boolean) => {
            const options = {
                useParallel: args.parallel,
                concurrency: args.concurrency,
                maxRetries: args.maxRetries,
                continuous: continuousOverride ?? args.continuous,
                focusTask: args.focusTask,
                promptTemplate: args.promptTemplate,
                taskLimit: args.taskLimit
            };

            if (args.type === 'baseline') {
                console.log('Running baseline experiment...\n');
                return await runBaselineFromArgs(
                    args.taskList,
                    args.projectRoot,
                    args.model,
                    args.provider,
                    args.outputDir || '',
                    options
                );
            }

            if (args.type === 'opencode') {
                console.log('Running OpenCode experiment...\n');
                return await runOpencodeFromArgs(
                    args.taskList,
                    args.projectRoot,
                    args.model,
                    args.provider,
                    args.outputDir || '',
                    options
                );
            }

            console.log('Running Claude Code experiment...\n');
            return await runClaudeCodeFromArgs(
                args.taskList,
                args.projectRoot,
                args.model,
                args.provider,
                args.outputDir || '',
                options
            );
        };

        let result = await runExperiment();

        // After a normal preliminary run, automatically rerun only failed tasks once.
        if (!args.continuous && result.failureCount > 0) {
            console.log(
                `\n[continuous:auto] Preliminary run has ${result.failureCount} failed task(s). ` +
                'Rerunning failed tasks from experiment_summary.json once...\n'
            );
            result = await runExperiment(true);
        }

        // Log experiment end
        logger.logExperimentEnd(result!);

        console.log('=== Experiment Complete ===');
        console.log(`Total Tasks: ${result!.totalTasks}`);
        console.log(`Successful: ${result!.successCount} (${Math.round(result!.successCount / result!.totalTasks * 100)}%)`);
        console.log(`Failed: ${result!.failureCount}`);
        console.log(`Warnings: ${result!.warningCount}`);
        console.log(`Execution Time: ${Math.round(result!.totalExecutionTimeMs / 1000)}s`);
        console.log(`Output Directory: ${result!.outputDir}`);
        console.log('');
        console.log('Generated files:');
        console.log(`  - Test files: ${result!.outputDir}/${args.type}-outputs/*/codes/test_*.{py,java,go,cpp}`);
        console.log(`  - Summary: ${result!.outputDir}/experiment_summary.json`);
        console.log(`  - Mapping: ${result!.outputDir}/test_file_map.json`);
        console.log(`  - Detailed logs: ${logDir}/${experimentId}_detailed.log`);
        console.log(`  - Log summary: ${logDir}/${experimentId}_summary.json`);

        process.exit(0);
    } catch (error) {
        console.error('\n=== Experiment Failed ===');
        console.error(error);
        
        // Log error
        logger.logError(error as Error, { args });
        
        process.exit(1);
    } finally {
        // Cleanup logger
        logger.close();
    }
}

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
}

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
