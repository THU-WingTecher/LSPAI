import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { getAllSymbols, selectOneSymbolFileFromWorkspace } from '../../../lsp/symbol';
import { getConfigInstance } from '../../../config';
import { setWorkspaceFolders } from '../../../helper';
import { DecodedToken } from '../../../lsp/types';
import { getDecodedTokensFromSymbol, getSourceFromDefinition, loadDefAndSaveToDefSymbol } from '../../../lsp/token';
import { findReferences } from '../../../lsp/reference';
import { getDiagnosticsForFilePath } from '../../../lsp/diagnostic';

suite('LSP-Features: Python Test', () => {
    const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
    const pythonProjectPath = path.join(fixturesDir, 'python');
    let fileUri: vscode.Uri | null = null;
    let targetSymbol: vscode.DocumentSymbol | null = null;
    let targetToken: DecodedToken | null = null;
    test('Python - symbol collecting test', async function() {

        getConfigInstance().updateConfig({
            workspace: pythonProjectPath
        });

        // await setPythonExtraPaths([pythonProjectPath]);
        const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
        console.log(`Python workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const fileName = "calculator.py";
        // const symbolName = "compute";
        // const languageId = "python";
        fileUri = vscode.Uri.file(path.join(pythonProjectPath, fileName));
        const symbols = await getAllSymbols(fileUri);
        console.log("Python symbols:", symbols.map(s => s.name));
        assert.ok(symbols.length > 0, 'Should find symbols');

        // symbols should contain logger function
        const loggerSymbol = symbols.find(s => s.name === 'logger');
        assert.ok(loggerSymbol, 'Should find logger function');

        // symbols should contain compute function
        const computeSymbol = symbols.find(s => s.name === 'compute');
        assert.ok(computeSymbol, 'Should find compute function');
        targetSymbol = computeSymbol;

        // symbols should contain sum_list function
        const sumListSymbol = symbols.find(s => s.name === 'sum_list');
        assert.ok(sumListSymbol, 'Should find sum_list function');
    });

    test('Python - token collecting test', async function() {
        assert.ok(fileUri, 'File URI should be set');
        assert.ok(targetSymbol, 'Target symbol should be set');
        const document = await vscode.workspace.openTextDocument(fileUri);
        const tokens = await getDecodedTokensFromSymbol(document, targetSymbol!);
        console.log("Python tokens:", tokens.map(t => t.word));
        assert.ok(tokens.length > 0, 'Should find tokens');

        // token name "add" and "multiply" should be included 
        const addToken = tokens.find(t => t.word === 'add');
        assert.ok(addToken, 'Should find add token');
        targetToken = addToken;
        const multiplyToken = tokens.find(t => t.word === 'multiply');
        assert.ok(multiplyToken, 'Should find multiply token');
    });

    test('Python - definition collecting test', async function() {
        assert.ok(fileUri, 'File URI should be set');
        assert.ok(targetSymbol, 'Target symbol should be set');
        await loadDefAndSaveToDefSymbol(targetToken!);
        assert.ok(targetToken!.definition, 'Should find definition symbol');
        assert.ok(targetToken!.defSymbol, 'Should find definition symbol');
        // load definition source code
        const definitionSourceCode = await getSourceFromDefinition(targetToken!);
        console.log("Python definition source code:", definitionSourceCode);
        assert.ok(definitionSourceCode, 'Should find definition source code');
        // definition source code should contain add function
        assert.ok(definitionSourceCode!.includes('return a + b'), 'Should find add function in definition source code');
        // definition source code should contain multiply function

    });

    test('Python - reference collecting test', async function() {
        const fileName = "math_utils.py";
        const symbolName = "add";
        // const languageId = "python";
        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, "python");
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');
        const symbol = symbolDocumentMap.symbol;
        const references = await findReferences(symbolDocumentMap.document, symbol.selectionRange.start);
        console.log("Python references for 'add':", references.map(r => r.uri.fsPath));
        assert.ok(references.length > 0, 'Should find references for add function');
        
    });

    test('Python - Diagnostic test', async function() {
        // this.timeout(30000);

        // getConfigInstance().updateConfig({
        //     workspace: pythonProjectPath
        // });
        
        // // Actually update workspace folders so workspace settings can be written
        // if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        //     await vscode.workspace.updateWorkspaceFolders(0, 0, {
        //         uri: vscode.Uri.file(pythonProjectPath),
        //         name: path.basename(pythonProjectPath),
        //     });
        //     // Wait for language server to initialize
        //     await new Promise(resolve => setTimeout(resolve, 2000));
        // }
        // const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
        // assert.ok(currentWorkspace, 'Workspace should be set');
        // assert.ok(currentWorkspace.uri.fsPath === pythonProjectPath, 'Workspace path should match');
        
        // // Test 1: Python Interpreter Path
        // const currentInterpreterPath = await getPythonInterpreterPath();
        // console.log('Current Python interpreter path:', currentInterpreterPath);
        // assert.ok(currentInterpreterPath.length > 0, 'Should have a Python interpreter path');

        // // Test setting interpreter path (if we have a valid path)
        // if (currentInterpreterPath.length > 0) {
        //     await setPythonInterpreterPath(currentInterpreterPath);
        //     const updatedInterpreterPath = await getPythonInterpreterPath();
        //     assert.ok(updatedInterpreterPath === currentInterpreterPath, 'Python interpreter path should be set correctly');
        //     console.log('Python interpreter path set and verified:', updatedInterpreterPath);
        // }

        // Test 2: Extra Python Paths
        const fileName = "calculator.py";
        const filePath = path.join(pythonProjectPath, fileName);
        // console.log('Python interpreter used by extension:', await getPythonInterpreterPath());
        // Initially set extra paths to empty
        // await setPythonExtraPaths([]);
        // const oldPythonExtraPaths = await getPythonExtraPaths();
        // console.log('Initial Python extra paths:', oldPythonExtraPaths);
        
        // Get diagnostics without extra paths
        const diagnosticsWithoutExtraPaths = await getDiagnosticsForFilePath(filePath);
        console.log('Diagnostics without extra paths:', diagnosticsWithoutExtraPaths.map(d => d.message));

        // Set extra paths to include the fixtures directory
        // const extraPaths = [pythonProjectPath];
        // await setPythonExtraPaths(extraPaths);
        // const currentPythonExtraPaths = await getPythonExtraPaths();
        // console.log('Current Python extra paths:', currentPythonExtraPaths);
        
        // Verify extra paths are set correctly
        // assert.ok(currentPythonExtraPaths.length === extraPaths.length, 'Python extra paths should be set as expected');
        // assert.ok(currentPythonExtraPaths.every((p, index) => p === extraPaths[index]), 'Python extra paths should match expected values');

        // Wait for language server to update with new paths
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get diagnostics with extra paths set
        const diagnosticsWithExtraPaths = await getDiagnosticsForFilePath(filePath);
        console.log('Diagnostics with extra paths:', diagnosticsWithExtraPaths.map(d => d.message));

        // Check for import errors in diagnostics
        const importErrors = diagnosticsWithExtraPaths.filter(d =>
            d.message.includes('No module named') ||
            d.message.includes('unresolved import') ||
            d.message.includes('not found') ||
            d.message.includes('Import')
        );

        // Since calculator.py imports math_utils from the same directory, there should be no import errors
        assert.strictEqual(importErrors.length, 0, 'Should not have import errors when extra paths are set correctly');
    });
});