import * as assert from 'assert';
import * as vscode from 'vscode';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../../helper';
import { getConfigInstance, PromptType, Provider, GenerationType, FixType } from '../../../../config';
import { runGenerateTestCodeSuite } from '../../../../experiment';
import { loadAllTargetSymbolsFromWorkspace } from '../../../../lsp/symbol';
import { findMatchedSymbolsFromTaskList } from '../../../../experiment';
import { readSliceAndSaveTaskList } from '../../../../experiment/utils/helper';
import { getDiagnosticsForFilePath } from '../../../../lsp/diagnostic';
import { reloadJavaLanguageServer } from '../../../../lsp/helper';

suite('Experiment Test Suite - JAVA', () => {
    const projectPath = "/LSPRAG/experiments/projects/commons-csv";
    const sampleNumber = 20;
    const languageId = 'java';
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
    };
    // let testFilesPath = "/LSPRAG/experiments/projects/commons-csv/src/main/java/org/apache/commons/cli";  
    getConfigInstance().updateConfig({
        ...currentConfig
    });

    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

    test('Setup for experiment - Configure Java source paths and classpath', async () => {
        const workspaceFolders = setWorkspaceFolders(projectPath);
        try {
            await updateWorkspaceFolders(workspaceFolders);
            console.log('Workspace folders updated to:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
        } catch (error) {
            console.error('Error updating workspace folders:', error);
        }
        assert.ok(vscode.workspace.workspaceFolders, 'Workspace folders should be set');
        assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, projectPath, 'Workspace folder should match project path');

        console.log('\n========== Reloading Java Language Server ==========');
        await reloadJavaLanguageServer();
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for Maven import to complete
        console.log('Java Language Server reload completed');
        
        // Open the test file to ensure Language Server analyzes it
        const testFilePath = "/LSPRAG/experiments/projects/commons-csv/src/lsprag/test/java/org/apache/commons/csv/CSVRecord_get_9851Test.java";
        const testFileUri = vscode.Uri.file(testFilePath);
        const document = await vscode.workspace.openTextDocument(testFileUri);
        await vscode.window.showTextDocument(document);
        console.log('\n========== Opened test file ==========');
        console.log('Test file path:', testFilePath);
        
        // Wait for Language Server to analyze the file
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get diagnostics after file is opened and analyzed
        console.log('\n========== Diagnostics for Test File ==========');
        const diagnostics = await getDiagnosticsForFilePath(testFilePath);
        console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
        
        // Verify that the file is on the classpath (should NOT have classpath error)
        const classpathErrors = diagnostics.filter(d => d.message.includes('is not on the classpath of project'));
        assert.strictEqual(classpathErrors.length, 0, `File should be on classpath. Found classpath errors: ${classpathErrors.map(d => d.message).join(', ')}`);
        
        // If there are diagnostics, they should be actual code errors, not classpath issues
        if (diagnostics.length > 0) {
            console.log('Found diagnostics (should be code errors, not classpath issues):', diagnostics.map(d => d.message));
        }
    });

    // test('Prepare FUT original commons-csv-task list ( same with the ICSE-26 paper Table 3, and Table 5 ', async () => {
        
    //     const taskListPath = '/LSPRAG/experiments/config/commons-csv-taskList.json';
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

    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    //     console.log(`#### Number of symbols: ${symbols.length}`);
    // });

    test('Prepare FUT with robustness scores for assertion generation analysis (commons-csv)', async () => {

        const taskListPath = '/LSPRAG/experiments/projects/commons-csv/symbol_robustness_results.json';
        const sampledTaskListPath = await readSliceAndSaveTaskList(taskListPath, 5);
        
        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

        symbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);
        symbols = await findMatchedSymbolsFromTaskList(sampledTaskListPath, symbols, projectPath);

        // // ==== LOAD SYMBOLS FROM TASK LIST ====
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });

    test('CFG - LSPRAG - 4o-mini', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.LSPRAG,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            'gpt-4o-mini',
            'openai' as Provider,
            symbols,
            languageId
        );
    });

    // test('CFG - experimental - deepseek-coder', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.LSPRAG,
    //         FixType.NOFIX,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
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
