import * as assert from 'assert';
import * as vscode from 'vscode';
import { getDiagnosticsForFilePath, groupDiagnosticsByMessage, groupedDiagnosticsToString, getCodeAction, applyCodeActions, markTestCodeWithDiagnostic } from '../../diagnostic';
import { activate, addJavaTestPath, getAllSymbols, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../lsp';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../helper';
import { getConfigInstance } from '../../config';
import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
import { experimentalDiagnosticPrompt } from '../../prompts/promptBuilder';
import { collectRelatedInfo } from '../../collectDiagnosticInfo';
// import { updateWorkspace } from '../../workspace';
suite('Diagnostic Test Suite', () => {
    // let currentSrcPath: string;
    // let symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[];
    // const projectPath = "/LSPRAG/experiments/projects/cobra";
    // const workspaceFolders = setWorkspaceFolders(projectPath);
    // const currentConfig = {
    //     model: 'gpt-4o-mini',
    //     expProb: 0.2,
    //     workspace: projectPath,
    //     parallelCount: 1,
    //     savePath: "/LSPRAG/experiments/projects/commons-csv/results_experimental_detailed_3_23_2025__07_14_11",
    // }
    // getConfigInstance().updateConfig({
    //     ...currentConfig
    // });
    
    // // const testPath = "/LSPRAG/experiments/projects/commons-cli/compilation_analysis/deepseek_only_failures/deepseek-reasoner/OptionValidator_search1Test.java"
    const pythonPath = "/LSPRAG/experiments/projects/black/results_agent_nofix_5_3_2025__09_22_09/gpt-4o-mini/initial/parse__addtoken_0_1_test.py";
    const importTestPath = "/LSPRAG/tests/import_test.py";
    const pythonInterpreterPath = "/root/miniconda3/envs/lsprag/bin/python";
    const blackModuleImportPath = "/LSPRAG/experiments/projects/black/src/black";
    const javaPath = "/LSPRAG/experiments/projects/commons-cli/src/lsprag/test/java/org/apache/commons/cli/AbstractParserTestCase.java";
    const goPath = "/LSPRAG/experiments/projects/cobra/bash_completions.go";
    const goPath1 = "/LSPRAG/experiments/projects/cobra/testCaseWithLSPRAG/gpt-4o-mini/args_ExactArgs1_test.go";

    // test('JAVA - test language server has launched', async () => {
    //     const symbols = await getAllSymbols(vscode.Uri.file(javaPath));
    //     assert.ok(symbols.length > 0);
    // });

    // test('JAVA - test diagnostic against java code', async () => {
    //     // const fileUri = vscode.Uri.file(javaPath);
    //     const result = await getDiagnosticsForFilePath(javaPath);
    //     console.log('result', result);
    //     assert.ok(result.length > 0);
    //     assert.ok(result.every(d => !d.message.includes("is not on the classpath of project")), "should not report missing java classpath");
    // });

    test('PYTHON - test language server has launched', async () => {
        const symbols = await getAllSymbols(vscode.Uri.file(pythonPath));
        assert.ok(symbols.length > 0);
    });

    test('PYTHON - test diagnostic against python code', async () => {
        await setPythonInterpreterPath(pythonInterpreterPath);
        await setPythonExtraPaths([blackModuleImportPath]);
        const fileUri = vscode.Uri.file(pythonPath);
        const result = await getDiagnosticsForFilePath(pythonPath);
        console.log('result', result);
        assert.ok(result.length > 0);
    });

    // test('GO - test language server has launched', async () => {
    //     const projectPath = "/LSPRAG/experiments/projects/cobra";
    //     const workspaceFolders = await setWorkspaceFolders(projectPath);
    //     console.log('workspaceFolders', vscode.workspace.workspaceFolders);
    //     // before update we first inspect whether the workspace forders already has our new workspace Folders 


    //     console.log('workspaceFolders', vscode.workspace.workspaceFolders);
    //     const symbols = await getAllSymbols(vscode.Uri.file(goPath));
    //     assert.ok(symbols.length > 0);

    // });

    // test('GO - test diagnostic against go code', async () => {
    //     const fileUri = vscode.Uri.file(goPath);
    //     const result = await getDiagnosticsForFilePath(goPath);
    //     const document = await vscode.workspace.openTextDocument(fileUri);
    //     const groupedDiagnostics = groupDiagnosticsByMessage(result);

    //     const srcPath = path.dirname(goPath);
    //     const firstDiagnostics = Array.from(groupedDiagnostics.values())
    //     .map(diagnosticArray => diagnosticArray[0])
    //     .filter(diagnostic => diagnostic !== undefined);  
    //     const contextInfo = await collectRelatedInfo(
    //         fileUri,
    //         document,
    //         firstDiagnostics,
    //         'go',
    //         srcPath
    //     );
    //     console.log('contextInfo', contextInfo);

    // });

    // test('GO - test diagnostic against go code with all diagnostics', async () => {
    //     const dirPath = "/LSPRAG/experiments/projects/cobra/lsprag-workspace/standardRag_gpt-4o-mini_20250601_163458/codes";

    //     const fileUri = vscode.Uri.file(goPath);
    //     const result = await getDiagnosticsForFilePath(dirPath);
    //     const document = await vscode.workspace.openTextDocument(fileUri);
    //     const groupedDiagnostics = groupDiagnosticsByMessage(result);

    //     const srcPath = path.dirname(goPath);
    //     const firstDiagnostics = Array.from(groupedDiagnostics.values())
    //     .map(diagnosticArray => diagnosticArray[0])
    //     .filter(diagnostic => diagnostic !== undefined);  
    //     const contextInfo = await collectRelatedInfo(
    //         fileUri,
    //         document,
    //         firstDiagnostics,
    //         'go',
    //         srcPath
    //     );
    //     console.log('contextInfo', contextInfo);

    // });

    // test('JAVA - test diagnostic against java code', async () => {
    //     const languageId = 'java';
    //     const dirPath = "/LSPRAG/experiments/projects/commons-cli/src/lsprag/test/java";
    //     const workspacePath = "/LSPRAG/experiments/projects/commons-cli";
    //     const workspaceFolders = setWorkspaceFolders(workspacePath);
    //     await updateWorkspaceFolders(workspaceFolders);
    //     // const oldJavaConfig = await getJavaConfiguration();
    //     // console.log('oldJavaConfig', oldJavaConfig);
    //     await addJavaSourcePath('/LSPRAG/experiments/projects/commons-cli/src/lsprag/test/java');
    //     // await vscode.commands.executeCommand('java.clean.workspace');
    //     // await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for clean operation
    //     // await vscode.commands.executeCommand('java.projectConfiguration.update');
    //     // const javaConfig = await getJavaConfiguration();

    //     // console.log('javaConfig', javaConfig);
    //     console.log('workspaceFolders', vscode.workspace.workspaceFolders);
    //     // Helper function to get all code files recursively
    //     async function getAllCodeFiles(dir: string): Promise<string[]> {
    //         const files: string[] = [];
    //         const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            
    //         for (const entry of entries) {
    //             const fullPath = path.join(dir, entry.name);
    //             if (entry.isDirectory()) {
    //                 files.push(...await getAllCodeFiles(fullPath));
    //             } else if (entry.name.endsWith('.go') || entry.name.endsWith('.py') || entry.name.endsWith('.java')) { // Add more extensions if needed (.py, .java, etc.)
    //                 files.push(fullPath);
    //             }
    //         }
    //         return files;
    //     }

    //     // Get all code files
    //     const codeFiles = await getAllCodeFiles(dirPath);
    //     // const codeFiles = ["/LSPRAG/experiments/projects/commons-cli/src/lsprag/test/java/org/apache/commons/cli/Option_getValue_0_1Test.java"];
    //     const allContextInfo: { [filepath: string]: string } = {};
    //     const srcPath = path.join(workspacePath, "src/main/java");

    //     // Process each file
    //     for (const filePath of codeFiles) {
    //         try {
    //             console.log('### Processing file:', filePath);
    //             const fileUri = vscode.Uri.file(filePath);
    //             const document = await vscode.workspace.openTextDocument(fileUri);
    //             const diagnostics = await getDiagnosticsForFilePath(filePath);
                
    //             if (diagnostics.length > 0) {
    //                 const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
    //                 const testCodeWithMarked = markTestCodeWithDiagnostic(document, groupedDiagnostics);
    //                 console.log('testCodeWithMarked', testCodeWithMarked);
    //                 const firstDiagnostics = Array.from(groupedDiagnostics.values())
    //                     .map(diagnosticArray => diagnosticArray[0])
    //                     .filter(diagnostic => diagnostic !== undefined);

    //                 const contextInfo = await collectRelatedInfo(
    //                     fileUri,
    //                     document,
    //                     groupedDiagnostics,
    //                     languageId,
    //                     srcPath
    //                 );

    //                 allContextInfo[filePath] = contextInfo;
    //                 console.log(`Processed ${filePath}:`);
    //                 console.log(contextInfo);
    //                 console.log('='.repeat(80));
    //             }
    //         } catch (error) {
    //             console.error(`Error processing file ${filePath}:`, error);
    //         }
    //     }

    //     // Assert that we found and processed some files
    //     assert.ok(Object.keys(allContextInfo).length > 0, 'No files were processed');
        
    //     // Optional: Save results to a file
    //     const resultsPath = path.join(dirPath, 'diagnostic_results.json');
    //     await fs.promises.writeFile(
    //         resultsPath, 
    //         JSON.stringify(allContextInfo, null, 2)
    //     );
    // });
    test('PYTHON - test diagnostic against python code', async () => {
        const languageId = 'python';
        const focalDoc = await vscode.workspace.openTextDocument(vscode.Uri.file("/LSPRAG/experiments/projects/black/src/black/cache.py"));
        const dirPath = "/LSPRAG/experiments/projects/black/lsprag-workspace/standardRag_gpt-4o-mini_20250601_154022/codes";
        const workspacePath = "/LSPRAG/experiments/projects/black";
        const workspaceFolders = setWorkspaceFolders(workspacePath);
        const focalMethodPath = "/LSPRAG/experiments/projects/black/src/black/main.py";
        await updateWorkspaceFolders(workspaceFolders);
        // const oldJavaConfig = await getJavaConfiguration();
        async function getAllCodeFiles(dir: string): Promise<string[]> {
            const files: string[] = [];
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    files.push(...await getAllCodeFiles(fullPath));
                } else if (entry.name.endsWith('.go') || entry.name.endsWith('.py') || entry.name.endsWith('.java')) { // Add more extensions if needed (.py, .java, etc.)
                    files.push(fullPath);
                }
            }
            return files;
        }

        // Get all code files
        const codeFiles = await getAllCodeFiles(dirPath);
        // const codeFiles = ["/LSPRAG/experiments/projects/commons-cli/src/lsprag/test/java/org/apache/commons/cli/Option_getValue_0_1Test.java"];
        const allContextInfo: { [filepath: string]: string } = {};
        const srcPath = path.join(workspacePath, "src");

        // Process each file
        for (const filePath of codeFiles) {
            try {
                console.log('### Processing file:', filePath);
                const fileUri = vscode.Uri.file(filePath);
                const document = await vscode.workspace.openTextDocument(fileUri);
                const diagnostics = await getDiagnosticsForFilePath(filePath);
                
                if (diagnostics.length > 0) {
                    const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
                    const testCodeWithMarked = markTestCodeWithDiagnostic(document, groupedDiagnostics);
                    console.log('testCodeWithMarked', testCodeWithMarked);
                    const firstDiagnostics = Array.from(groupedDiagnostics.values())
                        .map(diagnosticArray => diagnosticArray[0])
                        .filter(diagnostic => diagnostic !== undefined);

                    const contextInfo = await collectRelatedInfo(
                        fileUri,
                        focalDoc,
                        groupedDiagnostics,
                        languageId,
                        srcPath
                    );

                    allContextInfo[filePath] = contextInfo;
                    console.log(`Processed ${filePath}:`);
                    console.log(contextInfo);
                    console.log('='.repeat(80));
                }
            } catch (error) {
                console.error(`Error processing file ${filePath}:`, error);
            }
        }

        // Assert that we found and processed some files
        assert.ok(Object.keys(allContextInfo).length > 0, 'No files were processed');
        
        // Optional: Save results to a file
        const resultsPath = path.join(dirPath, 'diagnostic_results.json');
        await fs.promises.writeFile(
            resultsPath, 
            JSON.stringify(allContextInfo, null, 2)
        );
    });

    // test('GO - test diagnostic against go code', async () => {
    //     const languageId = 'go';
    //     const dirPath = "/LSPRAG/experiments/projects/cobra/lsprag-workspace/standardRag_gpt-4o-mini_20250601_163458/codes";
    //     const workspacePath = "/LSPRAG/experiments/projects/cobra";
    //     // Helper function to get all code files recursively
    //     async function getAllCodeFiles(dir: string): Promise<string[]> {
    //         const files: string[] = [];
    //         const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            
    //         for (const entry of entries) {
    //             const fullPath = path.join(dir, entry.name);
    //             if (entry.isDirectory()) {
    //                 files.push(...await getAllCodeFiles(fullPath));
    //             } else if (entry.name.endsWith('.go') || entry.name.endsWith('.py') || entry.name.endsWith('.java')) { // Add more extensions if needed (.py, .java, etc.)
    //                 files.push(fullPath);
    //             }
    //         }
    //         return files;
    //     }

    //     // Get all code files
    //     const codeFiles = await getAllCodeFiles(dirPath);
    //     const allContextInfo: { [filepath: string]: string } = {};
    //     const srcPath = workspacePath;
    //     // Process each file
    //     for (const filePath of codeFiles) {
    //         try {
    //             console.log('### Processing file:', filePath);
    //             const fileUri = vscode.Uri.file(filePath);
    //             const document = await vscode.workspace.openTextDocument(fileUri);
    //             const diagnostics = await getDiagnosticsForFilePath(filePath);
                
    //             if (diagnostics.length > 0) {
    //                 const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
    //                 const firstDiagnostics = Array.from(groupedDiagnostics.values())
    //                     .map(diagnosticArray => diagnosticArray[0])
    //                     .filter(diagnostic => diagnostic !== undefined);

    //                 const contextInfo = await collectRelatedInfo(
    //                     fileUri,
    //                     document,
    //                     firstDiagnostics,
    //                     languageId,
    //                     srcPath
    //                 );

    //                 allContextInfo[filePath] = contextInfo;
    //                 console.log(`Processed ${filePath}:`);
    //                 console.log(contextInfo);
    //                 console.log('='.repeat(80));
    //             }
    //         } catch (error) {
    //             console.error(`Error processing file ${filePath}:`, error);
    //         }
    //     }

    //     // Assert that we found and processed some files
    //     assert.ok(Object.keys(allContextInfo).length > 0, 'No files were processed');
        
    //     // Optional: Save results to a file
    //     const resultsPath = path.join(dirPath, 'diagnostic_results.json');
    //     await fs.promises.writeFile(
    //         resultsPath, 
    //         JSON.stringify(allContextInfo, null, 2)
    //     );
    // });
    // test('Fix Prompt Test for Python', async () => {
    //     const testUri = vscode.Uri.file(pythonPath);
    //     const document = await vscode.workspace.openTextDocument(testUri);
    //     const unitTestCode = document.getText();
    //     const diagnostics = await getDiagnosticsForFilePath(pythonPath);
    //     const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
    //     const diagnosticReport = groupedDiagnosticsToString(groupedDiagnostics, document).join('\n');
    //     const prompt = experimentalDiagnosticPrompt(unitTestCode, diagnosticReport);
    //     console.log("prompt", JSON.stringify(prompt, null, 2));
    // });

    // test('Language server recognizes installed environment libraries', async () => {
    //     // Set the desired Python interpreter path (update as needed)

    //     await setPythonInterpreterPath(pythonInterpreterPath);
    //     await setPythonExtraPaths([blackModuleImportPath]);
    //     // Activate the Python extension and log the interpreter in use
    //     console.log('Python interpreter used by extension:', await getPythonInterpreterPath());

    //     // Open the test file and collect diagnostics
    //     const fileUri = vscode.Uri.file(importTestPath);
    //     await vscode.workspace.openTextDocument(fileUri);
    //     const diagnostics = await getDiagnosticsForFilePath(importTestPath);

    //     // Log diagnostics for debugging
    //     console.log('Diagnostics:', diagnostics);

    //     // Assert: No diagnostic about missing pandas or import errors
    //     const importErrors = diagnostics.filter(d =>
    //         d.message.includes('No module named') ||
    //         d.message.includes('unresolved import') ||
    //         d.message.includes('not found') ||
    //         d.message.includes('Import')
    //     );
    //     assert.strictEqual(importErrors.length, 0, 'Should not report missing pandas or import errors');
    // });
    // test('Fix Prompt Test', async () => {
    //     const dirPath = "/LSPRAG/experiments/projects/commons-csv/src/lsprag/test/java";
    //     let javaFiles: string[] = [];
    //     try {
    //         javaFiles = await getJavaFiles(dirPath);
    //         console.log('Found Java files:', javaFiles);
    //     } catch (error) {
    //         console.error('Error finding Java files:', error);
    //     }
    //     let testPath = javaFiles[0];
    //     const testUri = vscode.Uri.file(testPath);
    //     await activate(testUri);
    //     const document = await vscode.workspace.openTextDocument(testUri);
    //     const unitTestCode = document.getText();
    //     const diagnostics = await getDiagnosticsForFilePath(testPath);
    //     const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
    //     const diagnosticReport = groupedDiagnosticsToString(groupedDiagnostics, document).join('\n');
    //     const prompt = experimentalDiagnosticPrompt(unitTestCode, diagnosticReport);
    //     console.log("prompt", JSON.stringify(prompt, null, 2));
    // });

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
    //     const dirPath = "/LSPRAG/experiments/projects/commons-csv/src/lsprag/test/java";
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

async function addJavaSourcePath(newPath: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('java');
    
    // Get current source paths
    const currentPaths: string[] = config.get('project.sourcePaths') || [];
    
    // Add new path if it's not already included
    if (!currentPaths.includes(newPath)) {
        currentPaths.push(newPath);
        
        // Update the configuration
        await config.update(
            'project.sourcePaths',
            currentPaths,
            vscode.ConfigurationTarget.Workspace
        );
        
        console.log('Updated Java source paths:', currentPaths);
    }
}

// Usage to add 'lsprag/test' to source paths

// async function updateWorkspaceForDiagnostics(testPath: string) {
//     // 1. Create a temporary symbolic link in the project's test directory
//     const projectTestDir = '/LSPRAG/experiments/projects/commons-csv/src/test/java/org/apache/commons/csv/';
//     const testFileName = path.basename(testPath);
//     const linkedPath = path.join(projectTestDir, testFileName);

//     // 2. Update workspace folders to include both paths
//     const workspaceFolders: vscode.WorkspaceFolder[] = [
//         {
//             uri: vscode.Uri.file('/LSPRAG/experiments/projects/commons-csv'),
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

// async function setPythonInterpreter(pythonPath: string, workspacePath: string) {
//     const vscodeDir = path.join(workspacePath, '.vscode');
//     const settingsPath = path.join(vscodeDir, 'settings.json');
//     if (!fs.existsSync(vscodeDir)) {
//         fs.mkdirSync(vscodeDir);
//     }
//     let settings = {};
//     if (fs.existsSync(settingsPath)) {
//         settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
//     }
//     settings['python.defaultInterpreterPath'] = pythonPath;
//     fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
// }