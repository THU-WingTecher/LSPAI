import * as assert from 'assert';
import * as vscode from 'vscode';
import { formatToJSON } from '../../utils';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, setWorkspaceFolders } from '../../helper';
import { loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider } from '../../config';
import path from 'path';
import { generateFileNameForDiffLanguage, generateTimestampString } from '../../fileHandler';
import { generateUnitTestForAFunction } from '../../generate';
import { ProjectName } from '../../experiment';
suite('Utils Test Suite', () => {
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    const currentConfig = {
        model: 'gpt-4o',
        provider: 'openai' as Provider,
        expProb: 0.1,
        generationType: GenerationType.ORIGINAL,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        ...privateConfig
    }
    let testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    

    // test('experiment helper functions', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     getConfigInstance().updateConfig({
    //         expProb: 0.1
    //     });
    //     console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
    //     const oneFile = randomlySelectOneFileFromWorkspace('java');
    //     console.log(`#### One file: ${oneFile}`);

    //     const symbols = await loadAllTargetSymbolsFromWorkspace('java');
    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    // });

    // test('Generate Test Code for 3 sample methods', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     getConfigInstance().updateConfig({
    //         expProb: 0.1
    //     });
    //     const workspace = getConfigInstance().workspace;
    //     const projectName = path.basename(workspace);
    //     let currentSrcPath;
    //     if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
    //         currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
    //     } else {
    //         currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
    //     }
    //     console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
    //     const oneFile = randomlySelectOneFileFromWorkspace('java');
    //     console.log(`#### One file: ${oneFile}`);

    //     const symbolDocumentMaps = await loadAllTargetSymbolsFromWorkspace('java');
    //     const symbolFilePairs = symbolDocumentMaps.map(({symbol, document}) => {
    //         return generateFileNameForDiffLanguage(document, symbol, getConfigInstance().savePath, 'java', []);
    //     });
    
    //     assert.ok(symbolFilePairs.length > 0, 'symbolFilePairs should not be empty');
    //     const randomIndex = Math.floor(Math.random() * symbolFilePairs.length);
    //     const symbolFilePairsToTest = symbolFilePairs.slice(randomIndex, randomIndex + 3);
    //     for (const symbolFilePair of symbolFilePairsToTest) {
    //         const { document, symbol, fileName } = symbolFilePair;
    //         const result = await generateUnitTestForAFunction(
    //             currentSrcPath,
    //             document, 
    //             symbol, 
    //             getConfigInstance().model,
    //             getConfigInstance().maxRound,
    //             fileName, 
    //             getConfigInstance().model,
    //             getConfigInstance().historyPath,
    //             getConfigInstance().logSavePath,
    //             false, // , we don't show code
    //         );
    //         console.log(`#### Test Code: ${result}`);
    //     }
    // });
});