import * as assert from 'assert';
import * as vscode from 'vscode';
import { formatToJSON } from '../../utils';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, saveTaskList, setWorkspaceFolders } from '../../helper';
import { loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../config';
import path from 'path';
import { generateFileNameForDiffLanguage, generateTimestampString } from '../../fileHandler';
import { generateUnitTestForAFunction } from '../../generate';
import { ProjectName } from '../../config';
import fs from 'fs';
suite('Experiment Test Suite', () => {
    const projectPath = "/LSPAI/experiments/projects/black";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    console.log('test-config path', path.join(__dirname, '../../../test-config.json'));
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    console.log('privateConfig', JSON.stringify(privateConfig));
    const projectName = path.basename(workspaceFolders[0].uri.fsPath);
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 0.1,
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

    test('experiment helper functions', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        getConfigInstance().updateConfig({
            expProb: 0.1
        });
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        const oneFile = randomlySelectOneFileFromWorkspace('python');
        console.log(`#### One file: ${oneFile}`);

        symbols = await loadAllTargetSymbolsFromWorkspace('python');
        assert.ok(symbols.length > 0, 'symbols should not be empty');
    });

    test('Generate Test Code for 3 sample methods', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        getConfigInstance().updateConfig({
            expProb: 0.1,
            generationType: GenerationType.CFG,
            fixType: FixType.NOFIX
        });
        const workspace = getConfigInstance().workspace;
        const projectName = path.basename(workspace);
        let currentSrcPath;
        if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
            currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
        } else {
            currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
        }
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        const oneFile = randomlySelectOneFileFromWorkspace('python');
        console.log(`#### One file: ${oneFile}`);

        const symbolFilePairs = symbols.map(({symbol, document}) => {
            return {
                symbol,
                document,
                fileName: generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), 'python', [],0)
            };
        });
        await saveTaskList(symbolFilePairs, workspace, getConfigInstance().savePath);
        assert.ok(symbolFilePairs.length > 0, 'symbolFilePairs should not be empty');
        const randomIndex = Math.floor(Math.random() * symbolFilePairs.length);
        const symbolFilePairsToTest = symbolFilePairs.slice(randomIndex, randomIndex + 3);
        for (const symbolFilePair of symbolFilePairsToTest) {
            const { document, symbol, fileName } = symbolFilePair;
            const result = await generateUnitTestForAFunction(
                currentSrcPath,
                document, 
                symbol, 
                fileName, 
                false, // , we don't show code
            );
            console.log(`#### Test Code: ${result}`);
        }
    
    
    const logPath = getConfigInstance().logSavePath;
    assert.ok(fs.existsSync(logPath), 'log path should exist');
    // *llmlogs.json, *diagnostic_report.json, *paths.json * means any string
    const llmlogs = fs.readdirSync(logPath).filter(file => file.endsWith('llm_logs.json'));
    assert.ok(llmlogs.length > 0, 'llmlogs.json should exist');
    if (getConfigInstance().fixType != FixType.NOFIX && getConfigInstance().generationType != GenerationType.NAIVE) {
        const diagnosticReportFolder = path.join(logPath, 'diagnostic_report');
        const diagnosticReports = fs.readdirSync(diagnosticReportFolder).filter(file => file.endsWith('diagnostic_report.json'));
        assert.ok(diagnosticReports.length === symbolFilePairsToTest.length, 'diagnostic_report.json should exist for each function');
    }
    const pathFolder = path.join(logPath, 'paths');
    const paths = fs.readdirSync(pathFolder).filter(file => file.endsWith('paths.json'));
    assert.ok(paths.length === symbolFilePairsToTest.length, 'paths.json should exist for each function');
    
    // tasklist file exist 
    const taskListPath = path.join(getConfigInstance().savePath, 'taskList.json');
    assert.ok(fs.existsSync(taskListPath), 'taskList.json should exist');
 
}); 
}); 