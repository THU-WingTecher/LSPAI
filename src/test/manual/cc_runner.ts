import { ClaudeCodeRouterManager, generateUUID } from '../../claudeCodeRouter';
import * as path from 'path';

/**
 * Manual test runner for Claude Code Router
 */
async function main() {
    console.log('=== Claude Code Router Test ===\n');

    // Create manager with auto-generated UUID
    const sessionId = generateUUID();
    const outputDir = path.join(__dirname, '../../../ccr-test-outputs');
    
    const manager = new ClaudeCodeRouterManager({ sessionId, outputDir });

    console.log(`Session ID: ${manager.getSessionId()}`);
    console.log(`Output Dir: ${manager.getOutputDir()}\n`);

    try {
        // Test 1: Single prompt
        console.log('Test 1: Single Prompt');
        await manager.runPrompt('Generate a Python function that adds two numbers', 'test_addition');

        // Test 2: Multiple prompts in sequence
        console.log('\nTest 2: Multiple Prompts');
        const prompts = [
            'Generate a factorial function in Python',
            'Write a unit test for the factorial function using pytest',
            'Add error handling for negative inputs'
        ];
        await manager.runPrompts(prompts);

        // Test 3: Batch from file
        console.log('\nTest 3: Batch Processing');
        const batchFile = path.join(__dirname, '../../../scripts/claude-code-router/batch-prompts-example.json');
        await manager.runBatchFromFile(batchFile);

        console.log('\n=== All tests completed! ===');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { main };
