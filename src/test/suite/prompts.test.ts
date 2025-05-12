import * as assert from 'assert';
import * as vscode from 'vscode';
import { formatToJSON } from '../../utils';
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

suite('Experiment Test Suite', () => {
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
    // let testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];
    let symbolFilePairs: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument, fileName: string}[] = [];
    let symbolFilePairsToTest: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument, fileName: string}[] = [];

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
        const symbolFilePair = {
            symbol,
            document,
            fileName: generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), 'python', [],0)
        }
        const contextSelectorForCFG = await getContextSelectorInstance(
            document, 
            symbol);
        const functionText = document.getText(symbolFilePair.symbol.range);
        const builder = createCFGBuilder(document.languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(functionText);
        const pathCollector = new PathCollector(document.languageId);
        const paths = pathCollector.collect(cfg.entry);
        const onlyFileName = fileName.split('/').pop()?.split(".")[0]!;
        const identifiedTerms = await contextSelectorForCFG.identifyContextTerms(functionText, []);

        const enrichedTerms = await contextSelectorForCFG.gatherContext(identifiedTerms, symbol);
        // const enrichedTerms: ContextTerm[] = [];
        // console.log("enrichedTerms", enrichedTerms);
        const promptObj = generateTestWithContextWithCFG(
            document, 
            symbol,
            document.getText(symbol.range), 
            enrichedTerms, 
            paths, 
            onlyFileName
        );
        console.log("promptObj", JSON.stringify(promptObj));
        // const fileName = generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), 'python', [],0)
    });
});