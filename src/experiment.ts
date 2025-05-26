import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { saveTaskList } from './helper';
import { getConfigInstance, GenerationType, PromptType, FixType, SRC_PATHS, ProjectName, Provider } from './config';
import { generateFileNameForDiffLanguage } from './fileHandler';
import { generateUnitTestForAFunction } from './generate';
import { activate } from './lsp';
import { createCFGBuilder } from './cfg/builderFactory';
import { PathCollector } from './cfg/path';
import { SupportedLanguage } from './ast';
import { ExpLogger } from './log';
import pLimit from 'p-limit';
const limit = pLimit(1);

export async function collectPathforSymbols(
    symbols: any, // Use the correct type if available
) {
    if (process.env.NODE_DEBUG !== 'true') {
        console.log('activate');
        await activate();
    }

    const savePath = path.join("lspai-workspace", "cfg-path-results", getConfigInstance().timeStamp);
    getConfigInstance().updateConfig({
        savePath: savePath
    });
    const workspace = getConfigInstance().workspace;
    const projectName = path.basename(workspace);
    let currentSrcPath;
    if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
        currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
    } else {
        currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
    }
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
    }>;

    // Find matching symbols
    const matchedSymbols = allSymbols.filter(({ symbol, document }) => {
        const currentRelativePath = path.relative(workspaceFolderPath, document.uri.fsPath);
        
        // Find a matching entry in taskList
        const matchingTask = taskList.find(task => 
            task.symbolName === symbol.name && 
            task.relativeDocumentPath === currentRelativePath
        );

        return matchingTask !== undefined;
    });

    console.log(`Found ${matchedSymbols.length} matching symbols from taskList`);
    return matchedSymbols;
}

export async function runGenerateTestCodeSuite(
    generationType: GenerationType,
    fixType: FixType,
    promptType: PromptType,
    model: string,
    provider: Provider,
    symbols: any, // Use the correct type if available
    languageId: string
) {
    if (process.env.NODE_DEBUG !== 'true') {
        console.log('activate');
        await activate();
    }
    getConfigInstance().updateConfig({
        generationType,
        fixType,
        promptType,
        model: model,
        provider: provider
    });
    const savePath = getConfigInstance().genSaveName();
    getConfigInstance().updateConfig({
        savePath: savePath
    });
    const workspace = getConfigInstance().workspace;
    const projectName = path.basename(workspace);
    let currentSrcPath;
    if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
        currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
    } else {
        currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
    }

    const symbolFilePairsToTest = getSymbolFilePairsToTest(symbols, languageId);
    await saveTaskList(symbolFilePairsToTest, workspace, getConfigInstance().savePath);
    // for (const symbolFilePair of symbolFilePairsToTest) {
    //     const { document, symbol, fileName } = symbolFilePair;
    //     const result = await generateUnitTestForAFunction(
    //         currentSrcPath,
    //         document, 
    //         symbol, 
    //         fileName, 
    //         false,
    //     );
    //     console.log(`#### Test Code: ${result}`);
    // }

    const testGenerationPromises = symbolFilePairsToTest.map(symbolFilePair => 
        limit(async () => {
            const { document, symbol, fileName } = symbolFilePair;
            const result = await generateUnitTestForAFunction(
                currentSrcPath,
                document, 
                symbol, 
                fileName, 
                false,
            );
            console.log(`#### Test Code: ${result}`);
            return result;
        })
    );

    const results = await Promise.all(testGenerationPromises);
    const logPath = getConfigInstance().logSavePath;
    console.log(`#### Log path: ${logPath}`);
    assert.ok(fs.existsSync(logPath), 'log path should exist');
    const llmlogs = fs.readdirSync(logPath).filter(file => file.endsWith('llm_logs.json'));
    assert.ok(llmlogs.length > 0, 'llm_logs.json should exist');
    if (getConfigInstance().fixType != FixType.NOFIX && getConfigInstance().generationType != GenerationType.NAIVE) {
        const diagnosticReportFolder = path.join(logPath, 'diagnostic_report');
        const diagnosticReports = await findJsonFilesRecursively(diagnosticReportFolder);
        console.log(`#### Diagnostic reports: ${diagnosticReports.length}`);
        // assert.equal(diagnosticReports.length, symbolFilePairsToTest.length, 'diagnostic_report json files should exist for each function');
    }
    if (getConfigInstance().generationType === GenerationType.CFG) {
        const pathFolder = path.join(logPath, 'paths');
        const paths = await findJsonFilesRecursively(pathFolder);
        console.log(`#### Paths: ${paths.length}`);
        // assert.equal(paths.length, symbolFilePairsToTest.length, 'paths json files should exist for each function');
    }
    const taskListPath = path.join(getConfigInstance().savePath, 'taskList.json');
    assert.ok(fs.existsSync(taskListPath), 'taskList.json should exist');
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
// import * as vscode from 'vscode';
// import * as fs from 'fs';
// import * as path from 'path';
// import { BASELINE } from "./invokeLLM";
// import { getAllSymbols } from './lsp';
// import { findFiles, generateFileNameForDiffLanguage, generateTimestampString } from './fileHandler';
// import { getLanguageSuffix } from './language';
// import { generateUnitTestForAFunction } from './generate';
// import { getConfigInstance, SRC_PATHS, GenerationType } from './config';
// // Constants for experiment settings
// const MIN_FUNCTION_LINES = 4;
// export const DEFAULT_FILE_ENCODING = 'utf8';
// const MAX_ROUNDS = 5;

