#!/usr/bin/env node

/**
 * Unified CLI for Experiment Framework
 * 
 * Single entry point for both baseline and opencode experiments
 * 
 * Usage:
 *   npm run experiment -- --type <baseline|opencode> --task-list <path> --project-root <path> --model <model> --provider <provider>
 *   
 * Examples:
 *   # Baseline experiment
 *   npm run experiment -- --type baseline --task-list /path/to/taskList.json --project-root /path/to/project --model deepseek-chat --provider deepseek
 *   
 *   # OpenCode experiment
 *   move to project directory & run the command
 *   npm run experiment -- --type opencode --task-list /path/to/taskList.json --project-root /path/to/project --model gpt-4 --provider openai
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ExperimentLogger, LogLevel, createExperimentLogger } from './utils/logger';
import { runBaselineFromArgs } from './runners/baselineRunner';
import { runOpencodeFromArgs } from './runners/opencodeRunner';

/**
 * Supported experiment types
 */
type ExperimentType = 'baseline' | 'opencode';

/**
 * CLI arguments interface
 */
interface CLIArgs {
    type: ExperimentType;
    taskList: string;
    projectRoot: string;
    model: string;
    provider: string;
    outputDir?: string;
    parallel?: boolean;
    concurrency?: number;
    logLevel?: string;
    verbose?: boolean;
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
            const key = arg.slice(2);
            const value = args[i + 1];
            parsed[key] = value;
            i++; // Skip next arg as it's the value
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
    if (!['baseline', 'opencode'].includes(parsed.type)) {
        console.error(`Error: Invalid experiment type '${parsed.type}'. Must be 'baseline' or 'opencode'\n`);
        printUsage();
        process.exit(1);
    }

    return {
        type: parsed.type as ExperimentType,
        taskList: parsed['task-list'],
        projectRoot: parsed['project-root'],
        model: parsed.model,
        provider: parsed.provider,
        outputDir: parsed['output-dir'],
        parallel: parsed['parallel'] !== 'false',
        concurrency: parseInt(parsed['concurrency'] || '4'),
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
    console.log('  --type <type>            Experiment type: baseline or opencode');
    console.log('  --task-list <path>       Path to task list JSON file');
    console.log('  --project-root <path>   Path to project root directory');
    console.log('  --model <model>          Model name (e.g., gpt-4, deepseek-chat, claude-3-5-sonnet)');
    console.log('  --provider <provider>    Provider name (e.g., openai, deepseek, anthropic)');
    console.log('');
    console.log('Optional Options:');
    console.log('  --output-dir <path>      Output directory (default: ./{type}-tests/{model}/{timestamp})');
    console.log('  --parallel <bool>        Use parallel execution (default: true)');
    console.log('  --concurrency <num>      Concurrency level (default: 4)');
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
    console.log('  # Sequential execution (for debugging)');
    console.log('  npm run experiment -- \\');
    console.log('    --type opencode \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model gpt-4 \\');
    console.log('    --provider openai \\');
    console.log('    --parallel false');
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
        args.outputDir = path.join(
            process.cwd(),
            `${args.type}-tests`,
            args.model,
            timestamp
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
    console.log(`  Output Dir: ${args.outputDir}`);
    console.log(`  Parallel: ${args.parallel}`);
    if (args.parallel) {
        console.log(`  Concurrency: ${args.concurrency}`);
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
            outputDir: args.outputDir || '',
            parallel: args.parallel,
            concurrency: args.concurrency,
            sessionId,
            experimentId
        });

        let result;
        
        // Run appropriate experiment
        if (args.type === 'baseline') {
            console.log('Running baseline experiment...\n');
        result = await runBaselineFromArgs(
            args.taskList,
            args.projectRoot,
            args.model,
            args.provider,
            args.outputDir || '',
            {
                useParallel: args.parallel,
                concurrency: args.concurrency
            }
        );
        } else if (args.type === 'opencode') {
            console.log('Running OpenCode experiment...\n');
        result = await runOpencodeFromArgs(
            args.taskList,
            args.projectRoot,
            args.model,
            args.provider,
            args.outputDir || '',
            {
                useParallel: args.parallel,
                concurrency: args.concurrency
            }
        );
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

