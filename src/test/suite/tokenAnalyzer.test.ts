import * as assert from 'assert';
import { getContextTermsFromTokens, isReturnTypeBoolean, isReturnTypeVoid, setHelpfulnessAlgorithm } from '../../tokenAnalyzer';
import { selectOneSymbolFileFromWorkspace, setWorkspaceFolders } from '../../helper';
import { ContextTerm, getContextSelectorInstance } from '../../agents/contextSelector';
import { PathCollector } from '../../cfg/path';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { SupportedLanguage } from '../../ast';
import { activate, getSymbolByLocation } from '../../lsp';

suite('tokenAnalyzer Helpfulness Algorithm', () => {
    setHelpfulnessAlgorithm('cfg');
    test('isMethodOrFunctionReturnBoolean correctly identifies boolean-returning functions', async () => {
        const projectPath = "/LSPAI/experiments/projects/commons-cli";
        const workspaceFolders = setWorkspaceFolders(projectPath);
        const fileName = "Options.java";
        const symbolName = "hasShortOption";
        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, 'java');
        assert.equal(isReturnTypeBoolean(symbolDocumentMap.symbol), true, `symbol ${symbolDocumentMap.symbol.name} should be a boolean-returning function`);
    });

    test('void returning functions correctly identified', async () => {
        const projectPath = "/LSPAI/experiments/projects/commons-cli";
        const workspaceFolders = setWorkspaceFolders(projectPath);
        const fileName = "Option.java";
        const symbolName = "add";
        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, 'java');
        assert.equal(isReturnTypeVoid(symbolDocumentMap.symbol), true, `symbol ${symbolDocumentMap.symbol.name} should be a void-returning function`);
    });

    // test('checkout identifying terms for given symbol : handleShortAndLongOption', async () => {
    //     const projectPath = "/LSPAI/experiments/projects/commons-cli";
    //     const workspaceFolders = setWorkspaceFolders(projectPath);
    //     const fileName = "DefaultParser.java";
    //     const symbolName = "handleShortAndLongOption";
    //     const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, 'java');
    //     console.log(`#### One file: ${symbolDocumentMap}`);
    //     const contextSelectorForCFG = await getContextSelectorInstance(
    //         symbolDocumentMap.document, 
    //         symbolDocumentMap.symbol);
    //     const decodedTokens = contextSelectorForCFG.getTokens();
    //     const builder = createCFGBuilder(symbolDocumentMap.document.languageId as SupportedLanguage);
    //     const cfg = await builder.buildFromCode(symbolDocumentMap.document.getText(symbolDocumentMap.symbol.range));
    //     const pathCollector = new PathCollector(symbolDocumentMap.document.languageId);
    //     const paths = pathCollector.collect(cfg.entry);
    //     // console.log("paths", paths);
    //     const uniqueConditions = pathCollector.getUniqueConditions();
    //     console.log("uniqueConditions size", uniqueConditions.size);
    //     // Default algorithm
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
        
    //     const defaultTerms = await getContextTermsFromTokens(decodedTokens, uniqueConditions);
    //     console.log("defaultTerms", defaultTerms);
    //     const expectedTerms = [
    //         'hasShortOption',
    //         'pos',
    //         'getMatchingLongOptions',
    //         'getOption',
    //         'acceptsArg',
    //         'isJavaProperty',
    //         'opt',
    //         'option',
    //     ]
    //     // defaultTerms's name should be in expectedTerms
    //     for (const term of expectedTerms) {
    //         assert.ok(defaultTerms.map(t => t.name).includes(term), `term ${term} should be in expectedTerms`);
    //     }
    //     // for terms, isJavaProperty's is_need_full_definition should be true
    //     for (const term of defaultTerms) {
    //         if (term.name == "isJavaProperty" || term.name == "acceptsArg") {
    //             assert.ok(term.need_full_definition, `term ${term.name} should have need_full_definition true`);
    //         }
    //     }
    //     const enrichedTerms = await contextSelectorForCFG.gatherContext(defaultTerms);
    //     console.log("handleShortAndLongOption::enrichedTerms", enrichedTerms);
    // });

    test('checkout identifying terms for given symbol : handleConcatenatedOptions', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        const projectPath = "/LSPAI/experiments/projects/commons-cli";
        const workspaceFolders = setWorkspaceFolders(projectPath);
        const fileName = "DefaultParser.java";
        const symbolName = "handleConcatenatedOptions";
        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, 'java');
        console.log(`#### One file: ${symbolDocumentMap}`);
        const contextSelectorForCFG = await getContextSelectorInstance(
            symbolDocumentMap.document, 
            symbolDocumentMap.symbol);
        const decodedTokens = contextSelectorForCFG.getTokens();
        const builder = createCFGBuilder(symbolDocumentMap.document.languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(symbolDocumentMap.document.getText(symbolDocumentMap.symbol.range));
        const pathCollector = new PathCollector(symbolDocumentMap.document.languageId);
        const paths = pathCollector.collect(cfg.entry);
        // console.log("paths", paths);
        const uniqueConditions = pathCollector.getUniqueConditions();
        console.log("uniqueConditions size", uniqueConditions.size);
        console.log("unique Conditions :", Array.from(uniqueConditions));
        // Default algorithm
        const defaultTerms = await getContextTermsFromTokens(decodedTokens, uniqueConditions);
        console.log("defaultTerms", defaultTerms);
        const enrichedTerms = await contextSelectorForCFG.gatherContext(defaultTerms, symbolDocumentMap.symbol);
        console.log("handleConcatenatedOptions::enrichedTerms", enrichedTerms);
        // const expectedTerms = [
        //     'currentOption',
        //     'hasOption',
        //     'options'
        // ]
        // // defaultTerms's name should be in expectedTerms
        // for (const term of expectedTerms) {
        //     assert.ok(defaultTerms.map(t => t.name).includes(term), `term ${term} should be in expectedTerms`);
        // }
    });

    test('checkout identifying terms for given symbol : handleConcatenatedOptions', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        const projectPath = "/LSPAI/experiments/projects/commons-cli";
        const workspaceFolders = setWorkspaceFolders(projectPath);
        const fileName = "DefaultParser.java";
        const symbolName = "handleOption";
        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, 'java');
        console.log(`#### One file: ${symbolDocumentMap.document.uri}, ${symbolDocumentMap.symbol.name}`);
        const contextSelectorForCFG = await getContextSelectorInstance(
            symbolDocumentMap.document, 
            symbolDocumentMap.symbol);
        const decodedTokens = contextSelectorForCFG.getTokens();
        console.log("decodedTokens", decodedTokens);
        const builder = createCFGBuilder(symbolDocumentMap.document.languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(symbolDocumentMap.document.getText(symbolDocumentMap.symbol.range));
        const pathCollector = new PathCollector(symbolDocumentMap.document.languageId);
        const paths = pathCollector.collect(cfg.entry);
        const functionInfo = builder.getFunctionInfo();
        console.log("functionInfo", functionInfo);
        // console.log("paths", paths);
        const uniqueConditions = pathCollector.getUniqueConditions();
        console.log("uniqueConditions size", uniqueConditions.size);
        console.log("unique Conditions :", Array.from(uniqueConditions));
        // Default algorithm
        const defaultTerms = await getContextTermsFromTokens(decodedTokens, uniqueConditions, functionInfo);
        console.log("", defaultTerms);
        const enrichedTerms = await contextSelectorForCFG.gatherContext(defaultTerms, symbolDocumentMap.symbol);
        console.log("handleConcatenatedOptions::enrichedTerms", enrichedTerms);
        const expectedTerms = [
            'Option',
        ]
        // defaultTerms's name should be in expectedTerms
        for (const term of expectedTerms) {
            assert.ok(defaultTerms.map(t => t.name).includes(term), `term ${term} should be in expectedTerms`);
        }
    });
});