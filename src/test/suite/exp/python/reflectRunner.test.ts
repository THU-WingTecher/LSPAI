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
    const testTypeRaw = process.env.TEST_TYPE || 'LSPRAG';
    const testType = testTypeRaw.trim().toLowerCase();
    const testConfigPath = process.env.TEST_CONFIG_PATH;
    const taskListPath = process.env.TEST_TASK_LIST_PATH;
    if (!taskListPath) {
        throw new Error('Missing required TEST_TASK_LIST_PATH. Pass --taskListPath=<path> when running tests.');
    }
    console.log(`#### projectName: ${projectName}`);
    console.log(`#### taskListPath: ${taskListPath}`);
    console.log(`#### testType: ${testTypeRaw}`);
    if (testType === 'config') {
        if (!testConfigPath) {
            throw new Error('Missing required TEST_CONFIG_PATH. Pass --testConfigPath=<path> when running tests.');
        }
        console.log(`#### testConfigPath: ${testConfigPath}`);
    }
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
    type ReflectConfigEntry = {
        cachedDir: string;
        testFileMapPath: string;
        promptType?: string;
        savePath?: string;
        saveName?: string;
    };

    const resolvePromptType = (raw?: string): PromptType => {
        if (!raw) {
            return PromptType.WITHCONTEXT;
        }
        const normalized = raw.replace(/[\s_-]/g, '').toLowerCase();
        switch (normalized) {
            case 'withcontext':
                return PromptType.WITHCONTEXT;
            case 'naive':
                return PromptType.NAIVE;
            case 'detailed':
                return PromptType.DETAILED;
            default:
                throw new Error(`Unsupported promptType "${raw}". Use WITHCONTEXT, NAIVE, or DETAILED.`);
        }
    };

    const loadReflectConfig = (configPath: string): ReflectConfigEntry[] => {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const entries = Array.isArray(raw) ? raw : raw?.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            throw new Error('Invalid TEST_CONFIG_PATH: expected a non-empty array or { entries: [...] }.');
        }
        const baseDir = path.dirname(configPath);
        return entries.map((entry, index) => {
            if (!entry || typeof entry !== 'object') {
                throw new Error(`Invalid config entry at index ${index}. Expected an object.`);
            }
            const cachedDir = entry.cachedDir;
            const testFileMapPath = entry.testFileMapPath;
            if (!cachedDir || !testFileMapPath) {
                throw new Error(`Config entry ${index} missing cachedDir or testFileMapPath.`);
            }
            return {
                cachedDir: path.isAbsolute(cachedDir) ? cachedDir : path.resolve(baseDir, cachedDir),
                testFileMapPath: path.isAbsolute(testFileMapPath) ? testFileMapPath : path.resolve(baseDir, testFileMapPath),
                promptType: entry.promptType,
                savePath: entry.savePath,
                saveName: entry.saveName
            } as ReflectConfigEntry;
        });
    };

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

    // test(`LSPRAG-reflect; ${model}; naive-experimental comparative experiment`, async () => {

    //     await runGenerateTestCodeSuite(
    //         GenerationType.LSPRAG,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         model, 
    //         provider,
    //         symbols,
    //         languageId,
    //         undefined,
    //     );

    //     const cachedDir = getConfigInstance().savePath;
    //     let testsDir = path.join(getConfigInstance().savePath, "final");
    //     const originalTestFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
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
    //         model, 
    //         provider,
    //         symbols,
    //         languageId,
    //         undefined,
    //         cachedDir,
    //         originalTestFileMapPath
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
    //         model, 
    //         provider,
    //         symbols,
    //         languageId,
    //         undefined,
    //         cachedDir,
    //         originalTestFileMapPath
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

    test(`Reflect runner; ${model}; ${testType}`, async () => {
        if (testType === 'lsprag') {
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
            return;
        }

        if (testType !== 'config') {
            throw new Error(`Unsupported TEST_TYPE "${testTypeRaw}". Use "LSPRAG" or "config".`);
        }
        if (!testConfigPath) {
            throw new Error('Missing required TEST_CONFIG_PATH when TEST_TYPE=config.');
        }

        const reflectConfigs = loadReflectConfig(testConfigPath);
        for (const config of reflectConfigs) {
            const cachedDir = config.cachedDir;
            let testsDir = cachedDir;
            let testFileMapPath = config.testFileMapPath;
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
                resolvePromptType(config.promptType),
                model, 
                provider,
                symbols,
                languageId,
                undefined,
                cachedDir,
                testFileMapPath,
                config.savePath || config.saveName
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
    });

}); 
