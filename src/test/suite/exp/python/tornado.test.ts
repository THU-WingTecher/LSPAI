import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import { loadAllTargetSymbolsFromWorkspace } from "../../../../lsp/symbol";
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../../../lsp/helper';
import { ProjectConfigName } from '../../../../config';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../../../config';
import { runGenerateTestCodeSuite, findMatchedSymbolsFromTaskList } from '../../../../experiment';
import { readSliceAndSaveTaskList } from '../../../../experiment/utils/helper';
import { setupPythonWorkspaceForExperiment } from '../../../../helper';
import { getPythonProjectInfo } from '../../utils/projectInfo';
import { runPipeline } from '../../../../ut_runner/runner';

suite('Experiment Test Suite', () => {
    const projectName = "tornado" as ProjectConfigName;
    const { pythonInterpreterPath, pythonExtraPaths, projectPath, languageId } = getPythonProjectInfo(projectName);
    const taskListPath = '/LSPRAG/experiments/config/tornado-robust-sample100.json';
    const sampleNumber = 100;
    const currentConfig = {
        parallelCount: 30,
        provider: 'openai' as Provider,
        expProb: 1,
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
        
        symbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);
        symbols = await findMatchedSymbolsFromTaskList(sampledTaskListPath, symbols, projectPath);
    
        // // ==== LOAD SYMBOLS FROM TASK LIST ====
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });
    
    // test('Prepare FUT original tornado-task list ( same with the ICSE-26 paper Table 3, and Table 5 )', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     const taskListPath = '/LSPRAG/experiments/config/tornado-taskList.json';
    //     const workspaceFolders = setWorkspaceFolders(projectPath);
    //     // await updateWorkspaceFolders(workspaceFolders);
    //     console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

    //     symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
    //     if (sampleNumber > 0) {
    //         const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
    //         symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    //     }

    //     symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);
    //     if (sampleNumber > 0) {
    //         const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
    //         symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    //     }
    //     // // ==== LOAD SYMBOLS FROM TASK LIST ====
    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    //     console.log(`#### Number of symbols: ${symbols.length}`);
    // });

    test('LSPRAG-reflact; deepseek-coder; naive-experimental comparative experiment ', async () => {

        await runGenerateTestCodeSuite(
            GenerationType.LSPRAG,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            'deepseek-chat',
            'deepseek' as Provider,
            symbols,
            languageId,
            undefined,
        );

        const cachedDir = getConfigInstance().savePath;
        await runGenerateTestCodeSuite(
            GenerationType.EXPERIMENTAL,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            'deepseek-chat',
            'deepseek' as Provider,
            symbols,
            languageId,
            undefined,
            cachedDir
        );
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
            PromptType.NAIVE,
            'deepseek-chat',
            'deepseek' as Provider,
            symbols,
            languageId,
            undefined,
            cachedDir
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

    test('LSPRAG - deepseek-chat - generate test code suite', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.LSPRAG,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            'deepseek-chat',
            'deepseek' as Provider,
            symbols,
            languageId,
        );
    });

    // test('Symprompt - gpt-4o-mini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Naive - gpt-4o ', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Symprompt - gpt-4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Naive - deepseek-chat', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Symprompt - deepseek-chat', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('AGENT - with context - deepseek-coder', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'deepseek-coder',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });
    
    // test('CFG - experimental - 4o-mini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.LSPRAG,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('AGENT - with context - 4omini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('CFG - experimental - 4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.LSPRAG,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('AGENT - with context - 4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

}); 