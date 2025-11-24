// Currently, java code action and diagnostic checking is not working <=== [[ a non-project file, only syntax errors are reported ]]

// import * as assert from 'assert';
// import * as vscode from 'vscode';
// import * as path from 'path';
// import * as fs from 'fs';
// import { getDiagnosticsForFilePath } from '../../../lsp/diagnostic';
// import { getCodeAction } from '../../../lsp/codeaction';
// import { activate } from '../../../lsp/helper';
// import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../helper';
// import { getConfigInstance } from '../../../config';

// suite('LSP-Features: CodeAction Test - Java', () => {
//     const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
//     const javaProjectPath = path.join(fixturesDir, 'java');
//     let tempTestFile: string | null = null;

//     test('Java - test code action for missing import', async function() {
//         this.timeout(30000);

//         // Setup workspace
//         getConfigInstance().updateConfig({
//             workspace: javaProjectPath
//         });
//         const workspaceFolders = setWorkspaceFolders(javaProjectPath);
//         await updateWorkspaceFolders(workspaceFolders);
//         console.log(`Java workspace path: ${workspaceFolders[0].uri.fsPath}`);

//         // Create a temporary test file with missing import
//         // This file uses ArrayList without importing java.util.ArrayList
//         const testCode = `package com.example;

// public class TestMissingImport {
//     public void testMethod() {
//         // Missing import for ArrayList
//         ArrayList<String> list = new ArrayList<>();
//         list.add("test");
//     }
// }
// `;
        
//         const testDir = path.join(javaProjectPath, 'src/main/java/com/example');
//         await fs.promises.mkdir(testDir, { recursive: true });
//         tempTestFile = path.join(testDir, 'TestMissingImport.java');
//         await fs.promises.writeFile(tempTestFile, testCode, 'utf8');
//         console.log(`Created test file: ${tempTestFile}`);

//         // Open the document and activate language server
//         const fileUri = vscode.Uri.file(tempTestFile);
//         await activate(fileUri);
//         const document = await vscode.workspace.openTextDocument(fileUri);

//         // Wait a bit for diagnostics to be available
//         await new Promise(resolve => setTimeout(resolve, 5000));

//         // Get diagnostics for the file
//         const diagnostics = await getDiagnosticsForFilePath(tempTestFile);
//         console.log('Diagnostics:', diagnostics.map(d => d.message));

//         // Filter diagnostics related to missing imports or undefined types
//         const importDiagnostics = diagnostics.filter(d => 
//             d.message.includes('cannot be resolved') || 
//             d.message.includes('cannot find symbol') ||
//             d.message.includes('import') ||
//             d.message.includes('ArrayList') ||
//             d.message.includes('List')
//         );

//         assert.ok(importDiagnostics.length > 0, 'Should find diagnostics for missing import');

//         // Get code actions for the first diagnostic
//         const firstDiagnostic = importDiagnostics[0];
//         console.log(`Getting code actions for diagnostic: ${firstDiagnostic.message} at range ${firstDiagnostic.range.start.line}:${firstDiagnostic.range.start.character}`);

//         const codeActions = await getCodeAction(fileUri, firstDiagnostic);
//         console.log('Code actions:', codeActions.map(a => a.title));

//         // Verify that code actions are returned
//         assert.ok(codeActions.length > 0, 'Should return code actions for missing import diagnostic');

//         // Verify that at least one code action is a QuickFix
//         const quickFixes = codeActions.filter(action => 
//             action.kind && action.kind.contains(vscode.CodeActionKind.QuickFix)
//         );
//         assert.ok(quickFixes.length > 0, 'Should have at least one QuickFix code action');

//         // Clean up
//         if (tempTestFile && fs.existsSync(tempTestFile)) {
//             await fs.promises.unlink(tempTestFile);
//             console.log(`Cleaned up test file: ${tempTestFile}`);
//         }
//     });

//     test('Java - test code action for multiple missing imports', async function() {
//         this.timeout(30000);

//         // Setup workspace
//         getConfigInstance().updateConfig({
//             workspace: javaProjectPath
//         });
//         const workspaceFolders = setWorkspaceFolders(javaProjectPath);
//         await updateWorkspaceFolders(workspaceFolders);

//         // Create a temporary test file with multiple missing imports
//         const testCode = `package com.example;

// public class TestMultipleMissingImports {
//     public void testMethod() {
//         // Missing imports for ArrayList and HashMap
//         ArrayList<String> list = new ArrayList<>();
//         HashMap<String, Integer> map = new HashMap<>();
//         list.add("test");
//         map.put("key", 1);
//     }
// }
// `;
        