// // Constants for file paths and extensions
// const INTERMEDIATE_FOLDER_PREFIX = 'temp_';
// const RESULTS_FOLDER_PREFIX = 'results_';
// export const NAIVE_PREFIX = "naive_";

// // Constants for time formatting
// const TIME_ZONE = 'CST';
// export const TIME_FORMAT_OPTIONS = { timeZone: TIME_ZONE, hour12: false };

// export type ProjectName = keyof typeof SRC_PATHS;

// // Add these constants near the top with other constants
// const SEED = 12345; // Fixed seed for reproducibility
// let seededRandom: () => number;

// // Add this function near other utility functions
// function initializeSeededRandom(seed: number) {
//     seededRandom = function() {
//         seed = (seed * 16807) % 2147483647;
//         return (seed - 1) / 2147483646;
//     };
// }

// // export async function _experiment(srcPath: string, language: string, methods: string[]) : Promise<{[key: string]: boolean[]}> {

// //     let folderPath: string;
// //     let expLogPath: string;
// //     if (!vscode.workspace.workspaceFolders) {
// //         folderPath = path.join(srcPath, RESULTS_FOLDER_PREFIX + generateTimestampString());
// //         getConfigInstance().updateConfig({
// //             savePath: folderPath
// //         });
// //         expLogPath = path.join(folderPath, "logs");
// //         const projectName = path.basename(srcPath);
// //         if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
// //             srcPath = path.join(srcPath, SRC_PATHS[projectName as ProjectName]);
// //         } else {
// //             srcPath = path.join(srcPath, SRC_PATHS.DEFAULT);
// //         }
// //     } else {
// //         const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
// //         folderPath = path.join(workspace, RESULTS_FOLDER_PREFIX + generateTimestampString());
// //         expLogPath = path.join(folderPath, "logs");
// //         getConfigInstance().updateConfig({
// //             savePath: folderPath
// //         });
// //     }

// //     console.log(`Testing the folder of ${srcPath}`);
// //     console.log(`saving the result to ${folderPath}`);
// //     console.log(`Model: ${getConfigInstance().model}`);
// //     console.log(`Methods: ${methods}`);
// //     console.log(`Max Rounds: ${MAX_ROUNDS}`);
// //     console.log(`Experiment Log Folder: ${expLogPath}`);
// //     console.log(`EXP_PROB_TO_TEST: ${getConfigInstance().expProb}`);
// //     console.log(`PARALLEL: ${getConfigInstance().parallelCount}`);
// // 	const suffix = getLanguageSuffix(language); 
// // 	const Files: string[] = [];
// // 	findFiles(srcPath, Files, language, suffix);	
// // 	const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

// // 	initializeSeededRandom(SEED); // Initialize the seeded random generator
	
// // 	for (const filePath of Files) {
// // 		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
// // 		console.log(`#### Preparing symbols under file: ${filePath}`);
// // 		const symbols = await getAllSymbols(document.uri);
// // 		if (symbols) {
// // 			for (const symbol of symbols) {
// // 				if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
// // 					// if (language === 'java' && !isPublic(symbol, document)) {
// // 					// 	continue;
// // 					// }
// // 					if (isSymbolLessThanLines(symbol)){
// // 						continue;
// // 					}
// // 					if (seededRandom() < getConfigInstance().expProb) { 
// // 						symbolDocumentMap.push({ symbol, document });
// // 					}
// // 				}
// // 			}
// // 		}
// // 		console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
// // 	}
// // 	const generatedResults: { [key: string]: boolean[] } = {};
    
