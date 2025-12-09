/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import { sleep } from '../helper';
import * as assert from 'assert';
import { VscodeRequestManager } from './vscodeRequestManager';
import * as fs from 'fs';
import { getDiagnosticsForUri, getDiagnosticsForFilePath } from './diagnostic';
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

export async function getJavaConfiguration(): Promise<{[key: string]: any}> {
    const config = vscode.workspace.getConfiguration('java');
    
    // Get common Java settings
    const settings = {
        // Project settings
        "project.referencedLibraries": config.get('project.referencedLibraries'),
        "project.sourcePaths": config.get('project.sourcePaths'),
        "project.outputPath": config.get('project.outputPath'),
        "project.explorer.showNonJavaResources": config.get('project.explorer.showNonJavaResources'),
        
        // JDK settings
        "jdk.home": config.get('jdk.home'),
        "java.home": config.get('home'),
        
        // Import settings
        "imports.gradle.wrapper.enabled": config.get('imports.gradle.wrapper.enabled'),
        "imports.maven.enabled": config.get('imports.maven.enabled'),
        "imports.exclusions": config.get('imports.exclusions'),
        
        // Completion settings
        "completion.enabled": config.get('completion.enabled'),
        "completion.guessMethodArguments": config.get('completion.guessMethodArguments'),
        
        // Format settings
        "format.enabled": config.get('format.enabled'),
        "format.settings.url": config.get('format.settings.url'),
        
        // Debug settings
        "debug.settings.hotCodeReplace": config.get('debug.settings.hotCodeReplace'),
        
        // Compiler settings
        "compiler.nullAnalysis.mode": config.get('compiler.nullAnalysis.mode'),
        
        // Configuration status
        "configuration.updateBuildConfiguration": config.get('configuration.updateBuildConfiguration'),
        "configuration.maven.userSettings": config.get('configuration.maven.userSettings')
    };

    return settings;
}

export async function createJavaTestFileWithErrors(projectPath: string): Promise<string> {
    // Create a temporary test directory if it doesn't exist
    const testDir = path.join(projectPath, 'src', 'test', 'java', 'com', 'test');
    await fs.promises.mkdir(testDir, { recursive: true });
    
    // Create a Java file with intentional errors to test LSP fault detection
    const testFileContent = `package com.test;

import java.util.List;
import java.util.ArrayList;

public class LSPTestFile {
    // Error 1: Type mismatch - assigning String to int
    private int number = "not a number";
    
    // Error 2: Undefined variable
    public void testMethod() {
        undefinedVariable = 10;
    }
    
    // Error 3: Missing return statement
    public String missingReturn() {
        System.out.println("This method should return a String");
        // Missing return statement
    }
    
    // Error 4: Calling non-existent method
    public void callNonExistent() {
        this.nonExistentMethod();
    }
    
    // Error 5: Type mismatch in method call
    public void typeMismatch() {
        List<String> list = new ArrayList<>();
        list.add(123); // Should be String, not int
    }
    
    // Error 6: Unreachable code (if compiler detects it)
    public void unreachableCode() {
        return;
        System.out.println("This will never execute");
    }
    
    // Error 7: Missing semicolon (syntax error)
    public void syntaxError() {
        int x = 5
        int y = 10;
    }
    
    // Error 8: Null pointer potential
    public void nullPointer() {
        String str = null;
        int length = str.length(); // Potential NPE
    }
}`;
    
    const testFilePath = path.join(testDir, 'LSPTestFile.java');
    await fs.promises.writeFile(testFilePath, testFileContent, 'utf8');
    console.log(`Created test Java file with intentional errors: ${testFilePath}`);
    
    return testFilePath;
}