//         const testDir = path.join(javaProjectPath, 'src/main/java/com/example');
//         await fs.promises.mkdir(testDir, { recursive: true });
//         tempTestFile = path.join(testDir, 'TestMultipleMissingImports.java');
//         await fs.promises.writeFile(tempTestFile, testCode, 'utf8');
//         console.log(`Created test file: ${tempTestFile}`);

//         // Open the document and activate language server
//         const fileUri = vscode.Uri.file(tempTestFile);
//         await activate(fileUri);
//         const document = await vscode.workspace.openTextDocument(fileUri);

//         // Wait a bit for diagnostics to be available
//         await new Promise(resolve => setTimeout(resolve, 5000));

//         // Get diagnostics for the file
//         const diagnostics = await getDiagnosticsForFilePath(tempTestFile);
//         console.log('Diagnostics:', diagnostics.map(d => d.message));

//         // Filter diagnostics related to missing imports
//         const importDiagnostics = diagnostics.filter(d => 
//             d.message.includes('cannot be resolved') || 
//             d.message.includes('cannot find symbol') ||
//             d.message.includes('import') ||
//             d.message.includes('ArrayList') ||
//             d.message.includes('HashMap')
//         );

//         assert.ok(importDiagnostics.length > 0, 'Should find diagnostics for missing imports');

//         // Test code actions for each diagnostic
//         let totalCodeActions = 0;
//         for (const diagnostic of importDiagnostics) {
//             const codeActions = await getCodeAction(fileUri, diagnostic);
//             console.log(`Code actions for "${diagnostic.message}":`, codeActions.map(a => a.title));
//             totalCodeActions += codeActions.length;
//         }

//         // Verify that code actions are returned for at least one diagnostic
//         assert.ok(totalCodeActions > 0, 'Should return code actions for missing import diagnostics');

//         // Clean up
//         if (tempTestFile && fs.existsSync(tempTestFile)) {
//             await fs.promises.unlink(tempTestFile);
//             console.log(`Cleaned up test file: ${tempTestFile}`);
//         }
//     });

//     test('Java - test code action for missing List import', async function() {
//         this.timeout(30000);

//         // Setup workspace
//         getConfigInstance().updateConfig({
//             workspace: javaProjectPath
//         });
//         const workspaceFolders = setWorkspaceFolders(javaProjectPath);
//         await updateWorkspaceFolders(workspaceFolders);

//         // Create a temporary test file using List without import
//         const testCode = `package com.example;

// public class TestListImport {
//     public void testMethod() {
//         // Missing import for List
//         List<String> list = new java.util.ArrayList<>();
//         list.add("test");
//     }
// }
// `;
        
//         const testDir = path.join(javaProjectPath, 'src/main/java/com/example');
//         await fs.promises.mkdir(testDir, { recursive: true });
//         tempTestFile = path.join(testDir, 'TestListImport.java');
//         await fs.promises.writeFile(tempTestFile, testCode, 'utf8');
//         console.log(`Created test file: ${tempTestFile}`);

//         // Open the document and activate language server
//         const fileUri = vscode.Uri.file(tempTestFile);
//         await activate(fileUri);

//         // Wait a bit for diagnostics to be available
//         await new Promise(resolve => setTimeout(resolve, 5000));

//         // Get diagnostics for the file
//         const diagnostics = await getDiagnosticsForFilePath(tempTestFile);
//         console.log('Diagnostics:', diagnostics.map(d => d.message));

//         // Filter diagnostics related to missing imports
//         const importDiagnostics = diagnostics.filter(d => 
//             d.message.includes('cannot be resolved') || 
//             d.message.includes('cannot find symbol') ||
//             d.message.includes('import') ||
//             d.message.includes('List')
//         );

//         if (importDiagnostics.length > 0) {
//             // Get code actions for the first diagnostic
//             const firstDiagnostic = importDiagnostics[0];
//             const codeActions = await getCodeAction(fileUri, firstDiagnostic);
//             console.log('Code actions:', codeActions.map(a => a.title));

//             // Verify that code actions are returned
//             assert.ok(codeActions.length > 0, 'Should return code actions for missing List import');
//         } else {
//             console.log('No import-related diagnostics found, skipping code action test');
//         }

//         // Clean up
//         if (tempTestFile && fs.existsSync(tempTestFile)) {
//             await fs.promises.unlink(tempTestFile);
//             console.log(`Cleaned up test file: ${tempTestFile}`);
//         }
//     });
// });

