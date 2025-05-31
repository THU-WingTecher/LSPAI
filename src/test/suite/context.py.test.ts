import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { getDiagnosticsForFilePath, groupDiagnosticsByMessage, groupedDiagnosticsToString, getCodeAction, applyCodeActions } from '../../diagnostic';
import { loadAllTargetSymbolsFromWorkspace, setWorkspaceFolders } from '../../helper';
import { loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../config';
import { ProjectName } from '../../config';
import { runGenerateTestCodeSuite, findMatchedSymbolsFromTaskList } from '../../experiment';

suite('Experiment Test Suite', () => {
    const pythonInterpreterPath = "/root/miniconda3/envs/lspai/bin/python";
    const projectPath = "/LSPAI/experiments/projects/black";
    const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src")];
    const sampleNumber = -1;
    const languageId = "python";
    const blackImportTestPath = "/LSPAI/tests/black_module_import_test.py"
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        ...privateConfig
    }
    // let testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

    test('set python interpreter path', async () => {
        await setPythonInterpreterPath(pythonInterpreterPath);
        const currentPythonInterpreterPath = await getPythonInterpreterPath();
        assert.ok(currentPythonInterpreterPath === pythonInterpreterPath, 'python interpreter path should be set as expected');

    });

    test('Language server recognizes installed environment libraries', async () => {
        // Set the desired Python interpreter path (update as needed)

        // Activate the Python extension and log the interpreter in use
        console.log('Python interpreter used by extension:', await getPythonInterpreterPath());

        // Open the test file and collect diagnostics
        const fileUri = vscode.Uri.file(blackImportTestPath);
        await vscode.workspace.openTextDocument(fileUri);
        await setPythonExtraPaths([]);
        const oldPythonExtraPaths = await getPythonExtraPaths();
        console.log('oldPythonExtraPaths:', oldPythonExtraPaths);
        const oldDiagnostics = await getDiagnosticsForFilePath(blackImportTestPath);
        const oldImportErrors = oldDiagnostics.filter(d =>
            d.message.includes('No module named') ||
            d.message.includes('unresolved import') ||
            d.message.includes('not found') ||
            d.message.includes('Import')
        );  
        assert.ok(oldImportErrors.length > 0, 'should have import errors');
        await setPythonExtraPaths(blackModuleImportPath);
        const currentPythonExtraPaths = await getPythonExtraPaths();
        console.log('currentPythonExtraPaths:', currentPythonExtraPaths);
        assert.ok(currentPythonExtraPaths.length === blackModuleImportPath.length, 'python extra paths should be set as expected');
        assert.ok(currentPythonExtraPaths.every((path, index) => path === blackModuleImportPath[index]), 'python extra paths should be set as expected');
        // Log diagnostics for debugging
        const newDiagnostics = await getDiagnosticsForFilePath(blackImportTestPath);
        console.log('newDiagnostics:', newDiagnostics);

        // Assert: No diagnostic about missing pandas or import errors
        const importErrors = newDiagnostics.filter(d =>
            d.message.includes('No module named') ||
            d.message.includes('unresolved import') ||
            d.message.includes('not found') ||
            d.message.includes('Import')
        );
        assert.strictEqual(importErrors.length, 0, 'Should not report missing pandas or import errors');
    });

    test('experiment helper functions', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        const taskListPath = "/LSPAI/experiments/lsprag_data/black/taskList.json"
        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        // const oneFile = randomlySelectOneFileFromWorkspace(languageId);
        // console.log(`#### One file: ${oneFile}`);

        // ==== LOAD TARGET SYMBOL ====
        // const fileName = "comments.py";
        // const symbolName = "_generate_ignored_nodes_from_fmt_skip";
        // const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        // console.log(`#### One file: ${symbolDocumentMap}`);
        // symbols.push(symbolDocumentMap);
        // ==== LOAD TARGET SYMBOL ====
        // ==== LOAD TARGET SYMBOL ====
        // const fileName2 = "DefaultParser.java";
        // const symbolName2 = "handleShortAndLongOption";
        // const symbolDocumentMap2 = await selectOneSymbolFileFromWorkspace(fileName2, symbolName2, languageId);
        // console.log(`#### One file: ${symbolDocumentMap2}`);
        // symbols.push(symbolDocumentMap2);
        // ==== LOAD TARGET SYMBOL ====
        // ==== LOAD ALL SYMBOLS ====
        symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
        if (sampleNumber > 0) {
            const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
            symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
        }
        // ==== LOAD ALL SYMBOLS ====

        // ==== LOAD SYMBOLS FROM TASK LIST ====
        symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);
        if (sampleNumber > 0) {
            const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
            symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
        }
        // ==== LOAD SYMBOLS FROM TASK LIST ====
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });

    test('CFG - experimental - gpt-4o-mini', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.EXPERIMENTAL,
            FixType.NOFIX,
            PromptType.WITHCONTEXT,
            'gpt-4o-mini',
            'openai' as Provider,
            symbols,
            languageId
        );
    });

    // test('AGENT - with context - deepseek-coder', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'deepseek-coder',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });
    
    // test('CFG - experimental - 4o-mini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.EXPERIMENTAL,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('AGENT - with context - 4omini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('CFG - experimental - 4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.EXPERIMENTAL,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('AGENT - with context - 4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

}); 