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
        this.experimentDir = path.isAbsolute(experimentDir)
            ? path.normalize(experimentDir)
            : path.join(workspacePath, experimentDir);
        this.workspacePath = workspacePath;
        this.progressFilePath = path.join(this.experimentDir, 'progress.json');
        this.taskListPath = path.join(this.experimentDir, 'taskList.json');
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
        const progress = JSON.parse(content) as ExperimentProgress;
        return this.recalculateProgressCounters(progress);
    }

    private async writeProgress(progress: ExperimentProgress): Promise<void> {
        const normalizedProgress = this.recalculateProgressCounters(progress);
        normalizedProgress.lastUpdated = new Date().toISOString();
        console.log(`#### writeProgress: ${normalizedProgress.completedTasks}`);
        await fs.promises.writeFile(this.progressFilePath, JSON.stringify(normalizedProgress, null, 2));
    }

    private recalculateProgressCounters(progress: ExperimentProgress): ExperimentProgress {
        const tasks = Array.isArray(progress.tasks) ? progress.tasks : [];
        const completedTasks = tasks.filter(task => task.completed).length;
        return {
            ...progress,
            totalTasks: tasks.length,
            completedTasks,
            tasks
        };
    }

    public async saveTaskList(
        symbolDocumentMap: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[]
    ): Promise<void> {
        const pythonImportStringCache = new Map<string, string>();

        // Build the data to be written
        const data = symbolDocumentMap.map(({ symbol, document }) => {
            const relativePath = path.relative(this.workspacePath, document.uri.fsPath);
            let importString = "";
            if (document.languageId === "python") {
                const cacheKey = document.uri.fsPath;
                const cachedImportString = pythonImportStringCache.get(cacheKey);
                if (cachedImportString !== undefined) {
                    importString = cachedImportString;
                } else {
                    importString = genPythonicSrcImportStatement(document.getText());
                    pythonImportStringCache.set(cacheKey, importString);
                }
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
            console.log(`#### Initializing from task list: ${taskList.length}`);
            const uncompletedTasks = progress.tasks.filter(task => !task.completed);
            console.log(`#### uncompletedTasks: ${uncompletedTasks.length}`);
            progress.tasks = taskList.map(task => ({
                ...task,
                completed: false
            }));
            console.log(`#### progress.tasks: ${progress.tasks.length}`);

            await this.writeProgress(progress);
        });
    }

    public async loadTaskList(): Promise<void> {
        const taskListContent = await fs.promises.readFile(this.taskListPath, 'utf8');
        const taskList = JSON.parse(taskListContent);
        await this.initializeFromTaskList(taskList);
    }

    public async markTaskComplete(
        symbolName: string,
        relativeDocumentPath: string,
        lineNum?: number,
        location?: number,
        error?: string,
        completed: boolean = true
    ): Promise<void> {
        // Acquire lock for atomic operation
        console.log(`#### markTaskComplete: ${symbolName} ${relativeDocumentPath}`);
        await this.acquireLock(async () => {
            const progress = await this.readProgress();
            console.log(`#### progress: ${progress.tasks.length}`);
            const candidates = progress.tasks.filter(t =>
                t.symbolName === symbolName &&
                t.relativeDocumentPath === relativeDocumentPath &&
                !t.completed
            );

            let task = candidates[0];
            if (Number.isFinite(lineNum)) {
                const exactLine = candidates.find(t => Number(t.lineNum) === Number(lineNum));
                if (exactLine) {
                    task = exactLine;
                }
            }
            if (Number.isFinite(location)) {
                const exactLocation = candidates.find(t => Number(t.location) === Number(location));
                if (exactLocation) {
                    task = exactLocation;
                }
            }

            if (task) {
                task.completed = completed;
                task.timestamp = new Date().toISOString();
                if (error) {
                    task.error = error;
                }
                await this.writeProgress(progress);
            }
        });
    }

    private normalizeTaskPath(pathValue: string): string {
        return (pathValue || '').replace(/\\/g, '/').replace(/^\.\//, '');
    }

    private buildTaskKey(task: TaskProgress): string | null {
        const relPath = this.normalizeTaskPath(task.relativeDocumentPath || '');
        const symbolName = task.symbolName || '';
        const location = Number(task.location);
        if (!relPath || !symbolName || !Number.isFinite(location)) {
            return null;
        }
        return `${relPath}::${symbolName}::${location + 1}`;
    }

    public async reconcileCompletedTasksWithArtifacts(
        testFileMapPath: string,
        finalDir: string
    ): Promise<void> {
        await this.acquireLock(async () => {
            if (!fs.existsSync(testFileMapPath)) {
                return;
            }

            let mapEntries: Record<string, any>;
            try {
                const raw = await fs.promises.readFile(testFileMapPath, 'utf8');
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    return;
                }
                mapEntries = parsed as Record<string, any>;
            } catch {
                return;
            }

            const existingFinalFiles = new Set<string>();
            if (fs.existsSync(finalDir)) {
                for (const entry of fs.readdirSync(finalDir)) {
                    const fullPath = path.join(finalDir, entry);
                    try {
                        if (fs.statSync(fullPath).isFile()) {
                            existingFinalFiles.add(entry);
                        }
                    } catch {
                        // ignore transient file-system errors during reconciliation
                    }
                }
            }

            const taskKeyToFiles = new Map<string, string[]>();
            for (const [fileName, entry] of Object.entries(mapEntries)) {
                if (!entry || typeof entry !== 'object') {
                    continue;
                }
                const taskKeyRaw = (entry as any).task_key || (entry as any).taskKey;
                if (typeof taskKeyRaw !== 'string' || !taskKeyRaw) {
                    continue;
                }
                const taskKey = this.normalizeTaskPath(taskKeyRaw);
                const list = taskKeyToFiles.get(taskKey) ?? [];
                list.push(path.basename(fileName));
                taskKeyToFiles.set(taskKey, list);
            }

            const progress = await this.readProgress();
            let downgraded = 0;

            for (const task of progress.tasks) {
                if (!task.completed) {
                    continue;
                }
                const taskKey = this.buildTaskKey(task);
                if (!taskKey) {
                    continue;
                }
                const mappedFiles = taskKeyToFiles.get(taskKey) ?? [];
                const hasFinalArtifact = mappedFiles.some((f) => existingFinalFiles.has(path.basename(f)));
                if (!hasFinalArtifact) {
                    task.completed = false;
                    task.error = '[reconcile] mapped final test file missing; task reset to uncompleted';
                    downgraded += 1;
                }
            }

            if (downgraded > 0) {
                console.warn(
                    `[RESUME] Reconciled ${downgraded} completed tasks without final artifacts. ` +
                    `They were reset to uncompleted for retry.`
                );
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
        // Queue this operation after the current lock holder.
        const previousLock = this.progressLock;
        let resolveCurrentLock: () => void;
        this.progressLock = new Promise(resolve => {
            resolveCurrentLock = resolve;
        });
        await previousLock;

        try {
            const result = await operation();
            return result;
        } finally {
            resolveCurrentLock!();
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
    resumeTestFileMapPath?: string,
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

    if (!continuityManager.isFirstTimeExperiment()) {
        const existingMapPath = path.join(savePath, 'test_file_map.json');
        const existingFinalDir = path.join(savePath, 'final');
        await continuityManager.reconcileCompletedTasksWithArtifacts(existingMapPath, existingFinalDir);
    }
    
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


    const normalizeTaskPath = (value: string): string =>
        value.replace(/\\/g, '/').replace(/^\.\//, '');
    const buildExperimentalTaskKey = (
        symbolName: string,
        sourceFilePath: string,
        symbolStartLine: number
    ) => {
        const relPath = normalizeTaskPath(path.relative(workspace, sourceFilePath));
        const oneBasedLine = symbolStartLine + 1;
        return `${relPath}::${symbolName}::${oneBasedLine}`;
    };

    let symbolPairsToProcess = symbolFilePairsToTest;
    if (!continuityManager.isFirstTimeExperiment()) {
        console.log(`#### Continuing experiment from ${previousExperimentDir}`);
        // Get uncompleted tasks and filter symbols strictly by progress.json identity
        const uncompletedTasks = await continuityManager.getUncompletedTasks();

        const uncompletedBaseKeys = new Set<string>();
        const uncompletedLocationKeys = new Set<string>();
        const uncompletedLineNumKeys = new Set<string>();
        const strictDisambiguationBases = new Set<string>();

        for (const task of uncompletedTasks) {
            const relPath = normalizeTaskPath(task.relativeDocumentPath || '');
            const baseKey = `${relPath}::${task.symbolName}`;
            uncompletedBaseKeys.add(baseKey);

            const taskLocation = Number(task.location);
            if (Number.isFinite(taskLocation)) {
                strictDisambiguationBases.add(baseKey);
                uncompletedLocationKeys.add(`${baseKey}::loc:${taskLocation}`);
            }

            const taskLineNum = Number(task.lineNum);
            if (Number.isFinite(taskLineNum)) {
                strictDisambiguationBases.add(baseKey);
                uncompletedLineNumKeys.add(`${baseKey}::line:${taskLineNum}`);
            }
        }

        symbolPairsToProcess = symbolFilePairsToTest.filter(({ symbol, document }) => {
            const relPath = normalizeTaskPath(path.relative(workspace, document.uri.fsPath));
            const baseKey = `${relPath}::${symbol.name}`;
            const locationKey = `${baseKey}::loc:${symbol.range.start.line}`;
            const lineNumKey = `${baseKey}::line:${symbol.range.end.line - symbol.range.start.line}`;

            if (uncompletedLocationKeys.has(locationKey) || uncompletedLineNumKeys.has(lineNumKey)) {
                return true;
            }
            if (!strictDisambiguationBases.has(baseKey) && uncompletedBaseKeys.has(baseKey)) {
                return true;
            }
            return false;
        });
        
        console.log(
            `#### Continuing experiment with ${symbolPairsToProcess.length} remaining tasks ` +
            `(uncompleted in progress.json: ${uncompletedTasks.length})`
        );
    } else {
        // For new experiments, initialize fresh progress tracking
        await continuityManager.saveTaskList(symbolFilePairsToTest);
        // await continuityManager.initializeFromTaskList(symbolFilePairsToTest);
        console.log(`#### Starting new experiment with ${symbolPairsToProcess.length} tasks`);
    }

    const readMapFile = async (mapPath: string): Promise<Record<string, any>> => {
        const raw = await fs.promises.readFile(mapPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`Invalid test_file_map JSON object: ${mapPath}`);
        }
        return parsed as Record<string, any>;
    };

    // Build/repair test-file mapping for analysis
    const newtestFileMapPath = path.join(getConfigInstance().savePath, 'test_file_map.json');
    const normalizeGeneratedFileName = (fileName: string): string =>
        path
            .basename(fileName)
            .replace(/_\d+(?=(?:_test|Test)\.[^.]+$)/, '');
    const buildSignatureKey = (entry: {
        file_name?: string;
        symbol_name?: string;
        line_num?: number;
    }): string | null => {
        const rel = normalizeTaskPath(entry.file_name || '');
        const sym = entry.symbol_name || '';
        const line = Number(entry.line_num);
        if (!rel || !sym || !Number.isFinite(line)) {
            return null;
        }
        return `${rel}::${sym}::${line}`;
    };
    const collectExistingGeneratedFiles = (rootDir: string): string[] => {
        const stages = ['final', 'initial'];
        const collected: string[] = [];
        for (const stage of stages) {
            const stageDir = path.join(rootDir, stage);
            if (!fs.existsSync(stageDir)) {
                continue;
            }
            const files = fs
                .readdirSync(stageDir)
                .filter((name) => /(?:_test|Test)\.[^.]+$/.test(name))
                .sort();
            collected.push(...files);
        }
        return collected;
    };

    const mapSources: string[] = [];
    if (previousExperimentDir) {
        const resumeMapSourcePath = resumeTestFileMapPath || newtestFileMapPath;
        if (fs.existsSync(resumeMapSourcePath)) {
            mapSources.push(resumeMapSourcePath);
        } else {
            console.warn(
                `[RESUME] Missing test_file_map for resumed run: ${resumeMapSourcePath}. ` +
                'Rebuilding mapping from task list and existing artifacts.'
            );
        }
    }
    if (dirForReuse && testFileMapPath && generationType === GenerationType.EXPERIMENTAL) {
        if (!fs.existsSync(testFileMapPath)) {
            throw new Error(`[EXPERIMENTAL] Missing input test_file_map: ${testFileMapPath}`);
        }
        mapSources.push(testFileMapPath);
    }
    if (fs.existsSync(newtestFileMapPath)) {
        mapSources.push(newtestFileMapPath);
    }
    const uniqueMapSources = Array.from(new Set(mapSources));

    const sourceEntriesInOrder: Array<[string, any]> = [];
    for (const sourcePath of uniqueMapSources) {
        try {
            const entries = await readMapFile(sourcePath);
            for (const [fileName, entry] of Object.entries(entries)) {
                sourceEntriesInOrder.push([path.basename(fileName), entry]);
            }
        } catch (error) {
            console.warn(`[MAP] Failed to read mapping source ${sourcePath}:`, error);
        }
    }

    const filesByTaskKey = new Map<string, string[]>();
    const filesBySignature = new Map<string, string[]>();
    for (const [fileName, entry] of sourceEntriesInOrder) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const taskKeyRaw = (entry as any).task_key || (entry as any).taskKey;
        if (typeof taskKeyRaw === 'string' && taskKeyRaw) {
            const taskKey = normalizeTaskPath(taskKeyRaw);
            const list = filesByTaskKey.get(taskKey) ?? [];
            if (!list.includes(fileName)) {
                list.push(fileName);
            }
            filesByTaskKey.set(taskKey, list);
        }
        const signature = buildSignatureKey(entry as any);
        if (signature) {
            const list = filesBySignature.get(signature) ?? [];
            if (!list.includes(fileName)) {
                list.push(fileName);
            }
            filesBySignature.set(signature, list);
        }
    }

    const availableFilesByNormalizedName = new Map<string, string[]>();
    const existingOutputFiles = collectExistingGeneratedFiles(getConfigInstance().savePath);
    for (const fileName of existingOutputFiles) {
        const normalized = normalizeGeneratedFileName(fileName);
        const list = availableFilesByNormalizedName.get(normalized) ?? [];
        if (!list.includes(fileName)) {
            list.push(fileName);
        }
        availableFilesByNormalizedName.set(normalized, list);
    }

    const pickFirstUnused = (candidates: string[], used: Set<string>): string | null => {
        for (const candidate of candidates) {
            const base = path.basename(candidate);
            if (!base || used.has(base)) {
                continue;
            }
            return base;
        }
        return null;
    };

    const rebuiltEntries: Record<string, any> = {};
    const usedOutputFileNames = new Set<string>();
    for (const { document, symbol, fileName } of symbolFilePairsToTest) {
        const relativeFilePath = normalizeTaskPath(path.relative(workspace, document.uri.fsPath));
        const oneBasedLine = symbol.range.start.line + 1;
        const taskKey = buildExperimentalTaskKey(symbol.name, document.uri.fsPath, symbol.range.start.line);
        const signature = `${relativeFilePath}::${symbol.name}::${oneBasedLine}`;
        const defaultFileName = path.basename(fileName);
        const normalizedDefault = normalizeGeneratedFileName(defaultFileName);

        const candidates: string[] = [];
        candidates.push(...(filesByTaskKey.get(taskKey) ?? []));
        candidates.push(...(filesBySignature.get(signature) ?? []));
        candidates.push(...(availableFilesByNormalizedName.get(normalizedDefault) ?? []));
        candidates.push(defaultFileName);

        let chosenFileName = pickFirstUnused(candidates, usedOutputFileNames);
        if (!chosenFileName) {
            const ext = path.extname(defaultFileName);
            const stem = defaultFileName.slice(0, defaultFileName.length - ext.length);
            let suffix = 1;
            do {
                chosenFileName = `${stem}_r${suffix}${ext}`;
                suffix += 1;
            } while (usedOutputFileNames.has(chosenFileName));
        }

        usedOutputFileNames.add(chosenFileName);
        rebuiltEntries[chosenFileName] = {
            project_name: projectName,
            file_name: relativeFilePath,
            symbol_name: symbol.name,
            line_num: oneBasedLine,
            task_key: taskKey,
        };
    }

    await fs.promises.writeFile(newtestFileMapPath, JSON.stringify(rebuiltEntries, null, 2), 'utf8');
    console.log(
        `[MAP] Rebuilt test_file_map with ${Object.keys(rebuiltEntries).length} entries ` +
        `(sources: ${uniqueMapSources.length}, existing output files: ${existingOutputFiles.length}) -> ${newtestFileMapPath}`
    );

    const mappedFileNames = new Set(Object.keys(rebuiltEntries).map((name) => path.basename(name)));
    const quarantineRoot = path.join(getConfigInstance().savePath, 'orphaned_unmapped');
    const quarantineUnmappedGeneratedFiles = async (): Promise<void> => {
        const stages = ['final', 'initial'];
        for (const stage of stages) {
            const stageDir = path.join(getConfigInstance().savePath, stage);
            if (!fs.existsSync(stageDir)) {
                continue;
            }
            const stageEntries = fs
                .readdirSync(stageDir)
                .filter((name) => /(?:_test|Test)\.[^.]+$/.test(name));
            let moved = 0;
            for (const entry of stageEntries) {
                if (mappedFileNames.has(entry)) {
                    continue;
                }
                const sourcePath = path.join(stageDir, entry);
                try {
                    if (!fs.statSync(sourcePath).isFile()) {
                        continue;
                    }
                } catch {
                    continue;
                }

                const targetDir = path.join(quarantineRoot, stage);
                await fs.promises.mkdir(targetDir, { recursive: true });
                const targetPath = path.join(targetDir, entry);
                try {
                    await fs.promises.rename(sourcePath, targetPath);
                } catch {
                    // cross-device fallback
                    await fs.promises.copyFile(sourcePath, targetPath);
                    await fs.promises.unlink(sourcePath);
                }
                moved += 1;
            }

            if (moved > 0) {
                console.log(
                    `[MAP] Quarantined ${moved} unmapped generated files from ${stageDir} ` +
                    `to ${path.join(quarantineRoot, stage)}`
                );
            }
        }
    };
    await quarantineUnmappedGeneratedFiles();

    const limit = createConcurrencyLimit();
    const validatedExperimentalOutputMappings = new Map<string, string>();
    const validatedExperimentalReuseMappings = new Map<string, string>();
    const usedOutputMappingKeys = new Set<string>();
    const usedReuseMappingKeys = new Set<string>();
    const outputMappingPath = newtestFileMapPath;
    const reuseMappingPath = testFileMapPath || outputMappingPath;

    if (dirForReuse && testFileMapPath && generationType === GenerationType.EXPERIMENTAL) {
        const missingOutputMappings: string[] = [];
        for (const { document, symbol } of symbolPairsToProcess) {
            const taskKey = buildExperimentalTaskKey(
                symbol.name,
                document.uri.fsPath,
                symbol.range.start.line
            );
            const mappedOutput = resolveTestFileNameFromTestFileMap({
                dirForReuse,
                symbolName: symbol.name,
                sourceFile: document.uri.fsPath,
                testFileMapPath: outputMappingPath,
                taskKey,
                usedMappingKeys: usedOutputMappingKeys
            });
            if (!mappedOutput) {
                missingOutputMappings.push(`${symbol.name} (${document.uri.fsPath}:${symbol.range.start.line + 1})`);
                continue;
            }
            usedOutputMappingKeys.add(mappedOutput);
            validatedExperimentalOutputMappings.set(
                taskKey,
                mappedOutput
            );

            // Optional second-pass mapping for loading cached drafts from dirForReuse.
            // This can differ from output mapping during resume runs.
            const mappedReuse = resolveTestFileNameFromTestFileMap({
                dirForReuse,
                symbolName: symbol.name,
                sourceFile: document.uri.fsPath,
                testFileMapPath: reuseMappingPath,
                taskKey,
                usedMappingKeys: usedReuseMappingKeys
            });
            if (mappedReuse) {
                usedReuseMappingKeys.add(mappedReuse);
                validatedExperimentalReuseMappings.set(taskKey, mappedReuse);
            }
        }

        if (missingOutputMappings.length > 0) {
            const preview = missingOutputMappings.slice(0, 20).join('\n- ');
            throw new Error(
                `[EXPERIMENTAL] Missing output test_file_map mappings for ` +
                `${missingOutputMappings.length}/${symbolPairsToProcess.length} tasks. ` +
                `Please ensure all test files are mapped before running reflection.\n- ${preview}`
            );
        }

        console.log(
            `[EXPERIMENTAL] Verified output mapping for all ` +
            `${validatedExperimentalOutputMappings.size} tasks using ${outputMappingPath}`
        );
        if (reuseMappingPath !== outputMappingPath) {
            console.log(
                `[EXPERIMENTAL] Reuse mapping source: ${reuseMappingPath} ` +
                `(resolved ${validatedExperimentalReuseMappings.size}/${symbolPairsToProcess.length} tasks)`
            );
        }
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
                    const taskKey = buildExperimentalTaskKey(
                        symbol.name,
                        document.uri.fsPath,
                        symbol.range.start.line
                    );
                    const mappedOutput = validatedExperimentalOutputMappings.get(taskKey);
                    if (mappedOutput) {
                        // Keep output filename stable with the active output map (resume-aware).
                        resolvedFileName = path.join(path.dirname(fileName), mappedOutput);

                        const cacheCandidates: Array<{ fileName: string; mapPath: string }> = [
                            { fileName: mappedOutput, mapPath: outputMappingPath }
                        ];
                        const mappedReuse = validatedExperimentalReuseMappings.get(taskKey);
                        if (mappedReuse && mappedReuse !== mappedOutput) {
                            cacheCandidates.push({ fileName: mappedReuse, mapPath: reuseMappingPath });
                        }

                        const allCandidateMapPaths = Array.from(
                            new Set(
                                [
                                    outputMappingPath,
                                    reuseMappingPath,
                                    ...cacheCandidates.map((candidate) => candidate.mapPath)
                                ].filter((candidatePath): candidatePath is string => !!candidatePath)
                            )
                        );

                        let cachedPath: string | null = null;
                        for (const candidate of cacheCandidates) {
                            const orderedMapPaths = [
                                candidate.mapPath,
                                ...allCandidateMapPaths.filter((p) => p !== candidate.mapPath)
                            ];
                            cachedPath = resolveCachedDraftTestPath(dirForReuse, candidate.fileName, {
                                taskKey,
                                testFileMapPaths: orderedMapPaths
                            });
                            if (cachedPath) {
                                break;
                            }
                        }

                        if (cachedPath) {
                            try {
                                cachedDraftTestCode = fs.readFileSync(cachedPath, 'utf8');
                                console.log(`[EXPERIMENTAL] Loaded cached draft test: ${cachedPath}`);
                            } catch (e) {
                                console.warn('[EXPERIMENTAL] Failed to read cached draft test (continuing):', e);
                            }
                        } else {
                            console.warn(
                                `[EXPERIMENTAL] No cached draft test found under dirForReuse: ${dirForReuse} ` +
                                `for candidates: ${cacheCandidates.map((c) => c.fileName).join(', ')} ` +
                                `(taskKey=${taskKey}, mapPaths=${allCandidateMapPaths.join(', ')})`
                            );
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
                        path.relative(workspace, document.uri.fsPath),
                        symbol.range.start.line + 1,
                        symbol.range.start.line
                    );
                    console.log(`#### Test Code: ${result}`);
                    return result;
                } else {
                    await continuityManager.markTaskComplete(
                        symbol.name,
                        path.relative(workspace, document.uri.fsPath),
                        symbol.range.start.line + 1,
                        symbol.range.start.line,
                        'Generated empty test code.',
                        false
                    );
                    console.log(`#### Test Code: ${result}`);
                    return result;
                }
            } catch (error) {
                // Track failed tasks for all experiments
                await continuityManager.markTaskComplete(
                    symbol.name,
                    path.relative(workspace, document.uri.fsPath),
                    symbol.range.start.line + 1,
                    symbol.range.start.line,
                    error instanceof Error ? error.message : String(error),
                    false
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
    const config = getConfigInstance();
    const resolvedSavePath = path.isAbsolute(config.savePath)
        ? config.savePath
        : path.join(config.workspace, config.savePath);
    const symbolFilePairs = symbols.map(({symbol, document}) => {
        return {
            symbol,
            document,
            fileName: generateFileNameForDiffLanguage(document, symbol, resolvedSavePath, languageId, [],0)
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
