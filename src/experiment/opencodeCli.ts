#!/usr/bin/env node

/**
 * CLI for OpenCode Unit Test Generation Experiment
 * 
 * This is a standalone OpenCode experiment runner that does NOT depend on:
 * - VSCode API
 * - LSPRAG configuration (generation_type, fix_type, etc.)
 * 
 * Usage:
 *   npm run opencode-experiment -- --task-list <path> --project-root <path> --model <model> --provider <provider>
 *   
 * Example:
 *   npm run opencode-experiment -- \
 *     --task-list /LSPRAG/experiments/config/black-taskList.json \
 *     --project-root /LSPRAG/experiments/projects/black \
 *     --model gpt-4 \
 *     --provider openai
 */

import * as fs from 'fs';
// Import ONLY OpenCode modules (no vscode dependencies)
import { runOpencodeFromArgs } from './opencodeRunner';

interface CLIArgs {
    taskList: string;
    projectRoot: string;
    model: string;
    provider: string;
    outputDir?: string;
    parallel?: boolean;
    concurrency?: number;
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
    if (!parsed['task-list'] || !parsed['project-root'] || !parsed['model'] || !parsed['provider']) {
        console.error('Error: Missing required arguments\n');
        printUsage();
        process.exit(1);
    }

    return {
        taskList: parsed['task-list'],
        projectRoot: parsed['project-root'],
        model: parsed['model'],
        provider: parsed['provider'],
        outputDir: parsed['output-dir'],
        parallel: parsed['parallel'] !== 'false',
        concurrency: parseInt(parsed['concurrency'] || '4')
    };
}

/**
 * Print usage information
 */
function printUsage() {
    console.log('OpenCode Unit Test Generation Experiment');
    console.log('');
    console.log('Usage:');
    console.log('  npm run opencode-experiment -- [options]');
    console.log('');
    console.log('Required Options:');
    console.log('  --task-list <path>       Path to task list JSON file');
    console.log('  --project-root <path>    Path to project root directory');
    console.log('  --model <model>          Model name (e.g., gpt-4, claude-3-5-sonnet-20241022)');
    console.log('  --provider <provider>    Provider name (e.g., openai, anthropic)');
    console.log('');
    console.log('Optional Options:');
    console.log('  --output-dir <path>      Output directory (default: ./opencode-tests/{model}/{timestamp})');
    console.log('  --parallel <bool>        Use parallel execution (default: true)');
    console.log('  --concurrency <num>      Concurrency level (default: 4)');
    console.log('');
    console.log('Examples:');
    console.log('  # Basic usage with OpenAI');
    console.log('  npm run opencode-experiment -- \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model gpt-4 \\');
    console.log('    --provider openai');
    console.log('');
    console.log('  # With Anthropic Claude');
    console.log('  npm run opencode-experiment -- \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model claude-3-5-sonnet-20241022 \\');
    console.log('    --provider anthropic');
    console.log('');
    console.log('  # With custom output and concurrency');
    console.log('  npm run opencode-experiment -- \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model gpt-4 \\');
    console.log('    --provider openai \\');
    console.log('    --output-dir ./my-results \\');
    console.log('    --concurrency 8');
    console.log('');
    console.log('  # Sequential execution (for debugging)');
    console.log('  npm run opencode-experiment -- \\');
    console.log('    --task-list /path/to/taskList.json \\');
    console.log('    --project-root /path/to/project \\');
    console.log('    --model gpt-4 \\');
    console.log('    --provider openai \\');
    console.log('    --parallel false');
}

/**
 * Main CLI function
 */
async function main() {
    console.log('=== OpenCode Unit Test Generation Experiment ===\n');

    const args = parseArgs();

    // Validate paths
    if (!fs.existsSync(args.taskList)) {
        console.error(`Error: Task list file not found: ${args.taskList}`);
        process.exit(1);
    }

    if (!fs.existsSync(args.projectRoot)) {
        console.error(`Error: Project root not found: ${args.projectRoot}`);
        process.exit(1);
    }

    console.log('Configuration:');
    console.log(`  Task List: ${args.taskList}`);
    console.log(`  Project Root: ${args.projectRoot}`);
    console.log(`  Model: ${args.model}`);
    console.log(`  Provider: ${args.provider}`);
    if (args.outputDir) {
        console.log(`  Output Dir: ${args.outputDir}`);
    }
    console.log(`  Parallel: ${args.parallel}`);
    if (args.parallel) {
        console.log(`  Concurrency: ${args.concurrency}`);
    }
    console.log('');

    try {
        const result = await runOpencodeFromArgs(
            args.taskList,
            args.projectRoot,
            args.model,
            args.provider,
            args.outputDir,
            {
                useParallel: args.parallel,
                concurrency: args.concurrency
            }
        );

        console.log('=== Experiment Complete ===');
        console.log(`Total Tasks: ${result.totalTasks}`);
        console.log(`Successful: ${result.successCount} (${Math.round(result.successCount / result.totalTasks * 100)}%)`);
        console.log(`Failed: ${result.failureCount}`);
        console.log(`Warnings: ${result.warningCount}`);
        console.log(`Execution Time: ${Math.round(result.totalExecutionTimeMs / 1000)}s`);
        console.log(`Output Directory: ${result.outputDir}`);
        console.log('');
        console.log('Generated files:');
        console.log(`  - Test files: ${result.outputDir}/opencode-outputs/*/codes/test_*.{py,java,go,cpp}`);
        console.log(`  - Summary: ${result.outputDir}/experiment_summary.json`);
        console.log(`  - Mapping: ${result.outputDir}/test_file_map.json`);
        console.log(`  - OpenCode outputs: ${result.outputDir}/opencode-outputs/`);

        process.exit(0);
    } catch (error) {
        console.error('\n=== Experiment Failed ===');
        console.error(error);
        process.exit(1);
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

