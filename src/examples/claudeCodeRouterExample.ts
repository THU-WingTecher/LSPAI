#!/usr/bin/env ts-node

import { ClaudeCodeRouterManager, generateUUID, quickPrompt } from '../claudeCodeRouter';
import * as path from 'path';

/**
 * Example 1: Quick single prompt
 */
async function example1_quickPrompt() {
    console.log('\n=== Example 1: Quick Prompt ===\n');
    
    const result = await quickPrompt('Generate a Python function that calculates factorial');
    console.log('Result:', result.substring(0, 100) + '...');
}

/**
 * Example 2: Multiple prompts with same session
 */
async function example2_consistentSession() {
    console.log('\n=== Example 2: Consistent Session ===\n');
    
    const sessionId = generateUUID();
    const manager = new ClaudeCodeRouterManager({ 
        sessionId,
        outputDir: path.join(process.cwd(), 'ccr-outputs')
    });

    console.log('Session ID:', sessionId);

    // Run related prompts in same session
    const prompts = [
        'Generate a Python function that calculates factorial',
        'Write a unit test for the factorial function using pytest',
        'Add docstrings to the factorial function',
        'Create error handling for negative inputs'
    ];

    const results = await manager.runPrompts(prompts);
    console.log(`\nCompleted ${results.length} prompts`);
    console.log(`Outputs saved to: ${manager.getOutputDir()}`);
}

/**
 * Example 3: Batch processing
 */
async function example3_batchProcessing() {
    console.log('\n=== Example 3: Batch Processing ===\n');
    
    const manager = new ClaudeCodeRouterManager();

    const batch = [
        { name: 'test-factorial', prompt: 'Generate a factorial function in Python' },
        { name: 'test-fibonacci', prompt: 'Generate a Fibonacci function in Python' },
        { name: 'test-binary-search', prompt: 'Generate a binary search function in Python' }
    ];

    await manager.runBatch(batch);
    console.log('Batch processing completed!');
}

/**
 * Example 4: Resume existing session
 */
async function example4_resumeSession() {
    console.log('\n=== Example 4: Resume Session ===\n');
    
    // First session
    const sessionId = generateUUID();
    const manager1 = new ClaudeCodeRouterManager({ sessionId });
    
    await manager1.runPrompt('What is a factorial function?', 'question');
    
    // Later, resume the same session
    const manager2 = new ClaudeCodeRouterManager({ sessionId });
    await manager2.runPrompt('Show me the code for it', 'followup');
    
    console.log('Session resumed successfully!');
}

/**
 * Example 5: Batch from JSON file
 */
async function example5_batchFromFile() {
    console.log('\n=== Example 5: Batch from File ===\n');
    
    const manager = new ClaudeCodeRouterManager();
    const batchFile = path.join(__dirname, '../../scripts/claude-code-router/batch-prompts-example.json');
    
    try {
        await manager.runBatchFromFile(batchFile);
        console.log('Batch from file completed!');
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Main function to run examples
 */
async function main() {
    const args = process.argv.slice(2);
    const exampleNum = args[0] || '2';

    console.log('=================================');
    console.log('Claude Code Router Examples');
    console.log('=================================');

    switch (exampleNum) {
        case '1':
            await example1_quickPrompt();
            break;
        case '2':
            await example2_consistentSession();
            break;
        case '3':
            await example3_batchProcessing();
            break;
        case '4':
            await example4_resumeSession();
            break;
        case '5':
            await example5_batchFromFile();
            break;
        case 'all':
            await example1_quickPrompt();
            await example2_consistentSession();
            await example3_batchProcessing();
            await example4_resumeSession();
            await example5_batchFromFile();
            break;
        default:
            console.log('\nUsage: node out/examples/claudeCodeRouterExample.js [1|2|3|4|5|all]');
            console.log('  1 - Quick single prompt');
            console.log('  2 - Multiple prompts with same session (default)');
            console.log('  3 - Batch processing');
            console.log('  4 - Resume existing session');
            console.log('  5 - Batch from JSON file');
            console.log('  all - Run all examples');
            process.exit(0);
    }

    console.log('\n=================================');
    console.log('Examples completed!');
    console.log('=================================');
}

if (require.main === module) {
    main().catch(console.error);
}

export { main };

