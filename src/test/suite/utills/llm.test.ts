import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfigInstance, Provider, Configuration } from '../../../config';
import { invokeLLM } from '../../../invokeLLM';
import {
    ensureAnthropicCredentials,
    getProviderApiKeyFromEnv,
    normalizeProviderForType,
    syncAnthropicCredentials
} from '../../../experiment/utils/providerAuth';
suite('LLM invoke Test Suite', () => {

    const projectPath = "/LSPRAG/src/test/fixtures/python";
    const currentConfig = {
        // model: 'deepseek-coder',
        // provider: 'deepseek' as Provider,
        workspace: projectPath,
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
    };
    getConfigInstance().updateConfig({
        ...currentConfig
    });

    const promptObj = [
        {
            role: 'system',
            content: 'You are a helpful assistant.'
        },
        {
            role: 'user',
            content: 'What is the capital of the moon?'
        }
    ];

    function normalizeToken(rawValue?: string): string | undefined {
        const value = rawValue?.trim();
        if (!value) {
            return undefined;
        }
        return value.endsWith(',') ? value.slice(0, -1).trim() : value;
    }

    test('Normalize Anthropic provider alias for claudecode and opencode', () => {
        assert.strictEqual(normalizeProviderForType('claude', 'claudecode'), 'anthropic');
        assert.strictEqual(normalizeProviderForType('claude', 'opencode'), 'anthropic');
        assert.strictEqual(normalizeProviderForType('anthopic', 'claudecode'), 'anthropic');
        assert.strictEqual(normalizeProviderForType('anthropic', 'opencode'), 'anthropic');
    });

    test('Sync Anthropic credentials for claudecode/opencode provider auth', () => {
        const envFromApiKey: NodeJS.ProcessEnv = {
            ANTHROPIC_API_KEY: 'sk-ant-test-key,'
        };
        const syncedFromApiKey = syncAnthropicCredentials(envFromApiKey);
        assert.strictEqual(syncedFromApiKey, 'sk-ant-test-key');
        assert.strictEqual(envFromApiKey.ANTHROPIC_API_KEY, 'sk-ant-test-key');
        assert.strictEqual(envFromApiKey.ANTHROPIC_AUTH_TOKEN, 'sk-ant-test-key');
        assert.strictEqual(getProviderApiKeyFromEnv('claude', envFromApiKey), 'sk-ant-test-key');

        const envFromAuthToken: NodeJS.ProcessEnv = {
            ANTHROPIC_AUTH_TOKEN: 'sk-ant-auth-token,'
        };
        const ensured = ensureAnthropicCredentials('opencode', envFromAuthToken);
        assert.strictEqual(ensured, 'sk-ant-auth-token');
        assert.strictEqual(envFromAuthToken.ANTHROPIC_API_KEY, 'sk-ant-auth-token');
        assert.strictEqual(envFromAuthToken.ANTHROPIC_AUTH_TOKEN, 'sk-ant-auth-token');
        assert.strictEqual(getProviderApiKeyFromEnv('anthropic', envFromAuthToken), 'sk-ant-auth-token');
    });

    test('Check LLM response with API key from environment variable', async function () {
        // Save original environment variable
        const originalApiKey = process.env.OPENAI_API_KEY;
        const originalTestingMode = process.env.TESTING_MODE;
        const originalNodeEnv = process.env.NODE_ENV;
        
        // Ensure we're in testing environment mode
        process.env.TESTING_MODE = 'true';
        process.env.NODE_ENV = 'test';
        
        // Set API key via environment variable
        const testApiKey = originalApiKey || process.env.OPENAI_API_KEY;
        if (!testApiKey) {
            this.skip();
            return;
        }
        process.env.OPENAI_API_KEY = testApiKey;
        
        // Reset config instance to reload from environment
        Configuration.resetInstance();
        getConfigInstance().updateConfig({
            ...currentConfig
        });
        
        try {
            const response = await invokeLLM(promptObj, []);
            console.log('response (from env var) ::', response);
            assert.ok(response && response.length > 0, 'response should not be empty');
        } finally {
            // Restore original environment variables
            if (originalApiKey !== undefined) {
                process.env.OPENAI_API_KEY = originalApiKey;
            } else {
                delete process.env.OPENAI_API_KEY;
            }
            if (originalTestingMode !== undefined) {
                process.env.TESTING_MODE = originalTestingMode;
            } else {
                delete process.env.TESTING_MODE;
            }
            if (originalNodeEnv !== undefined) {
                process.env.NODE_ENV = originalNodeEnv;
            } else {
                delete process.env.NODE_ENV;
            }
            Configuration.resetInstance();
        }
    });

    test('Check LLM response with API key from VSCode settings', async function () {
        // Save original environment variable and VSCode config
        const originalApiKey = process.env.OPENAI_API_KEY;
        const originalTestingMode = process.env.TESTING_MODE;
        const originalNodeEnv = process.env.NODE_ENV;
        const lspragConfig = vscode.workspace.getConfiguration('LSPRAG');
        const originalVSCodeApiKey = lspragConfig.get<string>('openaiApiKey');
        
        // Clear environment variable to ensure we're using VSCode settings
        delete process.env.OPENAI_API_KEY;
        delete process.env.TESTING_MODE;
        delete process.env.NODE_ENV;
        
        // Set API key via VSCode configuration
        const testApiKey = originalApiKey || originalVSCodeApiKey;
        if (!testApiKey) {
            this.skip();
            return;
        }
        await lspragConfig.update('openaiApiKey', testApiKey, vscode.ConfigurationTarget.Workspace);
        
        // Reset config instance to reload from VSCode settings
        Configuration.resetInstance();
        getConfigInstance().updateConfig({
            ...currentConfig
        });
        
        try {
            const response = await invokeLLM(promptObj, []);
            console.log('response (from VSCode settings) ::', response);
            assert.ok(response && response.length > 0, 'response should not be empty');
        } finally {
            // Restore original environment variables
            if (originalApiKey !== undefined) {
                process.env.OPENAI_API_KEY = originalApiKey;
            }
            if (originalTestingMode !== undefined) {
                process.env.TESTING_MODE = originalTestingMode;
            }
            if (originalNodeEnv !== undefined) {
                process.env.NODE_ENV = originalNodeEnv;
            }
            // Restore original VSCode configuration
            if (originalVSCodeApiKey !== undefined) {
                await lspragConfig.update('openaiApiKey', originalVSCodeApiKey, vscode.ConfigurationTarget.Workspace);
            } else {
                await lspragConfig.update('openaiApiKey', undefined, vscode.ConfigurationTarget.Workspace);
            }
            Configuration.resetInstance();
        }
    });

    test('Check Claude response with ANTHROPIC_AUTH_TOKEN', async function () {
        this.timeout(120000);

        const originalAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
        const originalApiKey = process.env.ANTHROPIC_API_KEY;
        const originalTestingMode = process.env.TESTING_MODE;
        const originalNodeEnv = process.env.NODE_ENV;

        const testAuthToken = normalizeToken(originalAuthToken) || normalizeToken(originalApiKey);
        if (!testAuthToken) {
            this.skip();
            return;
        }

        process.env.TESTING_MODE = 'true';
        process.env.NODE_ENV = 'test';
        process.env.ANTHROPIC_AUTH_TOKEN = testAuthToken;
        process.env.ANTHROPIC_API_KEY = testAuthToken;

        Configuration.resetInstance();
        getConfigInstance().updateConfig({
            workspace: projectPath,
            model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
            provider: 'anthropic' as Provider,
        });

        const claudePromptObj = [
            {
                role: 'system',
                content: 'You are a concise assistant.'
            },
            {
                role: 'user',
                content: 'Reply with only one word: moon'
            }
        ];

        try {
            const response = await invokeLLM(claudePromptObj, []);
            console.log('response (claude from env var) ::', response);
            assert.ok(response && response.length > 0, 'response should not be empty');
        } finally {
            if (originalAuthToken !== undefined) {
                process.env.ANTHROPIC_AUTH_TOKEN = originalAuthToken;
            } else {
                delete process.env.ANTHROPIC_AUTH_TOKEN;
            }
            if (originalApiKey !== undefined) {
                process.env.ANTHROPIC_API_KEY = originalApiKey;
            } else {
                delete process.env.ANTHROPIC_API_KEY;
            }
            if (originalTestingMode !== undefined) {
                process.env.TESTING_MODE = originalTestingMode;
            } else {
                delete process.env.TESTING_MODE;
            }
            if (originalNodeEnv !== undefined) {
                process.env.NODE_ENV = originalNodeEnv;
            } else {
                delete process.env.NODE_ENV;
            }
            Configuration.resetInstance();
        }
    });
});
