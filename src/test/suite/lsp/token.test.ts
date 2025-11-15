import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { getAllSymbols, getSymbolFromDocument } from '../../../lsp/symbol';
import { getContextSelectorInstance } from '../../../agents/contextSelector';
import { getConfigInstance, Provider, GenerationType, PromptType } from '../../../config';
import { activate, setPythonExtraPaths } from '../../../lsp/helper';
import { setWorkspaceFolders } from '../../../helper';
import { selectOneSymbolFileFromWorkspace } from "../../../lsp/symbol";
import { getReferenceInfo, findReferences } from '../../../lsp/reference';
import { DecodedToken } from '../../../lsp/types';
import { VscodeRequestManager } from '../../../lsp/vscodeRequestManager';
import { getDecodedTokensFromSymbol } from '../../../lsp/token';

suite('LSP-Features: Token Finding Test', () => {
    const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
    const pythonProjectPath = path.join(fixturesDir, 'python');
    const javaProjectPath = path.join(fixturesDir, 'java');
    const goProjectPath = path.join(fixturesDir, 'go');
    
    test('Python - Token Finding Test', async function() {

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
        const document = await vscode.workspace.openTextDocument(fileUri);
        const symbol = await getSymbolFromDocument(document, 'compute');
        assert.ok(symbol, 'Should find compute function');
        const tokens = await getDecodedTokensFromSymbol(document, symbol);
        console.log("Python tokens:", tokens.map(t => t.word));
        assert.ok(tokens.length > 0, 'Should find tokens');

        // token name "add" and "multiply" should be included 
        const addToken = tokens.find(t => t.word === 'add');
        assert.ok(addToken, 'Should find add token');
        const multiplyToken = tokens.find(t => t.word === 'multiply');
        assert.ok(multiplyToken, 'Should find multiply token');
    });

    test('Java - Token Finding Test', async function() {
        this.timeout(30000);

        getConfigInstance().updateConfig({
            workspace: javaProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(javaProjectPath);
        console.log(`Java workspace path: ${workspaceFolders[0].uri.fsPath}`);

        // Wait for Java language server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        const fileName = "src/main/java/com/example/Calculator.java";
        const fileUri = vscode.Uri.file(path.join(javaProjectPath, fileName));
        const document = await vscode.workspace.openTextDocument(fileUri);
        const symbol = await getSymbolFromDocument(document, 'compute');
        assert.ok(symbol, 'Should find compute method');
        const tokens = await getDecodedTokensFromSymbol(document, symbol);
        console.log("Java tokens:", tokens.map(t => t.word));
        assert.ok(tokens.length > 0, 'Should find tokens');

        // token name "add" and "multiply" should be included 
        const addToken = tokens.find(t => t.word === 'add');
        assert.ok(addToken, 'Should find add token');
        const multiplyToken = tokens.find(t => t.word === 'multiply');
        assert.ok(multiplyToken, 'Should find multiply token');
    });

    test('Go - Token Finding Test', async function() {
        this.timeout(60000);

        getConfigInstance().updateConfig({
            workspace: goProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(goProjectPath);
        console.log(`Go workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const fileName = "calculator.go";
        const fileUri = vscode.Uri.file(path.join(goProjectPath, fileName));
        const document = await vscode.workspace.openTextDocument(fileUri);
        
        // Wait for Go language server to initialize
        await new Promise(resolve => setTimeout(resolve, 5000));

        const symbol = await getSymbolFromDocument(document, 'Compute');
        assert.ok(symbol, 'Should find Compute method');
        const tokens = await getDecodedTokensFromSymbol(document, symbol);
        console.log("Go tokens:", tokens.map(t => t.word));
        assert.ok(tokens.length > 0, 'Should find tokens');

        // token name "Add" and "Multiply" should be included 
        const addToken = tokens.find(t => t.word === 'Add');
        assert.ok(addToken, 'Should find Add token');
        const multiplyToken = tokens.find(t => t.word === 'Multiply');
        assert.ok(multiplyToken, 'Should find Multiply token');
    });
    
});

