import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BASELINE, getModelName } from "./invokeLLM";
import { getAllSymbols } from './utils';
import { findFiles, generateFileNameForDiffLanguage, generateTimestampString } from './fileHandler';
import { getLanguageSuffix } from './language';
import { generateUnitTestForAFunction } from './generate';
import { currentExpProb, currentParallelCount, currentModel } from './config';
import { activate } from './lsp';
// Constants for experiment settings
const MIN_FUNCTION_LINES = 4;
export const DEFAULT_FILE_ENCODING = 'utf8';
const MAX_ROUNDS = 5;
const TIMEOUT_MS = 300 * 1000;


// Constants for file paths and extensions
const INTERMEDIATE_FOLDER_PREFIX = 'temp_';
const RESULTS_FOLDER_PREFIX = 'results_';
export const NAIVE_PREFIX = "naive_";

// Constants for time formatting
const TIME_ZONE = 'CST';
export const TIME_FORMAT_OPTIONS = { timeZone: TIME_ZONE, hour12: false };

// Constants for specific project paths
const SRC_PATHS = {
	"commons-cli": '/src/main/',
	"commons-csv": 'src/main/',
    "black": '/src',
    "crawl4ai": '/crawl4ai',
    DEFAULT: '/'
} as const;

type ProjectName = keyof typeof SRC_PATHS;

// Add these constants near the top with other constants
const SEED = 12345; // Fixed seed for reproducibility
let seededRandom: () => number;

// Add this function near other utility functions
function initializeSeededRandom(seed: number) {
    seededRandom = function() {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };
}

/**
 * Save the symbol-document pairs to a JSON file named 'taskList.json'.
 * 
 * - Symbol: we store only `symbol.name`.
 * - Document: we store the relative path (instead of absolute).
 */
async function saveTaskList(
    symbolDocumentMap: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[],
    workspaceFolderPath: string,
    outputFolderPath: string
): Promise<void> {
    const taskListFilePath = path.join(outputFolderPath, "taskList.json");

    // Build the data to be written
    const data = symbolDocumentMap.map(({ symbol, document }) => {
        const relativePath = path.relative(workspaceFolderPath, document.uri.fsPath);
        return {
            symbolName: symbol.name,
            sourceCode: document.getText(symbol.range),
            lineNum: symbol.range.end.line - symbol.range.start.line,
            relativeDocumentPath: relativePath
        };
    });

    // Write to JSON file
    await fs.promises.mkdir(path.dirname(taskListFilePath), { recursive: true });
    await fs.promises.writeFile(taskListFilePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`Task list has been saved to ${taskListFilePath}`);
}
/**
 * Load symbols specified in 'taskList.json' from the already collected symbol-document list.
 * 
 * - Reads 'taskList.json' and matches each entry against the provided allSymbols array.
 * - If symbolName and relative path match, that pair is included in the returned array.
 */
