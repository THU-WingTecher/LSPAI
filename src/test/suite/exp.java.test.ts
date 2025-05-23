import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, saveTaskList, setWorkspaceFolders, selectOneSymbolFileFromWorkspace } from '../../helper';
import { loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../config';
import { generateFileNameForDiffLanguage } from '../../fileHandler';
import { generateUnitTestForAFunction } from '../../generate';
import { ProjectName } from '../../config';
import { runGenerateTestCodeSuite } from '../../experiment';

suite('Experiment Test Suite - JAVA', () => {
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const sampleNumber = -1;
    const languageId = 'java';
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

    test('set JAVA configuration', async () => {
    });

    test('experiment helper functions', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        
        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        // const oneFile = randomlySelectOneFileFromWorkspace(languageId);
        // console.log(`#### One file: ${oneFile}`);

        // ==== LOAD TARGET SYMBOL ====
        // const fileName = "DefaultParser.java";
        // const symbolName = "handleConcatenatedOptions";
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
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });

    // test('select target file name and symbol', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     const fileName = "DefaultParser.java";
    //     const symbolName = "handleConcatenatedOptions";
    //     const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, 'java');
    //     console.log(`#### One file: ${symbolDocumentMap}`);
    //     symbols.push(symbolDocumentMap);
    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    // });

    test('CFG - experimental - deepseek-coder', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.EXPERIMENTAL,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            'deepseek-coder',
            'deepseek' as Provider,
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
