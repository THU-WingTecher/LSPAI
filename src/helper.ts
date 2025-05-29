import path from "path";
import vscode from "vscode";
import fs from "fs";
import { MIN_FUNCTION_LINES, SRC_PATHS } from "./config";
import { ProjectName } from "./config";
import { generateFileNameForDiffLanguage, findFiles } from "./fileHandler";
import { getLanguageSuffix } from "./language";
import { activate, getAllSymbols, getSymbolFromDocument } from "./lsp";
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

// export async function updateWorkspaceFolders(workspaceFolders: vscode.WorkspaceFolder[]) {
//     for (const workspaceFolder of workspaceFolders) {
//         if (vscode.workspace.workspaceFolders?.find(folder => folder.name === workspaceFolder.name)) {
//             console.log('workspaceFolder', workspaceFolder.name, 'already exists');
//         } else {
//             await vscode.workspace.updateWorkspaceFolders(
//                 0,
//                 null,
//                 ...workspaceFolders
//             );
//         }
//     }
//     return workspaceFolders;
// }

export async function updateWorkspaceFolders(workspaceFolders: vscode.WorkspaceFolder[]): Promise<vscode.WorkspaceFolder[]> {
    try {
        // First, remove all existing workspaces
        if (vscode.workspace.workspaceFolders?.length) {
            const removeResult = await vscode.workspace.updateWorkspaceFolders(
                0,  // Start index
                vscode.workspace.workspaceFolders.length  // Number of workspaces to remove
            );
            if (!removeResult) {
                throw new Error('Failed to remove existing workspaces');
            }
        }

        // Wait a bit for the workspace to clear
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('Adding workspace:', workspaceFolders[0].uri.fsPath);
        
        // Then add the new workspace
        const addResult = await vscode.workspace.updateWorkspaceFolders(
            0,  // Start index
            null,  // Number of workspaces to remove (use 0 instead of null)
            // {
            //     uri: vscode.Uri.file(workspaceFolders[0].uri.fsPath),
            //     name: workspaceFolders[0].name
            // }
            ...workspaceFolders
        );

        if (!addResult) {
            throw new Error('Failed to add new workspace');
        }

        // Wait for workspace to be updated
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verify the workspace was updated
        const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
        if (!currentWorkspace) {
            throw new Error('Workspace not properly set after update');
        }

        console.log('Successfully updated workspace to:', currentWorkspace.uri.fsPath);
        return workspaceFolders;

    } catch (error) {
        console.error('Workspace update failed:', error);
        throw error;
    }
}

// export async function updateWorkspaceFolders(workspaceFolders: vscode.WorkspaceFolder[]) {
//     // First, remove all existing workspaces
//     if (vscode.workspace.workspaceFolders?.length) {
//         const removeResult = await vscode.workspace.updateWorkspaceFolders(
//             0,  // Start index
//             vscode.workspace.workspaceFolders.length  // Number of workspaces to remove
//         );
//         if (!removeResult) {
//             console.error('Failed to remove existing workspaces');
//             return workspaceFolders;
//         }
//     }
//     console.log('adding workspaceFolders', workspaceFolders[0].uri.fsPath);
//     console.log('adding workspaceFolders-info', workspaceFolders[0]);
//     // Then add the new workspace
//     const addResult = await vscode.workspace.updateWorkspaceFolders(
//         0,  // Start index
//         null,  // Number of workspaces to remove (0 since we already removed them)
//         workspaceFolders[0]  // Add only the first workspace
//     );
//     const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
//     console.log('currentWorkspace', currentWorkspace?.uri.fsPath);
//     console.log('workspaceFolders', workspaceFolders);
//     if (!addResult) {
//         console.error('Failed to add new workspace');
//     }

//     return workspaceFolders;
// }

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

