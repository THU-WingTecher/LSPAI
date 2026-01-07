import * as assert from 'assert';
import * as vscode from 'vscode';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../../helper';
import { getConfigInstance, PromptType, Provider, GenerationType, FixType } from '../../../../config';
import { runGenerateTestCodeSuite } from '../../../../experiment';
import { loadAllTargetSymbolsFromWorkspace } from '../../../../lsp/symbol';
import { reloadJavaLanguageServer } from '../../../../lsp/helper';

suite('Fixtures Test Suite - Java', () => {
    const projectPath = "/LSPRAG/src/test/fixtures/java";
    const languageId = 'java';
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

    test('Setup for Java fixtures experiment', async () => {
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
        // Wait longer for Maven import to complete - Java LS can take 15-30 seconds
        console.log('Waiting for Java Language Server to initialize...');
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds for Maven import
        
        // Additional wait to ensure server is fully ready
        // await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('Java Language Server reload completed');
    });

    test('Load target symbols from Java fixtures', async () => {
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
            languageId
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