// // 	for (const method of methods) {
// // 		console.log(`#### Starting experiment for method: ${method}`);
// // 		generatedResults[method] = await parallelGenUnitTestForSymbols(symbolDocumentMap, srcPath, folderPath, language, method, getConfigInstance().parallelCount);
// // 	}
// // 	console.log('#### Experiment completed!');

// //     console.log(`Testing the folder of ${srcPath}`);
// //     console.log(`saving the result to ${folderPath}`);
// //     console.log(`Model: ${getConfigInstance().model}`);
// //     console.log(`Methods: ${methods}`);
// //     console.log(`Max Rounds: ${MAX_ROUNDS}`);
// //     console.log(`Experiment Log Folder: ${expLogPath}`);
// //     console.log(`EXP_PROB_TO_TEST: ${getConfigInstance().expProb}`);
// //     console.log(`PARALLEL: ${getConfigInstance().parallelCount}`);
// // 	return generatedResults;
// // }

// export function isGenerated(document: vscode.TextDocument, target: vscode.DocumentSymbol, origFolderPath: string, tempFolderPath: string, round: number): boolean {
// 	const res = generateFileNameForDiffLanguage(document, target, tempFolderPath, document.languageId, [], round);
// 	if (fs.existsSync(res.fileName.replace(tempFolderPath, origFolderPath))) {
// 		return true;
// 	} else {
// 		return false;
// 	}
// }
// // export async function reExperiment(language: string, methods: string[], origFilePath: string) : Promise<void> {

// //     let currentSrcPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
// // 	const projectName = vscode.workspace.workspaceFolders![0].name;
// // 	if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
// // 		currentSrcPath = path.join(currentSrcPath, SRC_PATHS[projectName as ProjectName]);
// // 	} else {
// // 		currentSrcPath = path.join(currentSrcPath, SRC_PATHS.DEFAULT);
// // 	}
// //     const tempFolderPath = path.join(origFilePath, 'temp');
// //     console.log(`Re Experimenting the folder of ${origFilePath}`);
// //     console.log(`saving the result to ${tempFolderPath}`);
// //     console.log(`Model: ${getConfigInstance().model}`);
// //     console.log(`Methods: ${methods}`);
// //     console.log(`Max Rounds: ${MAX_ROUNDS}`);
// //     console.log(`EXP_PROB_TO_TEST: ${getConfigInstance().expProb}`);
// //     console.log(`PARALLEL: ${getConfigInstance().parallelCount}`);
// // 	const suffix = getLanguageSuffix(language); 
// // 	const Files: string[] = [];
// // 	const Generated: string[] = [];
// // 	findFiles(currentSrcPath, Files, language, suffix);
// //     const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

// // 	initializeSeededRandom(SEED); // Initialize the seeded random generator
	
// // 	for (const method of methods) {
// // 		for (const filePath of Files) {
// //             const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
// //             console.log(`#### Preparing symbols under file: ${filePath}`);
// //             const symbols = await getAllSymbols(document.uri);
// //             if (symbols) {
// //                 for (const symbol of symbols) {
// //                     if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
// //                         // if (language === 'java' && !isPublic(symbol, document)) {
// //                         // 	continue;
// //                         // }
// //                         if (isSymbolLessThanLines(symbol)){
// //                             continue;
// //                         }
// //                         if (seededRandom() < getConfigInstance().expProb) { 
// //                             if (isGenerated(document, symbol, path.join(origFilePath, method), path.join(tempFolderPath, method))){
// //                                 continue;
// //                             }
// //                             symbolDocumentMap.push({ symbol, document });
// //                         }
// //                     }
// //                 }
// //             }
// //             console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
// //         }
// // 		const generatedResults: { [key: string]: boolean[] } = {};
// // 		console.log(`#### Starting experiment for method: ${method}`);
// // 		generatedResults[method] = await parallelGenUnitTestForSymbols(symbolDocumentMap, currentSrcPath, origFilePath, language, method, getConfigInstance().parallelCount);
// // 	}
// // 	console.log('#### Experiment completed!');
// // }

// function isPublic(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): boolean {
// 	const funcDefinition = document.lineAt(symbol.selectionRange.start.line).text;
// 	return funcDefinition.includes('public') || false;
// }

// // Function to get source path based on project type
// // function getPythonSourcePath(workspace: string): string {
// //     if (workspace.includes("black")) {
// //         return `${workspace}${PYTHON_SRC_PATHS.BLACK}`;
// //     } else if (workspace.includes("crawl4ai")) {
// //         return `${workspace}${PYTHON_SRC_PATHS.CRAWL4AI}`;
// //     }
// //     return `${workspace}${PYTHON_SRC_PATHS.DEFAULT}`;
// // }

