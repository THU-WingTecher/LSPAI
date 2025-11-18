import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { getAllSymbols } from '../../../lsp/symbol';
import { getConfigInstance, Provider, GenerationType, PromptType } from '../../../config';
import { activate, setPythonExtraPaths } from '../../../lsp/helper';
import { setWorkspaceFolders } from '../../../helper';

suite('LSP-Features: Symbol Finding Test', () => {
    const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
    const pythonProjectPath = path.join(fixturesDir, 'python');
    const javaProjectPath = path.join(fixturesDir, 'java');
    const goProjectPath = path.join(fixturesDir, 'go');
    
    test('Python - Symbol Finding All Test', async function() {

        getConfigInstance().updateConfig({
            workspace: pythonProjectPath
        });

        // await setPythonExtraPaths([pythonProjectPath]);
        const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
        console.log(`Python workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const fileName = "calculator.py";
        // const symbolName = "compute";
        // const languageId = "python";
        const fileUri = vscode.Uri.file(path.join(pythonProjectPath, fileName));
        const symbols = await getAllSymbols(fileUri);
        console.log("Python symbols:", symbols.map(s => s.name));
        assert.ok(symbols.length > 0, 'Should find symbols');

        // symbols should contain logger function
        const loggerSymbol = symbols.find(s => s.name === 'logger');
        assert.ok(loggerSymbol, 'Should find logger function');

        // symbols should contain compute function
        const computeSymbol = symbols.find(s => s.name === 'compute');
        assert.ok(computeSymbol, 'Should find compute function');

        // symbols should contain sum_list function
        const sumListSymbol = symbols.find(s => s.name === 'sum_list');
        assert.ok(sumListSymbol, 'Should find sum_list function');
    });
    
    test('Java - Symbol Finding All Test', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            workspace: javaProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(javaProjectPath);
        console.log(`Java workspace path: ${workspaceFolders[0].uri.fsPath}`);

        // Wait for Java language server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        const fileName = "src/main/java/com/example/Calculator.java";
        const fileUri = vscode.Uri.file(path.join(javaProjectPath, fileName));
        const symbols = await getAllSymbols(fileUri);
        console.log("Java symbols:", symbols.map(s => s.name));
        assert.ok(symbols.length > 0, 'Should find symbols');

        // symbols should contain Calculator class
        const calculatorSymbol = symbols.find(s => s.name === 'Calculator');
        assert.ok(calculatorSymbol, 'Should find Calculator class');

        // symbols should contain compute method
        const computeSymbol = symbols.find(s => s.name === 'compute(String, int, int)');
        assert.ok(computeSymbol, 'Should find compute method');

        // symbols should contain sumArray method
        const sumArraySymbol = symbols.find(s => s.name === 'sumArray(int[])');
        assert.ok(sumArraySymbol, 'Should find sumArray method');
    });

    test('Go - Symbol Finding All Test', async function() {
        this.timeout(60000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            workspace: goProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(goProjectPath);
        console.log(`Go workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const fileName = "calculator.go";
        const fileUri = vscode.Uri.file(path.join(goProjectPath, fileName));
        
        // Explicitly open the document to trigger Go language server initialization
        const document = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(document);
        
        // Wait longer for Go language server to initialize (vscgo installation may be needed)
        await new Promise(resolve => setTimeout(resolve, 10000));

        const symbols = await getAllSymbols(fileUri);
        console.log("Go symbols:", symbols.map(s => s.name));
        assert.ok(symbols.length > 0, 'Should find symbols');

        // symbols should contain Calculator type
        const calculatorSymbol = symbols.find(s => s.name === 'Calculator');
        assert.ok(calculatorSymbol, 'Should find Calculator type');

        // symbols should contain NewCalculator function
        const newCalculatorSymbol = symbols.find(s => s.name === 'NewCalculator');
        assert.ok(newCalculatorSymbol, 'Should find NewCalculator function');

        // symbols should contain Compute method
        const computeSymbol = symbols.find(s => s.name === '(*Calculator).Compute');
        assert.ok(computeSymbol, 'Should find Compute method');

        // symbols should contain SumSlice method
        const sumSliceSymbol = symbols.find(s => s.name === '(*Calculator).SumSlice');
        assert.ok(sumSliceSymbol, 'Should find SumSlice method');
    });
    
});

