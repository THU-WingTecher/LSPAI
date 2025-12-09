import * as cp from 'child_process';
import * as path from 'path';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests
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


const DEFAULT_TEST_CONFIG = {
  MODEL: 'deepseek-chat',
  PROVIDER: 'deepseek' as Provider,
  EXP_PROB: '0.2',
  TIMEOUT: '0', // 0 means no timeout
  PARALLEL_COUNT: '4',
  MAX_ROUND: '5',
  PROMPT_TYPE: PromptType.BASIC
};

// Function to load private configuration strictly from environment variables
export function loadPrivateConfig(provider?: Provider): PrivateConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY || process.env.TEST_OPENAI_API_KEY;
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || process.env.TEST_DEEPSEEK_API_KEY;
  const localLLMUrl = process.env.LOCAL_LLM_URL || process.env.TEST_LOCAL_LLM_URL;
  const proxyUrl = process.env.PROXY_URL || process.env.TEST_PROXY_URL;
  // const defaultAPIKEY = "1234567890"
  // Only validate the API key needed for the selected provider
  const selectedProvider = provider || validateProvider(process.env.TEST_PROVIDER || DEFAULT_TEST_CONFIG.PROVIDER);
  
  if (selectedProvider === 'openai' && !openaiApiKey) {
    console.warn(
      'Missing required environment variable: OPENAI_API_KEY (or TEST_OPENAI_API_KEY). Ensure you have sourced your .env.sh, or set it through vscode settings.'
    );
  }
  
  if (selectedProvider === 'deepseek' && !deepseekApiKey) {
    console.warn(
      'Missing required environment variable: DEEPSEEK_API_KEY (or TEST_DEEPSEEK_API_KEY). Ensure you have sourced your .env.sh, or set it through vscode settings.'
    );
  }
  
  if (selectedProvider === 'local' && !localLLMUrl) {
    console.warn(
      'Missing required environment variable: LOCAL_LLM_URL (or TEST_LOCAL_LLM_URL). Ensure you have sourced your .env.sh, or set it through vscode settings.'
    );
  }

  return {
    openaiApiKey: openaiApiKey || '',
    deepseekApiKey: deepseekApiKey || '',
    localLLMUrl: localLLMUrl || '',
    proxyUrl
  };
}

// Helper function to validate provider
function validateProvider(value: string): Provider {
  if (['openai', 'local', 'deepseek'].includes(value)) {
      return value as Provider;
  }
  console.warn(`Invalid provider: ${value}. Using default: ${DEFAULT_TEST_CONFIG.PROVIDER}`);
  return DEFAULT_TEST_CONFIG.PROVIDER;
}

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.98.2');
    const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    // const specificTest = process.env.npm_config_testfile || undefined;
    // Add after installation
  // Skip listing extensions in WSL to avoid prompt that causes hanging
  try {
    const installedExtensions = cp.execSync(
      `${cliPath} ${args.join(' ')} --list-extensions`,
      { 
        encoding: 'utf-8', 
        timeout: 5000, 
        stdio: 'pipe',
        env: { ...process.env, DONT_PROMPT_WSL_INSTALL: '1' }
      }
    );
    console.log('installedExtensions', installedExtensions);
  } catch (err: any) {
    // Ignore errors when listing extensions (common in WSL environments)
    console.log('Skipping extension list check (this is normal in WSL)');
  }
    // Use cp.spawn / cp.exec for custom setup
	// const installExtensions = ['ms-python.python', 'oracle.oracle-java', 'golang.go'];
    cp.spawnSync(
      cliPath,
		[...args, '--install-extension', 'ms-python.python', '--install-extension', 'redhat.java', '--install-extension', 'golang.go', '--install-extension', 'ms-vscode.cpptools'],
		{
        encoding: 'utf-8',
        stdio: 'inherit',
        env: { ...process.env, DONT_PROMPT_WSL_INSTALL: '1' }
      }
    );
    const privateConfig = loadPrivateConfig();
    // Run the extension test
    await runTests({
      // Use the specified `code` executable
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: {
        NODE_ENV: 'test',
        TEST_MODEL:  DEFAULT_TEST_CONFIG.MODEL,
        TEST_PROVIDER: validateProvider(DEFAULT_TEST_CONFIG.PROVIDER),
        TEST_EXP_PROB:  DEFAULT_TEST_CONFIG.EXP_PROB,
        TEST_TIMEOUT:  DEFAULT_TEST_CONFIG.TIMEOUT,
        TEST_PARALLEL_COUNT:  DEFAULT_TEST_CONFIG.PARALLEL_COUNT,
        TEST_MAX_ROUND:  DEFAULT_TEST_CONFIG.MAX_ROUND,
        TEST_PROMPT_TYPE:  DEFAULT_TEST_CONFIG.PROMPT_TYPE,
        TEST_OPENAI_API_KEY: privateConfig.openaiApiKey,
        TEST_SUMMARIZE_CONTEXT: 'true', // Add this line
        TEST_DEEPSEEK_API_KEY: privateConfig.deepseekApiKey,
        TEST_LOCAL_LLM_URL: privateConfig.localLLMUrl,
        TEST_PROXY_URL: privateConfig.proxyUrl
    }
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
