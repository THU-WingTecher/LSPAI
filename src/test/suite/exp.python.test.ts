import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, saveTaskList, setWorkspaceFolders } from '../../helper';
import { loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../config';
import { generateFileNameForDiffLanguage } from '../../fileHandler';
import { generateUnitTestForAFunction } from '../../generate';
import { ProjectName } from '../../config';
import { runGenerateTestCodeSuite } from '../../experiment';

suite('Experiment Test Suite', () => {
    const pythonInterpreterPath = "/root/miniconda3/envs/lspai/bin/python";
    const projectPath = "/LSPAI/experiments/projects/black";
    const pythonExtraPaths = [path.join(projectPath, "src/black"), path.join(projectPath, "src/black/src"), path.join(projectPath, "src")];
    const sampleNumber = 60;


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
        
        const workspaceFolders = await setWorkspaceFolders(projectPath);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        const oneFile = randomlySelectOneFileFromWorkspace('python');
        console.log(`#### One file: ${oneFile}`);

        symbols = await loadAllTargetSymbolsFromWorkspace('python');
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        
        const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
        symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    });


    test('CFG - with context', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.CFG,
            FixType.NOFIX,
            PromptType.WITHCONTEXT,
            'gpt-4o-mini',
            'openai' as Provider,
            symbols,
            'python'
        );
    });

    test('CFG - without context', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.CFG,
            FixType.NOFIX,
            PromptType.DETAILED,
            'gpt-4o-mini',
            'openai' as Provider,
            symbols,
            'python'
        );
    });

    test('AGENT - with context', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.AGENT,
            FixType.NOFIX,
            PromptType.WITHCONTEXT,
            'gpt-4o-mini',
            'openai' as Provider,
            symbols,
            'python'
        );
    });

    test('AGENT - without context', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.AGENT,
            FixType.NOFIX,
            PromptType.DETAILED,
            'gpt-4o-mini',
            'openai' as Provider,
            symbols,
            'python'
        );
    });

}); 