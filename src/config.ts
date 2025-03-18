import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import * as vscode from 'vscode';
import { generateTimestampString } from './fileHandler';

export enum PromptType {
    BASIC = 'basic',
    DETAILED = 'detailed',
    CONCISE = 'concise'
}

export enum GenerationType {
    ORIGINAL = 'original',
    AGENT = 'agent',
}

export type Provider = 'openai' | 'local' | 'deepseek';

// Function to load private configuration
export function loadPrivateConfig(configPath: string = path.join(__dirname, '../../test-config.json')): PrivateConfig {
    // First try to load from environment variables
    const fromEnv = {
        openaiApiKey: process.env.TEST_OPENAI_API_KEY,
        deepseekApiKey: process.env.TEST_DEEPSEEK_API_KEY,
        localLLMUrl: process.env.TEST_LOCAL_LLM_URL,
        proxyUrl: process.env.TEST_PROXY_URL
    };

    // If any required values are missing, try to load from config file
    if (!fromEnv.openaiApiKey || !fromEnv.deepseekApiKey || !fromEnv.localLLMUrl) {
        try {
            // Try to load from a local config file that's git-ignored
            const config = require(configPath);
            return {
                openaiApiKey: config.openaiApiKey || fromEnv.openaiApiKey,
                deepseekApiKey: config.deepseekApiKey || fromEnv.deepseekApiKey,
                localLLMUrl: config.localLLMUrl || fromEnv.localLLMUrl,
                proxyUrl: config.proxyUrl || fromEnv.proxyUrl
            };
        } catch (error) {
            console.log('error', error);
            console.error('Failed to load private configuration file');
            throw new Error('Missing required API keys and URLs. Please set them either through environment variables or test-config.json');
        }
    }

    return fromEnv as PrivateConfig;
}

const DEFAULT_CONFIG = {
    expProb: 0.2,
    parallelCount: 1,
    model: 'deepseek-chat',
    provider: 'deepseek' as Provider,
    timeoutMs: 600 * 1000,
    promptType: PromptType.BASIC,
    maxRound: 5
};
 // Add private configuration interface
 export interface PrivateConfig {
    openaiApiKey: string;
    deepseekApiKey: string;
    localLLMUrl: string;
    proxyUrl?: string;
}

export class Configuration {
    private static instance: Configuration;

    private config: any;
    private constructor() {
        this.config = this.loadConfiguration();
        console.log('Current Environment:', process.env.NODE_ENV);
        console.log('config::config', this.config);
        this.adjustTimeout();
    }

    public logAllConfig(): void {
        console.log('config::config', this.config);
    }

    // public reloadSavePath(): void {
    //     console.log('config::reloadSavePath', this.config.workspace, this.genSaveName());
    //     this.config.savePath = path.join(this.config.workspace, this.genSaveName());
    //     this.config.historyPath = path.join(this.config.savePath, 'history');
    //     this.config.logSavePath = path.join(this.config.savePath, 'logs');
    //     this.createSavePathIfNotExists(this.config.savePath);
    //     this.createSavePathIfNotExists(path.join(this.config.savePath, 'history'));
    //     this.createSavePathIfNotExists(path.join(this.config.savePath, 'logs'));
    // }
    public get summarizeContext(): boolean {
        return this.config.summarizeContext ?? true; // Default to true for backward compatibility
    }

    private createSavePathIfNotExists(savePath: string): void {
        if (!existsSync(savePath)) {
            mkdirSync(savePath, { recursive: true });
        }
    }

