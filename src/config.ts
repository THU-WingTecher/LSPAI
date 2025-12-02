import { existsSync, mkdirSync } from 'fs';
import path from 'path';

// Optional vscode import - only available in VSCode extension context
let vscode: any = null;
try {
    vscode = require('vscode');
} catch (e) {
    // Running outside VSCode extension context - vscode features will be disabled
    console.log('[CONFIG] Running without VSCode extension API');
}

// Utility function for timestamp generation (copied to avoid fileHandler dependency)
export function generateTimestampString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

export enum PromptType {
    BASIC = 'basic',
    DETAILED = 'detailed',
    WITHCONTEXT = 'withcontext',
    CONCISE = 'concise',
    FASTEST = 'fastest',
    BEST = 'best'
}

export enum GenerationType {
    NAIVE = 'naive', // without context, only template
    ORIGINAL = 'original', // with context, naive context, only template
    LSPRAG = 'lsprag',
    AGENT = 'agent',
    EXPERIMENTAL = 'experimental',
    FASTEST = 'fastest',
    BEST = 'best',
    SymPrompt = 'symprompt',
    CFG = 'cfg'
}

export enum FixType {
    ORIGINAL = 'original',
    NOFIX = 'nofix',
    // GROUPED = 'grouped',
    // EXPERIMENTAL = 'experimental',
    FASTEST = 'fastest',
    BEST = 'best'
}

export const GenerationTypeMapping = {
    [GenerationType.FASTEST]: GenerationType.NAIVE,  // Currently maps to NAIVE
    [GenerationType.BEST]: GenerationType.AGENT    // Currently maps to AGENT
} as const;

export const FixTypeMapping = {
    [FixType.FASTEST]: FixType.ORIGINAL,     // Currently maps to ORIGINAL
    [FixType.BEST]: FixType.ORIGINAL   // Currently maps to EXPERIMENTAL
} as const;

export const PromptTypeMapping = {
    [PromptType.FASTEST]: PromptType.CONCISE,     // Currently maps to BASIC
    [PromptType.BEST]: PromptType.DETAILED    // Currently maps to DETAILED
} as const;

const MODEL_TOKEN_LIMITS: Record<string, number> = {
    'gpt-4o-mini': 16384,
    'gpt-4o': 128000,
    'deepseek-chat': 32768,
    // Add more models as needed
    'default': 8192 // fallback for unknown models
};


// Helper function to resolve the actual type from a tag
export function resolveGenerationType(type: GenerationType | keyof typeof GenerationTypeMapping): GenerationType {
    if (type in GenerationTypeMapping) {
        return GenerationTypeMapping[type as keyof typeof GenerationTypeMapping];
    }
    return type as GenerationType;
}

export function resolveFixType(type: FixType | keyof typeof FixTypeMapping): FixType {
    if (type in FixTypeMapping) {
        return FixTypeMapping[type as keyof typeof FixTypeMapping];
    }
    return type as FixType;
}

export function resolvePromptType(type: PromptType | keyof typeof PromptTypeMapping): PromptType {
    if (type in PromptTypeMapping) {
        return PromptTypeMapping[type as keyof typeof PromptTypeMapping];
    }
    return type as PromptType;
}
// Constants for experiment settings
// export const MIN_FUNCTION_LINES = -1;
export const MIN_FUNCTION_LINES = 10;
export const DEFAULT_FILE_ENCODING = 'utf8';
export const MAX_ROUNDS = 3;

// Constants for file paths and extensions
export const INTERMEDIATE_FOLDER_PREFIX = 'temp_';
export const RESULTS_FOLDER_PREFIX = 'results_';
export const NAIVE_PREFIX = "naive_";

// Constants for time formatting
const TIME_ZONE = 'CST';
export const TIME_FORMAT_OPTIONS = { timeZone: TIME_ZONE, hour12: false };
    
export type ProjectName = keyof typeof SRC_PATHS;

// Add these constants near the top with other constants
const SEED = 12345; // Fixed seed for reproducibility
let seededRandom: () => number;

export type Provider = 'openai' | 'local' | 'deepseek';

// Function to load private configuration

