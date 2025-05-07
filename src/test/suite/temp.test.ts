import * as assert from 'assert';
import * as vscode from 'vscode';

import { getContextTermsFromTokens, setHelpfulnessAlgorithm } from '../../algorithm';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, saveTaskList, setWorkspaceFolders, findAFileFromWorkspace } from '../../helper';
import { loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate, getSymbolFromDocument } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../config';
import path from 'path';
import { generateFileNameForDiffLanguage, generateTimestampString } from '../../fileHandler';
import { getFileName } from '../../fileHandler';
import { generateUnitTestForAFunction } from '../../generate';
import { ProjectName } from '../../config';
import fs from 'fs';
import { PathCollector } from '../../cfg/path';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { SupportedLanguage } from '../../ast';
import { generateTestWithContextWithCFG } from '../../prompts/promptBuilder';
import { ContextTerm, getContextSelectorInstance } from '../../agents/contextSelector';
import { getDecodedTokensFromSybol } from '../../token';
suite('ContextSelector Helpfulness Algorithm', () => {
    const projectPath = "/LSPAI/experiments/projects/black";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    console.log('test-config path', path.join(__dirname, '../../../test-config.json'));
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    console.log('privateConfig', JSON.stringify(privateConfig));
    const projectName = path.basename(workspaceFolders[0].uri.fsPath);
    const sampleNumber = 1;
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        generationType: GenerationType.ORIGINAL,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        savePath: path.join(__dirname, '../../../test-results', projectName, 'gpt-4o-mini'),
        ...privateConfig
    }
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];
    let symbolFilePairs: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument, fileName: string}[] = [];
    let symbolFilePairsToTest: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument, fileName: string}[] = [];
    
    test('Switching algorithms changes output', async () => {
        const tokens = [
            { word: 'foo', type: 'function', isReturnValue: false },
            { word: 'bar', type: 'variable', isReturnValue: true },
            { word: 'baz', type: 'class', isReturnValue: false }
        ];

        // Default algorithm
        setHelpfulnessAlgorithm('default');
        const defaultTerms = getContextTermsFromTokens(tokens as any);

        // Alternative algorithm
        setHelpfulnessAlgorithm('alternative1');
        const altTerms = getContextTermsFromTokens(tokens as any);

        // Check that the outputs are different for at least one token
        let foundDifference = false;
        for (let i = 0; i < tokens.length; i++) {
            if (
                defaultTerms[i].need_definition !== altTerms[i].need_definition ||
                defaultTerms[i].need_example !== altTerms[i].need_example
            ) {
                foundDifference = true;
                break;
            }
        }
        assert.ok(foundDifference, 'Algorithms should produce different helpfulness results');
    });
    
    test('CFG prompt template for real world code', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        getConfigInstance().updateConfig({
            expProb: 0.1,
            generationType: GenerationType.CFG,
            fixType: FixType.NOFIX
        });
        setHelpfulnessAlgorithm('default');
        let currentSrcPath;
        const workspace = getConfigInstance().workspace;
        const projectName = path.basename(workspace);
        if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
            currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
        } else {
            currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
        }
        const FilePath = "pytree.py"
        const symbolName = "replace"
        const fileName = findAFileFromWorkspace(FilePath, 'python');
        console.log(`#### File name: ${fileName}`);
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fileName));
        const symbol = await getSymbolFromDocument(document, symbolName);
        assert.ok(symbol !== null, 'symbol should not be null');
        const contextSelectorForCFG = await getContextSelectorInstance(
            document, 
            symbol);
        const decodedTokens = contextSelectorForCFG.getTokens();
        console.log("decodedTokens", decodedTokens.map(token => token.type));
        // Default algorithm
        const defaultTerms = getContextTermsFromTokens(decodedTokens);
        const NoneFalseTerms = defaultTerms.filter(term => term.need_definition !== false || term.need_example !== false);
        // const symbolFilePair = {
        //     symbol,
        //     document,
        //     fileName: generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), 'python', [],0)
        // }
        // const functionText = document.getText(symbolFilePair.symbol.range);
        // const builder = createCFGBuilder(document.languageId as SupportedLanguage);
        // const cfg = await builder.buildFromCode(functionText);
        // const pathCollector = new PathCollector(document.languageId);
        // const paths = pathCollector.collect(cfg.entry);
        const onlyFileName = fileName.split('/').pop()?.split(".")[0]!;
        // const identifiedTerms = await contextSelectorForCFG.identifyContextTerms(functionText, []);
        
        const enrichedTerms = await contextSelectorForCFG.gatherContext(NoneFalseTerms);
        // const enrichedTerms: ContextTerm[] = [];
        // console.log("enrichedTerms", enrichedTerms);
        const promptObj = generateTestWithContextWithCFG(
            document, 
            symbol,
            document.getText(symbol.range), 
            enrichedTerms, 
            [], 
            onlyFileName
        );
        console.log("promptObj", JSON.stringify(promptObj));
        // const fileName = generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), 'python', [],0)
    });

});