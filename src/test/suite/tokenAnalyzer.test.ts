import * as assert from 'assert';
import { getContextTermsFromTokens, isReturnTypeBoolean, isReturnTypeVoid, setHelpfulnessAlgorithm } from '../../tokenAnalyzer';
import { selectOneSymbolFileFromWorkspace, setWorkspaceFolders } from '../../helper';
import { ContextTerm, getContextSelectorInstance } from '../../agents/contextSelector';
import { PathCollector } from '../../cfg/path';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { SupportedLanguage } from '../../ast';
import { retrieveDef, retrieveDefs } from '../../retrieve';
import { getTokenInPaths } from '../../tokenAnalyzer';
import * as vscode from 'vscode';
import { getSymbolByLocation } from '../../lsp';

suite('tokenAnalyzer Helpfulness Algorithm', () => {

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

    test('checkout identifying terms for given symbol', async () => {
        const projectPath = "/LSPAI/experiments/projects/commons-cli";
        const workspaceFolders = setWorkspaceFolders(projectPath);
        const fileName = "DefaultParser.java";
        const symbolName = "handleShortAndLongOption";
        const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, 'java');
        console.log(`#### One file: ${symbolDocumentMap}`);
        const contextSelectorForCFG = await getContextSelectorInstance(
            symbolDocumentMap.document, 
            symbolDocumentMap.symbol);
        const decodedTokens = contextSelectorForCFG.getTokens();
        // for (const token of decodedTokens) {
        //     await retrieveDef(symbolDocumentMap.document, token);
        // }
        const builder = createCFGBuilder(symbolDocumentMap.document.languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(symbolDocumentMap.document.getText(symbolDocumentMap.symbol.range));
        const pathCollector = new PathCollector(symbolDocumentMap.document.languageId);
        const paths = pathCollector.collect(cfg.entry);
        // console.log("paths", paths);
        const uniqueConditions = pathCollector.getUniqueConditions();
        console.log("uniqueConditions size", uniqueConditions.size);
        // Default algorithm
        setHelpfulnessAlgorithm('cfg');
        // const tokenUnderConditions = decodedTokens.filter(token => getTokenInPaths(token, uniqueConditions));
        // if (tokenUnderConditions.length > 0) {
        //     await retrieveDefs(symbolDocumentMap.document, tokenUnderConditions);
        //     for (const token of tokenUnderConditions) {
        //         if (token.definition && token.definition[0].range && token.definition.length > 0) {
        //             const defSymbolDoc = await vscode.workspace.openTextDocument(token.definition[0].uri);
        //             token.defSymbol = await getSymbolByLocation(defSymbolDoc, token.definition[0].range.start);
        //             console.log("token.defSymbol", token.defSymbol);
        //         }
        //     }
        // }
        const defaultTerms = await getContextTermsFromTokens(decodedTokens, uniqueConditions);
        console.log("defaultTerms", defaultTerms);
        const expectedTerms = [
            'hasShortOption',
            'pos',
            'getMatchingLongOptions',
            'getOption',
            'acceptsArg',
            'isJavaProperty',
            'opt',
            'option',
        ]
        // defaultTerms's name should be in expectedTerms
        for (const term of expectedTerms) {
            assert.ok(defaultTerms.map(t => t.name).includes(term), `term ${term} should be in expectedTerms`);
        }
        // for terms, isJavaProperty's is_need_full_definition should be true
        for (const term of defaultTerms) {
            if (term.name == "isJavaProperty" || term.name == "acceptsArg") {
                assert.ok(term.need_full_definition, `term ${term.name} should have need_full_definition true`);
            }
        }
        // const enrichedTerms = await contextSelectorForCFG.gatherContext(defaultTerms);
        // console.log("enrichedTerms", enrichedTerms);
    });

    // test('checkout identifying terms for given symbol', async () => {
    //     const projectPath = "/LSPAI/experiments/projects/black";
    //     const workspaceFolders = setWorkspaceFolders(projectPath);
    //     console.log('test-config path', path.join(__dirname, '../../../test-config.json'));
    //     const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    //     console.log('privateConfig', JSON.stringify(privateConfig));
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     getConfigInstance().updateConfig({
    //         expProb: 0.1,
    //         generationType: GenerationType.CFG,
    //         fixType: FixType.NOFIX
    //     });
    //     let currentSrcPath;
    //     const workspace = getConfigInstance().workspace;
    //     const projectName = path.basename(workspace);
    //     if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
    //         currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
    //     } else {
    //         currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
    //     }
    //     const FilePath = "pytree.py"
    //     const symbolName = "replace"
    //     const fileName = findAFileFromWorkspace(FilePath, 'python');
    //     console.log(`#### File name: ${fileName}`);
    //     const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fileName));
    //     const symbol = await getSymbolFromDocument(document, symbolName);
    //     assert.ok(symbol !== null, 'symbol should not be null');
    //     setHelpfulnessAlgorithm('cfg');
    //     const contextSelectorForCFG = await getContextSelectorInstance(
    //         document, 
    //         symbol);
    //     const decodedTokens = contextSelectorForCFG.getTokens();
    //     // Default algorithm
    //     const defaultTerms = getContextTermsFromTokens(decodedTokens);
    //     // const symbolFilePair = {
    //     //     symbol,
    //     //     document,
    //     //     fileName: generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), 'python', [],0)
    //     // }
    //     // const functionText = document.getText(symbolFilePair.symbol.range);
    //     // const builder = createCFGBuilder(document.languageId as SupportedLanguage);
    //     // const cfg = await builder.buildFromCode(functionText);
    //     // const pathCollector = new PathCollector(document.languageId);
    //     // const paths = pathCollector.collect(cfg.entry);
    //     const onlyFileName = fileName.split('/').pop()?.split(".")[0]!;
    //     // const identifiedTerms = await contextSelectorForCFG.identifyContextTerms(functionText, []);

    //     const enrichedTerms = await contextSelectorForCFG.gatherContext(defaultTerms);
    //     // const enrichedTerms: ContextTerm[] = [];
    //     // console.log("enrichedTerms", enrichedTerms);
    //     const promptObj = generateTestWithContextWithCFG(
    //         document, 
    //         symbol,
    //         document.getText(symbol.range), 
    //         enrichedTerms, 
    //         [], 
    //         onlyFileName
    //     );
    //     console.log("promptObj", JSON.stringify(promptObj));
    //     // const fileName = generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), 'python', [],0)
    // });
//     test('isMethodOrFunctionReturnBoolean correctly identifies boolean-returning functions', () => {
//         const booleanFunctionToken = {
//             type: 'function',
//             defSymbol: {
//                 detail: 'boolean',
//                 kind: vscode.SymbolKind.Function
//             } as vscode.DocumentSymbol
//         } as DecodedToken;

//         const nonBooleanFunctionToken = {
//             type: 'function',
//             defSymbol: {
//                 detail: 'string',
//                 kind: vscode.SymbolKind.Function
//             } as vscode.DocumentSymbol
//         } as DecodedToken;

//         const nonFunctionToken = {
//             type: 'variable',
//             defSymbol: {
//                 detail: 'boolean',
//                 kind: vscode.SymbolKind.Variable
//             } as vscode.DocumentSymbol
//         } as DecodedToken;

//         assert.strictEqual(isMethodOrFunctionReturnBoolean(booleanFunctionToken), true);
//         assert.strictEqual(isMethodOrFunctionReturnBoolean(nonBooleanFunctionToken), false);
//         assert.strictEqual(isMethodOrFunctionReturnBoolean(nonFunctionToken), false);
//     });
});