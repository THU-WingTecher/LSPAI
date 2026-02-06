import * as assert from 'assert';

import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
// import { saveTaskList } from './helper';
import { getConfigInstance, GenerationType, PromptType, FixType, getProjectSrcPath, Provider, ProjectConfigName } from './config';
import { generateFileNameForDiffLanguage } from './fileHandler';
import { generateUnitTestForAFunction } from './generate';
import { activate } from './lsp/helper';
import { createCFGBuilder } from './cfg/builderFactory';
import { PathCollector } from './cfg/path';
import { SupportedLanguage } from './ast';
import { ExpLogger } from './log';
import pLimit from 'p-limit';
import { genPythonicSrcImportStatement } from './helper';
import { resolveCachedDraftTestPath, resolveTestFileNameFromTestFileMap } from './strategy/generators/lsprag_reflect';

function createConcurrencyLimit() {
    const configured = getConfigInstance().parallelCount;
    const concurrency = Number.isFinite(configured) ? configured : 4;
    return pLimit(Math.max(1, concurrency));
}

interface TaskProgress {
    symbolName: string;
    relativeDocumentPath: string;
    sourceCode: string;
    importString: string;
    lineNum: number;
    location?: number;
    completed: boolean;
    timestamp?: string;
    error?: string;
}

interface ExperimentProgress {
    totalTasks: number;
    completedTasks: number;
    tasks: TaskProgress[];
    lastUpdated: string;
}


export class ExperimentContinuityManager {
    private progressFilePath: string;
    private taskListPath: string;
    private progressLock: Promise<void> = Promise.resolve();
    private experimentDir: string;
    private workspacePath: string;
    private isFirstTime: boolean;

    constructor(experimentDir: string, workspacePath: string) {
        this.experimentDir = experimentDir;
        if (experimentDir.includes(workspacePath)) {
            this.experimentDir = path.relative(workspacePath, experimentDir);
        }
        this.workspacePath = workspacePath;
        this.progressFilePath = path.join(workspacePath, this.experimentDir, 'progress.json');
        this.taskListPath = path.join(workspacePath, this.experimentDir, 'taskList.json');
        this.isFirstTime = true;
        this.initializeProgressFile();
    }

    private initializeProgressFile() {
        if (!fs.existsSync(this.progressFilePath)) {
            const initialProgress: ExperimentProgress = {
                totalTasks: 0,
                completedTasks: 0,
                tasks: [],
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.progressFilePath, JSON.stringify(initialProgress, null, 2));
        } else {
            this.isFirstTime = false;
        }
    }

    public isFirstTimeExperiment(): boolean {
        return this.isFirstTime;
    }

    private async readProgress(): Promise<ExperimentProgress> {
        const content = await fs.promises.readFile(this.progressFilePath, 'utf8');
        console.log(`#### Progress file: ${this.progressFilePath}`);
        return JSON.parse(content);
    }

    private async writeProgress(progress: ExperimentProgress): Promise<void> {
        progress.lastUpdated = new Date().toISOString();
        console.log(`#### writeProgress: ${progress.tasks.length}`);
        await fs.promises.writeFile(this.progressFilePath, JSON.stringify(progress, null, 2));
    }

    public async saveTaskList(
        symbolDocumentMap: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[]
    ): Promise<void> {
        // Build the data to be written
        const data = symbolDocumentMap.map(({ symbol, document }) => {
            const relativePath = path.relative(this.workspacePath, document.uri.fsPath);
            let importString = "";
            if (document.languageId === "python") {
                importString = genPythonicSrcImportStatement(document.getText());
            }
            return {
                symbolName: symbol.name,
                sourceCode: document.getText(symbol.range),
                importString: importString,
                lineNum: symbol.range.end.line - symbol.range.start.line,
                location: symbol.range.start.line,
                relativeDocumentPath: relativePath
            };
        });

        // Write to JSON file
        await fs.promises.mkdir(path.dirname(this.taskListPath), { recursive: true });
        await fs.promises.writeFile(this.taskListPath, JSON.stringify(data, null, 2), "utf8");
        console.log(`Task list has been saved to ${this.taskListPath}`);

        // Initialize progress tracking with the new task list
        await this.initializeFromTaskList(data);
    }

