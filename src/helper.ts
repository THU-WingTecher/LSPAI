import path from "path";
import vscode from "vscode";
import { SRC_PATHS } from "./config";
import { isSymbolLessThanLines, ProjectName } from "./experiment";
import { findFiles } from "./fileHandler";
import { getLanguageSuffix } from "./language";
import { getAllSymbols } from "./lsp";
import { getConfigInstance } from "./config";
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
    const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

	for (const filePath of Files) {
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