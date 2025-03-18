import * as assert from 'assert';
import { getConfigInstance, PromptType } from '../../config';
import { invokeLLM } from '../../invokeLLM';
import { Prompt } from '../../prompts/ChatMessage';
import { ChatMessage } from '../../prompts/ChatMessage';
import { activate } from '../../lsp';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    test('Workspace Folder should be set', async () => {

        const workspaceFolders = vscode.workspace.workspaceFolders;
        assert.ok(workspaceFolders && workspaceFolders.length > 0, "workspaceFolders should be set");
        
    });
    test('Test Prompt Type', () => {
        console.log(`Prompt Type: ${getConfigInstance().promptType}`);
        if (getConfigInstance().promptType === "basic") {
            assert.strictEqual(getConfigInstance().promptType, PromptType.BASIC);
        } else if (getConfigInstance().promptType === "detailed") {
            assert.strictEqual(getConfigInstance().promptType, PromptType.DETAILED);
        } else if (getConfigInstance().promptType === "concise") {
            assert.strictEqual(getConfigInstance().promptType, PromptType.CONCISE);
        }
    });
    
    test('LLM should answer the question', async () => {
        const chatMessages: ChatMessage[] = [
            { role: "system", content: 'you are a helpful assistant' },
            { role: "user", content: 'what is the capital of France?' }
        ];
    
        // const promptObj: Prompt = { messages: chatMessages };
        const result = await invokeLLM(chatMessages, []);
        console.log(`${getConfigInstance().model} Result: ${result}`);
        assert.strictEqual(result.length > 0, true, `Result should not be empty, current model : ${getConfigInstance().model}`);
    }); 

    test('should properly load test configuration from environment variables', async () => {
        // Set test environment variables

        // await activate();
        // Set all test environment variables
        const envKeys = ['TEST_MODEL', 'TEST_PROVIDER', 'TEST_EXP_PROB',    'TEST_TIMEOUT', 'TEST_PARALLEL_COUNT', 'TEST_MAX_ROUND', 'TEST_PROMPT_TYPE', 'TEST_OPENAI_API_KEY', 'TEST_DEEPSEEK_API_KEY', 'TEST_LOCAL_LLM_URL', 'TEST_PROXY_URL'];
        const testConfig = Object.fromEntries(
            envKeys.map(key => [key, process.env[key]])
        );

        // Import config after setting environment variables

        // Verify each configuration value
        assert.strictEqual(getConfigInstance().model, testConfig.TEST_MODEL);
        assert.strictEqual(getConfigInstance().provider, testConfig.TEST_PROVIDER);
        assert.strictEqual(getConfigInstance().expProb, parseFloat(testConfig.TEST_EXP_PROB!));
        assert.strictEqual(getConfigInstance().timeoutMs, parseInt(testConfig.TEST_TIMEOUT!));
        assert.strictEqual(getConfigInstance().parallelCount, parseInt(testConfig.TEST_PARALLEL_COUNT!));
        assert.strictEqual(getConfigInstance().maxRound, parseInt(testConfig.TEST_MAX_ROUND!));
        assert.strictEqual(getConfigInstance().promptType, testConfig.TEST_PROMPT_TYPE);
    });
});