const DEFAULT_CONFIG = {
    expProb: 1,
    testNumber: 5,
    parallelCount: 1,
    model: 'deepseek-chat',
    provider: 'deepseek' as Provider,
    timeoutMs: 600 * 1000,
    promptType: PromptType.BASIC,
    fixType: FixType.ORIGINAL,
    generationType: GenerationType.LSPRAG,
    maxRound: 5,
    savePath: 'lsprag-tests'
};
 // Add private configuration interface
 export interface PrivateConfig {
    openaiApiKey: string;
    deepseekApiKey: string;
    localLLMUrl: string;
    proxyUrl?: string;
}

// // Function to get temporary directory
// function getWorkSpaceDir(): string {
//     return vscode.workspace.workspaceFolders![0].uri.fsPath;
// }

export class Configuration {
    private static instance: Configuration | null;

    private config: any;
    private projectName: string;
    private startTimestamp: string;

    private constructor() {
        this.projectName = 'unknownProject';
        this.config = this.loadConfiguration();
        this.startTimestamp = generateTimestampString();
        if (this.config.workspace) {
            this.updateWorkspace(this.config.workspace);
        }

        // console.log('Current Environment:', process.env.NODE_ENV);
        // console.log('config::config', this.config);
        this.adjustTimeout();
        // Only watch for configuration changes if running in VSCode extension context
        if (vscode && vscode.workspace) {
            vscode.workspace.onDidChangeConfiguration(this.handleConfigurationChange, this);
        }
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

    public static resetInstance(): Configuration {
        Configuration.instance = null;
        return Configuration.getInstance();
    }

    private createSavePathIfNotExists(savePath: string): void {
        try {
            if (!existsSync(savePath)) {
                mkdirSync(savePath, { recursive: true });
            }
        } catch (error) {
            console.error(`Failed to create directory: ${savePath}`, error);
            throw error;
        }
    }

    private handleConfigurationChange(event: any): void {
        if (event?.affectsConfiguration?.('LSPRAG')) {
            console.log('Configuration changed, reloading...');
            this.config = this.loadConfiguration();
            this.logAllConfig();
            // Update any other properties or behaviors that depend on the configuration
        }
    }

    private updateWorkspace(newWorkspace: string): void {
        this.config.workspace = newWorkspace;
        this.projectName = path.basename(this.config.workspace); // Use path.basename instead of split('/').pop()
        // this.createSavePathIfNotExists(path.join(this.config.workspace, this.config.savePath));
        // this.createSavePathIfNotExists(this.historyPath);
        // this.createSavePathIfNotExists(this.logSavePath);
    }

    public updateConfig(newConfig: Partial<Configuration>): void {
        // if workspace is changed, update the projectName
        const workspaceChanged = 'workspace' in newConfig;
        
        if (newConfig.logSavePath) {
            throw new Error('logSavePath is not allowed to be manually set, it will be automatically generated');
        }
        if (newConfig.historyPath) {
            throw new Error('historyPath is not allowed to be manually set, it will be automatically generated');
        }

        // Update config first
        this.config = { ...this.config, ...newConfig };

        // Handle workspace update
        if (workspaceChanged) {
            this.updateWorkspace(this.config.workspace);
        } else if (newConfig.model || newConfig.promptType || newConfig.generationType) {
            // If model, promptType, or generationType changes, we need to update paths
            const historyPath = this.historyPath;
            const logPath = this.logSavePath;
            
            // Create new paths
            // this.createSavePathIfNotExists(path.dirname(historyPath));
            // this.createSavePathIfNotExists(historyPath);
            // this.createSavePathIfNotExists(path.dirname(logPath));
            // this.createSavePathIfNotExists(logPath);
        }

        if (newConfig.savePath) {
            // if savePath has workspace value, assert error 
            let savePath = newConfig.savePath;
            if (newConfig.savePath.includes(this.config.workspace)) {
                console.log('savepath contains workspace value', newConfig.savePath, this.config.workspace);
                // throw new Error('savePath cannot contain workspace value');
            } else {
                savePath = path.join(this.config.workspace, this.config.savePath);
            }
            // savePath should be updated 
            this.config.savePath = savePath;
            this.createSavePathIfNotExists(savePath);
            this.createSavePathIfNotExists(path.join(savePath, '..', 'history'));
            this.createSavePathIfNotExists(path.join(savePath, '..', 'logs'));
        }
    }

    public static getInstance(): Configuration {
        if (!Configuration.instance) {
            Configuration.instance = new Configuration();
        }
        return Configuration.instance;
    }

    public static isTestingEnvironment(): boolean {
        // console.log('config::isTestingEnvironment', process.env.NODE_ENV);
        return process.env.NODE_ENV === 'test' || process.env.TESTING_MODE === 'true';
    }

    private loadConfiguration() {
        const configFromEnv = {
            openaiApiKey: process.env.OPENAI_API_KEY,
            deepseekApiKey: process.env.DEEPSEEK_API_KEY,
            localLLMUrl: process.env.LOCAL_LLM_URL,
            proxyUrl: process.env.HTTP_PROXY || process.env.HTTPS_PROXY || ''
        }
        if (Configuration.isTestingEnvironment()) {
            // Validate test environment variables
            // this.validateTestConfig(process.env.TEST_SRC_PATH, 'TEST_SRC_PATH');
            return {
                ...configFromEnv,
                workspace: process.env.TEST_SRC_PATH!,
                model: DEFAULT_CONFIG.model,
                provider: DEFAULT_CONFIG.provider,
                promptType: DEFAULT_CONFIG.promptType,
                generationType: DEFAULT_CONFIG.generationType,
                timeoutMs: DEFAULT_CONFIG.timeoutMs,
                parallelCount: DEFAULT_CONFIG.parallelCount,
                maxRound: DEFAULT_CONFIG.maxRound,
                testNumber: DEFAULT_CONFIG.testNumber,
                expProb: DEFAULT_CONFIG.expProb,
                savePath: DEFAULT_CONFIG.savePath
            };
        } else if (vscode && vscode.workspace) {
            // Running in VSCode extension context - use VSCode configuration
            const config = vscode.workspace.getConfiguration('LSPRAG');
            const globalConfig = vscode.workspace.getConfiguration('http');
            const globalProxy = (globalConfig.get('proxy') as string) || '';
            return {
                workspace: (config.get('workspace') as string) ?? vscode.workspace.workspaceFolders![0].uri.fsPath,
                expProb: DEFAULT_CONFIG.expProb,
                model: (config.get('model') as string) ?? DEFAULT_CONFIG.model,
                provider: (config.get('provider') as Provider) ?? DEFAULT_CONFIG.provider,
                promptType: (config.get('promptType') as PromptType) ?? DEFAULT_CONFIG.promptType,
                generationType: (config.get('generationType') as GenerationType) ?? DEFAULT_CONFIG.generationType,
                timeoutMs: DEFAULT_CONFIG.timeoutMs,
                parallelCount: (config.get('parallel') as number) ?? DEFAULT_CONFIG.parallelCount,
                maxRound: (config.get('maxRound') as number) ?? DEFAULT_CONFIG.maxRound,
                openaiApiKey: config.get('openaiApiKey') as string,
                deepseekApiKey: config.get('deepseekApiKey') as string,
                localLLMUrl: config.get('localLLMUrl') as string,
                savePath: (config.get('savePath') as string) ?? DEFAULT_CONFIG.savePath,
                proxyUrl: globalProxy || ''
            };
        } else {
            // Running outside VSCode (e.g., standalone scripts) - use defaults or environment variables
            console.log('[CONFIG] No VSCode context, using default configuration');
            return {
                workspace: process.env.LSPRAG_WORKSPACE || process.cwd(),
                expProb: DEFAULT_CONFIG.expProb,
                model: process.env.LSPRAG_MODEL || DEFAULT_CONFIG.model,
                provider: (process.env.LSPRAG_PROVIDER as Provider) || DEFAULT_CONFIG.provider,
                promptType: DEFAULT_CONFIG.promptType,
                generationType: DEFAULT_CONFIG.generationType,
                fixType: DEFAULT_CONFIG.fixType,
                timeoutMs: DEFAULT_CONFIG.timeoutMs,
                parallelCount: DEFAULT_CONFIG.parallelCount,
                maxRound: DEFAULT_CONFIG.maxRound,
                testNumber: DEFAULT_CONFIG.testNumber,
                openaiApiKey: process.env.OPENAI_API_KEY,
                deepseekApiKey: process.env.DEEPSEEK_API_KEY,
                localLLMUrl: process.env.LOCAL_LLM_URL,
                savePath: DEFAULT_CONFIG.savePath,
                proxyUrl: process.env.HTTP_PROXY || process.env.HTTPS_PROXY || ''
            };
        }
    }

    private adjustTimeout(): void {
        if (this.provider === 'local' || this.provider === 'deepseek') {
            this.config.timeoutMs *= 2;
        }
    }
    
    private constructResultPath(): string {
        return path.join(
            "lsprag-workspace",
            this.startTimestamp,
            this.projectName,
            this.generationType + "_" + this.promptType + "_",
            this.config.model,
        );
    }
    public genSaveName(): string {
        // Ensure we have all required parts
        if (!this.config.workspace || !this.startTimestamp || !this.projectName || !this.config.model) {
            throw new Error('Missing required configuration for genSaveName');
        }
        return path.join(
            this.constructResultPath(),
            "results"
        );

        // assert(this.config.workspace, 'workspace is not set');
        // let saveName = "results";
        // if (this.generationType === GenerationType.ORIGINAL) {
        //     saveName += "_original";
        // } else if (this.generationType === GenerationType.AGENT) {
        //     saveName += "_agent";
        // } else if (this.generationType === GenerationType.CFG) {
        //     saveName += "_cfg";
        // }
        // if (this.fixType === FixType.NOFIX) {
        //     saveName += "_nofix";
        // }
        // if (this.promptType === PromptType.BASIC) {
        //     saveName += "_basic";
        // } else if (this.promptType === PromptType.DETAILED) {
        //     saveName += "_detailed";
        // } else if (this.promptType === PromptType.CONCISE) {
        //     saveName += "_concise";
        // }
        // if (this.config.model){
        //     saveName += `_${this.config.model}`;
        // }
        // return path.join(this.config.workspace, `${saveName}_${this.startTimestamp}`, this.config.model);
    }

    public get savePath(): string {
        return this.config.savePath;
    }

    public get historyPath(): string {
        // Ensure we have all required parts
        if (!this.config.workspace || !this.startTimestamp || !this.projectName || !this.config.model) {
            throw new Error('Missing required configuration for historyPath');
        }
        return path.join(
            this.config.workspace,
            this.constructResultPath(),
            'history'
        );
    }

    public get timeStamp(): string {
        return this.startTimestamp;
    }

    public get logSavePath(): string {
        // Ensure we have all required parts
        if (!this.config.workspace || !this.startTimestamp || !this.projectName || !this.config.model) {
            throw new Error('Missing required configuration for logSavePath');
        }
        return path.join(
            this.config.workspace,
            this.constructResultPath(),
            'logs'
        );
    }

    public get workspace(): string {
        return this.config.workspace;
    }

    public get generationType(): GenerationType {
        return resolveGenerationType(this.config.generationType);
    }

    public get fixType(): FixType {
        return resolveFixType(this.config.fixType);
    }

    // Getters
    public get expProb(): number {
        return this.config.expProb;
    }
    /**
     * Get the maximum token limit for the current model
     * @returns Maximum token limit for the current model
     */
    public get maxTokens(): number {
        const currentModel = this.model;
        return MODEL_TOKEN_LIMITS[currentModel] || MODEL_TOKEN_LIMITS['default'];
    }

    /**
     * Get the maximum token limit for a specific model
     * @param modelName - The name of the model
     * @returns Maximum token limit for the specified model
     */
    public getMaxTokensForModel(modelName: string): number {
        return MODEL_TOKEN_LIMITS[modelName] || MODEL_TOKEN_LIMITS['default'];
    }
    public get model(): string {
        return this.config.model;
    }

    public get provider(): Provider {
        return this.config.provider;
    }

    public get promptType(): PromptType {
        return resolvePromptType(this.config.promptType);
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

    public get testNumber(): number {
        return this.config.testNumber;
    }

}

// Export singleton instance
// Create and export the singleton instance
// Non-functional edit by Claude Code: verifying write access
export function getConfigInstance() {
    return Configuration.getInstance();
}
// Constants for specific project paths

export const SRC_PATHS = {
    "commons-cli": 'src/main/java/',
    "commons-csv": 'src/main/java/',
    "black": '/src/black',
    "crawl4ai": '/crawl4ai',
    "tornado": '/tornado',
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