// // Function to generate result folder path
// function generateResultFolderPath(workspace: string): string {
//     return `${workspace}/${RESULTS_FOLDER_PREFIX}${generateTimestampString()}/`;
// }

// export function sleep(ms: number): Promise<void> {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

// export async function experiment(language: string, genMethods: string[]): Promise<void> {
// 	let currentSrcPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
// 	const projectName = vscode.workspace.workspaceFolders![0].name;
// 	if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
// 		currentSrcPath = path.join(currentSrcPath, SRC_PATHS[projectName as ProjectName]);
// 	} else {
// 		currentSrcPath = path.join(currentSrcPath, SRC_PATHS.DEFAULT);
// 	}
// 	const results = await _experiment(currentSrcPath, language, genMethods);
// 	for (const method in results) {
// 		console.log(method, 'Results:', results);
// 		const successCount = results[method].filter(result => result).length;
// 		console.log(`${method}-Success: ${successCount}/${results[method].length}`);
// 	}
// 	vscode.window.showInformationMessage('Experiment Ended!');
// }

// export function isSymbolLessThanLines(symbol: vscode.DocumentSymbol): boolean {
//     return symbol.range.end.line - symbol.range.start.line < MIN_FUNCTION_LINES;
// }

// export function goSpecificEnvGen(folderName: string, language: string, srcPath: string): string {
//     // Create the new folder path
//     const newFolder = folderName;
//     const suffix = getLanguageSuffix(language); 
//     const Files: string[] = [];

//     // Find all source code files
//     findFiles(srcPath, Files, language, suffix);
	
//     // Copy all source code files to the new folder, preserving directory structure
//     Files.forEach(file => {
//         // Calculate the relative destination directory and file name
//         const relativeDir = path.relative(srcPath, path.dirname(file));
//         console.log(path.dirname(file), relativeDir);
//         const destDir = path.join(newFolder, relativeDir);
//         const destFile = path.join(destDir, path.basename(file));

//         // Ensure the destination directory exists
//         if (!fs.existsSync(destDir)) {
//             fs.mkdirSync(destDir, { recursive: true });
//         }

//         // Try to copy the file
//         try {
//             fs.copyFileSync(file, destFile);
//         } catch (err) {
//             console.error(`Error copying file ${file} to ${destFile}: ${err}`);
//         }
//     });

//     return newFolder;
// }

// async function parallelGenUnitTestForSymbols(
//     symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[], 
// 	currentSrcPath: string,
// 	currentTestPath: string,
//     language: string, 
//     method: string, 
//     num_parallel: number,
//     round: number
// ) {
//     const generatedResults: any[] = [];
// 	const historyPath = path.join(currentTestPath, "history");
//     const folderPath = path.join(currentTestPath, method);    
// 	const expLogPath = path.join(currentTestPath, "logs");
//     const filePaths: string[] = [];
//     if (language === 'go') {
//         const res = goSpecificEnvGen(folderPath, language, currentSrcPath);
//     }
//     const symbolFilePairs = symbolDocumentMap.map(({symbol, document}) => {
//         return generateFileNameForDiffLanguage(document, symbol, folderPath, language, filePaths, round);
//     });

//     for (let i = 0; i < symbolFilePairs.length; i += num_parallel) {
//         const batch = symbolFilePairs.slice(i, i + num_parallel);
//         const symbolTasks = batch.map(async ({ document, symbol, fileName }) => {
//             console.log(`#### Processing symbol ${symbol.name}`);
//             const result = await generateUnitTestForAFunction(
// 				currentSrcPath,
//                 document, 
//                 symbol, 
//                 getConfigInstance().model,
//                 MAX_ROUNDS,
//                 fileName, 
//                 method,
//                 historyPath,
//                 expLogPath,
//                 false, // in parallel setting, we don't show code
//             );
//             vscode.window.showInformationMessage(`[Progress:${generatedResults.length}] Unit test (${method}) for ${symbol.name} generated!`);
//             generatedResults.push(result);
//         });
//         await Promise.all(symbolTasks.map(task => 
//             Promise.race([
//                 task,
//                 sleep(getConfigInstance().timeoutMs).then(() => console.warn('Timeout exceeded for symbol processing'))
//             ])
//         ));
//     }
//     vscode.window.showInformationMessage(`Unit test for all ${symbolDocumentMap.map(item => item.symbol.name).join(', ')} generated!`);
//     return generatedResults;
// }