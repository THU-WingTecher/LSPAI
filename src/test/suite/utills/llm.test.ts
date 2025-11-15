import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfigInstance, GenerationType, PromptType, Provider, Configuration } from '../../../config';
import path from 'path';
import { invokeLLM } from '../../../invokeLLM';
suite('LLM invoke Test Suite', () => {

    const currentConfig = {
        // model: 'deepseek-coder',
        // provider: 'deepseek' as Provider,
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

    test('Check LLM response with API key from environment variable', async () => {
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
            throw new Error('OPENAI_API_KEY must be set in environment for this test');
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

    test('Check LLM response with API key from VSCode settings', async () => {
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
            throw new Error('API key must be available from environment or VSCode settings for this test');
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
});