export function genPythonicSrcImportStatement(text: string) {
    let importString = "";
    // Find import statements including multi-line parenthesized imports
    const importRegex = /^(?:from\s+[\w.]+\s+import\s+(?:\(\s*[\w,.\s]+(?:[\w,.\s]+\s*)*\)|[\w,.\s]+)|import\s+(?:[\w.]+(?:\s*,\s*[\w.]+)*))(?:\s*\))?(?=\s*$|\s*#)/gm;

    // Get all matches
    let matches = text.match(importRegex);
    if (matches) {
        // Process each match to ensure proper parenthesis closure
        importString = matches
            .map(stmt => {
                let lines = stmt.split('\n').map(line => line.trim());
                
                // Clean up each line
                lines = lines.map(line => {
                    // Remove trailing comma
                    line = line.replace(/,\s*$/, '');
                    return line;
                });
                
                stmt = lines.join('\n');
                stmt = stmt.trim();
                // If statement has opening parenthesis but no closing one, add it
                if ((stmt.match(/\(/g) || []).length > (stmt.match(/\)/g) || []).length) {
                    stmt += ')';
                }
                return stmt;
            })
            .filter(stmt => !stmt.match(/^.*(?:import\s+(?:and|in|or|is|not|as)\s*|^\s*and\s*|^\s*,\s*|\s+$)/))
            .join('\n');
    }
    return importString;
}
export async function saveTaskList(
    symbolDocumentMap: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[],
    workspaceFolderPath: string,
    outputFolderPath: string
): Promise<void> {
    const taskListFilePath = path.join(outputFolderPath, "taskList.json");

    // Build the data to be written
    const data = symbolDocumentMap.map(({ symbol, document }) => {
        const relativePath = path.relative(workspaceFolderPath, document.uri.fsPath);
        let importString = ""
        if (document.languageId === "python") {
            importString = genPythonicSrcImportStatement(document.getText());
        }
        return {
            symbolName: symbol.name,
            sourceCode: document.getText(symbol.range),
            importString: importString,
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
export async function extractSymbolDocumentMapFromTaskList(
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

// async function _experiment(srcPath: string, language: string, methods: string[]) : Promise<{[key: string]: boolean[]}> {
// 	const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
// 	const folderPath = path.join(workspace, RESULTS_FOLDER_PREFIX + generateTimestampString());
// 	const expLogPath = path.join(folderPath, "logs");

//     console.log(`Testing the folder of ${srcPath}`);
//     console.log(`saving the result to ${folderPath}`);
//     console.log(`Model: ${currentModel}`);
//     console.log(`Methods: ${methods}`);
//     console.log(`Max Rounds: ${MAX_ROUNDS}`);
//     console.log(`Experiment Log Folder: ${expLogPath}`);
//     console.log(`EXP_PROB_TO_TEST: ${currentExpProb}`);
//     console.log(`PARALLEL: ${currentParallelCount}`);
// 	const suffix = getLanguageSuffix(language); 
// 	const Files: string[] = [];
// 	findFiles(srcPath, Files, language, suffix);	
// 	const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

// 	initializeSeededRandom(SEED); // Initialize the seeded random generator
	
// 	for (const filePath of Files) {
// 		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
// 		console.log(`#### Preparing symbols under file: ${filePath}`);
//         await activate(document.uri);
// 		const symbols = await getAllSymbols(document.uri);
// 		if (symbols) {
// 			for (const symbol of symbols) {
// 				if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
// 					// if (language === 'java' && !isPublic(symbol, document)) {
// 					// 	continue;
// 					// }
// 					if (isSymbolLessThanLines(symbol)){
// 						continue;
// 					}
// 					if (seededRandom() < currentExpProb) { 
// 						symbolDocumentMap.push({ symbol, document });
// 					}
// 				}
// 			}
// 		}
// 		console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
// 	}
// 	const generatedResults: { [key: string]: boolean[] } = {};
//     await saveTaskList(symbolDocumentMap, workspace, folderPath);
//     const matchedSymbols = await extractSymbolDocumentMapFromTaskList(
//         workspace,
//         symbolDocumentMap,
//         path.join(folderPath, "taskList.json")
//     );
// 	// for (const method of methods) {
// 	// 	console.log(`#### Starting experiment for method: ${method}`);
// 	// 	generatedResults[method] = await parallelGenUnitTestForSymbols(symbolDocumentMap, srcPath, folderPath, language, method, currentParallelCount);
// 	// }
// 	console.log('#### Experiment completed!');

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
                const fileName = generateFileNameForDiffLanguage(document, symbol, getConfigInstance().savePath, 'java', [], round)
                const result = await generateUnitTestForAFunction(
                    currentSrcPath,
                    document, 
                    symbol, 
                    fileName, 
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
    // if (MIN_FUNCTION_LINES === -1) {
    //     return false;
    // }
    return symbol.range.end.line - symbol.range.start.line < MIN_FUNCTION_LINES;
}

export function goSpecificEnvGen(folderName: string, language: string, srcPath: string): void {
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
    const workspace = getConfigInstance().workspace;
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

export async function selectOneSymbolFileFromWorkspace(fileName:string, symbolName:string, language:string) : Promise<{symbol: vscode.DocumentSymbol, document: vscode.TextDocument}> {
    const filePath = findAFileFromWorkspace(fileName, language);
    console.log("filePATH :: ", filePath);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const symbol = await getSymbolFromDocument(document, symbolName);
    if (!symbol) {
        throw new Error(`Symbol ${symbolName} not found in file ${filePath}`);
    }
    return {
        symbol,
        document
    };
}

export function findAFileFromWorkspace(targetFile: string, language: string) {
    if (!vscode.workspace.workspaceFolders && !getConfigInstance().workspace) {
        throw new Error("No workspace folders found");
    }
    let testFilesPath: string;
    const workspace = getConfigInstance().workspace;
    const Files: string[] = [];
    const projectName = path.basename(workspace);
    if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
        testFilesPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
    } else {
        testFilesPath = path.join(workspace, SRC_PATHS.DEFAULT);
    }
    const suffix = getLanguageSuffix(language); 
    findFiles(testFilesPath, Files, language, suffix);	
    return Files.filter(f => f.endsWith(targetFile))[0];
}   
 
export async function loadAllTargetSymbolsFromWorkspace(language: string) : 
            Promise<{ symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[]> {
    if (!vscode.workspace.workspaceFolders && !getConfigInstance().workspace) {
        throw new Error("No workspace folders found");
    }
    let testFilesPath: string;
    console.log('all workspace folders', vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath));
    console.log('current workspace', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    const workspace = getConfigInstance().workspace;
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
    const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];
    // if (language === "go") {
    //     await goSpecificEnvGen(getConfigInstance().savePath, language, testFilesPath);
    // }
	for (const filePath of Files) {
        console.log('filePath', filePath);
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
		console.log(`#### Preparing symbols under file: ${filePath}`);
        await activate(document.uri);
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
    console.log(`#### Found ${symbolDocumentMap.length} symbols from ${testFilesPath} that is more than ${MIN_FUNCTION_LINES} lines`);
    return symbolDocumentMap;
}
