import * as assert from 'assert';
import * as vscode from 'vscode';
import { formatToJSON } from '../../utils';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, saveTaskList, setWorkspaceFolders, findAFileFromWorkspace } from '../../helper';
import { loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, getSymbolFromDocument, setPythonExtraPaths, setPythonInterpreterPath } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../config';
import path from 'path';
import { generateFileNameForDiffLanguage, generateTimestampString } from '../../fileHandler';
import { generateUnitTestForAFunction } from '../../generate';
import { ProjectName } from '../../config';
import fs from 'fs';

suite('Experiment Test Suite', () => {
    const pythonInterpreterPath = "/root/miniconda3/envs/lspai/bin/python";
    const projectPath = "/LSPAI/experiments/projects/black";
    const pythonExtraPaths = [path.join(projectPath, "src/black"), path.join(projectPath, "src/black/src"), path.join(projectPath, "src")];
    const sampleNumber = 50;

    const workspaceFolders = setWorkspaceFolders(projectPath);
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        ...privateConfig
    }
    // let testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

    test('set python interpreter path', async () => {
        await setPythonInterpreterPath(pythonInterpreterPath);
        const currentPythonInterpreterPath = await getPythonInterpreterPath();
        assert.ok(currentPythonInterpreterPath === pythonInterpreterPath, 'python interpreter path should be set as expected');
        await setPythonExtraPaths(pythonExtraPaths);
        const currentPythonExtraPaths = await getPythonExtraPaths();
        assert.ok(currentPythonExtraPaths.length === pythonExtraPaths.length, 'python extra paths should be set as expected');
        assert.ok(currentPythonExtraPaths.every((path, index) => path === pythonExtraPaths[index]), 'python extra paths should be set as expected');
    });

    test('experiment helper functions', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }

        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        const oneFile = randomlySelectOneFileFromWorkspace('python');
        console.log(`#### One file: ${oneFile}`);

        symbols = await loadAllTargetSymbolsFromWorkspace('python');
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        
        const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
        symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    });


    test('Generate Test Code for CFG sample methods', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.CFG,
            FixType.ORIGINAL,
            symbols,
            workspaceFolders
        );
    });

    test('Generate Test Code for AGENT sample methods', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.AGENT,
            FixType.ORIGINAL,
            symbols,
            workspaceFolders
        );
    });

}); 

async function runGenerateTestCodeSuite(
    generationType: GenerationType,
    fixType: FixType,
    symbols: any, // Use the correct type if available
    workspaceFolders: vscode.WorkspaceFolder[]
) {
    if (process.env.NODE_DEBUG !== 'true') {
        console.log('activate');
        await activate();
    }
    getConfigInstance().updateConfig({
        generationType,
        fixType
    });
    const savePath = getConfigInstance().genSaveName();
    getConfigInstance().updateConfig({
        savePath: savePath
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

    const symbolFilePairsToTest = getSymbolFilePairsToTest(symbols);
    await saveTaskList(symbolFilePairsToTest, workspace, getConfigInstance().savePath);
    for (const symbolFilePair of symbolFilePairsToTest) {
        const { document, symbol, fileName } = symbolFilePair;
        const result = await generateUnitTestForAFunction(
            currentSrcPath,
            document, 
            symbol, 
            fileName, 
            false,
        );
        console.log(`#### Test Code: ${result}`);
    }

    const logPath = getConfigInstance().logSavePath;
    assert.ok(fs.existsSync(logPath), 'log path should exist');
    const llmlogs = fs.readdirSync(logPath).filter(file => file.endsWith('llm_logs.json'));
    assert.ok(llmlogs.length > 0, 'llmlogs.json should exist');
    if (getConfigInstance().fixType != FixType.NOFIX && getConfigInstance().generationType != GenerationType.NAIVE) {
        const diagnosticReportFolder = path.join(logPath, 'diagnostic_report');
        const diagnosticReports = fs.readdirSync(diagnosticReportFolder).filter(file => file.endsWith('.json'));
        assert.ok(diagnosticReports.length === symbolFilePairsToTest.length, 'diagnostic_report.json should exist for each function');
    }
    if (getConfigInstance().generationType === GenerationType.CFG) {
        const pathFolder = path.join(logPath, 'paths');
        const paths = fs.readdirSync(pathFolder).filter(file => file.endsWith('.json'));
        assert.ok(paths.length === symbolFilePairsToTest.length, 'paths.json should exist for each function');
    }
    const taskListPath = path.join(getConfigInstance().savePath, 'taskList.json');
    assert.ok(fs.existsSync(taskListPath), 'taskList.json should exist');
}

function getSymbolFilePairsToTest(symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[]) {
    const symbolFilePairs = symbols.map(({symbol, document}) => {
        return {
            symbol,
            document,
            fileName: generateFileNameForDiffLanguage(document, symbol, path.join(getConfigInstance().workspace, getConfigInstance().savePath), 'python', [],0)
        };
    });
    return symbolFilePairs;
}