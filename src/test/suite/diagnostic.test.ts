import * as assert from 'assert';
import * as vscode from 'vscode';
import { getDiagnosticsForFilePath, groupDiagnosticsByMessage, groupedDiagnosticsToString, getCodeAction, applyCodeActions } from '../../diagnostic';
import { activate } from '../../lsp';
import { setWorkspaceFolders } from '../../helper';
import { getConfigInstance } from '../../config';
import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
import { experimentalDiagnosticPrompt } from '../../prompts/promptBuilder';
// import { updateWorkspace } from '../../workspace';
suite('Diagnostic Test Suite', () => {
    let currentSrcPath: string;
    let symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[];
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    const currentConfig = {
        model: 'gpt-4o-mini',
        expProb: 0.2,
        workspace: projectPath,
        parallelCount: 1,
        savePath: "/LSPAI/experiments/projects/commons-csv/results_experimental_detailed_3_23_2025__07_14_11",
    }
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    
    // const testPath = "/LSPAI/experiments/projects/commons-cli/compilation_analysis/deepseek_only_failures/deepseek-reasoner/OptionValidator_search1Test.java"
    const testPaths = [
        // "/LSPAI/experiments/projects/commons-csv/src/results_experimental_detailed_3_23_2025__07_14_11/gpt-4o-mini/org/apache/commons/csv/CSVFormat_getDelimiterString1Test.java", // a test file with experimental test path results_experimental_detailed_3_23_2025__07_14_11/...
        "/LSPAI/experiments/projects/commons-csv/src/lspai/test/java/org/apache/commons/csv/CSVFormat_getDelimiterString1Test.java", // a test file with ordinary test path src/test/java/...    
    ]

    // test('should return diagnostics immediately if available', async () => {
    //     console.log('workspaceFolders', workspaceFolders);
    //     for (const testPath of testPaths) {
    //         console.log('testPath', testPath);
    //         const fileUri = vscode.Uri.file(testPath);
    //         const result = await getDiagnosticsForFilePath(testPath);
    //         // const result = await getDiagnosticsForFilePath(testPath);
    //         console.log('result', result);

    //         await activate(fileUri);
    //         // await vscode.commands.executeCommand('java.project.refresh');
    //         const diagnostics = await getDiagnosticsForFilePath(testPath);
    //         console.log('diagnostics', diagnostics);
    //         assert.ok(diagnostics.length > 0);
    //     }
    //     // Verify results
    //     // assert.strictEqual(result.length, 1);
    //     // assert.strictEqual(result[0].message, 'Test diagnostic');

    //     // Restore original function
    //     // vscode.languages.getDiagnostics = originalGetDiagnostics;
    // });

    // test('should group diagnostics by message', async () => {
    //     const dirPath = "/LSPAI/experiments/projects/commons-csv/src/lspai/test/java";
    //     let javaFiles: string[] = [];
    //     try {
    //         javaFiles = await getJavaFiles(dirPath);
    //         console.log('Found Java files:', javaFiles);
    //     } catch (error) {
    //         console.error('Error finding Java files:', error);
    //     }
    //     for (const testPath of javaFiles) {
    //         const testUri = vscode.Uri.file(testPath);
    //         await activate(testUri);
    //         const document = await vscode.workspace.openTextDocument(testUri);
    //         const diagnostics = await getDiagnosticsForFilePath(testPath);
    //         const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
    //         const codeActions = await getCodeAction(testUri, diagnostics[0]);  
    //         await applyCodeActions(testUri, codeActions);

    //         console.log(groupedDiagnosticsToString(groupedDiagnostics, document).join('\n'));
    //     }
    // });

    test('Fix Prompt Test', async () => {
        const dirPath = "/LSPAI/experiments/projects/commons-csv/src/lspai/test/java";
        let javaFiles: string[] = [];
        try {
            javaFiles = await getJavaFiles(dirPath);
            console.log('Found Java files:', javaFiles);
        } catch (error) {
            console.error('Error finding Java files:', error);
        }
        let testPath = javaFiles[0];
        const testUri = vscode.Uri.file(testPath);
        await activate(testUri);
        const document = await vscode.workspace.openTextDocument(testUri);
        const unitTestCode = document.getText();
        const diagnostics = await getDiagnosticsForFilePath(testPath);
        const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
        const diagnosticReport = groupedDiagnosticsToString(groupedDiagnostics, document).join('\n');
        const prompt = experimentalDiagnosticPrompt(unitTestCode, diagnosticReport);
        console.log("prompt", JSON.stringify(prompt, null, 2));
    });

    // test('should wait for diagnostics change event if initially empty', async () => {
    //     // Prepare test data
    //     const mockDiagnostics = [
    //         new vscode.Diagnostic(
    //             new vscode.Range(0, 0, 0, 1),
    //             'Updated diagnostic',
    //             vscode.DiagnosticSeverity.Warning
    //         )
    //     ];

    //     // Mock getDiagnostics to return empty first, then results
    //     const originalGetDiagnostics = vscode.languages.getDiagnostics;
    //     let callCount = 0;
    //     vscode.languages.getDiagnostics = (uri) => {
    //         callCount++;
    //         return callCount === 1 ? [] : mockDiagnostics;
    //     };

    //     // Start the diagnostics request
    //     const diagnosticsPromise = getDiagnosticsForUri(testUri);

    //     // Simulate diagnostics change event
    //     setTimeout(() => {
    //         const event = {
    //             uris: [testUri]
    //         };
    //         vscode.languages.onDidChangeDiagnostics.fire(event);
    //     }, 100);

    //     // Wait for results
    //     const result = await diagnosticsPromise;

    //     // Verify results
    //     assert.strictEqual(result.length, 1);
    //     assert.strictEqual(result[0].message, 'Updated diagnostic');
    //     assert.ok(mockDispose.called);

    //     // Restore original function
    //     vscode.languages.getDiagnostics = originalGetDiagnostics;
    // });

    // test('should timeout after 10 seconds if no diagnostics found', async function() {
    //     this.timeout(12000); // Extend mocha timeout for this test

    //     // Mock getDiagnostics to always return empty
    //     const originalGetDiagnostics = vscode.languages.getDiagnostics;
    //     vscode.languages.getDiagnostics = (uri) => [];

    //     // Execute test
    //     const result = await getDiagnosticsForUri(testUri);

    //     // Verify results
    //     assert.strictEqual(result.length, 0);
    //     assert.ok(mockDispose.called);

    //     // Restore original function
    //     vscode.languages.getDiagnostics = originalGetDiagnostics;
    // });

    // test('should retry up to 3 times before timeout', async function() {
    //     this.timeout(8000); // Extend mocha timeout for this test

    //     // Track number of getDiagnostics calls
    //     let getDiagnosticsCalls = 0;
    //     const originalGetDiagnostics = vscode.languages.getDiagnostics;
    //     vscode.languages.getDiagnostics = (uri) => {
    //         getDiagnosticsCalls++;
    //         return [];
    //     };

    //     // Execute test
    //     await getDiagnosticsForUri(testUri);

    //     // Verify number of retries
    //     assert.ok(getDiagnosticsCalls >= 4); // Initial call + 3 retries
    //     assert.ok(mockDispose.called);

    //     // Restore original function
    //     vscode.languages.getDiagnostics = originalGetDiagnostics;
    // });
}); 

