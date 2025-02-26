import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BASELINE } from "./invokeLLM";
import { getAllSymbols } from './utils';
import { findFiles, generateFileNameForDiffLanguage, generateTimestampString } from './fileHandler';
import { getLanguageSuffix } from './language';
import { generateUnitTestForAFunction } from './generate';
import { currentExpProb, currentParallelCount, currentModel } from './config';
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

async function _experiment(srcPath: string, language: string, methods: string[]) : Promise<{[key: string]: boolean[]}> {
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
	const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

	initializeSeededRandom(SEED); // Initialize the seeded random generator
	
	for (const filePath of Files) {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
		console.log(`#### Preparing symbols under file: ${filePath}`);
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
export async function reExperiment(language: string, methods: string[], origFilePath: string) : Promise<void> {

    let currentSrcPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
	const projectName = vscode.workspace.workspaceFolders![0].name;
	if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
		currentSrcPath = path.join(currentSrcPath, SRC_PATHS[projectName as ProjectName]);
	} else {
		currentSrcPath = path.join(currentSrcPath, SRC_PATHS.DEFAULT);
	}
    const tempFolderPath = path.join(origFilePath, 'temp');
    console.log(`Re Experimenting the folder of ${origFilePath}`);
    console.log(`saving the result to ${tempFolderPath}`);
    console.log(`Model: ${currentModel}`);
    console.log(`Methods: ${methods}`);
    console.log(`Max Rounds: ${MAX_ROUNDS}`);
    console.log(`EXP_PROB_TO_TEST: ${currentExpProb}`);
    console.log(`PARALLEL: ${currentParallelCount}`);
	const suffix = getLanguageSuffix(language); 
	const Files: string[] = [];
	const Generated: string[] = [];
	findFiles(currentSrcPath, Files, language, suffix);
    const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

	initializeSeededRandom(SEED); // Initialize the seeded random generator
	
	for (const method of methods) {
		for (const filePath of Files) {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
            console.log(`#### Preparing symbols under file: ${filePath}`);
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
                            if (isGenerated(document, symbol, path.join(origFilePath, method), path.join(tempFolderPath, method))){
                                continue;
                            }
                            symbolDocumentMap.push({ symbol, document });
                        }
                    }
                }
            }
            console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
        }
		const generatedResults: { [key: string]: boolean[] } = {};
		console.log(`#### Starting experiment for method: ${method}`);
		generatedResults[method] = await parallelGenUnitTestForSymbols(symbolDocumentMap, currentSrcPath, origFilePath, language, method, currentParallelCount);
	}
	console.log('#### Experiment completed!');
}

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

export async function experiment(language: string, genMethods: string[]): Promise<void> {
	let currentSrcPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
	const projectName = vscode.workspace.workspaceFolders![0].name;
	if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
		currentSrcPath = path.join(currentSrcPath, SRC_PATHS[projectName as ProjectName]);
	} else {
		currentSrcPath = path.join(currentSrcPath, SRC_PATHS.DEFAULT);
	}
	const results = await _experiment(currentSrcPath, language, genMethods);
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
                currentModel,
                MAX_ROUNDS,
                fileName, 
                method,
                historyPath,
                expLogPath,
                false, // in parallel setting, we don't show code
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
 