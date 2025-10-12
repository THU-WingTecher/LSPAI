/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import { sleep } from '../helper';
import * as assert from 'assert';
import { VscodeRequestManager } from './vscodeRequestManager';
export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

export async function getPythonInterpreterPath(): Promise<string> {
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (pythonExtension) {
        await pythonExtension.activate();
        const pythonPath = pythonExtension.exports.settings.getExecutionDetails().execCommand[0];
        console.log('pythonPath', pythonPath);
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
    console.log("config.get('analysis.include'):", config.get('analysis.include'));
    return config.get('analysis.extraPaths', []);
}

export async function setPythonAnalysisInclude(includePaths: string[] = ["tests/**/*.py"]) {
    const config = vscode.workspace.getConfiguration('python');
    await config.update(
        'analysis.include',
        includePaths,
        vscode.ConfigurationTarget.Workspace
    );
}

export async function setPythonAnalysisExclude(excludePaths: string[] = []) {
    const config = vscode.workspace.getConfiguration('python');
    await config.update(
        'analysis.exclude',
        excludePaths,
        vscode.ConfigurationTarget.Workspace
    );
}

export async function setPythonExtraPaths(pythonExtraPaths: string[]) {
    const config = vscode.workspace.getConfiguration('python');
    await config.update(
        'analysis.extraPaths',
        pythonExtraPaths,
        vscode.ConfigurationTarget.Workspace
    );

}


export async function setupPythonLSP(extraPaths: string[], interpreterPath: string) {
    await setPythonExtraPaths(extraPaths);
    const currentPythonExtraPaths = await getPythonExtraPaths();
    assert.ok(currentPythonExtraPaths.length === extraPaths.length, 'python extra paths should be set as expected');
    assert.ok(currentPythonExtraPaths.every((path, index) => path === extraPaths[index]), 'python extra paths should be set as expected');
    await setPythonInterpreterPath(interpreterPath);
    const currentPythonInterpreterPath = await getPythonInterpreterPath();
    assert.ok(currentPythonInterpreterPath === interpreterPath, 'python interpreter path should be set as expected');
  }

export async function closeEditor(editor: vscode.TextEditor) {
    editor.edit(editBuilder => {
        editBuilder.delete(new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(editor.document.lineCount, 0)
        ));
    }).then(() => {
        VscodeRequestManager.closeActiveEditor();
    });
}

/**
 * Activates the vscode.lsp-sample extension
 */
export async function activate(docUri: vscode.Uri | undefined = undefined) {
	// The extensionId is `publisher.name` from package.json
	// const ext = vscode.extensions.getExtension('LSPRAG.LSPRAG');
	// if (!ext) {
	// 	throw new Error('Extension not found');
	// }	
	// await ext.activate();
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

export async function getTypeInfo(uri: vscode.Uri, position: vscode.Position): Promise<any> {
    const typeInfo = await VscodeRequestManager.typeDefinition(uri, position);
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