    public updateConfig(newConfig: Partial<Configuration>): void {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.savePath) {
            this.createSavePathIfNotExists(this.config.savePath);
            this.createSavePathIfNotExists(path.join(this.config.savePath, 'history'));
            this.createSavePathIfNotExists(path.join(this.config.savePath, 'logs'));
        }
    }

    public static getInstance(): Configuration {
        if (!Configuration.instance) {
            Configuration.instance = new Configuration();
        }
        return Configuration.instance;
    }

    public static isTestingEnvironment(): boolean {
        console.log('config::isTestingEnvironment', process.env.NODE_ENV);
        return process.env.NODE_ENV === 'test' || process.env.TESTING_MODE === 'true';
    }

    public static isExperimentEnvironment(): boolean {
        console.log('config::isExperimentEnvironment', process.env.NODE_ENV);
        return process.env.NODE_ENV === 'experiment' || process.env.EXPERIMENT_MODE === 'true';
    }

    private validateTestConfig(envVar: string | undefined, paramName: string): void {
        if (!envVar) {
            throw new Error(`Testing environment requires ${paramName} to be set`);
        }
    }

    private loadConfiguration() {
        if (Configuration.isExperimentEnvironment()) {
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
                summarizeContext: process.env.TEST_SUMMARIZE_CONTEXT === 'true',
                parallelCount: parseInt(process.env.TEST_PARALLEL_COUNT!),
                maxRound: parseInt(process.env.TEST_MAX_ROUND!),
                openaiApiKey: process.env.TEST_OPENAI_API_KEY,
                deepseekApiKey: process.env.TEST_DEEPSEEK_API_KEY,
                localLLMUrl: process.env.TEST_LOCAL_LLM_URL,
                proxyUrl: process.env.TEST_PROXY_URL
            };
        } else if (Configuration.isTestingEnvironment()) {
            // Validate test environment variables
            // this.validateTestConfig(process.env.TEST_SRC_PATH, 'TEST_SRC_PATH');
            return {
                workspace: process.env.TEST_SRC_PATH!,
                model: DEFAULT_CONFIG.model,
                provider: DEFAULT_CONFIG.provider,
                promptType: DEFAULT_CONFIG.promptType,
                timeoutMs: DEFAULT_CONFIG.timeoutMs,
                parallelCount: DEFAULT_CONFIG.parallelCount,
                maxRound: DEFAULT_CONFIG.maxRound,
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
                summarizeContext: config.get<boolean>('summarizeContext') ?? true,
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

    public genSaveName(): string {
        let saveName = "results";
        if (this.generationType === GenerationType.ORIGINAL) {
            saveName += "_original";
        } else if (this.generationType === GenerationType.AGENT) {
            saveName += "_agent";
        }
        if (this.promptType === PromptType.BASIC) {
            saveName += "_basic";
        } else if (this.promptType === PromptType.DETAILED) {
            saveName += "_detailed";
        } else if (this.promptType === PromptType.CONCISE) {
            saveName += "_concise";
        }
        if (this.config.model){
            saveName += `_${this.config.model}`;
        }
        return path.join(`${saveName}_${generateTimestampString()}`, this.config.model);
    }

    public get savePath(): string {
        return this.config.savePath;
    }

    public get historyPath(): string {
        return path.join(this.config.savePath, 'history');
    }

    public get logSavePath(): string {
        return path.join(this.config.savePath, 'logs');
    }

    public get workspace(): string {
        return this.config.workspace;
    }

    public get generationType(): GenerationType {
        return this.config.generationType;
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
export function getConfigInstance() {
    return Configuration.getInstance();
}
// Constants for specific project paths

export const SRC_PATHS = {
    "commons-cli": 'src/main/java/',
    "commons-csv": 'src/main/java/',
    "black": '/src',
    "crawl4ai": '/crawl4ai',
    DEFAULT: '/'
} as const;

// For backward compatibility, export individual values
// export const currentExpProb = configInstance.expProb;
// export const currentModel = configInstance.model;
// export const currentProvider = configInstance.provider;
// export const currentPromptType = configInstance.promptType;
// export const currentParallelCount = configInstance.parallelCount;
// export const maxRound = configInstance.maxRound;
// export const currentTimeout = configInstance.timeoutMs;
// export const methodsForExperiment = configInstance.methodsForExperiment;