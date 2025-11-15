import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { getContextSelectorInstance } from '../../../agents/contextSelector';
import { getConfigInstance, Provider, GenerationType, PromptType } from '../../../config';
import { activate, setPythonExtraPaths } from '../../../lsp/helper';
import { selectOneSymbolFileFromWorkspace, setWorkspaceFolders } from '../../../helper';
import { getReferenceInfo, findReferences } from '../../../lsp/reference';
import { DecodedToken } from '../../../lsp/types';
import { VscodeRequestManager } from '../../../lsp/vscodeRequestManager';

suite('LSP Features Test - Python, Java, Go', () => {
    const fixturesDir = path.join(__dirname, '../../fixtures');
    const pythonProjectPath = path.join(fixturesDir, 'python');
    const javaProjectPath = path.join(fixturesDir, 'java');
    const goProjectPath = path.join(fixturesDir, 'go');

    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.AGENT,
        promptType: PromptType.DETAILED,
        parallelCount: 1,
        maxRound: 3,
        savePath: path.join(__dirname, '../../../logs'),
    };

    test('Python - Test Tokens Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: pythonProjectPath
        });

        await setPythonExtraPaths([pythonProjectPath]);
        const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
        console.log(`Python workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const fileName = "calculator.py";
        const symbolName = "compute";
        const languageId = "python";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const contextSelector = await getContextSelectorInstance(
            symbolDocumentMap.document,
            symbolDocumentMap.symbol
        );

        const tokens = contextSelector!.getTokens();
        console.log("Python tokens:", tokens.map((t: DecodedToken) => t.word));

        const expectedTokens = ['add', 'multiply', 'operation', 'a', 'b'];
        const tokenWords = tokens.map((t: DecodedToken) => t.word);
        const hasExpectedTokens = expectedTokens.some(token => tokenWords.includes(token));
        assert.ok(hasExpectedTokens, 'Should include expected tokens like add, multiply');
        assert.ok(tokens.length > 0, 'Should have tokens');
    });

    test('Python - Test Definition Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: pythonProjectPath
        });

        await setPythonExtraPaths([pythonProjectPath]);
        const workspaceFolders = setWorkspaceFolders(pythonProjectPath);

        const fileName = "calculator.py";
        const symbolName = "compute";
        const languageId = "python";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const document = symbolDocumentMap.document;
        const symbol = symbolDocumentMap.symbol;

        const contextSelector = await getContextSelectorInstance(document, symbol);
        const tokens = contextSelector!.getTokens();

        const addToken = tokens.find((t: DecodedToken) => t.word === 'add');
        assert.ok(addToken, 'Should find add token');

        if (addToken) {
            const position = new vscode.Position(addToken.line, addToken.startChar);
            const definitions = await VscodeRequestManager.definitions(document.uri, position);
            console.log("Python definitions for 'add':", definitions.map(d => d.uri.fsPath));
            assert.ok(definitions.length > 0, 'Should find definition for add function');
            assert.ok(definitions[0].uri.fsPath.includes('math_utils.py'), 'Definition should be in math_utils.py');
        }
    });

    test('Python - Test Reference Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: pythonProjectPath
        });

        await setPythonExtraPaths([pythonProjectPath]);
        const workspaceFolders = setWorkspaceFolders(pythonProjectPath);

        const fileName = "math_utils.py";
        const symbolName = "add";
        const languageId = "python";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const document = symbolDocumentMap.document;
        const symbol = symbolDocumentMap.symbol;

        const references = await findReferences(document, symbol.selectionRange.start);
        console.log("Python references for 'add':", references.map(r => r.uri.fsPath));

        assert.ok(references.length > 0, 'Should find references for add function');
        const referenceFiles = references.map(r => path.basename(r.uri.fsPath));
        assert.ok(referenceFiles.includes('calculator.py') || referenceFiles.includes('main.py'), 
            'Should find references in calculator.py or main.py');
    });

    test('Java - Test Tokens Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: javaProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(javaProjectPath);
        console.log(`Java workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const fileName = "Calculator.java";
        const symbolName = "compute";
        const languageId = "java";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const contextSelector = await getContextSelectorInstance(
            symbolDocumentMap.document,
            symbolDocumentMap.symbol
        );

        const tokens = contextSelector!.getTokens();
        console.log("Java tokens:", tokens.map((t: DecodedToken) => t.word));

        const expectedTokens = ['MathUtils', 'add', 'multiply', 'operation'];
        const tokenWords = tokens.map((t: DecodedToken) => t.word);
        const hasExpectedTokens = expectedTokens.some(token => tokenWords.includes(token));
        assert.ok(hasExpectedTokens, 'Should include expected tokens like MathUtils, add, multiply');
        assert.ok(tokens.length > 0, 'Should have tokens');
    });

    test('Java - Test Definition Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: javaProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(javaProjectPath);

        const fileName = "Calculator.java";
        const symbolName = "compute";
        const languageId = "java";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const document = symbolDocumentMap.document;
        const symbol = symbolDocumentMap.symbol;

        const contextSelector = await getContextSelectorInstance(document, symbol);
        const tokens = contextSelector!.getTokens();

        const mathUtilsToken = tokens.find((t: DecodedToken) => t.word === 'MathUtils');
        assert.ok(mathUtilsToken, 'Should find MathUtils token');

        if (mathUtilsToken) {
            const position = new vscode.Position(mathUtilsToken.line, mathUtilsToken.startChar);
            const definitions = await VscodeRequestManager.definitions(document.uri, position);
            console.log("Java definitions for 'MathUtils':", definitions.map(d => d.uri.fsPath));
            assert.ok(definitions.length > 0, 'Should find definition for MathUtils class');
            assert.ok(definitions[0].uri.fsPath.includes('MathUtils.java'), 'Definition should be in MathUtils.java');
        }
    });

    test('Java - Test Reference Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: javaProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(javaProjectPath);

        const fileName = "MathUtils.java";
        const symbolName = "add";
        const languageId = "java";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const document = symbolDocumentMap.document;
        const symbol = symbolDocumentMap.symbol;

        const references = await findReferences(document, symbol.selectionRange.start);
        console.log("Java references for 'add':", references.map(r => r.uri.fsPath));

        assert.ok(references.length > 0, 'Should find references for add method');
        const referenceFiles = references.map(r => path.basename(r.uri.fsPath));
        assert.ok(referenceFiles.includes('Calculator.java') || referenceFiles.includes('Main.java'), 
            'Should find references in Calculator.java or Main.java');
    });

    test('Go - Test Tokens Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: goProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(goProjectPath);
        console.log(`Go workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const fileName = "calculator.go";
        const symbolName = "Compute";
        const languageId = "go";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const contextSelector = await getContextSelectorInstance(
            symbolDocumentMap.document,
            symbolDocumentMap.symbol
        );

        const tokens = contextSelector!.getTokens();
        console.log("Go tokens:", tokens.map((t: DecodedToken) => t.word));

        const expectedTokens = ['Add', 'Multiply', 'operation'];
        const tokenWords = tokens.map((t: DecodedToken) => t.word);
        const hasExpectedTokens = expectedTokens.some(token => tokenWords.includes(token));
        assert.ok(hasExpectedTokens, 'Should include expected tokens like Add, Multiply');
        assert.ok(tokens.length > 0, 'Should have tokens');
    });

    test('Go - Test Definition Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: goProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(goProjectPath);

        const fileName = "calculator.go";
        const symbolName = "Compute";
        const languageId = "go";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const document = symbolDocumentMap.document;
        const symbol = symbolDocumentMap.symbol;

        const contextSelector = await getContextSelectorInstance(document, symbol);
        const tokens = contextSelector!.getTokens();

        const addToken = tokens.find((t: DecodedToken) => t.word === 'Add');
        assert.ok(addToken, 'Should find Add token');

        if (addToken) {
            const position = new vscode.Position(addToken.line, addToken.startChar);
            const definitions = await VscodeRequestManager.definitions(document.uri, position);
            console.log("Go definitions for 'Add':", definitions.map(d => d.uri.fsPath));
            assert.ok(definitions.length > 0, 'Should find definition for Add function');
            assert.ok(definitions[0].uri.fsPath.includes('math_utils.go'), 'Definition should be in math_utils.go');
        }
    });

    test('Go - Test Reference Feature', async function() {
        this.timeout(30000);
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        getConfigInstance().updateConfig({
            ...currentConfig,
            workspace: goProjectPath
        });

        const workspaceFolders = setWorkspaceFolders(goProjectPath);

        const fileName = "math_utils.go";
        const symbolName = "Add";
        const languageId = "go";

        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map');

        const document = symbolDocumentMap.document;
        const symbol = symbolDocumentMap.symbol;

        const references = await findReferences(document, symbol.selectionRange.start);
        console.log("Go references for 'Add':", references.map(r => r.uri.fsPath));

        assert.ok(references.length > 0, 'Should find references for Add function');
        const referenceFiles = references.map(r => path.basename(r.uri.fsPath));
        assert.ok(referenceFiles.includes('calculator.go') || referenceFiles.includes('main.go'), 
            'Should find references in calculator.go or main.go');
    });
});

