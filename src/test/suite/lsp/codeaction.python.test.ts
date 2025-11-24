import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getDiagnosticsForFilePath } from '../../../lsp/diagnostic';
import { getCodeAction } from '../../../lsp/codeaction';
import { activate, setPythonInterpreterPath, setPythonExtraPaths } from '../../../lsp/helper';
import { setWorkspaceFolders } from '../../../helper';
import { getConfigInstance } from '../../../config';

suite('LSP-Features: CodeAction Test', () => {
    const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
    const pythonProjectPath = path.join(fixturesDir, 'python');
    let tempTestFile: string | null = null;

    test('Python - test code action for missing import', async function() {
        this.timeout(30000);

        // Setup workspace
        getConfigInstance().updateConfig({
            workspace: pythonProjectPath
        });
        const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
        console.log(`Python workspace path: ${workspaceFolders[0].uri.fsPath}`);

        // Create a temporary test file with missing import
        // This file uses 'os' module without importing it
        const testCode = `def test_function():
    # Missing import for 'os' module
    path = os.path.join('test', 'file.txt')
    return path
`;
        
        tempTestFile = path.join(pythonProjectPath, 'test_missing_import.py');
        await fs.promises.writeFile(tempTestFile, testCode, 'utf8');
        console.log(`Created test file: ${tempTestFile}`);

        // Open the document and activate language server
        const fileUri = vscode.Uri.file(tempTestFile);
        await activate(fileUri);
        const document = await vscode.workspace.openTextDocument(fileUri);

        // Wait a bit for diagnostics to be available
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get diagnostics for the file
        const diagnostics = await getDiagnosticsForFilePath(tempTestFile);
        console.log('Diagnostics:', diagnostics.map(d => d.message));

        // Filter diagnostics related to missing imports
        const importDiagnostics = diagnostics.filter(d => 
            d.message.includes('undefined') || 
            d.message.includes('not defined') ||
            d.message.includes('import') ||
            d.message.includes('name')
        );

        assert.ok(importDiagnostics.length > 0, 'Should find diagnostics for missing import');

        // Get code actions for the first diagnostic
        const firstDiagnostic = importDiagnostics[0];
        console.log(`Getting code actions for diagnostic: ${firstDiagnostic.message} at range ${firstDiagnostic.range.start.line}:${firstDiagnostic.range.start.character}`);

        const codeActions = await getCodeAction(fileUri, firstDiagnostic);
        console.log('Code actions:', codeActions.map(a => a.title));

        // Verify that code actions are returned
        assert.ok(codeActions.length > 0, 'Should return code actions for missing import diagnostic');

        // Verify that at least one code action is a QuickFix
        const quickFixes = codeActions.filter(action => 
            action.kind && action.kind.contains(vscode.CodeActionKind.QuickFix)
        );
        assert.ok(quickFixes.length > 0, 'Should have at least one QuickFix code action');

        // Clean up
        if (tempTestFile && fs.existsSync(tempTestFile)) {
            await fs.promises.unlink(tempTestFile);
            console.log(`Cleaned up test file: ${tempTestFile}`);
        }
    });

    test('Python - test code action for multiple missing imports', async function() {
        this.timeout(30000);

        // Setup workspace
        getConfigInstance().updateConfig({
            workspace: pythonProjectPath
        });
        const workspaceFolders = setWorkspaceFolders(pythonProjectPath);

        // Create a temporary test file with multiple missing imports
        const testCode = `def test_function():
    # Missing imports for 'os' and 'sys' modules
    path = os.path.join('test', 'file.txt')
    version = sys.version
    return path, version
`;
        
        tempTestFile = path.join(pythonProjectPath, 'test_multiple_missing_imports.py');
        await fs.promises.writeFile(tempTestFile, testCode, 'utf8');
        console.log(`Created test file: ${tempTestFile}`);

        // Open the document and activate language server
        const fileUri = vscode.Uri.file(tempTestFile);
        await activate(fileUri);
        const document = await vscode.workspace.openTextDocument(fileUri);

        // Wait a bit for diagnostics to be available
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get diagnostics for the file
        const diagnostics = await getDiagnosticsForFilePath(tempTestFile);
        console.log('Diagnostics:', diagnostics.map(d => d.message));

        // Filter diagnostics related to missing imports
        const importDiagnostics = diagnostics.filter(d => 
            d.message.includes('undefined') || 
            d.message.includes('not defined') ||
            d.message.includes('import') ||
            d.message.includes('name')
        );

        assert.ok(importDiagnostics.length > 0, 'Should find diagnostics for missing imports');

        // Test code actions for each diagnostic
        let totalCodeActions = 0;
        for (const diagnostic of importDiagnostics) {
            const codeActions = await getCodeAction(fileUri, diagnostic);
            console.log(`Code actions for "${diagnostic.message}":`, codeActions.map(a => a.title));
            totalCodeActions += codeActions.length;
        }

        // Verify that code actions are returned for at least one diagnostic
        assert.ok(totalCodeActions > 0, 'Should return code actions for missing import diagnostics');

        // Clean up
        if (tempTestFile && fs.existsSync(tempTestFile)) {
            await fs.promises.unlink(tempTestFile);
            console.log(`Cleaned up test file: ${tempTestFile}`);
        }
    });
});

