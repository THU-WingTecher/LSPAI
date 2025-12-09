import path from "path";
import vscode from "vscode";
import fs from "fs";
import { generateFileNameForDiffLanguage, findFiles } from "./fileHandler";
import { getLanguageSuffix } from "./language";
import { getConfigInstance, getProjectSrcPath, ProjectConfigName } from "./config";
import { generateUnitTestForAFunction } from "./generate";
import assert from "assert";

// Add these constants near the top with other constants
export const SEED = 12345; // Fixed seed for reproducibility
export let seededRandom: () => number;

// Add this function near other utility functions
export function initializeSeededRandom(seed: number) {
    seededRandom = function() {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };
}

export async function updateWorkspaceFolders(workspaceFolders: vscode.WorkspaceFolder[]): Promise<vscode.WorkspaceFolder[]> {
    if (process.env.NODE_DEBUG === 'true') {
        console.log('In debug mode, workspace cannot be updated in programmatically');
        return workspaceFolders;
    }
    return new Promise((resolve, reject) => {
        const currentWorkspaceCount = vscode.workspace.workspaceFolders?.length || 0;
        
        console.log('Updating workspace folders...');
        console.log('Current workspace folders:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
        console.log('New workspace folder:', workspaceFolders[0].uri.fsPath);
        
        // Set up event listener BEFORE calling updateWorkspaceFolders
        const disposable = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            console.log('Workspace folders changed event fired');
            console.log('Added:', event.added.map(f => f.uri.fsPath));
            console.log('Removed:', event.removed.map(f => f.uri.fsPath));
            console.log('Current workspace folders:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
            
            disposable.dispose();
            resolve(workspaceFolders);
        });
        
        // Replace all existing workspace folders with the new one in a single operation
        // This follows the pattern: workspace.updateWorkspaceFolders(0, 1, { uri: ...});
        const result = vscode.workspace.updateWorkspaceFolders(
            0,  // Start at index 0
            currentWorkspaceCount,  // Remove all existing workspace folders
            {
                uri: workspaceFolders[0].uri,
                name: workspaceFolders[0].name
            }
        );
        
        if (!result) {
            console.error('Failed to update workspace folders - invalid operation');
            disposable.dispose();
            reject(new Error('Failed to update workspace folders'));
        } else {
            console.log('Workspace update operation initiated successfully');
            
            // Set a timeout in case the event doesn't fire
            setTimeout(() => {
                disposable.dispose();
                console.warn('Timeout waiting for workspace change event, resolving anyway');
                resolve(workspaceFolders);
            }, 5000);
        }
    });
}

export function setWorkspaceFolders(projectPath: string): vscode.WorkspaceFolder[] {
    getConfigInstance().updateConfig({
        workspace: projectPath
    });
    const projectName = path.basename(projectPath);
    const workspaceFolders: vscode.WorkspaceFolder[] = [
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
// export async function saveTaskList(
//     symbolDocumentMap: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[],
//     workspaceFolderPath: string,
//     outputFolderPath: string
// ): Promise<void> {
//     const taskListFilePath = path.join(outputFolderPath, "taskList.json");

//     // Build the data to be written
//     const data = symbolDocumentMap.map(({ symbol, document }) => {
//         const relativePath = path.relative(workspaceFolderPath, document.uri.fsPath);
//         let importString = ""
//         if (document.languageId === "python") {
//             importString = genPythonicSrcImportStatement(document.getText());
//         }
//         return {
//             symbolName: symbol.name,
//             sourceCode: document.getText(symbol.range),
//             importString: importString,
//             lineNum: symbol.range.end.line - symbol.range.start.line,
//             relativeDocumentPath: relativePath
//         };
//     });

//     // Write to JSON file
//     await fs.promises.mkdir(path.dirname(taskListFilePath), { recursive: true });
//     await fs.promises.writeFile(taskListFilePath, JSON.stringify(data, null, 2), "utf8");
//     console.log(`Task list has been saved to ${taskListFilePath}`);
// }
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
    assert.ok(matchedSymbols.length === taskList.length, `matchedSymbols.length !== taskList.length: ${matchedSymbols.length} !== ${taskList.length}`);
    return matchedSymbols;
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
                const fileName = generateFileNameForDiffLanguage(document, symbol, getConfigInstance().savePath, 'java', [], round);
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
    let testFilesPath = "/LSPRAG/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";
    const projectName = path.basename(projectPath);
    testFilesPath = getProjectSrcPath(projectName as ProjectConfigName);
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
    testFilesPath = getProjectSrcPath(projectName as ProjectConfigName);
    const suffix = getLanguageSuffix(language); 
    findFiles(testFilesPath, Files, language, suffix);	
    initializeSeededRandom(SEED); // Initialize the seeded random generator
    const randomIndex = Math.floor(Math.random() * Files.length);
    return Files[randomIndex];
}

export function findAFileFromWorkspace(targetFile: string, language: string) {
    if (!vscode.workspace.workspaceFolders && !getConfigInstance().workspace) {
        throw new Error("No workspace folders found");
    }
    let testFilesPath: string;
    const workspace = getConfigInstance().workspace;
    const Files: string[] = [];
    const projectName = path.basename(workspace);
    testFilesPath = getProjectSrcPath(projectName as ProjectConfigName);
    const suffix = getLanguageSuffix(language); 
    findFiles(testFilesPath, Files, language, suffix);	
    return Files.filter(f => f.endsWith(targetFile))[0];
}   
 

