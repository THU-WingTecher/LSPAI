import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getContextSelectorInstance, ContextTerm } from '../../agents/contextSelector';
import { getConfigInstance, loadPrivateConfig, Provider, GenerationType, PromptType } from '../../config';
import { getDocUri, activate, getReference } from '../../lsp';
import { getAllSymbols } from '../../lsp';
import { setWorkspaceFolders } from '../../helper';
import { getSourcCodes } from '../../retrieve';

suite('Context Selector Agent Tests', () => {
    // Test file path - adjust this to point to a real file in your test fixture
    
    // Update config with source path
    
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    let testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli/GnuParser.java";  
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.AGENT,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        parallelCount: 1,
        maxRound: 3,
        savePath: path.join(__dirname, '../../../logs'),
        ...privateConfig
    }
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    // getConfigInstance().updateConfig({
    //     model: 'deepseek-reasoner',
    //     provider: 'deepseek',
    //     ...privateConfig
    // });
    getConfigInstance().logAllConfig();    

    
    test('Context Gathering for Terms', async () => {
        // Create some test terms
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        const sampleJson = [
            {
              "name": "stripLeadingHyphens",
              "need_definition_reason": "The behavior of Util.stripLeadingHyphens() is critical to how options are parsed. Without knowing its implementation, it's unclear how many hyphens are stripped or if it handles edge cases like multiple hyphens.",
              "need_example_reason": "An example of the output of Util.stripLeadingHyphens() for inputs like \"--opt\" or \"-D\" would clarify how the method normalizes arguments.",
              "need_definition": true,
              "need_example": true
            },
            {
              "name": "indexOfEqual",
              "need_definition_reason": "The implementation of DefaultParser.indexOfEqual() denameines how option-value pairs (e.g., --key=value) are split. Without context, we cannot verify edge cases like escaped equal signs or values containing equal signs.",
              "need_example_reason": "An example showing how indexOfEqual() handles strings like \"key=value=123\" or \"key\\=part=value\" would help define test cases.",
              "need_definition": true,
              "need_example": true
            },
            {
              "name": "EQUAL",
              "need_definition_reason": "The value of Char.EQUAL (e.g., '=' or another character) directly affects how option-value pairs are split. Tests must account for this constant's actual value.",
              "need_example_reason": "An example confirming Char.EQUAL is '=' (or another symbol) is required to validate tokenization logic.",
              "need_definition": true,
              "need_example": true
            },
            {
              "name": "hasOption",
              "need_definition_reason": "The behavior of Options.hasOption() denameines whether the parser recognizes valid options. Without knowing if it checks short/long names or handles aliases, tests may miss false positives/negatives.",
              "need_example_reason": "An example of how an Options instance is configured (e.g., with short \"-D\" vs. long \"--debug\") would clarify validation logic.",
              "need_definition": true,
              "need_example": true
            },
            {
              "name": "stopAtNonOption",
              "need_definition_reason": "The stopAtNonOption flag controls whether parsing stops at non-option arguments. Tests need to validate both modes, but the exact conditions for stopping require context from parent Parser classes.",
              "need_example_reason": "An example of a command-line sequence where stopAtNonOption=true/false would demonstrate how the rest of the arguments are processed.",
              "need_definition": true,
              "need_example": false
            }
          ]
        // await vscode.workspace.updateWorkspaceFolders(0, 0, ...workspaceFolders);
        const document = await vscode.workspace.openTextDocument(testFilesPath);
        await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 2000));

        await activate(document.uri);
      
        // Test the context term identification
        const symbols = await getAllSymbols(document.uri);
        // console.log("symbols", symbols.map(s => s.name));
        const targetSymbol = symbols.find(s => s.name.includes('flatten'));
        // const sourceCode = getSourcCodes(document, targetSymbol!);
        const contextSelector = await getContextSelectorInstance(
            document, 
            targetSymbol!);
        const enrichedTerms = await contextSelector.gatherContext(sampleJson, null);
        assert.ok(enrichedTerms.length == sampleJson.length, 'Should identify at least one context term');
        // console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    });
    
    test('Context Term Identification', async () => {
        // Activate the extension
        await vscode.workspace.updateWorkspaceFolders(0, 1, ...workspaceFolders);
        const document = await vscode.workspace.openTextDocument(testFilesPath);
        await vscode.window.showTextDocument(document);
        
        // Wait for language server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }

        
        // Test the context term identification
        const symbols = await getAllSymbols(document.uri);
        // console.log("symbols", symbols.map(s => s.name));
        const targetSymbol = symbols.find(s => s.name.includes('flatten'))!;
        const sourceCode = getSourcCodes(document, targetSymbol!);
        const contextSelector = await getContextSelectorInstance(
            document, 
            targetSymbol!);
        const identifiedTerms = await contextSelector.identifyContextTerms(sourceCode, []);
        console.log("identifiedTerms", JSON.stringify(identifiedTerms, null, 2));
        const enrichedTerms = await contextSelector.gatherContext(identifiedTerms, targetSymbol);
        console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
        // // Verify we got some terms
        // assert.ok(identifiedTerms.length > 0, 'Should identify at least one context term');
        
        // console.log('=== Identified Context Terms ===');
        // console.log(JSON.stringify(identifiedTerms, null, 2));
        
        // // Check the structure of the terms
        // identifiedTerms.forEach(term => {
        //     assert.ok(term.name, 'Term should have a name');
        //     assert.ok(typeof term.relevance === 'number', 'Term should have a relevance score');
        //     assert.ok(term.relevance >= 0 && term.relevance <= 1, 'Relevance should be between 0 and 1');
        // });
    });
});