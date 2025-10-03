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
export function loadPrivateConfig(): PrivateConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY || process.env.TEST_OPENAI_API_KEY;
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || process.env.TEST_DEEPSEEK_API_KEY;
  const localLLMUrl = process.env.LOCAL_LLM_URL || process.env.TEST_LOCAL_LLM_URL;
  const proxyUrl = process.env.PROXY_URL || process.env.TEST_PROXY_URL;
  if (!openaiApiKey || !deepseekApiKey || !localLLMUrl) {
    throw new Error(
      'Missing required environment variables: OPENAI_API_KEY, DEEPSEEK_API_KEY, LOCAL_LLM_URL (or their TEST_ variants). Ensure you have sourced your .env.sh.'
    );
  }

  return {
    openaiApiKey,
    deepseekApiKey,
    localLLMUrl,
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
  const installedExtensions = cp.execSync(
    `${cliPath} ${args.join(' ')} --list-extensions`,
    { encoding: 'utf-8' }
  );
  console.log('installedExtensions', installedExtensions);
    // Use cp.spawn / cp.exec for custom setup
	// const installExtensions = ['ms-python.python', 'oracle.oracle-java', 'golang.go'];
    cp.spawnSync(
      cliPath,
		[...args, '--install-extension', 'ms-python.python', '--install-extension', 'redhat.java', '--install-extension', 'golang.go', '--install-extension', 'ms-vscode.cpptools'],
		{
        encoding: 'utf-8',
        stdio: 'inherit'
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
