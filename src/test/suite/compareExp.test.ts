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

    let currentSrcPath: string;
    let symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[];
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.ORIGINAL,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        parallelCount: 8,
        ...privateConfig
    }
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
    
    test('Prepare for Experiment, testing ', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        getConfigInstance().updateConfig({
            generationType: GenerationType.AGENT,
        });

        const workspace = getConfigInstance().workspace;
        const projectName = path.basename(workspace);

        if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
            currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
        } else {
            currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
        }
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        
        console.log('### Start Generating ###');
        console.log('Current Config:', getConfigInstance());
        symbolDocumentMaps = await loadAllTargetSymbolsFromWorkspace('java');
        console.log('symbolDocumentMaps', symbolDocumentMaps.length);

        // assert.ok(symbolFilePairs.length > 0, 'symbolFilePairs should not be empty');
        // symbolDocumentMaps = symbolDocumentMaps.slice(14,25);
        console.log('### GOINGTO TEST ### ', symbolDocumentMaps.length);
    });

    test('Generate Test Code for of 10% commons-cli with AGENT', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        getConfigInstance().updateConfig({
            generationType: GenerationType.AGENT,
        });

        getConfigInstance().updateConfig({
            savePath: path.join(getConfigInstance().workspace, 
                    `results_${getConfigInstance().generationType}_${getConfigInstance().promptType}_${generateTimestampString()}`,
                    getConfigInstance().model),
        });

        const symbolFilePairs = symbolDocumentMaps.map(({symbol, document}) => {
            return generateFileNameForDiffLanguage(document, symbol, getConfigInstance().savePath, 'java', []);
        });    
        const generatedResults = [];
        const num_parallel = getConfigInstance().parallelCount;
        for (let i = 0; i < symbolFilePairs.length; i += num_parallel) {
            const batch = symbolFilePairs.slice(i, i + num_parallel);
            const symbolTasks = batch.map(async ({ document, symbol, fileName }) => {
                console.log(`#### Processing symbol ${symbol.name}`);
                const result = await generateUnitTestForAFunction(
                    currentSrcPath,
                    document, 
                    symbol, 
                    getConfigInstance().model,
                    getConfigInstance().maxRound,
                    fileName, 
                    getConfigInstance().model,
                    getConfigInstance().historyPath,
                    getConfigInstance().logSavePath,
                    false, // in parallel setting, we don't show code
                );
                vscode.window.showInformationMessage(`[Progress:${generatedResults.length}] Unit test (${getConfigInstance().model}) for ${symbol.name} generated!`);
                generatedResults.push(result);
            });
            await Promise.all(symbolTasks.map(task => 
                Promise.race([
                    task,
                    sleep(600 * 1000).then(() => console.warn('Timeout exceeded for symbol processing'))
                ])
            ));
        }
    });

    // test('Generate Test Code for of 10% commons-cli with ORIGINAL', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
    //     getConfigInstance().updateConfig({
    //         generationType: GenerationType.ORIGINAL,
    //         promptType: PromptType.DETAILED,
    //     });

    //     getConfigInstance().updateConfig({
    //         savePath: path.join(getConfigInstance().workspace, 
    //                 `results_${getConfigInstance().generationType}_${getConfigInstance().promptType}_${generateTimestampString()}`,
    //                 getConfigInstance().model),
    //     });

    //     const symbolFilePairs = symbolDocumentMaps.map(({symbol, document}) => {
    //         return generateFileNameForDiffLanguage(document, symbol, getConfigInstance().savePath, 'java', []);
    //     });    

    //     const generatedResults = [];
    //     const num_parallel = getConfigInstance().parallelCount;
    //     for (let i = 0; i < symbolFilePairs.length; i += num_parallel) {
    //         const batch = symbolFilePairs.slice(i, i + num_parallel);
    //         const symbolTasks = batch.map(async ({ document, symbol, fileName }) => {
    //             console.log(`#### Processing symbol ${symbol.name}`);
    //             const result = await generateUnitTestForAFunction(
    //                 currentSrcPath,
    //                 document, 
    //                 symbol, 
    //                 getConfigInstance().model,
    //                 getConfigInstance().maxRound,
    //                 fileName, 
    //                 getConfigInstance().model,
    //                 getConfigInstance().historyPath,
    //                 getConfigInstance().logSavePath,
    //                 false, // in parallel setting, we don't show code
    //             );
    //             vscode.window.showInformationMessage(`[Progress:${generatedResults.length}] Unit test (${getConfigInstance().model}) for ${symbol.name} generated!`);
    //             generatedResults.push(result);
    //         });
    //         await Promise.all(symbolTasks.map(task => 
    //             Promise.race([
    //                 task,
    //                 sleep(600 * 1000).then(() => console.warn('Timeout exceeded for symbol processing'))
    //             ])
    //         ));
    //     }
    // });
});

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
