import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getDependentContext } from '../../retrieve';
import { getConfigInstance, PromptType } from '../../config';
import { genPrompt } from '../../prompts/promptBuilder';
import { getDocUri, activate } from '../../lsp';
import { collectInfo, ContextInfo } from '../../generate';
import { getAllSymbols } from '../../lsp';
suite('Context and Prompt Tests', () => {
    // const testFilesPath = path.join(__dirname, '../../../testFixture');
    const workspaceFolders = [
        {
            uri: vscode.Uri.file('/LSPAI/experiments/projects/commons-cli'),
            name: 'commons-cli',
            index: 0
        }
    ];
    
    // Update the workspace folders

    const testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli"
    getConfigInstance().updateConfig({ workspace: "/LSPAI/experiments/projects/commons-cli" });
    //set vscode.workspace.workspaceFolders to srcPath
    // Ensure the test directory exists
    if (!fs.existsSync(testFilesPath)) {
        fs.mkdirSync(testFilesPath, { recursive: true });
    }
    
    // Create test files if they don't exist
    const javaTestFile = path.join(testFilesPath, 'GnuParser.java');
    
    let collectedInfo: ContextInfo;
    let collectedInfoSummarized: ContextInfo;
    // const pythonTestFile = path.join(testFilesPath, 'test_module.py');   
    
    test('Test Dependency Context Collection - Java', async () => {
        // Activate the extension
        await vscode.workspace.updateWorkspaceFolders(0, 0, ...workspaceFolders);
        console.log('process.env.DEBUG', process.env.DEBUG);
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        // Open the test file
        getConfigInstance().updateConfig({ promptType: PromptType.DETAILED });
        const docUri = getDocUri(javaTestFile);
        const document = await vscode.workspace.openTextDocument(docUri);
        await vscode.window.showTextDocument(document);
        
        // Wait for language server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get symbols from the document
        const symbols = await getAllSymbols(docUri);
        console.log('symbols', symbols.map((s: vscode.DocumentSymbol) => s.name));
        // const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        //     'vscode.executeDocumentSymbolProvider',
        //     docUri
        // );
        
        assert.ok(symbols && symbols.length > 0, 'Should have symbols');
        
        // Find the calculate method
        const methodSymbol = symbols.find((s: vscode.DocumentSymbol) => s.name.includes('flatten'));
        console.log('methodSymbol', methodSymbol);
        assert.ok(methodSymbol, 'Should find flatten method');
        
        // Test with summarization enabled
        getConfigInstance().updateConfig({ summarizeContext: true });
        
        console.log('=== Testing with summarization ENABLED ===');
        
        // Collect info with summarization
        collectedInfoSummarized = await collectInfo(document, methodSymbol!, 'java', 'TestClass_flatten');
        
        console.log('=== Collected Info (Summarized) ===');

        console.log(JSON.stringify(collectedInfoSummarized.dependentContext, null, 2));
        
        // Generate prompt with summarized context
        // const promptObjSummarized = await genPrompt(collectedInfoSummarized, 'test', 'java');
        
        // console.log('=== Prompt Template (Summarized) ===');
        // console.log(promptObjSummarized[1].content);
        
        // Test with summarization disabled
        getConfigInstance().updateConfig({ summarizeContext: false });
        
        console.log('=== Testing with summarization DISABLED ===');
        
        // Collect info without summarization
        collectedInfo = await collectInfo(document, methodSymbol!, 'java', 'TestClass_flatten');
        // collectedInfo = collectedInfoFull;
        console.log('=== Collected Info (Full) ===');
        console.log(JSON.stringify(collectedInfo.dependentContext, null, 2));
        
        // Generate prompt with full context
        const promptObjFull = await genPrompt(collectedInfo, 'test', 'java');
        
        console.log('=== Prompt Template (Full) ===');
        console.log(promptObjFull[1].content);
        
        // Compare the two versions

        assert.notDeepStrictEqual(
            collectedInfoSummarized.dependentContext, 
            collectedInfo.dependentContext, 
            'Summarized and full context should be different'
        );
        assert.ok(
            collectedInfo.dependentContext.length > collectedInfoSummarized.dependentContext.length,
            'Full context should be longer than summarized context'
        );
    });
    
    // Add a test to display all available prompt templates
    test('Display All Prompt Templates', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        console.log('=== Available Prompt Templates ===');
        
        // Create a simple mock data structure
        if (!collectedInfo) {
            throw new Error('collectedInfo is not initialized');
        }

        // Generate prompts with different prompt types
        getConfigInstance().updateConfig({ promptType: PromptType.BASIC });
        const summarizedBasicPrompt = await genPrompt(collectedInfoSummarized, 'test', 'java');
        
        getConfigInstance().updateConfig({ promptType: PromptType.DETAILED });
        const summarizedDetailedPrompt = await genPrompt(collectedInfoSummarized, 'test', 'java');
        
        getConfigInstance().updateConfig({ promptType: PromptType.CONCISE });
        const summarizedConcisePrompt = await genPrompt(collectedInfoSummarized, 'test', 'java');
        
        console.log('===SUMMARIZED Basic Prompt Template ===');
        console.log(summarizedBasicPrompt[1].content);
        
        console.log('===SUMMARIZED Detailed Prompt Template ===');
        console.log(summarizedDetailedPrompt[1].content);
        
        console.log('===SUMMARIZED Concise Prompt Template ===');
        console.log(summarizedConcisePrompt[1].content);


        // Generate prompts with different prompt types
        getConfigInstance().updateConfig({ promptType: PromptType.BASIC });
        const basicPrompt = await genPrompt(collectedInfo, 'test', 'java');
        
        getConfigInstance().updateConfig({ promptType: PromptType.DETAILED });
        const detailedPrompt = await genPrompt(collectedInfo, 'test', 'java');
        
        getConfigInstance().updateConfig({ promptType: PromptType.CONCISE });
        const concisePrompt = await genPrompt(collectedInfo, 'test', 'java');
        
        console.log('===FULL Basic Prompt Template ===');
        console.log(basicPrompt[1].content);
        
        console.log('===FULL Detailed Prompt Template ===');
        console.log(detailedPrompt[1].content);
        
        console.log('===FULL Concise Prompt Template ===');
        console.log(concisePrompt[1].content);
    });
});