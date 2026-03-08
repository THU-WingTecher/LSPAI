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
    const parallelCountRaw = process.env.TEST_PARALLEL_COUNT || '1';
    const parallelCount = Number.parseInt(parallelCountRaw, 10);
    const projectName = "black" as ProjectConfigName;
    const taskListPath = "/LSPRAG/experiments/config/black-robust-final.json";
    const model = process.env.TEST_MODEL || 'gpt-4o-mini';
    const provider = (process.env.TEST_PROVIDER || 'openai') as Provider;
    console.log(`#### projectName: ${projectName}`);
    console.log(`#### taskListPath: ${taskListPath}`);
    console.log(`#### parallelCount: ${parallelCount}`);
    console.log(`#### model: ${model}`);
    console.log(`#### provider: ${provider}`);
    const { pythonInterpreterPath, pythonExtraPaths, projectPath, languageId } = getPythonProjectInfo(projectName);
    const sampleNumber = -1;
    const currentConfig = {
        parallelCount: parallelCount,
        model,
        provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
    };
    // let testFilesPath = "/LSPRAG/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
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

    // test('Prepare FUT original black-task list ( same with the ICSE-26 paper Table 3, and Table 5 )', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     const taskListPath = '/LSPRAG/experiments/projects/tornado/symbol_robustness_results.json';
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
    
    // test('LSPRAG - deepseek-coder ', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.LSPRAG,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('LSPRAG-reflact; deepseek-coder; naive-experimental comparative experiment ', async () => {

    //     await runGenerateTestCodeSuite(
    //         GenerationType.LSPRAG,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         // 'gpt-5',
    //         // 'openai' as Provider,
    //         symbols,
    //         languageId,
    //         undefined,
    //     );

    //     const cachedDir = getConfigInstance().savePath;
    //     let testsDir = path.join(getConfigInstance().savePath, "final");
    //     let testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
    //     let final_report_path = testsDir+'-final-report';
    //     await runPipeline(testsDir, final_report_path, testFileMapPath, {
    //       language: languageId,
    //       pythonExe: pythonInterpreterPath,
    //       jobs: getConfigInstance().parallelCount,
    //       timeoutSec: 30,
    //       pythonpath: pythonExtraPaths
    //     });

    //     await runGenerateTestCodeSuite(
    //         GenerationType.EXPERIMENTAL,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //         undefined,
    //         cachedDir,
    //         testFileMapPath
    //     );
    //     testsDir = path.join(getConfigInstance().savePath, "final");
    //     testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
    //     final_report_path = testsDir+'-final-report';
    //     await runPipeline(testsDir, final_report_path, testFileMapPath, {
    //       language: languageId,
    //       pythonExe: pythonInterpreterPath,
    //       jobs: getConfigInstance().parallelCount,
    //       timeoutSec: 30,
    //       pythonpath: pythonExtraPaths
    //     });

    //     await runGenerateTestCodeSuite(
    //         GenerationType.EXPERIMENTAL,
    //         FixType.ORIGINAL,
    //         PromptType.NAIVE,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //         undefined,
    //         cachedDir
    //     );
    //     testsDir = path.join(getConfigInstance().savePath, "final");
    //     testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
    //     final_report_path = testsDir+'-final-report';
    //     await runPipeline(testsDir, final_report_path, testFileMapPath, {
    //       language: languageId,
    //       pythonExe: pythonInterpreterPath,
    //       jobs: getConfigInstance().parallelCount,
    //       timeoutSec: 30,
    //       pythonpath: pythonExtraPaths
    //     });

    // });


    test('Reflect on already generated Agent based test code', async() => {

        const model = 'deepseek-chat';
        const provider = 'deepseek' as Provider;
        const DirList = [
            {
                "cachedDir" :"/LSPRAG/experiments/data/main_result/black/claudecode-deepseek/deepseek-chat/2026-02-04/codes",
                "testFileMapPath" : "/LSPRAG/experiments/data/main_result/black/claudecode-deepseek/deepseek-chat/test_file_map.json",
                "savePath": "claudecode-vars-deepseek",
                "promptType": PromptType.WITHCONTEXT
            },
            {
                "cachedDir" :"/LSPRAG/experiments/data/main_result/black/claudecode-deepseek/deepseek-chat/2026-02-04/codes",
                "testFileMapPath" : "/LSPRAG/experiments/data/main_result/black/claudecode-deepseek/deepseek-chat/test_file_map.json",
                "savePath": "claudecode-naive-deepseek",
                "promptType": PromptType.NAIVE
            },
            {
                "cachedDir" :"/LSPRAG/experiments/data/main_result/black/claudecode_cfg-deepseek/deepseek-chat/deepseek/2026-02-04/codes",
                "testFileMapPath" : "/LSPRAG/experiments/data/main_result/black/claudecode_cfg-deepseek/deepseek-chat/test_file_map.json",
                "savePath": "claudecode_cfg_vars-deepseek",
                "promptType": PromptType.WITHCONTEXT
            },
            {
                "cachedDir" :"/LSPRAG/experiments/data/main_result/black/lsprag-deepseek/deepseek-chat/results/final",
                "testFileMapPath" : "/LSPRAG/experiments/data/main_result/black/lsprag-deepseek/deepseek-chat/results/test_file_map.json",
                "savePath": "lsprag_vars-deepseek",
                "promptType": PromptType.WITHCONTEXT
            },
            {
                "cachedDir" :"/LSPRAG/experiments/data/main_result/black/opencode-deepseek/deepseek-chat/deepseek-chat/codes",
                "testFileMapPath" : "/LSPRAG/experiments/data/main_result/black/opencode-deepseek/deepseek-chat/test_file_map.json",
                "savePath": "opencode_vars-deepseek",
                "promptType": PromptType.WITHCONTEXT
            },
            {
                "cachedDir" :"/LSPRAG/experiments/data/main_result/black/opencode-deepseek/deepseek-chat/deepseek-chat/codes",
                "testFileMapPath" : "/LSPRAG/experiments/data/main_result/black/opencode-deepseek/deepseek-chat/test_file_map.json",
                "savePath": "opencode_naive-deepseek",
                "promptType": PromptType.NAIVE
            },
            {
                "cachedDir" :"/LSPRAG/experiments/data/main_result/black/opencode_cfg-deepseek/deepseek-chat/deepseek-chat/codes",
                "testFileMapPath" : "/LSPRAG/experiments/data/main_result/black/opencode_cfg-deepseek/deepseek-chat/test_file_map.json",
                "savePath": "opencode_cfg_vars-deepseek",
                "promptType": PromptType.WITHCONTEXT
            },
     
        ]
        for (const dirInfo of DirList) {
            let cachedDir = dirInfo.cachedDir;
            let testsDir = dirInfo.cachedDir;
            let testFileMapPath = dirInfo.testFileMapPath;
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
                dirInfo.promptType,
                model,
                provider,
                symbols,
                languageId,
                undefined,
                cachedDir,
                testFileMapPath,
                dirInfo.savePath
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
        }
    })
    // test('Naive - gpt-4o-mini - continueing', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //         "/LSPRAG/experiments/projects/black/lsprag-workspace/5_31_2025__15_37_29/black/naive_detailed_nofix/gpt-4o-mini/results"
    //     );
    // });

    // test('Symprompt - gpt-4o-mini - continueing', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //         "/LSPRAG/experiments/projects/black/lsprag-workspace/5_31_2025__15_37_29/black/symprompt_detailed_nofix/gpt-4o-mini/results"
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