const symlink = promisify(fs.symlink);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

async function createSymlink(sourcePath: string, targetPath: string): Promise<void> {
    try {
        // Ensure target directory exists
        await mkdir(path.dirname(targetPath), { recursive: true });

        // Remove existing symlink if it exists
        try {
            await unlink(targetPath);
        } catch (error) {
            // Ignore error if file doesn't exist
            // if (error instanceof Error && error.code !== 'ENOENT') {
            //     throw error;
            // }
        }

        // Create the symlink
        await symlink(sourcePath, targetPath);
        console.log(`Created symlink from ${sourcePath} to ${targetPath}`);
    } catch (error) {
        // console.error(`Failed to create symlink: ${error.message}`);
        throw error;
    }
}


// async function updateWorkspaceForDiagnostics(testPath: string) {
//     // 1. Create a temporary symbolic link in the project's test directory
//     const projectTestDir = '/LSPAI/experiments/projects/commons-csv/src/test/java/org/apache/commons/csv/';
//     const testFileName = path.basename(testPath);
//     const linkedPath = path.join(projectTestDir, testFileName);

//     // 2. Update workspace folders to include both paths
//     const workspaceFolders: vscode.WorkspaceFolder[] = [
//         {
//             uri: vscode.Uri.file('/LSPAI/experiments/projects/commons-csv'),
//             name: 'commons-csv',
//             index: 0
//         }
//     ];

//     await vscode.workspace.updateWorkspaceFolders(
//         0,
//         null,
//         ...workspaceFolders
//     );

//     // 3. Create symbolic link
//     await createSymlink(testPath, linkedPath);

//     return linkedPath;
// }

// // Usage:
// const linkedPath = await updateWorkspaceForDiagnostics(testPath);
// // Now get diagnostics using the linked path
// const diagnostics = await getDiagnostics(vscode.Uri.file(linkedPath));

async function getJavaFiles(dirPath: string): Promise<string[]> {
    const javaFiles: string[] = [];

    async function scanDirectory(currentPath: string) {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            
            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                await scanDirectory(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.java')) {
                // Add java files to the result array
                javaFiles.push(fullPath);
            }
        }
    }

    try {
        await scanDirectory(dirPath);
        return javaFiles;
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
        throw error;
    }
}

// Usage example:
/*
try {
    const javaFiles = await getJavaFiles('/path/to/directory');
    console.log('Found Java files:', javaFiles);
} catch (error) {
    console.error('Error finding Java files:', error);
}
*/