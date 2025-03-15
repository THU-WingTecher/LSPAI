import * as path from 'path';
import * as cp from 'child_process';
import {
    downloadAndUnzipVSCode,
    runTests,
    resolveCliArgsFromVSCodeExecutablePath,
} from '@vscode/test-electron';

// Define types locally instead of importing from config.ts
export enum PromptType {
    BASIC = 'basic',
    DETAILED = 'detailed',
    CONCISE = 'concise'
}

 // Add private configuration interface
 interface PrivateConfig {
    openaiApiKey: string;
    deepseekApiKey: string;
    localLLMUrl: string;
    proxyUrl?: string;
}

export type Provider = 'openai' | 'local' | 'deepseek';

// Define default test configuration
const DEFAULT_TEST_CONFIG = {
    MODEL: 'deepseek-chat',
    PROVIDER: 'deepseek' as Provider,
    EXP_PROB: '0.2',
    TIMEOUT: '0', // 0 means no timeout
    PARALLEL_COUNT: '4',
    MAX_ROUND: '5',
    PROMPT_TYPE: PromptType.BASIC
};

interface CommandLineArgs {
    srcPath: string;
    model?: string;
    provider?: Provider;
    expProb?: string;
    timeout?: string;
    parallelCount?: string;
    maxRound?: string;
    promptType?: PromptType;
}

function parseCommandLineArgs(): CommandLineArgs {
    // slice(2) because process.argv[0] is node path and argv[1] is script path
    const args = process.argv.slice(2);
    console.log('Command line arguments:', args);

    if (args.length < 1) {
        console.error(`
Usage: npm run experiment <srcPath> [model] [provider] [exp-prob] [timeout] [parallel-count] [max-round] [prompt-type]
Example: npm run experiment /path/to/source gpt-4o-mini openai 0.2 0 8 5 detailed
        `);
        process.exit(1);
    }

    // Parse positional arguments
    const parsedArgs: CommandLineArgs = {
        srcPath: args[0],
        model: args[1] ?? DEFAULT_TEST_CONFIG.MODEL,
        provider: validateProvider(args[2] ?? DEFAULT_TEST_CONFIG.PROVIDER),
        expProb: args[3] ?? String(DEFAULT_TEST_CONFIG.EXP_PROB),
        timeout: args[4] ?? String(DEFAULT_TEST_CONFIG.TIMEOUT),
        parallelCount: args[5] ?? String(DEFAULT_TEST_CONFIG.PARALLEL_COUNT),
        maxRound: args[6] ?? String(DEFAULT_TEST_CONFIG.MAX_ROUND),
        promptType: validatePromptType(args[7] ?? DEFAULT_TEST_CONFIG.PROMPT_TYPE)
    };

    // Validate numeric values
    if (parsedArgs.expProb && isNaN(parseFloat(parsedArgs.expProb))) {
        console.error(`Invalid exp-prob value: ${parsedArgs.expProb}. Must be a number.`);
        process.exit(1);
    }
    if (parsedArgs.timeout && isNaN(parseInt(parsedArgs.timeout))) {
        console.error(`Invalid timeout value: ${parsedArgs.timeout}. Must be a number.`);
        process.exit(1);
    }
    if (parsedArgs.parallelCount && isNaN(parseInt(parsedArgs.parallelCount))) {
        console.error(`Invalid parallel-count value: ${parsedArgs.parallelCount}. Must be a number.`);
        process.exit(1);
    }
    if (parsedArgs.maxRound && isNaN(parseInt(parsedArgs.maxRound))) {
        console.error(`Invalid max-round value: ${parsedArgs.maxRound}. Must be a number.`);
        process.exit(1);
    }

    // Log parsed arguments for debugging
    console.log('Parsed arguments:', {
        ...parsedArgs,
    });

    return parsedArgs;
}

// Helper function to validate prompt type
function validatePromptType(value: string): PromptType {
    if (Object.values(PromptType).includes(value as PromptType)) {
        return value as PromptType;
    }
    console.warn(`Invalid prompt type: ${value}. Using default: ${DEFAULT_TEST_CONFIG.PROMPT_TYPE}`);
    return DEFAULT_TEST_CONFIG.PROMPT_TYPE;
}

// Helper function to validate provider
function validateProvider(value: string): Provider {
    if (['openai', 'local', 'deepseek'].includes(value)) {
        return value as Provider;
    }
    console.warn(`Invalid provider: ${value}. Using default: ${DEFAULT_TEST_CONFIG.PROVIDER}`);
    return DEFAULT_TEST_CONFIG.PROVIDER;
}


// Function to load private configuration
function loadPrivateConfig(): PrivateConfig {
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
            const configPath = path.join(__dirname, '../../test-config.json');
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
async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
        const extensionTestsPath = path.resolve(__dirname, './exps/index');

        // Parse command line arguments
        const args = parseCommandLineArgs();
        console.log('test::runExperiment::args', args);
        // Download VS Code, unzip it, and run the integration test
        const vscodeExecutablePath = await downloadAndUnzipVSCode('1.98.2');
        const [cliPath, ...vscodeArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    
        // Install required extensions
        cp.spawnSync(
            cliPath,
            [...vscodeArgs, '--install-extension', 'ms-python.python', '--install-extension', 'redhat.java', '--install-extension', 'golang.go'],
            {
                encoding: 'utf-8',
                stdio: 'inherit'
            }
        );
    
        // Run the tests with environment variables
        const privateConfig = loadPrivateConfig();
        // console.log('test::runExperiment::extension test env setted')
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            extensionTestsEnv: {
                NODE_ENV: 'test',
                EXPERIMENT_SRC_PATH: args.srcPath,
                TEST_MODEL: args.model ?? DEFAULT_TEST_CONFIG.MODEL,
                TEST_PROVIDER: validateProvider(args.provider ?? DEFAULT_TEST_CONFIG.PROVIDER),
                TEST_EXP_PROB: args.expProb ?? DEFAULT_TEST_CONFIG.EXP_PROB,
                TEST_TIMEOUT: args.timeout ?? DEFAULT_TEST_CONFIG.TIMEOUT,
                TEST_PARALLEL_COUNT: args.parallelCount ?? DEFAULT_TEST_CONFIG.PARALLEL_COUNT,
                TEST_MAX_ROUND: args.maxRound ?? DEFAULT_TEST_CONFIG.MAX_ROUND,
                TEST_PROMPT_TYPE: args.promptType ?? DEFAULT_TEST_CONFIG.PROMPT_TYPE,
                TEST_OPENAI_API_KEY: privateConfig.openaiApiKey,
                TEST_DEEPSEEK_API_KEY: privateConfig.deepseekApiKey,
                TEST_LOCAL_LLM_URL: privateConfig.localLLMUrl,
                TEST_PROXY_URL: privateConfig.proxyUrl
            }
        });

    } catch (err) {
        console.error('Failed to run experiment:', err);
        process.exit(1);
    }
}

main();