import * as vscode from 'vscode';

export enum PromptType {
    BASIC = 'basic', // no context
    DETAILED = 'detailed', // with context
    CONCISE = 'concise' // with context and unit test
  }
  
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
// const RANDOM_SEED = Date.now();
// const DEFAULT_WORKSPACE = "/vscode-llm-ut/experiments/commons-cli/";
// const DEFAULT_SRC_PATH = `${DEFAULT_WORKSPACE}src/main/`;
// const DEFAULT_TEST_PATH = `${DEFAULT_WORKSPACE}/results_test/`;
// const DEFAULT_EXP_LOG_PATH = `${DEFAULT_TEST_PATH}logs/`;
// const DEFAULT_HISTORY_PATH = `${DEFAULT_TEST_PATH}history/`;
// const DEFAULT_MODEL = "deepseek-chat"; // gpt-4o-mini"; // llama3-70b // deepseek-chat
// const DEFAULT_GEN_METHODS = [DEFAULT_MODEL, `naive_${DEFAULT_MODEL}`];
const DEFAULT_EXP_PROB = 0.2;
const DEFAULT_PARALLEL_COUNT = 1;
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_PROVIDER = 'deepseek';
const DEFAULT_TIMEOUT_MS = 600 * 1000;
const DEFAULT_PROMPT_TYPE = PromptType.BASIC;
// // Then update the variables that can change during runtime
// export let currentWorkspace = DEFAULT_WORKSPACE;
// export let currentSrcPath = DEFAULT_SRC_PATH;
// export let currentTestPath = DEFAULT_TEST_PATH;
// export let currentExpLogPath = DEFAULT_EXP_LOG_PATH;
// export let currentHistoryPath = DEFAULT_HISTORY_PATH;
// export let currentModel = DEFAULT_MODEL;
// export let currentGenMethods = [...DEFAULT_GEN_METHODS];
export type Provider = 'openai' | 'local' | 'deepseek';
export let currentExpProb = DEFAULT_EXP_PROB;
export let currentTimeout = DEFAULT_TIMEOUT_MS;
export const config = vscode.workspace.getConfiguration('lspAi');
export const currentModel = config.get<string>('model') ?? DEFAULT_MODEL;
export const currentProvider = config.get<Provider>('provider') ?? DEFAULT_PROVIDER;
export let currentPromptType = DEFAULT_PROMPT_TYPE;
if (process.env.EXPERIMENT_PROMPT_TYPE) {
    currentPromptType = process.env.EXPERIMENT_PROMPT_TYPE as PromptType;
} else {
    currentPromptType = config.get<PromptType>('promptType') ?? DEFAULT_PROMPT_TYPE;
}
if (currentProvider == 'local' || currentProvider == 'deepseek') {
    currentTimeout = currentTimeout * 2
}
export const currentParallelCount = config.get<number>('parallel') ?? DEFAULT_PARALLEL_COUNT;;
export const methodsForExperiment = [currentModel];

export const maxRound = config.get<number>('maxRound') ?? 5;