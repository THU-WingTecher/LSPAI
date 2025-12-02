import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import * as fs from 'fs';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../../helper';
import { loadAllTargetSymbolsFromWorkspace } from "../../../../lsp/symbol";
import { activate, setupPythonLSP } from '../../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../../../config';

import { runGenerateTestCodeSuite, findMatchedSymbolsFromTaskList } from '../../../../experiment';


function customFilterTaskList(taskList: any[]): any[] {
    return taskList.filter((item: any) => {
        // Remove functions that start with "_"
        if (item.symbolName && item.symbolName.startsWith('_')) {
            return false;
        }
        
        // Remove functions with more than 200 lines of code
        let lineCount = 0;
        if (item.sourceCode) {
            lineCount = item.sourceCode.split('\n').length;
        } else if (item.lineNum !== undefined) {
            // Use lineNum if sourceCode is not available
            lineCount = item.lineNum;
        }
        
        if (lineCount > 200) {
            return false;
        }
        
        return true;
    });
}

async function readSliceAndSaveTaskList(
    taskListPath: string,
    sampleNumber: number
): Promise<string> {
    // Read the task list
    const taskListContent = fs.readFileSync(taskListPath, 'utf-8');
    const taskList = JSON.parse(taskListContent);
    
    // Apply custom filtering
    const filteredTaskList = customFilterTaskList(taskList);
    console.log(`Filtered ${taskList.length - filteredTaskList.length} items (removed functions starting with "_" or >200 lines)`);
    
    // Sort by robustness score (descending - highest first)
    filteredTaskList.sort((a: any, b: any) => b.robustnessScore - a.robustnessScore);
    
    // Slice to sample number if needed
    let slicedTaskList = filteredTaskList;
    if (sampleNumber > 0 && sampleNumber < filteredTaskList.length) {
        slicedTaskList = filteredTaskList.slice(0, sampleNumber);
    }
    
    // Generate output path
    const dir = path.dirname(taskListPath);
    const basename = path.basename(taskListPath, path.extname(taskListPath));
    const outputPath = path.join(dir, `${basename}-sample${sampleNumber > 0 ? sampleNumber : 'all'}.json`);
    
    // Save to JSON file
    fs.writeFileSync(outputPath, JSON.stringify(slicedTaskList, null, 2), 'utf-8');
    console.log(`Task list sliced and saved to: ${outputPath}`);
    
    return outputPath;
}

suite('Experiment Test Suite', () => {
    const pythonInterpreterPath = "/root/miniconda3/envs/black/bin/python";
    const projectPath = "/LSPRAG/experiments/projects/black";
    const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src")];
    const sampleNumber = 100;
    const languageId = "python";
    const blackImportTestPath = "../../../resources/black_module_import_test.py";
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
        await setupPythonLSP(blackModuleImportPath, pythonInterpreterPath);
    });

    // test('Prepare FUT original black-task list ( same with the ICSE-26 paper Table 3, and Table 5 )', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     const taskListPath = '/LSPRAG/experiments/config/black-taskList.json';
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

    test('Prepare FUT with robustness scores for assertion generation analysis', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }

        const taskListPath = '/LSPRAG/experiments/projects/black/symbol_robustness_results.json';
        const sampledTaskListPath = await readSliceAndSaveTaskList(taskListPath, sampleNumber);
        
        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

        symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
        symbols = await findMatchedSymbolsFromTaskList(sampledTaskListPath, symbols, projectPath);

        // // ==== LOAD SYMBOLS FROM TASK LIST ====
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });


    // test('Naive - gpt-4o-mini - continueing', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //         "/LSPRAG/experiments/projects/black/lsprag-workspace/5_31_2025__15_37_29/black/naive_detailed_nofix/gpt-4o-mini/results"
    //     );
    // });

    // test('Symprompt - gpt-4o-mini - continueing', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //         "/LSPRAG/experiments/projects/black/lsprag-workspace/5_31_2025__15_37_29/black/symprompt_detailed_nofix/gpt-4o-mini/results"
    //     );
    // });

    test('LSPRAG - gpt-5 ', async () => {
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