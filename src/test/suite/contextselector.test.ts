import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getContextSelectorInstance, ContextTerm } from '../../agents/contextSelector';
import { getConfigInstance, loadPrivateConfig } from '../../config';
import { getDocUri, activate, getReference } from '../../lsp';
import { getAllSymbols } from '../../lsp';
import { invokeLLM } from '../../invokeLLM';
import { ProjectName } from '../../experiment';
import { SRC_PATHS } from '../../config';
import { setWorkspaceFolders } from '../../helper';
import { getSourcCodes } from '../../retrieve';
suite('Context Selector Agent Tests', () => {
    // Test file path - adjust this to point to a real file in your test fixture
    
    // Update config with source path
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    let testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli/GnuParser.java";  
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    getConfigInstance().updateConfig({
        model: 'gpt-4o',
        provider: 'openai',
        ...privateConfig
    });
    // getConfigInstance().updateConfig({
    //     model: 'deepseek-reasoner',
    //     provider: 'deepseek',
    //     ...privateConfig
    // });
    getConfigInstance().logAllConfig();    // Update the workspace folders

    
    test('Context Gathering for Terms', async () => {
        // Create some test terms
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        const sampleJson = [
            {
              "term": "stripLeadingHyphens",
              "need_context_reason": "The behavior of Util.stripLeadingHyphens() is critical to how options are parsed. Without knowing its implementation, it's unclear how many hyphens are stripped or if it handles edge cases like multiple hyphens.",
              "need_example_reason": "An example of the output of Util.stripLeadingHyphens() for inputs like \"--opt\" or \"-D\" would clarify how the method normalizes arguments.",
              "need_context": true,
              "need_example": true
            },
            {
              "term": "indexOfEqual",
              "need_context_reason": "The implementation of DefaultParser.indexOfEqual() determines how option-value pairs (e.g., --key=value) are split. Without context, we cannot verify edge cases like escaped equal signs or values containing equal signs.",
              "need_example_reason": "An example showing how indexOfEqual() handles strings like \"key=value=123\" or \"key\\=part=value\" would help define test cases.",
              "need_context": true,
              "need_example": true
            },
            {
              "term": "EQUAL",
              "need_context_reason": "The value of Char.EQUAL (e.g., '=' or another character) directly affects how option-value pairs are split. Tests must account for this constant's actual value.",
              "need_example_reason": "An example confirming Char.EQUAL is '=' (or another symbol) is required to validate tokenization logic.",
              "need_context": true,
              "need_example": true
            },
            {
              "term": "hasOption",
              "need_context_reason": "The behavior of Options.hasOption() determines whether the parser recognizes valid options. Without knowing if it checks short/long names or handles aliases, tests may miss false positives/negatives.",
              "need_example_reason": "An example of how an Options instance is configured (e.g., with short \"-D\" vs. long \"--debug\") would clarify validation logic.",
              "need_context": true,
              "need_example": true
            },
            {
              "term": "stopAtNonOption",
              "need_context_reason": "The stopAtNonOption flag controls whether parsing stops at non-option arguments. Tests need to validate both modes, but the exact conditions for stopping require context from parent Parser classes.",
              "need_example_reason": "An example of a command-line sequence where stopAtNonOption=true/false would demonstrate how the rest of the arguments are processed.",
              "need_context": true,
              "need_example": false
            }
          ]
        // await vscode.workspace.updateWorkspaceFolders(0, 0, ...workspaceFolders);
        const document = await vscode.workspace.openTextDocument(testFilesPath);
        await vscode.window.showTextDocument(document);
        await new Promise(resolve => setTimeout(resolve, 2000));

        // await activate();
      
        // Test the context term identification
        const symbols = await getAllSymbols(document.uri);
        // console.log("symbols", symbols.map(s => s.name));
        const targetSymbol = symbols.find(s => s.name.includes('flatten'));
        // const sourceCode = getSourcCodes(document, targetSymbol!);
        const contextSelector = await getContextSelectorInstance(
            document, 
            targetSymbol!);
        const enrichedTerms = await contextSelector.gatherContext(sampleJson);
        console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    });

        
    // test('Context Selector Configuration Loading', async () => {
    //     // This test checks if the configuration is loaded correctly
    //     // We're forcing a reload to ensure we have fresh config
    //     // Get the context selector instance
    //     await vscode.workspace.updateWorkspaceFolders(0, 0, ...workspaceFolders);
    //     const document = await vscode.workspace.openTextDocument(javaTestFile);
    //     await vscode.window.showTextDocument(document);
        
    //     // Wait for language server to initialize
    //     await new Promise(resolve => setTimeout(resolve, 2000));
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     const symbols = await getAllSymbols(document.uri);
    //     // console.log("symbols", symbols.map(s => s.name));
    //     const targetSymbol = symbols.find(s => s.name.includes('flatten'));
    //     const contextSelector = await getContextSelectorInstance(
    //         document, 
    //         targetSymbol!);
    //     // Generate a simple prompt with dummy data to verify config is loaded
    //     const dummyTerms: ContextTerm[] = [
    //         { term: 'Options', 
    //             relevance: 0.9, 
    //             needsExample: true,
    //             needsContext: true
    //         }
    //     ];
    //     const enrichedTerms = await contextSelector.gatherContext(dummyTerms);
    //     // const prompt = contextSelector.generateContextEnrichedPrompt('class TestClass {}', dummyTerms);
        
    //     // // Verify the prompt contains expected sections from config
    //     assert.ok(enrichedTerms[0].example && enrichedTerms[0].example.length>0, 'example should not be empty');
    //     assert.ok(enrichedTerms[0].context && enrichedTerms[0].context.length>0, 'context should not be empty');
    // });
    
    test('Context Term Identification', async () => {
        // Activate the extension
        await vscode.workspace.updateWorkspaceFolders(0, 0, ...workspaceFolders);
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
        const targetSymbol = symbols.find(s => s.name.includes('flatten'));
        const sourceCode = getSourcCodes(document, targetSymbol!);
        const contextSelector = await getContextSelectorInstance(
            document, 
            targetSymbol!);
        const identifiedTerms = await contextSelector.identifyContextTerms(sourceCode, []);
        console.log("identifiedTerms", JSON.stringify(identifiedTerms, null, 2));
        const enrichedTerms = await contextSelector.gatherContext(identifiedTerms);
        console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
        // // Verify we got some terms
        // assert.ok(identifiedTerms.length > 0, 'Should identify at least one context term');
        
        // console.log('=== Identified Context Terms ===');
        // console.log(JSON.stringify(identifiedTerms, null, 2));
        
        // // Check the structure of the terms
        // identifiedTerms.forEach(term => {
        //     assert.ok(term.term, 'Term should have a name');
        //     assert.ok(typeof term.relevance === 'number', 'Term should have a relevance score');
        //     assert.ok(term.relevance >= 0 && term.relevance <= 1, 'Relevance should be between 0 and 1');
        // });
    });
    // test('get Reference Code', async () => {

    //   const docUri = getDocUri(testFilesPath);
    //   const document = await vscode.workspace.openTextDocument(docUri);
    //   await activate(docUri);
    //   const symbols = await getAllSymbols(docUri);
    //   const methodSymbol = symbols.find(s => s.name.includes('flatten'));
    //   assert.ok(methodSymbol, 'Should find flatten method');
    //   const targetSymbol = symbols.find(s => s.name.includes('indexOfEqual'));
    //   const contextSelector = await getContextSelectorInstance(
    //         document, 
    //         targetSymbol!);
      
    //   const referenceCode = await getReference(targetSymbol!);
    //   console.log("referenceCode", referenceCode);
    // });
    
    // test('End-to-End Context-Enriched Prompt Generation', async () => {
    //     // Open the test file
    //     const docUri = getDocUri(javaTestFile);
    //     const document = await vscode.workspace.openTextDocument(docUri);
        
    //     // Get symbols from the document
    //     const symbols = await getAllSymbols(docUri);
    //     assert.ok(symbols && symbols.length > 0, 'Should have symbols');
        
    //     // Find a specific method to test
    //     const methodSymbol = symbols.find(s => s.name.includes('flatten'));
    //     assert.ok(methodSymbol, 'Should find flatten method');
        
    //     // Get method code
    //     const methodRange = methodSymbol!.range;
    //     const methodCode = document.getText(methodRange);
        
    //     // Step 1: Identify context terms for the method
    //     console.log('=== Identifying context terms for method ===');
    //     const terms = await contextSelector.identifyContextTerms(methodCode);
    //     console.log(`Identified ${terms.length} terms`);
        
    //     // Step 2: Gather context for the identified terms
    //     console.log('=== Gathering context for identified terms ===');
    //     const enrichedTerms = await contextSelector.gatherContext(terms);
        
    //     // Step 3: Generate the context-enriched prompt
    //     console.log('=== Generating context-enriched prompt ===');
    //     const contextEnrichedPrompt = contextSelector.generateContextEnrichedPrompt(methodCode, enrichedTerms);
        
    //     console.log('=== Final Context-Enriched Prompt ===');
    //     console.log(contextEnrichedPrompt);
        
    //     // Verify the prompt is well-formed
    //     assert.ok(contextEnrichedPrompt.includes('RELEVANT CONTEXT'), 'Prompt should include context section');
    //     assert.ok(contextEnrichedPrompt.includes('CODE TO TEST'), 'Prompt should include code section');
        
    //     // Step 4: Test generating a test using the prompt
    //     console.log('=== Generating test using context-enriched prompt ===');
        
    //     const logObj: any = {};
    //     const promptObj = [
    //         { role: "system", content: "You are an expert unit test generator." },
    //         { role: "user", content: contextEnrichedPrompt }
    //     ];
        
    //     try {
    //         const testCode = await invokeLLM(promptObj, logObj);
    //         console.log('=== Generated Test Code ===');
    //         console.log(testCode);
            
    //         // Verify the generated test code
    //         assert.ok(testCode.length > 0, 'Should generate test code');
    //         assert.ok(
    //             testCode.includes('test') || testCode.includes('Test') || testCode.includes('@Test'),
    //             'Generated code should include test reference'
    //         );
            
    //         // Log token usage
    //         console.log('Token usage:', logObj.tokenUsage);
    //     } catch (error) {
    //         assert.fail(`Failed to generate test: ${error}`);
    //     }
    // });
    
    // test('Compare Normal vs Context-Enriched Test Generation', async () => {
    //     // Open the test file
    //     const docUri = getDocUri(javaTestFile);
    //     const document = await vscode.workspace.openTextDocument(docUri);
        
    //     // Get symbols from the document
    //     const symbols = await getAllSymbols(docUri);
    //     const methodSymbol = symbols.find(s => s.name.includes('flatten'));
    //     assert.ok(methodSymbol, 'Should find flatten method');
        
    //     // Get method code
    //     const methodRange = methodSymbol!.range;
    //     const methodCode = document.getText(methodRange);
        
    //     // Generate a test without context enrichment
    //     console.log('=== Generating test WITHOUT context enrichment ===');
    //     const normalLogObj: any = {};
    //     const normalPromptObj = [
    //         { role: "system", content: "You are an expert unit test generator." },
    //         { role: "user", content: `Write a unit test for the following code:\n\n\`\`\`java\n${methodCode}\n\`\`\`` }
    //     ];
        
    //     const normalTestCode = await invokeLLM(normalPromptObj, normalLogObj);
    //     console.log('=== Generated Test Code (Normal) ===');
    //     console.log(normalTestCode);
    //     console.log('Token usage (Normal):', normalLogObj.tokenUsage);
        
    //     // Generate a test with context enrichment
    //     console.log('=== Generating test WITH context enrichment ===');
    //     const terms = await contextSelector.identifyContextTerms(methodCode);
    //     const enrichedTerms = await contextSelector.gatherContext(terms);
    //     const contextEnrichedPrompt = contextSelector.generateContextEnrichedPrompt(methodCode, enrichedTerms);
        
    //     const enrichedLogObj: any = {};
    //     const enrichedPromptObj = [
    //         { role: "system", content: "You are an expert unit test generator." },
    //         { role: "user", content: contextEnrichedPrompt }
    //     ];
        
    //     const enrichedTestCode = await invokeLLM(enrichedPromptObj, enrichedLogObj);
    //     console.log('=== Generated Test Code (Context-Enriched) ===');
    //     console.log(enrichedTestCode);
    //     console.log('Token usage (Context-Enriched):', enrichedLogObj.tokenUsage);
        
    //     // Compare the results (this is subjective - we're looking for differences)
    //     assert.notStrictEqual(
    //         normalTestCode, 
    //         enrichedTestCode, 
    //         'Context-enriched test should be different from normal test'
    //     );
        
    //     // Check for potential improvements in the context-enriched version
    //     // This is a simple heuristic - more sophisticated metrics could be used
    //     const normalLines = normalTestCode.split('\n').length;
    //     const enrichedLines = enrichedTestCode.split('\n').length;
    //     console.log(`Normal test: ${normalLines} lines, Enriched test: ${enrichedLines} lines`);
        
    //     const normalAsserts = (normalTestCode.match(/assert/g) || []).length;
    //     const enrichedAsserts = (enrichedTestCode.match(/assert/g) || []).length;
    //     console.log(`Normal test: ${normalAsserts} assertions, Enriched test: ${enrichedAsserts} assertions`);
    // });
});