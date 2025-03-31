import path from "path";
import vscode from "vscode";
import fs from "fs";
import { MIN_FUNCTION_LINES, SRC_PATHS } from "./config";
import { ProjectName } from "./config";
import { generateFileNameForDiffLanguage, findFiles, _generateFileNameForDiffLanguage } from "./fileHandler";
import { getLanguageSuffix } from "./language";
import { getAllSymbols } from "./lsp";
import { getConfigInstance } from "./config";
import { generateUnitTestForAFunction } from "./generate";

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


export function setWorkspaceFolders(projectPath: string) {
    getConfigInstance().updateConfig({
        workspace: projectPath
    });
    const projectName = path.basename(projectPath);
    const workspaceFolders = [
        {
            uri: vscode.Uri.file(projectPath),
            name: projectName,
            index: 0
        }
    ];
    return workspaceFolders;
}


export async function experiment(symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[], currentSrcPath: string, _round: number) : Promise<any[]> {
    const symbolFilePairs = symbolDocumentMaps.map(({symbol, document}) => {
        return ;
    });    
    const generatedResults: any[] = [];
    const num_parallel = getConfigInstance().parallelCount;
    for (let i = 0; i < symbolDocumentMaps.length; i += num_parallel) {
        const batch = symbolDocumentMaps.slice(i, i + num_parallel);
        const symbolTasks = batch.map(async ({ document, symbol }) => {
            console.log(`#### Processing symbol ${symbol.name}`);
            for (let round = 0; round < getConfigInstance().testNumber; round++) {
                const fileName = _generateFileNameForDiffLanguage(document, symbol, getConfigInstance().savePath, 'java', [], round)
                const result = await generateUnitTestForAFunction(
                    currentSrcPath,
                    document, 
                    symbol, 
                    getConfigInstance().model,
                    getConfigInstance().maxRound,
                    fileName, 
                    getConfigInstance().model,
                    getConfigInstance().historyPath,
                    getConfigInstance().logSavePath,
                    false, // in parallel setting, we don't show code
                );
                if (result.length > 0) {
                    console.log(`[Progress:${generatedResults.length}] Unit test (${getConfigInstance().model}) for ${symbol.name}(round:${round}) generated!`);
                    break;
                } else {
                    console.log(`[Progress:${generatedResults.length}] Unit test (${getConfigInstance().model}) for ${symbol.name}(round:${round}) failed!`);
                }
            }
            vscode.window.showInformationMessage(`[Progress:${generatedResults.length}] Unit test (${getConfigInstance().model}) for ${symbol.name} generated!`);
        });
        await Promise.all(symbolTasks.map(task => 
            Promise.race([
                task,
                sleep(600 * 1000).then(() => console.warn('Timeout exceeded for symbol processing'))
            ])
        ));
    }
    return generatedResults;
}
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


export function isSymbolLessThanLines(symbol: vscode.DocumentSymbol): boolean {
    if (MIN_FUNCTION_LINES === -1) {
        return false;
    }
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

export function setTestFilesPath(projectPath: string) {
    let testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";
    const projectName = path.basename(projectPath);
    if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
        testFilesPath = path.join(projectPath, SRC_PATHS[projectName as ProjectName]);
    } else {
        testFilesPath = path.join(projectPath, SRC_PATHS.DEFAULT);
    }
    return testFilesPath;
}


export function randomlySelectOneFileFromWorkspace(language: string) {
    if (!vscode.workspace.workspaceFolders && !getConfigInstance().workspace) {
        throw new Error("No workspace folders found");
    }
    let testFilesPath: string;
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? getConfigInstance().workspace;
    const Files: string[] = [];
    const projectName = path.basename(workspace);
    if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
        testFilesPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
    } else {
        testFilesPath = path.join(workspace, SRC_PATHS.DEFAULT);
    }
    const suffix = getLanguageSuffix(language); 
    findFiles(testFilesPath, Files, language, suffix);	
    initializeSeededRandom(SEED); // Initialize the seeded random generator
    const randomIndex = Math.floor(Math.random() * Files.length);
    return Files[randomIndex];
}

export async function loadAllTargetSymbolsFromWorkspace(language: string) : 
            Promise<{ symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[]> {
    if (!vscode.workspace.workspaceFolders && !getConfigInstance().workspace) {
        throw new Error("No workspace folders found");
    }
    let testFilesPath: string;
    console.log('current workspace', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? getConfigInstance().workspace;
    const Files: string[] = [];
    const projectName = path.basename(workspace);
    if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
        testFilesPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
    } else {
        testFilesPath = path.join(workspace, SRC_PATHS.DEFAULT);
    }
    const suffix = getLanguageSuffix(language); 
    console.log('testFilesPath', testFilesPath);
    findFiles(testFilesPath, Files, language, suffix);
    initializeSeededRandom(SEED); // Initialize the seeded random generator
    const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

	for (const filePath of Files) {
        console.log('filePath', filePath);
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
		console.log(`#### Preparing symbols under file: ${filePath}`);
		const symbols = await getAllSymbols(document.uri);
        console.log(`#### Symbols: ${symbols.length}`);
		if (symbols) {
			for (const symbol of symbols) {
				if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
					// if (language === 'java' && !isPublic(symbol, document)) {
					// 	continue;
					// }
					if (isSymbolLessThanLines(symbol)){
						continue;
					}
					if (seededRandom() < getConfigInstance().expProb) { 
						symbolDocumentMap.push({ symbol, document });
					}
				}
			}
		}
		console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
	}
    return symbolDocumentMap;
}
