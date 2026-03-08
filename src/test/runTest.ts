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
  PARALLEL_COUNT: '1',
  MAX_ROUND: '5',
  PROMPT_TYPE: PromptType.BASIC
};

function getCliArgValue(names: string[]): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    for (const name of names) {
      const flag = `--${name}`;
      if (arg === flag) {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          return next;
        }
      }
      if (arg.startsWith(`${flag}=`)) {
        return arg.slice(flag.length + 1);
      }
    }
  }
  return undefined;
}

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
    if (['openai', 'local', 'deepseek', 'anthropic'].includes(value)) {
        return value as Provider;
    }
    console.warn(`Invalid provider: ${value}. Using default: ${DEFAULT_TEST_CONFIG.PROVIDER}`);
    return DEFAULT_TEST_CONFIG.PROVIDER;
}

async function main() {
  try {
    delete process.env.ELECTRON_RUN_AS_NODE;
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.98.2');
    const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    // const specificTest = process.env.npm_config_testfile || undefined;
    // Add after installation
  // Skip listing extensions in WSL to avoid prompt that causes hanging

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
    let installedExtensions: any = null;
    try {
      installedExtensions = cp.execSync(
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
      console.log('Skipping extension list check');
    }

    if (installedExtensions === null) {
       console.error("Failed to install extensions, please review the issue on Github");
       process.exit(1);
    }
    
    const model =
      getCliArgValue(['model']) ||
      process.env.npm_config_model ||
      process.env.TEST_MODEL ||
      DEFAULT_TEST_CONFIG.MODEL;
    const providerRaw =
      getCliArgValue(['provider']) ||
      process.env.npm_config_provider ||
      process.env.TEST_PROVIDER ||
      DEFAULT_TEST_CONFIG.PROVIDER;
    const provider = validateProvider(providerRaw);
    const privateConfig = loadPrivateConfig(provider);
    const projectName =
      getCliArgValue(['projectName', 'project-name']) ||
      process.env.npm_config_projectname ||
      process.env.npm_config_project_name ||
      process.env.TEST_PROJECT_NAME;
    const taskListPath =
      getCliArgValue(['taskListPath', 'task-list-path', 'taskList', 'task-list']) ||
      process.env.npm_config_tasklistpath ||
      process.env.npm_config_task_list_path ||
      process.env.npm_config_tasklist ||
      process.env.npm_config_task_list ||
      process.env.TEST_TASK_LIST_PATH;
    const testType =
      getCliArgValue(['testType', 'test-type']) ||
      process.env.npm_config_testtype ||
      process.env.npm_config_test_type ||
      process.env.TEST_TYPE;
      process.env.TEST_TASK_LIST_PATH;
    const testConfigPath =
      getCliArgValue(['testConfigPath', 'test-config-path']) ||
      process.env.npm_config_testconfigpath ||
      process.env.npm_config_test_config_path ||
      process.env.TEST_CONFIG_PATH;
    const parallelCountRaw =
      getCliArgValue(['parallelCount', 'parallel-count']) ||
      process.env.npm_config_parallelcount ||
      process.env.npm_config_parallel_count ||
      process.env.TEST_PARALLEL_COUNT ||
      DEFAULT_TEST_CONFIG.PARALLEL_COUNT;
    const parallelCount = Number.parseInt(parallelCountRaw, 10);

    // if (!projectName) {
    //   throw new Error('Missing required project name. Pass --projectName=<name> or set TEST_PROJECT_NAME.');
    // }
    // if (!taskListPath) {
    //   throw new Error('Missing required task list path. Pass --taskListPath=<path> or set TEST_TASK_LIST_PATH.');
    // }
    // if (!Number.isInteger(parallelCount) || parallelCount < 1) {
    //   throw new Error(`Invalid parallel count: ${parallelCountRaw}. Provide a positive integer.`);
    // }
    console.log(`[test-runner] TEST_PROJECT_NAME=${projectName}`);
    console.log(`[test-runner] TEST_TASK_LIST_PATH=${taskListPath}`);
    console.log(`[test-runner] TEST_PARALLEL_COUNT=${parallelCount}`);
    console.log(`[test-runner] TEST_MODEL=${model}`);
    console.log(`[test-runner] TEST_PROVIDER=${provider}`);
    // Run the extension test
    await runTests({
      // Use the specified `code` executable
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: {
        NODE_ENV: 'test',
        TEST_MODEL: model,
        TEST_PROVIDER: provider,
        TEST_EXP_PROB:  DEFAULT_TEST_CONFIG.EXP_PROB,
        TEST_TIMEOUT:  DEFAULT_TEST_CONFIG.TIMEOUT,
        TEST_PARALLEL_COUNT: String(parallelCount),
        TEST_MAX_ROUND:  DEFAULT_TEST_CONFIG.MAX_ROUND,
        TEST_PROMPT_TYPE:  DEFAULT_TEST_CONFIG.PROMPT_TYPE,
        TEST_OPENAI_API_KEY: privateConfig.openaiApiKey,
        TEST_SUMMARIZE_CONTEXT: 'true', // Add this line
        TEST_DEEPSEEK_API_KEY: privateConfig.deepseekApiKey,
        TEST_LOCAL_LLM_URL: privateConfig.localLLMUrl,
        TEST_PROXY_URL: privateConfig.proxyUrl,
        TEST_PROJECT_NAME: projectName,
        TEST_TASK_LIST_PATH: taskListPath,
        TEST_TYPE: testType,
        TEST_CONFIG_PATH: testConfigPath,
    }
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
