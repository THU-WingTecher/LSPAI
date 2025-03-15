import path from 'path';
import * as vscode from 'vscode';

export enum PromptType {
    BASIC = 'basic',
    DETAILED = 'detailed',
    CONCISE = 'concise'
}

export type Provider = 'openai' | 'local' | 'deepseek';

const DEFAULT_CONFIG = {
    expProb: 0.2,
    parallelCount: 1,
    model: 'deepseek-chat',
    provider: 'deepseek' as Provider,
    timeoutMs: 600 * 1000,
    promptType: PromptType.BASIC,
    maxRound: 5
};

export class Configuration {
    private static instance: Configuration;
    private config: any;

    private constructor() {
        this.config = this.loadConfiguration();
        this.adjustTimeout();
    }

    public static getInstance(): Configuration {
        if (!Configuration.instance) {
            Configuration.instance = new Configuration();
        }
        return Configuration.instance;
    }

    private isTestingEnvironment(): boolean {
        return process.env.NODE_ENV === 'test' || process.env.TESTING_MODE === 'true';
    }

    private validateTestConfig(envVar: string | undefined, paramName: string): void {
        if (!envVar) {
            throw new Error(`Testing environment requires ${paramName} to be set`);
        }
    }

    private loadConfiguration() {
        if (this.isTestingEnvironment()) {
            // Validate test environment variables
            this.validateTestConfig(process.env.TEST_EXP_PROB, 'TEST_EXP_PROB');
            this.validateTestConfig(process.env.TEST_MODEL, 'TEST_MODEL');
            this.validateTestConfig(process.env.TEST_PROVIDER, 'TEST_PROVIDER');
            this.validateTestConfig(process.env.TEST_PROMPT_TYPE, 'TEST_PROMPT_TYPE');
            this.validateTestConfig(process.env.TEST_TIMEOUT, 'TEST_TIMEOUT');
            this.validateTestConfig(process.env.TEST_PARALLEL_COUNT, 'TEST_PARALLEL_COUNT');
            this.validateTestConfig(process.env.TEST_MAX_ROUND, 'TEST_MAX_ROUND');
            this.validateTestConfig(process.env.TEST_OPENAI_API_KEY, 'TEST_OPENAI_API_KEY');
            this.validateTestConfig(process.env.TEST_DEEPSEEK_API_KEY, 'TEST_DEEPSEEK_API_KEY');
            this.validateTestConfig(process.env.TEST_LOCAL_LLM_URL, 'TEST_LOCAL_LLM_URL');
            this.validateTestConfig(process.env.TEST_PROXY_URL, 'TEST_PROXY_URL');

            return {
                expProb: parseFloat(process.env.TEST_EXP_PROB!),
                model: process.env.TEST_MODEL!,
                provider: process.env.TEST_PROVIDER! as Provider,
                promptType: process.env.TEST_PROMPT_TYPE! as PromptType,
                timeoutMs: parseInt(process.env.TEST_TIMEOUT!),
                parallelCount: parseInt(process.env.TEST_PARALLEL_COUNT!),
                maxRound: parseInt(process.env.TEST_MAX_ROUND!),
                openaiApiKey: process.env.TEST_OPENAI_API_KEY,
                deepseekApiKey: process.env.TEST_DEEPSEEK_API_KEY,
                localLLMUrl: process.env.TEST_LOCAL_LLM_URL,
                proxyUrl: process.env.TEST_PROXY_URL
            };
        } else {
            const config = vscode.workspace.getConfiguration('lspAi');
            return {
                expProb: DEFAULT_CONFIG.expProb,
                model: config.get<string>('model') ?? DEFAULT_CONFIG.model,
                provider: config.get<Provider>('provider') ?? DEFAULT_CONFIG.provider,
                promptType: config.get<PromptType>('promptType') ?? DEFAULT_CONFIG.promptType,
                timeoutMs: DEFAULT_CONFIG.timeoutMs,
                parallelCount: config.get<number>('parallel') ?? DEFAULT_CONFIG.parallelCount,
                maxRound: config.get<number>('maxRound') ?? DEFAULT_CONFIG.maxRound,
                openaiApiKey: config.get<string>('openaiApiKey'),
                deepseekApiKey: config.get<string>('deepseekApiKey'),
                localLLMUrl: config.get<string>('localLLMUrl'),
                proxyUrl: config.get<string>('proxyUrl')
            };
        }
    }

    private adjustTimeout(): void {
        if (this.provider === 'local' || this.provider === 'deepseek') {
            this.config.timeoutMs *= 2;
        }
    }

    // Getters
    public get expProb(): number {
        return this.config.expProb;
    }

    public get model(): string {
        return this.config.model;
    }

    public get provider(): Provider {
        return this.config.provider;
    }

    public get promptType(): PromptType {
        return this.config.promptType;
    }

    public get timeoutMs(): number {
        return this.config.timeoutMs;
    }

    public get parallelCount(): number {
        return this.config.parallelCount;
    }

    public get maxRound(): number {
        return this.config.maxRound;
    }

    public get openaiApiKey(): string | undefined {
        return this.config.openaiApiKey;
    }

    public get deepseekApiKey(): string | undefined {
        return this.config.deepseekApiKey;
    }

    public get localLLMUrl(): string | undefined {
        return this.config.localLLMUrl;
    }

    public get proxyUrl(): string | undefined {
        return this.config.proxyUrl;
    }

    public get methodsForExperiment(): string[] {
        return [this.model];
    }
}

// Export singleton instance
// Create and export the singleton instance
export const configInstance = Configuration.getInstance();

// For backward compatibility, export individual values
export const currentExpProb = configInstance.expProb;
export const currentModel = configInstance.model;
export const currentProvider = configInstance.provider;
export const currentPromptType = configInstance.promptType;
export const currentParallelCount = configInstance.parallelCount;
export const maxRound = configInstance.maxRound;
export const currentTimeout = configInstance.timeoutMs;
export const methodsForExperiment = configInstance.methodsForExperiment;