    public async initializeFromTaskList(taskList: any[]): Promise<void> {
        // Acquire lock for atomic operation
        await this.acquireLock(async () => {
            const progress = await this.readProgress();
            
            // Initialize progress for new tasks
            progress.totalTasks = taskList.length;
            console.log(`#### Initializing from task list: ${taskList.length}`);
            const uncompletedTasks = progress.tasks.filter(task => !task.completed);
            console.log(`#### uncompletedTasks: ${uncompletedTasks.length}`);
            progress.tasks = taskList.map(task => ({
                ...task,
                completed: false
            }));
            console.log(`#### progress.tasks: ${progress.tasks.length}`);
            progress.completedTasks = 0;

            await this.writeProgress(progress);
        });
    }

    public async loadTaskList(): Promise<void> {
        const taskListContent = await fs.promises.readFile(this.taskListPath, 'utf8');
        const taskList = JSON.parse(taskListContent);
        await this.initializeFromTaskList(taskList);
    }

    public async markTaskComplete(symbolName: string, relativeDocumentPath: string, error?: string): Promise<void> {
        // Acquire lock for atomic operation
        console.log(`#### markTaskComplete: ${symbolName} ${relativeDocumentPath}`);
        await this.acquireLock(async () => {
            const progress = await this.readProgress();
            console.log(`#### progress: ${progress.tasks.length}`);
            const task = progress.tasks.find(t => 
                t.symbolName === symbolName && 
                t.relativeDocumentPath === relativeDocumentPath
            );

            if (task && !task.completed) {
                task.completed = true;
                task.timestamp = new Date().toISOString();
                if (error) {
                    task.error = error;
                }
                progress.completedTasks++;
                await this.writeProgress(progress);
            }
        });
    }

    public async getUncompletedTasks(): Promise<TaskProgress[]> {
        const progress = await this.readProgress();
        console.log(`#### Uncompleted tasks: ${progress.tasks.filter(task => !task.completed).length}`);
        return progress.tasks.filter(task => !task.completed);
    }

    public async getProgress(): Promise<ExperimentProgress> {
        return await this.readProgress();
    }

    private async acquireLock<T>(operation: () => Promise<T>): Promise<T> {
        // Wait for previous operation to complete
        await this.progressLock;

        // Create new lock
        let resolveLock: () => void;
        this.progressLock = new Promise(resolve => {
            resolveLock = resolve;
        });

        try {
            const result = await operation();
            return result;
        } finally {
            resolveLock!();
        }
    }
}

export async function collectPathforSymbols(
    symbols: any, // Use the correct type if available
) {
    if (process.env.NODE_DEBUG !== 'true') {
        console.log('activate');
        await activate();
    }

    const savePath = path.join("lsprag-workspace", "cfg-path-results", getConfigInstance().timeStamp);
    getConfigInstance().updateConfig({
        savePath: savePath
    });
    const workspace = getConfigInstance().workspace;
    const projectName = getConfigInstance().getProjectName();
    let currentSrcPath;
    currentSrcPath = getProjectSrcPath(projectName as ProjectConfigName);
    const logPath = getConfigInstance().logSavePath;
    for (const symbolFilePair of symbols) {
        const logger = new ExpLogger([], getConfigInstance().model, symbolFilePair.symbol.name, symbolFilePair.symbol.name, symbolFilePair.symbol.name);
        const { document, symbol } = symbolFilePair;
        const builder = createCFGBuilder(document.languageId as SupportedLanguage);
        const functionText = document.getText(symbol.range);
        const cfg = await builder.buildFromCode(functionText);
        const pathCollector = new PathCollector(document.languageId);
        const paths = pathCollector.collect(cfg.entry);
        const minimizedPaths = pathCollector.minimizePaths(paths);
        logger.saveCFGPaths(functionText, minimizedPaths);
        console.log(`#### minimizedPaths: ${minimizedPaths.length}`);
    }

    const pathFolder = path.join(logPath, 'paths');
    const paths = await findJsonFilesRecursively(pathFolder);
    console.log(`#### Paths: ${paths.length}`);
        // assert.equal(paths.length, symbolFilePairsToTest.length, 'paths json files should exist for each function');
}

