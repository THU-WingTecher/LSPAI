/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import { customExecuteDocumentSymbolProvider } from './utils';
import { sleep } from './helper';
export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

export async function getPythonInterpreterPath(): Promise<string> {
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (pythonExtension) {
        await pythonExtension.activate();
        const pythonPath = pythonExtension.exports.settings.getExecutionDetails().execCommand[0];
        return pythonPath;
    }
    return '';
}

export async function setPythonInterpreterPath(pythonInterpreterPath: string) {
    const config = vscode.workspace.getConfiguration('python');
    await config.update(
        'defaultInterpreterPath',
        pythonInterpreterPath,
        vscode.ConfigurationTarget.Workspace
    );

    console.log('Set python.defaultInterpreterPath to', pythonInterpreterPath);
}

export async function getPythonExtraPaths(): Promise<string[]> {
    const config = vscode.workspace.getConfiguration('python');
    return config.get('analysis.extraPaths', []);
}

export async function setPythonExtraPaths(pythonExtraPaths: string[]) {
    const config = vscode.workspace.getConfiguration('python');
    await config.update(
        'analysis.extraPaths',
        pythonExtraPaths,
        vscode.ConfigurationTarget.Workspace
    );

    console.log('Set python.extraPaths to', pythonExtraPaths);
}

export async function closeEditor(editor: vscode.TextEditor) {
    editor.edit(editBuilder => {
        editBuilder.delete(new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(editor.document.lineCount, 0)
        ));
    }).then(() => {
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
}

export async function getSymbolByLocation(document: vscode.TextDocument, location: vscode.Position): Promise<vscode.DocumentSymbol | null> {
    const symbols = await getAllSymbols(document.uri);
    const shortestSymbol = getShortestSymbol(symbols, new vscode.Range(location, location));
    if (shortestSymbol) {
        return shortestSymbol;
    }
    return null;
}
/**
 * Activates the vscode.lsp-sample extension
 */
export async function activate(docUri: vscode.Uri | undefined = undefined) {
	// The extensionId is `publisher.name` from package.json
	const ext = vscode.extensions.getExtension('GwihwanGo.LSPAI');
	if (!ext) {
		throw new Error('Extension not found');
	}	
	await ext.activate();
    console.log("activate docUri", docUri?.path);
	if (docUri) {
		try {
			doc = await vscode.workspace.openTextDocument(docUri);
			// editor = await vscode.window.showTextDocument(doc);
			await sleep(2000); // Wait for server activation
		} catch (e) {
			console.error(e);
		}
	}
}
// const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
//     'vscode.executeDocumentSymbolProvider',
//     document.uri
// );
export async function getTypeInfo(uri: vscode.Uri, position: vscode.Position): Promise<any> {
    const typeInfo = await vscode.commands.executeCommand<vscode.Definition | vscode.Location | null>(
        'vscode.executeTypeDefinitionProvider', uri, position);
    return typeInfo;
}

export const getDocPath = (p: string) => {
	return path.resolve(__dirname, '../manual-testing-sandbox', p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
	const all = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length)
	);
	return editor.edit(eb => eb.replace(all, content));
}

export async function getSymbolFromDocument(document: vscode.TextDocument, symbolName: string): Promise<vscode.DocumentSymbol | null> {
    const symbols = await getAllSymbols(document.uri);
    const symbol = symbols.find(s => s.name.toLocaleLowerCase().includes(symbolName.toLowerCase()));
    return symbol || null;
}


export async function getAllSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
    const allSymbols: vscode.DocumentSymbol[] = [];
    // console.log("sending request to get all symbols");
    const symbols = await customExecuteDocumentSymbolProvider(uri);
    // console.log(`uri = ${uri}, symbols = ${symbols}`);
    function collectSymbols(symbols: vscode.DocumentSymbol[]) {
        // console.log("collecting...")
        for (const symbol of symbols) {
            allSymbols.push(symbol);
            if (symbol.children.length > 0) {
                collectSymbols(symbol.children);
            }
        }
    }

    if (symbols) {
        collectSymbols(symbols);
    }

    return allSymbols;
}

export function getShortestSymbol(symbols: vscode.DocumentSymbol[], range: vscode.Range): vscode.DocumentSymbol | null {
    let shortestSymbol: vscode.DocumentSymbol | null = null;
    for (const symbol of symbols) {
        if (symbol.range.contains(range)) {
            if (!shortestSymbol || (symbol.range.end.line - symbol.range.start.line) < (shortestSymbol.range.end.line - shortestSymbol.range.start.line)) {
                shortestSymbol = symbol;
            }
        }
    }
    return shortestSymbol;
}

export async function getJavaConfiguration(): Promise<any> {
    return vscode.workspace.getConfiguration('java');
}

interface JavaSettings {
    "java.project.referencedLibraries": string[];
    "java.project.sourcePaths": string[];
    "java.project.outputPath": string;
    "java.project.explorer.showNonJavaResources": boolean;
}

export async function updateJavaWorkspaceConfig(settingsPath: string) {
    // Create or update .vscode/settings.json in the workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folders found');
    }

    const vscodePath = path.join(workspaceFolders[0].uri.fsPath, '.vscode');
    const settingsFilePath = path.join(vscodePath, 'settings.json');

    let settings: Partial<JavaSettings> = {};
    try {
        const settingsContent = await vscode.workspace.fs.readFile(vscode.Uri.file(settingsFilePath));
        settings = JSON.parse(settingsContent.toString());
    } catch (error) {
        // File doesn't exist or can't be read, use empty settings
    }

    // Update Java settings
    const updatedSettings: JavaSettings = {
        "java.project.referencedLibraries": ["lib/**/*.jar"],
        "java.project.sourcePaths": ["src/main/java"],
        "java.project.outputPath": "bin",
        "java.project.explorer.showNonJavaResources": false,
        ...settings
    };

    // If settingsPath includes test paths, add them
    if (settingsPath.includes('test')) {
        updatedSettings["java.project.sourcePaths"].push(settingsPath);
    }

    // Ensure .vscode directory exists
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(vscodePath));

    // Write settings file
    await vscode.workspace.fs.writeFile(
        vscode.Uri.file(settingsFilePath),
        Buffer.from(JSON.stringify(updatedSettings, null, 4))
    );

    console.log('Updated Java workspace settings');
}

export async function reloadJavaLanguageServer() {
    try {
        // Clean Java Language Server Workspace
        await vscode.commands.executeCommand('java.clean.workspace');
        
        // Wait for the clean operation to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Force update project configuration
        await vscode.commands.executeCommand('java.projectConfiguration.update');
        
        console.log('Java Language Server reloaded successfully');
    } catch (error) {
        console.error('Error reloading Java Language Server:', error);
        throw error;
    }
}

export async function addJavaTestPath(testPath: string) {
    try {
        await updateJavaWorkspaceConfig(testPath);
        await reloadJavaLanguageServer();
        console.log('Added Java test path and reloaded server:', testPath);
    } catch (error) {
        console.error('Error adding Java test path:', error);
        throw error;
    }
}