export async function setupPythonLSP(extraPaths: string[], interpreterPath: string) {
    const config = vscode.workspace.getConfiguration('python');
    console.log(config);
    const currentInclude = config.get<string[]>('analysis.include', []);
    console.log("config.get('analysis.include'):", currentInclude);
    
    // Add **/test*/** to analysis.include if not already present (but exclude paths starting with "lsprag")
    const testPattern = '**/test*/**';
    let updatedInclude = [...currentInclude];
    if (!updatedInclude.includes(testPattern)) {
        updatedInclude.push(testPattern);
        await setPythonAnalysisInclude(updatedInclude);
        console.log(`Added ${testPattern} to analysis.include. Updated include:`, updatedInclude);
    } else {
        console.log(`${testPattern} already in analysis.include`);
    }
    
    // Exclude paths starting with "lsprag" from analysis
    const configExclude = vscode.workspace.getConfiguration('python');
    const currentExclude = configExclude.get<string[]>('analysis.exclude', []);
    const lspragExcludePatterns = ['**/lsprag*/**', '**/lsprag/**'];
    let updatedExclude = [...currentExclude];
    for (const pattern of lspragExcludePatterns) {
        if (!updatedExclude.includes(pattern)) {
            updatedExclude.push(pattern);
        }
    }
    if (updatedExclude.length > currentExclude.length) {
        await setPythonAnalysisExclude(updatedExclude);
        console.log(`Added lsprag exclusion patterns to analysis.exclude. Updated exclude:`, updatedExclude);
    } else {
        console.log(`lsprag exclusion patterns already in analysis.exclude`);
    }
    
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

// export async function getJavaConfiguration(): Promise<any> {
//     return vscode.workspace.getConfiguration('java');
// }

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

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const vscodePath = path.join(workspacePath, '.vscode');
    const settingsFilePath = path.join(vscodePath, 'settings.json');

    let settings: Partial<JavaSettings> = {};
    try {
        const settingsContent = await vscode.workspace.fs.readFile(vscode.Uri.file(settingsFilePath));
        settings = JSON.parse(settingsContent.toString());
    } catch (error) {
        // File doesn't exist or can't be read, use empty settings
    }

    // Check if this is a Maven project
    const pomXmlPath = path.join(workspacePath, 'pom.xml');
    const isMavenProject = fs.existsSync(pomXmlPath);

    // Default classpath - Maven projects use target/, others use lib/
    const defaultReferencedLibraries = isMavenProject 
        ? ["target/classes", "target/test-classes", "target/dependency/**/*.jar"]
        : ["lib/**/*.jar"];

    // Default source paths - include standard Maven paths plus any custom test paths
    const defaultSourcePaths = ["src/main/java", "src/test/java"];
    
    // Update Java settings
    const updatedSettings: JavaSettings = {
        "java.project.referencedLibraries": defaultReferencedLibraries,
        "java.project.sourcePaths": defaultSourcePaths,
        "java.project.outputPath": isMavenProject ? "target/classes" : "bin",
        "java.project.explorer.showNonJavaResources": false,
        ...settings
    };

    // Merge existing referencedLibraries if they exist
    if (settings["java.project.referencedLibraries"]) {
        const existing = settings["java.project.referencedLibraries"];
        updatedSettings["java.project.referencedLibraries"] = [
            ...new Set([...defaultReferencedLibraries, ...existing])
        ];
    }

    // Merge existing sourcePaths if they exist, otherwise use defaults
    // Filter out absolute paths and normalize to relative paths
    if (settings["java.project.sourcePaths"]) {
        const existing = settings["java.project.sourcePaths"] as string[];
        const normalizedExisting = existing
            .filter(p => !path.isAbsolute(p)) // Remove absolute paths
            .map(p => p.replace(/\\/g, '/')); // Normalize separators
        
        updatedSettings["java.project.sourcePaths"] = [
            ...new Set([...defaultSourcePaths, ...normalizedExisting])
        ];
    }

    // If settingsPath includes test paths, add them (equivalent to Maven build-helper-maven-plugin)
    // Ensure we use relative paths only (not absolute paths)
    if (settingsPath.includes('test')) {
        const relativeTestPath = path.relative(workspacePath, settingsPath);
        // Normalize path separators (use forward slashes for consistency)
        const normalizedPath = relativeTestPath.replace(/\\/g, '/');
        
        // Remove any absolute paths that might have been added
        updatedSettings["java.project.sourcePaths"] = updatedSettings["java.project.sourcePaths"]
            .filter((p: string) => !path.isAbsolute(p))
            .map((p: string) => p.replace(/\\/g, '/'));
        
        // Add the normalized relative path if not already present
        if (!updatedSettings["java.project.sourcePaths"].includes(normalizedPath)) {
            updatedSettings["java.project.sourcePaths"].push(normalizedPath);
        }
    }

    // Ensure .vscode directory exists
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(vscodePath));

    // Write settings file
    await vscode.workspace.fs.writeFile(
        vscode.Uri.file(settingsFilePath),
        Buffer.from(JSON.stringify(updatedSettings, null, 4))
    );

    console.log('Updated Java workspace settings', { isMavenProject, referencedLibraries: updatedSettings["java.project.referencedLibraries"] });
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
export async function setupJavaTestEnvironment(projectPath: string) {
    // Configure Java source paths to include test directories
    const javaConfig = vscode.workspace.getConfiguration('java');
    const currentSourcePaths = javaConfig.get<string[]>('project.sourcePaths', []);
    
    // Add test paths if not already included
    const testPaths = [
        'src/main/java',
        'src/test/java',
        'src/lsprag/test/java'
    ];
    
    const updatedSourcePaths = [...currentSourcePaths];
    for (const testPath of testPaths) {
        if (!updatedSourcePaths.includes(testPath)) {
            updatedSourcePaths.push(testPath);
        }
    }
    
    // Update Java source paths configuration
    await javaConfig.update(
        'project.sourcePaths',
        updatedSourcePaths,
        vscode.ConfigurationTarget.Workspace
    );
    console.log('Updated Java source paths:', updatedSourcePaths);
    
    // Also update workspace settings file
    const lspragTestPath = path.join(projectPath, 'src/lsprag/test/java');
    await updateJavaWorkspaceConfig(lspragTestPath);
    
    // Wait for configuration to take effect
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Trigger Java project configuration update
    try {
        await vscode.commands.executeCommand('java.projectConfiguration.update');
        console.log('Triggered Java project configuration update');
        await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
        console.log('Could not trigger Java project update:', error);
    }
    
    const config = await getJavaConfiguration();
    console.log('Java config:', config);

    // Create a test file with intentional errors
    const testFilePath = await createJavaTestFileWithErrors(projectPath);
    const fileUri = vscode.Uri.file(testFilePath);

    // Open the document to ensure it's loaded by the LSP
    const document = await vscode.workspace.openTextDocument(fileUri);
    console.log(`Opened document: ${testFilePath}`);
    console.log(`Document text length: ${document.getText().length}`);

    // Activate the language server for this file
    await activate(fileUri);

    // Wait longer for Java LSP to analyze (Java LSP can be slower)
    console.log('Waiting for Java LSP to analyze the file...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Try to trigger Java project update to ensure the file is recognized
    try {
        await vscode.commands.executeCommand('java.projectConfiguration.update');
        console.log('Triggered Java project configuration update');
        await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
        console.log('Could not trigger Java project update:', error);
    }

    // Use getDiagnosticsForUri which waits for diagnostics with retries
    console.log('Getting diagnostics (this may take a moment for Java LSP)...');
    let result = await getDiagnosticsForUri(fileUri);
    console.log('Diagnostics found:', result.length);
    console.log('Diagnostic messages:', result.map(d => `${d.severity}: ${d.message} (line ${d.range.start.line + 1})`));

    // If still no diagnostics, try the file path method as fallback
    if (result.length === 0) {
        console.log('No diagnostics found via getDiagnosticsForUri, trying getDiagnosticsForFilePath...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const fallbackDiagnostics = await getDiagnosticsForFilePath(testFilePath);
        console.log('Fallback diagnostics:', fallbackDiagnostics.length);

        if (fallbackDiagnostics.length > 0) {
            result = fallbackDiagnostics;
        } else {
            console.warn('WARNING: Java LSP did not detect any errors. This might indicate:');
            console.warn('1. Java LSP is not properly initialized');
            console.warn('2. The file is not in a recognized Java project structure');
            console.warn('3. Java LSP needs more time to analyze');
            console.warn('4. The errors are not being detected by the LSP');
            console.warn('File path:', testFilePath);
            console.warn('File exists:', fs.existsSync(testFilePath));
        }
    }

    // Verify that the LSP detected errors (should find multiple errors)
    assert.ok(result.length > 0, 'Java LSP should detect at least one error in the test file');

    // Verify that classpath errors are not the main issue
    const classpathErrors = result.filter(d => d.message.includes("is not on the classpath of project"));
    console.log('Classpath errors:', classpathErrors.length);

    // The test should find actual code errors, not just classpath issues
    const actualErrors = result.filter(d => !d.message.includes("is not on the classpath of project") &&
        !d.message.includes("The project cannot be built")
    );
    assert.ok(actualErrors.length > 0, 'Java LSP should detect actual code errors, not just classpath issues');

    return testFilePath;
}
