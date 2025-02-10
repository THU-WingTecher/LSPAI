import * as vscode from 'vscode';


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
const DEFAULT_EXP_PROB = 1;
const DEFAULT_PARALLEL_COUNT = 1;

// // Then update the variables that can change during runtime
// export let currentWorkspace = DEFAULT_WORKSPACE;
// export let currentSrcPath = DEFAULT_SRC_PATH;
// export let currentTestPath = DEFAULT_TEST_PATH;
// export let currentExpLogPath = DEFAULT_EXP_LOG_PATH;
// export let currentHistoryPath = DEFAULT_HISTORY_PATH;
// export let currentModel = DEFAULT_MODEL;
// export let currentGenMethods = [...DEFAULT_GEN_METHODS];

export let currentExpProb = DEFAULT_EXP_PROB;
export let currentParallelCount = DEFAULT_PARALLEL_COUNT;
export const config = vscode.workspace.getConfiguration('lspAi');
export const currentModel = config.get<string>('model') ?? 'deepseek-chat';
export const methodsForExperiment = [currentModel, `naive_${currentModel}`];

export const maxRound = config.get<number>('maxRound') ?? 5;