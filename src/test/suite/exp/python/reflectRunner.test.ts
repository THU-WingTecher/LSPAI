import * as assert from 'assert';
import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import { setWorkspaceFolders } from '../../../../helper';
import { loadAllTargetSymbolsFromWorkspace, getSymbolFromDocument } from "../../../../lsp/symbol";
import { activate } from '../../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType, ProjectConfigName } from '../../../../config';
import { readSliceAndSaveTaskList } from '../../../../experiment/utils/helper';
import { runGenerateTestCodeSuite, findMatchedSymbolsFromTaskList } from '../../../../experiment';
import { runPipeline } from '../../../../ut_runner/runner';
import { setupPythonWorkspaceForExperiment } from '../../../../helper';
import { getPythonProjectInfo } from '../../../../config';
import { isSkipLLMModeEnabled } from '../../../../invokeLLM';

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

    const skipLLMMode = isSkipLLMModeEnabled();
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
        resumeFromResultsDir?: string;
        resumeTestFileMapPath?: string;
        symbolName?: string;
        sourceFile?: string;
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
            const resumeFromResultsDir =
                entry.resumeFromResultsDir || entry.resume_from_results_dir;
            const resumeTestFileMapPath =
                entry.resumeTestFileMapPath || entry.resume_test_file_map_path;
            if (!cachedDir || !testFileMapPath) {
                throw new Error(`Config entry ${index} missing cachedDir or testFileMapPath.`);
            }
            return {
                cachedDir: path.isAbsolute(cachedDir) ? cachedDir : path.resolve(baseDir, cachedDir),
                testFileMapPath: path.isAbsolute(testFileMapPath) ? testFileMapPath : path.resolve(baseDir, testFileMapPath),
                promptType: entry.promptType,
                savePath: entry.savePath,
                saveName: entry.saveName,
                resumeFromResultsDir: resumeFromResultsDir
                    ? (path.isAbsolute(resumeFromResultsDir)
                        ? resumeFromResultsDir
                        : path.resolve(baseDir, resumeFromResultsDir))
                    : undefined,
                resumeTestFileMapPath: resumeTestFileMapPath
                    ? (path.isAbsolute(resumeTestFileMapPath)
                        ? resumeTestFileMapPath
                        : path.resolve(baseDir, resumeTestFileMapPath))
                    : undefined,
                symbolName: entry.symbolName || entry.symbol_name,
                sourceFile: entry.sourceFile || entry.source_file
            } as ReflectConfigEntry;
        });
    };

    const runPipelineFor = async (testsDir: string, testFileMapPath: string): Promise<void> => {
        const finalReportPath = `${testsDir}-final-report`;
        await runPipeline(testsDir, finalReportPath, testFileMapPath, {
          language: languageId,
          pythonExe: pythonInterpreterPath,
          jobs: getConfigInstance().parallelCount,
          timeoutSec: 30,
          pythonpath: pythonExtraPaths
        });
    };

    type ProgressStatus = {
        progressPath: string;
        totalTasks: number;
        completedTasks: number;
        remainingTasks: number;
    };

    const getAutoResumeMaxRounds = (): number => {
        const raw = process.env.REFLECT_AUTO_RESUME_MAX_ROUNDS;
        const parsed = raw ? Number.parseInt(raw, 10) : 10;
        if (!Number.isFinite(parsed) || parsed < 1) {
            return 10;
        }
        return parsed;
    };

    const readProgressStatus = (resultsDir: string): ProgressStatus => {
        const progressPath = path.join(resultsDir, 'progress.json');
        if (!fs.existsSync(progressPath)) {
            throw new Error(`[reflectRunner] progress.json not found: ${progressPath}`);
        }
        const raw = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
        const totalTasks = Number(raw?.totalTasks ?? 0);
        const completedTasks = Number(raw?.completedTasks ?? 0);
        if (!Number.isFinite(totalTasks) || !Number.isFinite(completedTasks)) {
            throw new Error(
                `[reflectRunner] Invalid progress.json format: ${progressPath} ` +
                `(totalTasks=${raw?.totalTasks}, completedTasks=${raw?.completedTasks})`
            );
        }
        return {
            progressPath,
            totalTasks,
            completedTasks,
            remainingTasks: Math.max(0, totalTasks - completedTasks)
        };
    };

    const runGenerateWithAutoResume = async (params: {
        generationType: GenerationType;
        fixType: FixType;
        promptType: PromptType;
        symbolsOverride?: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[];
        previousExperimentDir?: string;
        dirForReuse?: string;
        testFileMapPath?: string;
        saveName?: string;
        resumeTestFileMapPath?: string;
        runLabel: string;
    }): Promise<string> => {
        const maxRounds = getAutoResumeMaxRounds();
        let previousExperimentDir = params.previousExperimentDir;
        let resumeTestFileMapPath = params.resumeTestFileMapPath;
        let lastCompletedTasks = -1;

        for (let round = 1; round <= maxRounds; round++) {
            await runGenerateTestCodeSuite(
                params.generationType,
                params.fixType,
                params.promptType,
                model,
                provider,
                params.symbolsOverride || symbols,
                languageId,
                previousExperimentDir,
                params.dirForReuse,
                params.testFileMapPath,
                params.saveName,
                resumeTestFileMapPath
            );

            const resultsDir = previousExperimentDir || getConfigInstance().savePath;
            const progress = readProgressStatus(resultsDir);
            console.log(
                `[reflectRunner] Progress (${params.runLabel}) round ${round}: ` +
                `${progress.completedTasks}/${progress.totalTasks} ` +
                `(remaining: ${progress.remainingTasks}) @ ${progress.progressPath}`
            );

            if (progress.remainingTasks === 0) {
                return resultsDir;
            }

            if (progress.completedTasks <= lastCompletedTasks) {
                throw new Error(
                    `[reflectRunner] Auto-resume made no forward progress for ${params.runLabel}. ` +
                    `Last completed=${lastCompletedTasks}, current=${progress.completedTasks}, resultsDir=${resultsDir}`
                );
            }
            lastCompletedTasks = progress.completedTasks;

            if (round === maxRounds) {
                throw new Error(
                    `[reflectRunner] Auto-resume exceeded max rounds (${maxRounds}) for ${params.runLabel}. ` +
                    `Last progress: ${progress.completedTasks}/${progress.totalTasks}. ` +
                    `Set REFLECT_AUTO_RESUME_MAX_ROUNDS to increase the cap if needed.`
                );
            }

            previousExperimentDir = resultsDir;
            if (!resumeTestFileMapPath) {
                const candidate = path.join(resultsDir, 'test_file_map.json');
                if (fs.existsSync(candidate)) {
                    resumeTestFileMapPath = candidate;
                }
            }
            console.log(
                `[reflectRunner] Auto-resume continuing ${params.runLabel} ` +
                `from ${resultsDir} (next round: ${round + 1})`
            );
        }

        throw new Error(`[reflectRunner] Unexpected auto-resume loop exit for ${params.runLabel}`);
    };

    const runExperimentalReflect = async (params: {
        cachedDir: string;
        testFileMapPath: string;
        promptType: PromptType;
        preTestsDir?: string;
        saveName?: string;
        resumeFromResultsDir?: string;
        resumeTestFileMapPath?: string;
        symbolsOverride?: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[];
    }): Promise<void> => {
        const preTestsDir = params.preTestsDir || params.cachedDir;
        if (params.resumeFromResultsDir) {
            const resumeDir = params.resumeFromResultsDir;
            const resumeProgressPath = path.join(resumeDir, 'progress.json');
            if (!fs.existsSync(resumeDir)) {
                throw new Error(
                    `resumeFromResultsDir does not exist: ${resumeDir}`
                );
            }
            if (!fs.existsSync(resumeProgressPath)) {
                throw new Error(
                    `resumeFromResultsDir is missing progress.json: ${resumeProgressPath}`
                );
            }
            if (params.saveName) {
                console.log(
                    '[reflectRunner] resumeFromResultsDir is set; saveName/savePath will be ignored for output directory selection.'
                );
            }
            console.log(`[reflectRunner] Resuming from existing results directory: ${resumeDir}`);
        }
        if (params.resumeTestFileMapPath && !fs.existsSync(params.resumeTestFileMapPath)) {
            throw new Error(
                `resumeTestFileMapPath does not exist: ${params.resumeTestFileMapPath}`
            );
        }
        if (!skipLLMMode) {
            await runPipelineFor(preTestsDir, params.testFileMapPath);
        } else {
            console.log('[reflectRunner] LSPRAG_SKIP_LLM enabled (config mode): skipping pre-reflect runPipelineFor');
        }

        const resultsDir = await runGenerateWithAutoResume({
            generationType: GenerationType.EXPERIMENTAL,
            fixType: FixType.ORIGINAL,
            promptType: params.promptType,
            symbolsOverride: params.symbolsOverride,
            previousExperimentDir: params.resumeFromResultsDir,
            dirForReuse: params.cachedDir,
            testFileMapPath: params.testFileMapPath,
            saveName: params.saveName,
            resumeTestFileMapPath: params.resumeTestFileMapPath,
            runLabel: `EXPERIMENTAL:${params.promptType}`
        });

        const testsDir = path.join(resultsDir, "final");
        const testFileMapPath = path.join(resultsDir, "test_file_map.json");
        if (!skipLLMMode) {
            await runPipelineFor(testsDir, testFileMapPath);
        } else {
            console.log('[reflectRunner] LSPRAG_SKIP_LLM enabled (config mode): skipping post-reflect runPipelineFor');
        }
    };

    const runLspragReflect = async (): Promise<void> => {
        const cachedDir = await runGenerateWithAutoResume({
            generationType: GenerationType.LSPRAG,
            fixType: FixType.ORIGINAL,
            promptType: PromptType.WITHCONTEXT,
            runLabel: 'LSPRAG:WITHCONTEXT'
        });
        const testsDir = path.join(cachedDir, "final");
        const testFileMapPath = path.join(cachedDir, "test_file_map.json");

        await runExperimentalReflect({
            cachedDir,
            testFileMapPath,
            preTestsDir: testsDir,
            promptType: PromptType.NAIVE
        });
        
        const CFGcachedDir = await runGenerateWithAutoResume({
            generationType: GenerationType.LSPRAG,
            fixType: FixType.ORIGINAL,
            promptType: PromptType.CFG,
            runLabel: 'LSPRAG:CFG'
        });
        const CFGtestsDir = path.join(CFGcachedDir, "final");
        const CFGtestFileMapPath = path.join(CFGcachedDir, "test_file_map.json");
        await runExperimentalReflect({
            cachedDir: CFGcachedDir,
            testFileMapPath: CFGtestFileMapPath,
            preTestsDir: CFGtestsDir,
            promptType: PromptType.WITHCONTEXT
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

    test(`Reflect runner; ${model}; ${testType}`, async () => {
        if (skipLLMMode) {
            console.log('[reflectRunner] Skip-LLM mode is active (config mode only).');
        }

        if (testType === 'lsprag') {
            await runLspragReflect();
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
            let symbolsOverride: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[] | undefined;
            if (config.symbolName || config.sourceFile) {
                if (!config.symbolName || !config.sourceFile) {
                    throw new Error('Config entry must provide both symbolName(symbol_name) and sourceFile(source_file) for targeted mode.');
                }
                const targetDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(config.sourceFile));
                const targetSymbol = await getSymbolFromDocument(targetDoc, config.symbolName);
                if (!targetSymbol) {
                    throw new Error(`Target symbol "${config.symbolName}" not found in ${config.sourceFile}`);
                }
                symbolsOverride = [{ symbol: targetSymbol, document: targetDoc }];
                console.log(`[reflectRunner] Targeted mode: ${config.symbolName} @ ${config.sourceFile}`);
            }
            await runExperimentalReflect({
                cachedDir: config.cachedDir,
                testFileMapPath: config.testFileMapPath,
                promptType: resolvePromptType(config.promptType),
                saveName: config.savePath || config.saveName,
                resumeFromResultsDir: config.resumeFromResultsDir,
                resumeTestFileMapPath: config.resumeTestFileMapPath,
                symbolsOverride
            });
        }
    });

}); 