async function extractSymbolDocumentMapFromTaskList(
    workspaceFolderPath: string,
    allCollectedSymbols: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[],
    taskListFilePath: string
): Promise<{ symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[]> {
    // Read the file
    const buffer = await fs.promises.readFile(taskListFilePath, "utf8");
    const taskList = JSON.parse(buffer) as any;

    const matchedSymbols: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[] = [];

    // For each entry in taskList, find matching symbol-document in allCollectedSymbols
    for (const taskItem of taskList) {
        const { symbolName, sourceCode, lineNum, relativeDocumentPath } = taskItem;

        // Attempt to find a corresponding item in allCollectedSymbols
        const matched = allCollectedSymbols.find(({ symbol, document }) => {
            const currentRelativePath = path.relative(workspaceFolderPath, document.uri.fsPath);
            return symbol.name === symbolName && currentRelativePath === relativeDocumentPath;
        });

        if (matched) {
            matchedSymbols.push(matched);
        }
    }

    console.log(`Loaded ${matchedSymbols.length} matching symbol-document pairs from taskList.`);
    return matchedSymbols;
}

async function _experiment(srcPath: string, language: string, methods: string[], taskListPath: string) : Promise<{[key: string]: boolean[]}> {
	const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
	const folderPath = path.join(workspace, RESULTS_FOLDER_PREFIX + generateTimestampString());
	const expLogPath = path.join(folderPath, "logs");

    console.log(`Testing the folder of ${srcPath}`);
    console.log(`saving the result to ${folderPath}`);
    console.log(`Model: ${currentModel}`);
    console.log(`Methods: ${methods}`);
    console.log(`Max Rounds: ${MAX_ROUNDS}`);
    console.log(`Experiment Log Folder: ${expLogPath}`);
    console.log(`EXP_PROB_TO_TEST: ${currentExpProb}`);
    console.log(`PARALLEL: ${currentParallelCount}`);
	const suffix = getLanguageSuffix(language); 
	const Files: string[] = [];
	findFiles(srcPath, Files, language, suffix);	
	let symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

	initializeSeededRandom(SEED); // Initialize the seeded random generator
	
	for (const filePath of Files) {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
		console.log(`#### Preparing symbols under file: ${filePath}`);
        await activate(document.uri);
		const symbols = await getAllSymbols(document.uri);
		if (symbols) {
			for (const symbol of symbols) {
				if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
					// if (language === 'java' && !isPublic(symbol, document)) {
					// 	continue;
					// }
					if (isSymbolLessThanLines(symbol)){
						continue;
					}
					if (seededRandom() < currentExpProb) { 
						symbolDocumentMap.push({ symbol, document });
					}
				}
			}
		}
		console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
	}
	const generatedResults: { [key: string]: boolean[] } = {};
    if (taskListPath) {
        symbolDocumentMap = await extractSymbolDocumentMapFromTaskList(
            workspace,
            symbolDocumentMap,
            taskListPath
        );
    } else {
        saveTaskList(symbolDocumentMap, workspace, folderPath);
    }
	for (const method of methods) {
		console.log(`#### Starting experiment for method: ${method}`);
		generatedResults[method] = await parallelGenUnitTestForSymbols(symbolDocumentMap, srcPath, folderPath, language, method, currentParallelCount);
	}
	console.log('#### Experiment completed!');

    console.log(`Testing the folder of ${srcPath}`);
    console.log(`saving the result to ${folderPath}`);
    console.log(`Model: ${currentModel}`);
    console.log(`Methods: ${methods}`);
    console.log(`Max Rounds: ${MAX_ROUNDS}`);
    console.log(`Experiment Log Folder: ${expLogPath}`);
    console.log(`EXP_PROB_TO_TEST: ${currentExpProb}`);
    console.log(`PARALLEL: ${currentParallelCount}`);
	return generatedResults;
}

export function isGenerated(document: vscode.TextDocument, target: vscode.DocumentSymbol, origFolderPath: string, tempFolderPath: string): boolean {
	const res = generateFileNameForDiffLanguage(document, target, tempFolderPath, document.languageId, [])
	if (fs.existsSync(res.fileName.replace(tempFolderPath, origFolderPath))) {
		return true;
	} else {
		return false;
	}
}
// export async function reExperiment(language: string, methods: string[], origFilePath: string) : Promise<void> {
// 	logCurrentSettings()
// 	const tempFolderPath = `${currentTestPath}temp_${Math.random().toString(36).substring(2, 15)}/`;
// 	const suffix = getLanguageSuffix(language); 

// 	function findFiles(folderPath: string, Files: string[] = []) {
// 		fs.readdirSync(folderPath).forEach(file => {
// 			const fullPath = path.join(folderPath, file);
// 			if (fs.statSync(fullPath).isDirectory()) {
// 				findFiles(fullPath, Files); // Recursively search in subdirectory
// 			} else if (file.endsWith(`.${suffix}`)) {
// 				if (language === "go" && file.toLowerCase().includes('test')) {
// 					console.log(`Ignoring test file: ${fullPath}`);
// 				} else {
// 					Files.push(fullPath);
// 				}
// 			}
// 		});
// 	}
// 	const Files: string[] = [];
// 	const Generated: string[] = [];
// 	findFiles(currentSrcPath, Files);
// 	const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];
// 	let origFinalFilePath;
// 	for (const method of methods) {
// 		for (const filePath of Files) {
// 				const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
// 				console.log(`#### Preparing symbols under file: ${filePath}`);
// 				const symbols = await getAllSymbols(document.uri);
// 				if (symbols) {
// 					for (const symbol of symbols) {
// 						if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
// 							origFinalFilePath = path.join(origFilePath, method);
// 							if (isGenerated(document, symbol, origFinalFilePath, path.join(tempFolderPath, method))){
// 								continue;
// 							}
// 							// if (language === 'java' && !isPublic(symbol, document)) {
// 							// 	continue;
// 							// }
// 							if (isSymbolLessThanLines(symbol)){
// 								continue;
// 							}
// 							vscode.window.showInformationMessage(`Found leak file : ${origFinalFilePath}`);
// 							symbolDocumentMap.push({ symbol, document });
// 						}
// 					}
// 				}
// 				console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
// 			}
// 		const generatedResults: { [key: string]: boolean[] } = {};
// 		console.log(`#### Starting experiment for method: ${method}`);
// 		generatedResults[method] = await parallelGenUnitTestForSymbols(symbolDocumentMap, language, method, currentParallelCount);
// 	}
// 	console.log('#### Experiment completed!');
// 	logCurrentSettings();
// }

