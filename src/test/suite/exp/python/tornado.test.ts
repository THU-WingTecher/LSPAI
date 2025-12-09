import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import { randomlySelectOneFileFromWorkspace, setWorkspaceFolders, updateWorkspaceFolders } from '../../../../helper';
import { loadAllTargetSymbolsFromWorkspace } from "../../../../lsp/symbol";

import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath, setupPythonLSP } from '../../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../../../config';
import { runGenerateTestCodeSuite, findMatchedSymbolsFromTaskList } from '../../../../experiment';
import { readSliceAndSaveTaskList } from '../../../../experiment/utils/helper';

suite('Experiment Test Suite', () => {
    const pythonInterpreterPath = "/root/miniconda3/envs/LSPRAG/bin/python";
    const projectPath = "/LSPRAG/experiments/projects/tornado";
    const pyExtraPath = [path.join(projectPath, "tornado"), projectPath];
    const sampleNumber = -1;
    const languageId = "python";
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
    };
    // let testFilesPath = "/LSPRAG/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

    test('Setup for experiment', async () => {
        const workspaceFolders = setWorkspaceFolders(projectPath);
        try {
            await updateWorkspaceFolders(workspaceFolders);
            console.log('Workspace folders updated to:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
        } catch (error) {
            console.error('Error updating workspace folders:', error);
        }
        assert.ok(vscode.workspace.workspaceFolders, 'Workspace folders should be set');
        assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, projectPath, 'Workspace folder should match project path');
        await setupPythonLSP(pyExtraPath, pythonInterpreterPath);
    });

    test('Prepare FUT with robustness scores for assertion generation analysis', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
    
        const taskListPath = '/LSPRAG/experiments/projects/tornado/symbol_robustness_results.json';
        const sampledTaskListPath = await readSliceAndSaveTaskList(taskListPath, 100);
        
        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
    
        symbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);
        symbols = await findMatchedSymbolsFromTaskList(sampledTaskListPath, symbols, projectPath);
    
        // // ==== LOAD SYMBOLS FROM TASK LIST ====
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });
    
    // test('Prepare FUT original tornado-task list ( same with the ICSE-26 paper Table 3, and Table 5 )', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     const taskListPath = '/LSPRAG/experiments/config/tornado-taskList.json';
    //     const workspaceFolders = setWorkspaceFolders(projectPath);
    //     // await updateWorkspaceFolders(workspaceFolders);
    //     console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

    //     symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
    //     if (sampleNumber > 0) {
    //         const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
    //         symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    //     }

    //     symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);
    //     if (sampleNumber > 0) {
    //         const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
    //         symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    //     }
    //     // // ==== LOAD SYMBOLS FROM TASK LIST ====
    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    //     console.log(`#### Number of symbols: ${symbols.length}`);
    // });

    test('LSPRAG - gpt-5', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.LSPRAG,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            'gpt-5',
            'openai' as Provider,
            symbols,
            languageId,
        );
    });

    // test('Symprompt - gpt-4o-mini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Naive - gpt-4o ', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Symprompt - gpt-4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Naive - deepseek-chat', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Symprompt - deepseek-chat', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

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
    //         GenerationType.LSPRAG,
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
    //         GenerationType.LSPRAG,
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