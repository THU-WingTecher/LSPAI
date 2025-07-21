import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getContextSelectorInstance, ContextTerm } from '../../agents/contextSelector';
import { getConfigInstance, loadPrivateConfig, Provider, GenerationType, PromptType } from '../../config';
import { getDocUri, activate, setPythonExtraPaths } from '../../lsp';
import { getAllSymbols } from '../../lsp';
import { selectOneSymbolFileFromWorkspace, setWorkspaceFolders } from '../../helper';
import { getSourcCodes } from '../../retrieve';
import { getContextTermsFromTokens } from '../../tokenAnalyzer';
import { PathCollector, ConditionAnalysis } from '../../cfg/path';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { SupportedLanguage } from '../../ast';
import { getReferenceInfo } from '../../reference';
import { DecodedToken } from '../../token';
import { generateTestWithContextWithCFG } from '../../strategy/generators/experimental';

suite('Context Selector Agent Tests', () => {
    // Test file path - adjust this to point to a real file in your test fixture
    
    // Update config with source path
    
    // const projectPath = "/LSPRAG/experiments/projects/commons-cli";
    // const workspaceFolders = setWorkspaceFolders(projectPath);
    // let testFilesPath = "/LSPRAG/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli/GnuParser.java";  
    // const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    // const currentConfig = {
    //     model: 'gpt-4o-mini',
    //     provider: 'openai' as Provider,
    //     expProb: 0.2,
    //     generationType: GenerationType.AGENT,
    //     promptType: PromptType.DETAILED,
    //     // workspace: projectPath,
    //     parallelCount: 1,
    //     maxRound: 3,
    //     savePath: path.join(__dirname, '../../../logs'),
    //     ...privateConfig
    // }
    // getConfigInstance().updateConfig({
    //     ...currentConfig
    // });
    // getConfigInstance().updateConfig({
    //     model: 'deepseek-reasoner',
    //     provider: 'deepseek',
    //     ...privateConfig
    // });
    // getConfigInstance().logAllConfig();    
    let languageId = "python";
    let symbolDocumentMap : {document: vscode.TextDocument, symbol: vscode.DocumentSymbol} | null = null;
    let contextSelector;
    test('Context Gathering for Terms - PYTHON ( focal method reference )', async () => {
        // Create some test terms
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        const pyProjectPath = "/LSPRAG/experiments/projects/black";
        const blackModuleImportPath = [path.join(pyProjectPath, "src/black"), path.join(pyProjectPath, "src/blackd"), path.join(pyProjectPath, "src/blib2to3"), path.join(pyProjectPath, "src")];
        // await setPythonExtraPaths(blackModuleImportPath);

        const fileName = "brackets.py";
        const workspaceFolders = setWorkspaceFolders(pyProjectPath);
        // console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        const symbolName = "is_split_before_delimiter";
        symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        contextSelector = await getContextSelectorInstance(
          symbolDocumentMap.document, 
          symbolDocumentMap.symbol);
        console.log("Finding Reference for function symbol:", symbolDocumentMap.symbol.name);
        const reference = await getReferenceInfo(symbolDocumentMap.document, symbolDocumentMap.symbol.selectionRange);
        console.log("Reference:", reference);
        assert.ok(reference.length > 0, 'Should find reference for function symbol');
        // console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    });

    test('Context Gathering for Terms - PYTHON', async () => {
        // Create some test terms
        const sourceCode = getSourcCodes(symbolDocumentMap!.document, symbolDocumentMap!.symbol);
        console.log("sourceCode", sourceCode);
        const builder = createCFGBuilder(languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(sourceCode);
        builder.printCFGGraph(cfg.entry);
        const pathCollector = new PathCollector(languageId);
        pathCollector.collect(cfg.entry);
        const functionInfo = builder.getFunctionInfo();
        const conditionAnalyses = pathCollector.getUniqueConditions();
        console.log("pathCollector", pathCollector.getPaths());
        const tokens = contextSelector!.getTokens();
        console.log("tokens", tokens.map((t : DecodedToken) => t.word));
        console.log("conditionAnalyses", conditionAnalyses.map((c : ConditionAnalysis) => c.condition));
        console.log("conditionAnalyses.length", conditionAnalyses.length);
        const identifiedTerms = await getContextTermsFromTokens(
          symbolDocumentMap!.document, 
          symbolDocumentMap!.symbol,
          tokens,
          conditionAnalyses, 
          functionInfo);
        const enrichedTerms = await contextSelector!.gatherContext(identifiedTerms, symbolDocumentMap!.symbol);
        console.log(`enrichedTerms: ${enrichedTerms.map((term: ContextTerm) => ("\nname: " + term.name + "\ncontext: " + term.context +"\nexample: " + term.example))}`);
        console.log(`enrichedTerms: ${enrichedTerms.map((term: ContextTerm) => JSON.stringify(term, null, 2))}`);
        assert.ok(enrichedTerms.length > 0, 'Should identify at least one context term');
        const promptObj = await generateTestWithContextWithCFG(symbolDocumentMap!.document, symbolDocumentMap!.symbol, sourceCode, enrichedTerms!, conditionAnalyses, "testing")
        console.log("promptObj:", promptObj[1].content);
        // console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    });

    // test('Context Gathering for Terms - JAVA ( focal method reference )', async () => {
    //     // Create some test terms
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     languageId = "java";
    //     const fileName = "DefaultParser.java";
    //     const symbolName = "handleConcatenatedOptions";
    //     const javaProjectPath = "/LSPRAG/experiments/projects/commons-cli";
    //     const workspaceFolders = setWorkspaceFolders(javaProjectPath);
    //     console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
    //     symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
    //     contextSelector = await getContextSelectorInstance(
    //       symbolDocumentMap.document, 
    //       symbolDocumentMap.symbol);
    //     console.log("Finding Reference for function symbol:", symbolDocumentMap.symbol.name);
    //     const reference = await getReferenceInfo(symbolDocumentMap.document, symbolDocumentMap.symbol.selectionRange);
    //     console.log("Reference:", reference);
    //     assert.ok(reference.length > 0, 'Should find reference for function symbol');
    //     // console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    // });

    // test('Context Gathering for Terms - JAVA', async () => {
    //     // Create some test terms
    //     const builder = createCFGBuilder(languageId as SupportedLanguage);
    //     const cfg = await builder.buildFromCode(symbolDocumentMap!.document.getText(symbolDocumentMap!.symbol.range));
    //     const pathCollector = new PathCollector(languageId);
    //     const functionInfo = builder.getFunctionInfo();
    //     const conditionAnalyses = pathCollector.getUniqueConditions();
    //     const identifiedTerms = await getContextTermsFromTokens(
    //       symbolDocumentMap!.document, 
    //       contextSelector!.getTokens(), 
    //       conditionAnalyses, 
    //       functionInfo);
    //     const enrichedTerms = await contextSelector!.gatherContext(identifiedTerms, symbolDocumentMap!.symbol);
    //     console.log(`enrichedTerms: ${enrichedTerms.map((term: ContextTerm) => JSON.stringify(term, null, 2))}`);
    //     assert.ok(enrichedTerms.length > 0, 'Should identify at least one context term');
    //     // console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    // });


    // test('Context Gathering for Terms', async () => {
    //     // Create some test terms
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     const sampleJson = [
    //         {
    //           "name": "stripLeadingHyphens",
    //           "need_definition_reason": "The behavior of Util.stripLeadingHyphens() is critical to how options are parsed. Without knowing its implementation, it's unclear how many hyphens are stripped or if it handles edge cases like multiple hyphens.",
    //           "need_example_reason": "An example of the output of Util.stripLeadingHyphens() for inputs like \"--opt\" or \"-D\" would clarify how the method normalizes arguments.",
    //           "need_definition": true,
    //           "need_example": true
    //         },
    //         {
    //           "name": "indexOfEqual",
    //           "need_definition_reason": "The implementation of DefaultParser.indexOfEqual() denameines how option-value pairs (e.g., --key=value) are split. Without context, we cannot verify edge cases like escaped equal signs or values containing equal signs.",
    //           "need_example_reason": "An example showing how indexOfEqual() handles strings like \"key=value=123\" or \"key\\=part=value\" would help define test cases.",
    //           "need_definition": true,
    //           "need_example": true
    //         },
    //         {
    //           "name": "EQUAL",
    //           "need_definition_reason": "The value of Char.EQUAL (e.g., '=' or another character) directly affects how option-value pairs are split. Tests must account for this constant's actual value.",
    //           "need_example_reason": "An example confirming Char.EQUAL is '=' (or another symbol) is required to validate tokenization logic.",
    //           "need_definition": true,
    //           "need_example": true
    //         },
    //         {
    //           "name": "hasOption",
    //           "need_definition_reason": "The behavior of Options.hasOption() denameines whether the parser recognizes valid options. Without knowing if it checks short/long names or handles aliases, tests may miss false positives/negatives.",
    //           "need_example_reason": "An example of how an Options instance is configured (e.g., with short \"-D\" vs. long \"--debug\") would clarify validation logic.",
    //           "need_definition": true,
    //           "need_example": true
    //         },
    //         {
    //           "name": "stopAtNonOption",
    //           "need_definition_reason": "The stopAtNonOption flag controls whether parsing stops at non-option arguments. Tests need to validate both modes, but the exact conditions for stopping require context from parent Parser classes.",
    //           "need_example_reason": "An example of a command-line sequence where stopAtNonOption=true/false would demonstrate how the rest of the arguments are processed.",
    //           "need_definition": true,
    //           "need_example": false
    //         }
    //       ]
    //     // await vscode.workspace.updateWorkspaceFolders(0, 0, ...workspaceFolders);
    //     const document = await vscode.workspace.openTextDocument(testFilesPath);
    //     await vscode.window.showTextDocument(document);
    //     await new Promise(resolve => setTimeout(resolve, 2000));

    //     await activate(document.uri);
      
    //     // Test the context term identification
    //     const symbols = await getAllSymbols(document.uri);
    //     // console.log("symbols", symbols.map(s => s.name));
    //     const targetSymbol = symbols.find(s => s.name.includes('flatten'));
    //     // const sourceCode = getSourcCodes(document, targetSymbol!);
    //     const contextSelector = await getContextSelectorInstance(
    //         document, 
    //         targetSymbol!);
    //     const enrichedTerms = await contextSelector.gatherContext(sampleJson, null);
    //     console.log(`enrichedTerms: ${enrichedTerms.map(term => JSON.stringify(term, null, 2))}`);
    //     assert.ok(enrichedTerms.length == sampleJson.length, 'Should identify at least one context term');
    //     // console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    // });
    
    // test('Context Term Identification', async () => {
    //     // Activate the extension
    //     await vscode.workspace.updateWorkspaceFolders(0, 1, ...workspaceFolders);
    //     const document = await vscode.workspace.openTextDocument(testFilesPath);
    //     await vscode.window.showTextDocument(document);
        
    //     // Wait for language server to initialize
    //     await new Promise(resolve => setTimeout(resolve, 2000));
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }

        
    //     // Test the context term identification
    //     const symbols = await getAllSymbols(document.uri);
    //     // console.log("symbols", symbols.map(s => s.name));
    //     const targetSymbol = symbols.find(s => s.name.includes('flatten'))!;
    //     const sourceCode = getSourcCodes(document, targetSymbol!);
    //     const contextSelector = await getContextSelectorInstance(
    //         document, 
    //         targetSymbol!);
    //     const identifiedTerms = await contextSelector.identifyContextTerms(sourceCode, []);
    //     console.log("identifiedTerms", JSON.stringify(identifiedTerms, null, 2));
    //     const enrichedTerms = await contextSelector.gatherContext(identifiedTerms, targetSymbol);
    //     console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    //     // // Verify we got some terms
    //     // assert.ok(identifiedTerms.length > 0, 'Should identify at least one context term');
        
    //     // console.log('=== Identified Context Terms ===');
    //     // console.log(JSON.stringify(identifiedTerms, null, 2));
        
    //     // // Check the structure of the terms
    //     // identifiedTerms.forEach(term => {
    //     //     assert.ok(term.name, 'Term should have a name');
    //     //     assert.ok(typeof term.relevance === 'number', 'Term should have a relevance score');
    //     //     assert.ok(term.relevance >= 0 && term.relevance <= 1, 'Relevance should be between 0 and 1');
    //     // });
    // });
});