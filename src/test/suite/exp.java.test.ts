import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, saveTaskList, setWorkspaceFolders, updateWorkspaceFolders } from '../../helper';
import { loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../config';
import { generateFileNameForDiffLanguage } from '../../fileHandler';
import { generateUnitTestForAFunction } from '../../generate';
import { ProjectName } from '../../config';
import { runGenerateTestCodeSuite } from '../../experiment';

suite('Experiment Test Suite - JAVA', () => {
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const sampleNumber = 50;
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
        const oneFile = randomlySelectOneFileFromWorkspace(languageId);
        console.log(`#### One file: ${oneFile}`);

        symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        
        if (sampleNumber > 0) {
            const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
            symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
        }
        console.log(`#### Number of symbols: ${symbols.length}`);
    });


    test('CFG - with context', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.CFG,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            symbols,
            languageId
        );
    });

    // test('CFG - without context', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.CFG,
    //         FixType.ORIGINAL,
    //         PromptType.DETAILED,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('AGENT - with context', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('AGENT - without context', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.DETAILED,
    //         symbols,
    //         languageId
    //     );
    // });

}); 
