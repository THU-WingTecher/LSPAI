import * as assert from 'assert';
import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../../helper';
import { loadAllTargetSymbolsFromWorkspace } from "../../../../lsp/symbol";
import { activate } from '../../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType, ProjectConfigName, getProjectWorkspace, getProjectPythonExe, getProjectLanguage, getProjectPythonPath } from '../../../../config';
import { readSliceAndSaveTaskList } from '../../../../experiment/utils/helper';
import { runGenerateTestCodeSuite, findMatchedSymbolsFromTaskList } from '../../../../experiment';
import { runPipeline } from '../../../../ut_runner/runner';
import { setupPythonWorkspaceForExperiment } from '../../../../helper';
import { getPythonProjectInfo } from '../../../../config';

suite('Experiment Test Suite', () => {
    const sampleNumber = -1;
    const parallelCount = process.env.TEST_PARALLEL_COUNT ? parseInt(process.env.TEST_PARALLEL_COUNT) : 1;
    const model = process.env.TEST_MODEL || 'gpt-4o-mini'
    const provider = process.env.TEST_PROVIDER as Provider || 'openai' as Provider;
    const projectNameEnv = process.env.TEST_PROJECT_NAME;
    if (!projectNameEnv) {
        throw new Error('Missing required TEST_PROJECT_NAME. Pass --projectName=<name> when running tests.');
    }
    const projectName = projectNameEnv as ProjectConfigName;
    const taskListPath = process.env.TEST_TASK_LIST_PATH;
    if (!taskListPath) {
        throw new Error('Missing required TEST_TASK_LIST_PATH. Pass --taskListPath=<path> when running tests.');
    }
    console.log(`#### projectName: ${projectName}`);
    console.log(`#### taskListPath: ${taskListPath}`);
    const { pythonInterpreterPath, pythonExtraPaths, projectPath, languageId } = getPythonProjectInfo(projectName);
    const currentConfig = {
        parallelCount: parallelCount,
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
    };
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

    test('Setup for experiment', async () => {
        await setupPythonWorkspaceForExperiment({
            projectPath,
            pythonExtraPaths,
            pythonInterpreterPath,
        });
    });

    test('Prepare FUT with robustness scores for assertion generation analysis', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }

        const sampledTaskListPath = await readSliceAndSaveTaskList(taskListPath, sampleNumber);
        const sampledTasks = JSON.parse(fs.readFileSync(sampledTaskListPath, 'utf8'));

        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

        symbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);
        symbols = await findMatchedSymbolsFromTaskList(sampledTaskListPath, symbols, projectPath);
        const expectedSymbolCount = sampleNumber < 0 ? sampledTasks.length : sampleNumber;
        assert.strictEqual(
            symbols.length,
            expectedSymbolCount,
            `symbol count mismatch: expected ${expectedSymbolCount}, got ${symbols.length}`
        );
        // // ==== LOAD SYMBOLS FROM TASK LIST ====
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });

    test(`LSPRAG-reflect; ${model}; naive-experimental comparative experiment`, async () => {

        await runGenerateTestCodeSuite(
            GenerationType.LSPRAG,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            model, 
            provider,
            symbols,
            languageId,
            undefined,
        );

        const cachedDir = getConfigInstance().savePath;
        let testsDir = path.join(getConfigInstance().savePath, "final");
        let testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
        let final_report_path = testsDir+'-final-report';
        await runPipeline(testsDir, final_report_path, testFileMapPath, {
          language: languageId,
          pythonExe: pythonInterpreterPath,
          jobs: getConfigInstance().parallelCount,
          timeoutSec: 30,
          pythonpath: pythonExtraPaths
        });

        await runGenerateTestCodeSuite(
            GenerationType.EXPERIMENTAL,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            model, 
            provider,
            symbols,
            languageId,
            undefined,
            cachedDir,
            testFileMapPath
        );
        testsDir = path.join(getConfigInstance().savePath, "final");
        testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
        final_report_path = testsDir+'-final-report';
        await runPipeline(testsDir, final_report_path, testFileMapPath, {
          language: languageId,
          pythonExe: pythonInterpreterPath,
          jobs: getConfigInstance().parallelCount,
          timeoutSec: 30,
          pythonpath: pythonExtraPaths
        });

        await runGenerateTestCodeSuite(
            GenerationType.EXPERIMENTAL,
            FixType.ORIGINAL,
            PromptType.NAIVE,
            model, 
            provider,
            symbols,
            languageId,
            undefined,
            cachedDir,
            testFileMapPath
        );
        testsDir = path.join(getConfigInstance().savePath, "final");
        testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
        final_report_path = testsDir+'-final-report';
        await runPipeline(testsDir, final_report_path, testFileMapPath, {
          language: languageId,
          pythonExe: pythonInterpreterPath,
          jobs: getConfigInstance().parallelCount,
          timeoutSec: 30,
          pythonpath: pythonExtraPaths
        });

    });

}); 