export async function findMatchedSymbolsFromTaskList(
    taskListFilePath: string,
    allSymbols: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[],
    workspaceFolderPath: string
): Promise<{ symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[]> {
    // Read the taskList file
    const taskListContent = await fs.promises.readFile(taskListFilePath, 'utf8');
    const taskList = JSON.parse(taskListContent) as Array<{
        symbolName: string;
        relativeDocumentPath: string;
        lineNum?: number;
        location?: number;
        line_num?: number;
    }>;

    const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
    const symbolLineNum = (symbol: vscode.DocumentSymbol) =>
        symbol.range.end.line - symbol.range.start.line;
    const symbolStartLine = (symbol: vscode.DocumentSymbol) =>
        symbol.range.start.line;

    const index = new Map<string, { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[]>();
    for (const entry of allSymbols) {
        const rel = normalizePath(path.relative(workspaceFolderPath, entry.document.uri.fsPath));
        const key = `${rel}::${entry.symbol.name}`;
        const list = index.get(key) ?? [];
        list.push(entry);
        index.set(key, list);
    }

    const matchedSymbols: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[] = [];
    let unmatched = 0;
    let ambiguous = 0;

    for (const task of taskList) {
        const rel = normalizePath(task.relativeDocumentPath || '');
        const key = `${rel}::${task.symbolName}`;
        const candidates = index.get(key) ?? [];
        if (candidates.length === 0) {
            unmatched += 1;
            continue;
        }

        const taskLocation =
            task.location !== undefined && task.location !== null
                ? Number(task.location)
                : task.line_num !== undefined && task.line_num !== null
                    ? Number(task.line_num)
                    : undefined;
        const taskLineNum =
            task.lineNum !== undefined && task.lineNum !== null
                ? Number(task.lineNum)
                : undefined;

        let selected = candidates;
        let disambiguated = false;
        if (Number.isFinite(taskLocation)) {
            const locationMatched = candidates.filter(
                c => symbolStartLine(c.symbol) === taskLocation
            );
            if (locationMatched.length > 0) {
                selected = locationMatched;
                disambiguated = true;
            }
        }
        if (!disambiguated && Number.isFinite(taskLineNum)) {
            const lineMatched = candidates.filter(
                c => symbolLineNum(c.symbol) === taskLineNum
            );
            if (lineMatched.length > 0) {
                selected = lineMatched;
            }
        }

        if (selected.length > 1) {
            ambiguous += 1;
        }
        matchedSymbols.push(selected[0]);
    }

    console.log(
        `Found ${matchedSymbols.length} matching symbols from taskList ` +
        `(unmatched: ${unmatched}, ambiguous: ${ambiguous})`
    );
    return matchedSymbols;
}

export function countTestFile(finalTestPath: string) {
    // Add test file counting
    if (fs.existsSync(finalTestPath)) {
        const testFiles = fs.readdirSync(finalTestPath).filter(file => file.toLowerCase().includes('test'));
        // console.log(`#### Found ${testFiles.length} test files in ${finalTestPath}`);
        return testFiles.length;
    } else {
        // console.log(`#### No test files found in ${finalTestPath}`);
    }
    return 0;
}

export async function runGenerateTestCodeSuite(
    generationType: GenerationType,
    fixType: FixType,
    promptType: PromptType,
    model: string,
    provider: Provider,
    symbols: any, // Use the correct type if available
    languageId: string,
    previousExperimentDir?: string, // Optional parameter for continuing experiments
    dirForReuse?: string, // Optional parameter for reflecting experiments
    testFileMapPath?: string,
    saveName?: string,
) {
    if (process.env.NODE_DEBUG !== 'true') {
        console.log('activate');
        await activate();
    }

    // Initialize config
    getConfigInstance().updateConfig({
        generationType,
        fixType,
        promptType,
        model: model,
        provider: provider
    });
    // If continuing from previous experiment, use its save path
    const savePath = previousExperimentDir || getConfigInstance().genSaveName(saveName);
    getConfigInstance().updateConfig({
        savePath: savePath
    });

    getConfigInstance().logAllConfig();
    console.log(`#### test ${symbols.length} focal method`);
    
    // Setup paths
    const workspace = getConfigInstance().workspace;
    const projectName = getConfigInstance().getProjectName();
    let currentSrcPath;
    currentSrcPath = getProjectSrcPath(projectName as ProjectConfigName);

    // Get symbol pairs and save task list
    const symbolFilePairsToTest = getSymbolFilePairsToTest(symbols, languageId);
    const continuityManager = new ExperimentContinuityManager(savePath, workspace);
    
    // Decide output root ONCE for the whole run (critical for EXPERIMENTAL resume).
    // const normalizeCacheRoot = (dir: string): string => {
    //     const trimmed = dir.replace(/[\/\\]+$/, '');
    //     if (trimmed.endsWith(`${path.sep}initial`) || trimmed.endsWith(`${path.sep}final`)) {
    //         return path.dirname(trimmed);
    //     }
    //     return trimmed;
    // };

    // const outputSaveRootOverride = (dirForReuse && generationType === GenerationType.EXPERIMENTAL)
    //     ? `${normalizeCacheRoot(dirForReuse)}_${Date.now()}_${promptType}`
    //     : getConfigInstance().savePath;


    let symbolPairsToProcess = symbolFilePairsToTest;
    if (!continuityManager.isFirstTimeExperiment()) {
        console.log(`#### Continuing experiment from ${previousExperimentDir}`);
        // await continuityManager.loadTaskList();
        
        // Get uncompleted tasks and filter symbols
        const uncompletedTasks = await continuityManager.getUncompletedTasks();
        symbolPairsToProcess = symbolFilePairsToTest.filter(({ symbol, document, fileName }) => {
            const relativePath = path.relative(workspace, document.uri.fsPath);
            const basename = path.basename(fileName);
            const finalSavePath = path.join(getConfigInstance().savePath, "final");
            
            // Check if file exists in final directory
            const fileExistsInFinal = fs.existsSync(path.join(finalSavePath, basename));
            
            // Only include tasks that are uncompleted AND don't have corresponding file in final directory
            return !fileExistsInFinal;
        });
        
        console.log(`#### Continuing experiment with ${symbolPairsToProcess.length} remaining tasks`);
    } else {
        // For new experiments, initialize fresh progress tracking
        await continuityManager.saveTaskList(symbolFilePairsToTest);
        // await continuityManager.initializeFromTaskList(symbolFilePairsToTest);
        console.log(`#### Starting new experiment with ${symbolPairsToProcess.length} tasks`);
    }

    // Build/merge test-file mapping for analysis
    // if (testFileMapPath === undefined) {
    const newtestFileMapPath = path.join(getConfigInstance().savePath, 'test_file_map.json');
    // }
    const newEntries = Object.fromEntries(
        symbolFilePairsToTest.map(({ document, symbol, fileName }) => [
            path.basename(fileName),
            {
                project_name: projectName,
                file_name: path.relative(workspace, document.uri.fsPath),
                symbol_name: symbol.name,
            }
        ])
    );
    let existingEntries: Record<string, any> = {};
    try {
        const prev = await fs.promises.readFile(newtestFileMapPath, 'utf8');
        existingEntries = JSON.parse(prev);
    } catch {}
    await fs.promises.writeFile(newtestFileMapPath, JSON.stringify({ ...existingEntries, ...newEntries }, null, 2), 'utf8');
    console.log(`#### Test file map has been saved to ${newtestFileMapPath}`);

    const limit = createConcurrencyLimit();
    const buildExperimentalTaskKey = (symbolName: string, sourceFilePath: string) =>
        `${symbolName}::${path.normalize(sourceFilePath)}`;
    const validatedExperimentalMappings = new Map<string, string>();

    if (dirForReuse && testFileMapPath && generationType === GenerationType.EXPERIMENTAL) {
        const missingMappings: string[] = [];
        for (const { document, symbol } of symbolPairsToProcess) {
            const mapped = resolveTestFileNameFromTestFileMap({
                dirForReuse,
                symbolName: symbol.name,
                sourceFile: document.uri.fsPath,
                testFileMapPath
            });
            if (!mapped) {
                missingMappings.push(`${symbol.name} (${document.uri.fsPath}:${symbol.range.start.line + 1})`);
                continue;
            }
            validatedExperimentalMappings.set(
                buildExperimentalTaskKey(symbol.name, document.uri.fsPath),
                mapped
            );
        }

        if (missingMappings.length > 0) {
            const preview = missingMappings.slice(0, 20).join('\n- ');
            throw new Error(
                `[EXPERIMENTAL] Missing test_file_map mappings for ${missingMappings.length}/${symbolPairsToProcess.length} tasks. ` +
                `Please ensure all test files are mapped before running reflection.\n- ${preview}`
            );
        }

        console.log(
            `[EXPERIMENTAL] Verified mapping for all ${validatedExperimentalMappings.size} tasks using ${testFileMapPath}`
        );
    }

    // Generate test promises with progress tracking
    const testGenerationPromises = symbolPairsToProcess.map(symbolFilePair => 
        limit(async () => {
            const { document, symbol, fileName } = symbolFilePair;
            try {
                // NOTE: `dirForReuse` is EXPERIMENTAL-only and is used for assertion-reflection runs:
                // we load the cached draft test *here* (where fileName is decided), and pass the code down.
                let resolvedFileName = fileName;
                let cachedDraftTestCode: string | undefined;
                if (dirForReuse && testFileMapPath && generationType === GenerationType.EXPERIMENTAL) {
                    const taskKey = buildExperimentalTaskKey(symbol.name, document.uri.fsPath);
                    const mapped = validatedExperimentalMappings.get(taskKey);
                    if (mapped) {
                        // Use the cached randomized basename for the new run too (stable naming).
                        resolvedFileName = path.join(path.dirname(fileName), mapped);
                        const cachedPath = resolveCachedDraftTestPath(dirForReuse, mapped);
                        if (cachedPath) {
                            try {
                                cachedDraftTestCode = fs.readFileSync(cachedPath, 'utf8');
                                console.log(`[EXPERIMENTAL] Loaded cached draft test: ${cachedPath}`);
                            } catch (e) {
                                console.warn('[EXPERIMENTAL] Failed to read cached draft test (continuing):', e);
                            }
                        } else {
                            console.warn(`[EXPERIMENTAL] No cached draft test found under dirForReuse: ${dirForReuse} for ${mapped}`);
                        }
                    } else {
                        throw new Error(
                            `[EXPERIMENTAL] Missing validated mapping for ${symbol.name} (${document.uri.fsPath}). ` +
                            `Please ensure all test files are mapped before running reflection.`
                        );
                    }
                }

                const result = await generateUnitTestForAFunction(
                    currentSrcPath,
                    document, 
                    symbol, 
                    resolvedFileName, 
                    false,
                    true,
                    dirForReuse,
                    cachedDraftTestCode,
                    // outputSaveRootOverride
                );
                
                if (result) {
                    // Track progress for all experiments
                    await continuityManager.markTaskComplete(
                        symbol.name,
                        path.relative(workspace, document.uri.fsPath)
                    );
                    console.log(`#### Test Code: ${result}`);
                    return result;
                } else {
                    console.log(`#### Test Code: ${result}`);
                    return result;
                }
            } catch (error) {
                // Track failed tasks for all experiments
                await continuityManager.markTaskComplete(
                    symbol.name,
                    path.relative(workspace, document.uri.fsPath),
                    error instanceof Error ? error.message : String(error)
                );
                throw error;
            }
        })
    );

    const results = await Promise.all(testGenerationPromises);
    console.log(`#### ALL unit test for ${projectName} completed`);
    
    // Verify and log results
    const finalTestPath = path.join(getConfigInstance().savePath, "final");
    const testFiles = countTestFile(finalTestPath);
    console.log(`#### Test files: ${testFiles}`);
    
    const logPath = getConfigInstance().logSavePath;
    console.log(`#### Log path: ${logPath}`);
    assert.ok(fs.existsSync(logPath), 'log path should exist');
    
    // const llmlogs = fs.readdirSync(logPath).filter(file => file.endsWith('llm_logs.json'));
    // assert.ok(llmlogs.length > 0, 'llm_logs.json should exist');

    // Check diagnostic reports if needed
    if (getConfigInstance().fixType !== FixType.NOFIX && getConfigInstance().generationType !== GenerationType.NAIVE) {
        const diagnosticReportFolder = path.join(logPath, 'diagnostic_report');
        const diagnosticReports = await findJsonFilesRecursively(diagnosticReportFolder);
        console.log(`#### Diagnostic reports: ${diagnosticReports.length}`);
    }

    // Check CFG paths if needed
    if (getConfigInstance().generationType === GenerationType.CFG) {
        const pathFolder = path.join(logPath, 'paths');
        const paths = await findJsonFilesRecursively(pathFolder);
        console.log(`#### Paths: ${paths.length}`);
    }

    // Verify task list exists
    const taskListPath = path.join(getConfigInstance().savePath, 'taskList.json');
    // assert.ok(fs.existsSync(taskListPath), 'taskList.json should exist');

    // Log final progress for all experiments
    const progress = await continuityManager.getProgress();
    console.log(`#### Experiment progress: ${progress.completedTasks}/${progress.totalTasks} tasks completed`);
}


export function getSymbolFilePairsToTest(symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[], languageId: string) {
    const symbolFilePairs = symbols.map(({symbol, document}) => {
        return {
            symbol,
            document,
            fileName: generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), languageId, [],0)
        };
    });
    return symbolFilePairs;
}

export async function findJsonFilesRecursively(rootDir: string): Promise<string[]> {
    const jsonFiles: string[] = [];

    async function scanDirectory(currentPath: string) {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            
            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                await scanDirectory(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                // Add json files to the result array
                jsonFiles.push(fullPath);
            }
        }
    }

    try {
        await scanDirectory(rootDir);
        return jsonFiles;
    } catch (error) {
        console.error(`Error scanning directory ${rootDir}:`, error);
        throw error;
    }
}