function isPublic(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): boolean {
	const funcDefinition = document.lineAt(symbol.selectionRange.start.line).text;
	return funcDefinition.includes('public') || false;
}

// Function to get source path based on project type
// function getPythonSourcePath(workspace: string): string {
//     if (workspace.includes("black")) {
//         return `${workspace}${PYTHON_SRC_PATHS.BLACK}`;
//     } else if (workspace.includes("crawl4ai")) {
//         return `${workspace}${PYTHON_SRC_PATHS.CRAWL4AI}`;
//     }
//     return `${workspace}${PYTHON_SRC_PATHS.DEFAULT}`;
// }

// Function to generate result folder path
function generateResultFolderPath(workspace: string): string {
    return `${workspace}/${RESULTS_FOLDER_PREFIX}${generateTimestampString()}/`;
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function experiment(language: string, genMethods: string[], taskListPath: string = ""): Promise<void> {
	let currentSrcPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
	const projectName = vscode.workspace.workspaceFolders![0].name;
	if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
		currentSrcPath = path.join(currentSrcPath, SRC_PATHS[projectName as ProjectName]);
	} else {
		currentSrcPath = path.join(currentSrcPath, SRC_PATHS.DEFAULT);
	}
	const results = await _experiment(currentSrcPath, language, genMethods, taskListPath);
	for (const method in results) {
		console.log(method, 'Results:', results);
		const successCount = results[method].filter(result => result).length;
		console.log(`${method}-Success: ${successCount}/${results[method].length}`);
	}
	vscode.window.showInformationMessage('Experiment Ended!');
}

export function isSymbolLessThanLines(symbol: vscode.DocumentSymbol): boolean {
    return symbol.range.end.line - symbol.range.start.line < MIN_FUNCTION_LINES;
}

export function goSpecificEnvGen(folderName: string, language: string, srcPath: string): string {
    // Create the new folder path
    const newFolder = folderName;
    const suffix = getLanguageSuffix(language); 
    const Files: string[] = [];

    // Find all source code files
    findFiles(srcPath, Files, language, suffix);
	
    // Copy all source code files to the new folder, preserving directory structure
    Files.forEach(file => {
        // Calculate the relative destination directory and file name
        const relativeDir = path.relative(srcPath, path.dirname(file));
        console.log(path.dirname(file), relativeDir);
        const destDir = path.join(newFolder, relativeDir);
        const destFile = path.join(destDir, path.basename(file));

        // Ensure the destination directory exists
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Try to copy the file
        try {
            fs.copyFileSync(file, destFile);
        } catch (err) {
            console.error(`Error copying file ${file} to ${destFile}: ${err}`);
        }
    });

    return newFolder;
}

async function parallelGenUnitTestForSymbols(
    symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[], 
	currentSrcPath: string,
	currentTestPath: string,
    language: string, 
    method: string, 
    num_parallel: number
) {
    const generatedResults: any[] = [];
	const historyPath = path.join(currentTestPath, "history");
    const folderPath = path.join(currentTestPath, method);    
	const expLogPath = path.join(currentTestPath, "logs");
    const showCode = false;
    const filePaths: string[] = []
    if (language === 'go') {
        const res = goSpecificEnvGen(folderPath, language, currentSrcPath);
    }
    const symbolFilePairs = symbolDocumentMap.map(({symbol, document}) => {
        return generateFileNameForDiffLanguage(document, symbol, folderPath, language, filePaths);
    });

    for (let i = 0; i < symbolFilePairs.length; i += num_parallel) {
        const batch = symbolFilePairs.slice(i, i + num_parallel);
        const symbolTasks = batch.map(async ({ document, symbol, fileName }) => {
            console.log(`#### Processing symbol ${symbol.name}`);
            const result = await generateUnitTestForAFunction(
				currentSrcPath,
                document, 
                symbol, 
                getModelName(method),
                MAX_ROUNDS,
                fileName, 
                method,
                historyPath,
                expLogPath,
                showCode
            );
            vscode.window.showInformationMessage(`[Progress:${generatedResults.length}] Unit test (${method}) for ${symbol.name} generated!`);
            generatedResults.push(result);
        });
        await Promise.all(symbolTasks.map(task => 
            Promise.race([
                task,
                sleep(TIMEOUT_MS).then(() => console.warn('Timeout exceeded for symbol processing'))
            ])
        ));
    }
    vscode.window.showInformationMessage(`Unit test for all ${symbolDocumentMap.map(item => item.symbol.name).join(', ')} generated!`);
    return generatedResults;
}

export function isBaseline(method: string): boolean {
	return method.includes(BASELINE);
}
 