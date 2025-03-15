import * as assert from 'assert';
import { currentModel, currentProvider, currentPromptType, maxRound, methodsForExperiment, PromptType } from '../../config';
import { invokeLLM } from '../../invokeLLM';
import { Prompt } from '../../prompts/ChatMessage';
import { ChatMessage } from '../../prompts/ChatMessage';


suite('Extension Test Suite', () => {
    test('Test Prompt Type', () => {
        console.log(`Prompt Type: ${currentPromptType}`);
        if (currentPromptType == "basic") {
            assert.strictEqual(currentPromptType, PromptType.BASIC);
        } else if (currentPromptType == "detailed") {
            assert.strictEqual(currentPromptType, PromptType.DETAILED);
        } else if (currentPromptType == "concise") {
            assert.strictEqual(currentPromptType, PromptType.CONCISE);
        }
    });
    
    test('LLM should answer the question', async () => {
        const chatMessages: ChatMessage[] = [
            { role: "system", content: 'you are a helpful assistant' },
            { role: "user", content: 'what is the capital of France?' }
        ];
    
        // const promptObj: Prompt = { messages: chatMessages };
        const result = await invokeLLM(chatMessages, []);
        assert.strictEqual(result.length > 0, true, `Result should not be empty, current model : ${currentModel}`);
    }); 

    test('should properly load test configuration from environment variables', async () => {
        // Set test environment variables


        // Set all test environment variables
        const envKeys = ['TEST_MODEL', 'TEST_PROVIDER', 'TEST_EXP_PROB',    'TEST_TIMEOUT', 'TEST_PARALLEL_COUNT', 'TEST_MAX_ROUND', 'TEST_PROMPT_TYPE', 'TEST_OPENAI_API_KEY', 'TEST_DEEPSEEK_API_KEY', 'TEST_LOCAL_LLM_URL', 'TEST_PROXY_URL'];
        const testConfig = Object.fromEntries(
            envKeys.map(key => [key, process.env[key]])
        );

        // Import config after setting environment variables
        const currentConfig = await import('../../config');

        // Verify each configuration value
        assert.strictEqual(currentConfig.currentModel, testConfig.TEST_MODEL);
        assert.strictEqual(currentConfig.currentProvider, testConfig.TEST_PROVIDER);
        assert.strictEqual(currentConfig.currentExpProb, parseFloat(testConfig.TEST_EXP_PROB!));
        assert.strictEqual(currentConfig.currentTimeout, parseInt(testConfig.TEST_TIMEOUT!));
        assert.strictEqual(currentConfig.currentParallelCount, parseInt(testConfig.TEST_PARALLEL_COUNT!));
        assert.strictEqual(currentConfig.maxRound, parseInt(testConfig.TEST_MAX_ROUND!));
        assert.strictEqual(currentConfig.currentPromptType, testConfig.TEST_PROMPT_TYPE);
    });
});