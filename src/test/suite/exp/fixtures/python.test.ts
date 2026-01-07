import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../../helper';
import { loadAllTargetSymbolsFromWorkspace } from "../../../../lsp/symbol";
import { activate, setupPythonLSP } from '../../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../../../config';
import { runGenerateTestCodeSuite } from '../../../../experiment';

suite('Fixtures Test Suite - Python', () => {
    const projectPath = "/LSPRAG/src/test/fixtures/python";
    const interpreterPath = "/root/miniconda3/envs/black/bin/python";
    const languageId = "python";
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
    };
    
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

    test('Setup for Python fixtures experiment', async () => {
        const workspaceFolders = setWorkspaceFolders(projectPath);
        try {
            await updateWorkspaceFolders(workspaceFolders);
            console.log('Workspace folders updated to:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
        } catch (error) {
            console.error('Error updating workspace folders:', error);
        }
        assert.ok(vscode.workspace.workspaceFolders, 'Workspace folders should be set');
        assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, projectPath, 'Workspace folder should match project path');
        
        // Setup Python LSP with the fixture project path
        const pythonModulePath = [projectPath];
        await setupPythonLSP(pythonModulePath, interpreterPath);
    });

    test('Load target symbols from Python fixtures', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }

        const workspaceFolders = setWorkspaceFolders(projectPath);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

        symbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);

        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols loaded: ${symbols.length}`);
        console.log(`#### Symbol names: ${symbols.map(s => s.symbol.name).join(', ')}`);
    });

    test('LSPRAG - gpt-4o-mini', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.LSPRAG,
            FixType.ORIGINAL,
            PromptType.WITHCONTEXT,
            'gpt-4o-mini',
            'openai' as Provider,
            symbols,
            languageId,
        );
    });

    // Example: Uncomment to test with Naive approach
    // test('Naive - gpt-4o-mini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // Example: Uncomment to test with SymPrompt approach
    // test('SymPrompt - gpt-4o-mini', async () => {
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

}); 

