import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import { 
    loadAllTargetSymbolsFromWorkspace, 
    setWorkspaceFolders, 
    updateWorkspaceFolders,
    extractSymbolDocumentMapFromTaskList
} from '../../helper';
import { loadPrivateConfig } from '../../config';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../lsp';
import { 
    getConfigInstance, 
    GenerationType, 
    PromptType, 
    Provider, 
    FixType 
} from '../../config';
import { runGenerateTestCodeSuite } from '../../experiment';

interface ProjectConfig {
    path: string;
    languageId: string;
    name: string;
    settings?: any;
    tasklist?: string;
}

// Model configurations
interface ModelConfig {
    model: string;
    provider: Provider;
}

const MODELS: ModelConfig[] = [
    // { model: 'gpt-4o-mini', provider: 'openai' },
    { model: 'gpt-4o', provider: 'openai' },
    { model: 'deepseek-chat', provider: 'deepseek' },
];

// Prompt Types to test
const GENERATION_TYPES = [
    GenerationType.CFG,
    // GenerationType.NAIVE,
    // GenerationType.SymPrompt,
];

// Project configurations
const GO_PROJECTS: ProjectConfig[] = [
    {
        path: "/LSPRAG/experiments/projects/logrus",
        languageId: 'go',
        name: 'logrus',
        tasklist: '/LSPRAG/experiments/config/logrus-taskList.json',
    },
    {
        path: "/LSPRAG/experiments/projects/cobra",
        languageId: 'go',
        name: 'cobra',
        tasklist: '/LSPRAG/experiments/config/cobra-taskList.json',
    }
];

const JAVA_PROJECTS: ProjectConfig[] = [
    {
        path: "/LSPRAG/experiments/projects/commons-cli",
        languageId: 'java',
        name: 'commons-cli',
        tasklist: '/LSPRAG/experiments/config/commons-cli-taskList.json',
    },
    {
        path: "/LSPRAG/experiments/projects/commons-csv",
        languageId: 'java',
        name: 'commons-csv',
        tasklist: '/LSPRAG/experiments/config/commons-csv-taskList.json',
    }
];

const PYTHON_PROJECTS: ProjectConfig[] = [
    {
        path: "/LSPRAG/experiments/projects/black",
        languageId: 'python',
        name: 'black',
        settings: {
            pythonPath: "/root/miniconda3/envs/lsprag/bin/python",
            extraPaths: [
                path.join("/LSPRAG/experiments/projects/black", "src/black"), 
                path.join("/LSPRAG/experiments/projects/black", "src/blackd"), 
                path.join("/LSPRAG/experiments/projects/black", "src/blib2to3"), 
                path.join("/LSPRAG/experiments/projects/black", "src")  
            ]
        },
        tasklist: '/LSPRAG/experiments/config/black-taskList.json',
    },
    {
        path: "/LSPRAG/experiments/projects/tornado",
        languageId: 'python',
        name: 'tornado',
        settings: {
                pythonPath: "/root/miniconda3/envs/lsprag/bin/python",
                extraPaths: [
                    path.join("/LSPRAG/experiments/projects/tornado", "tornado"),    
                ]
            },
        tasklist: '/LSPRAG/experiments/config/tornado-taskList.json',
        },
];

// const ALL_PROJECTS = [...GO_PROJECTS];
const ALL_PROJECTS = [GO_PROJECTS[0]];
// const ALL_PROJECTS = [JAVA_PROJECTS[1]];


// ... existing code ...
suite('Multi-Project Test Suite', () => {
    const sampleNumber = -1;
    const minLineNumber = 5;
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    console.log(`#### Sample number: ${sampleNumber}`);
    // Single test that runs all projects sequentially
    test('Run all projects sequentially', async () => {
        // Activate extension if needed
        if (process.env.NODE_DEBUG !== 'true') {
            await activate();
        }

        // Process each project sequentially
        for (const project of ALL_PROJECTS) {
            console.log(`#### Starting tests for ${project.name} ####`);
            
            // Setup workspace for this project
            const workspaceFolders = await setWorkspaceFolders(project.path);
            await updateWorkspaceFolders(workspaceFolders);
            
            // Add delay to ensure language servers are ready
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await setLanguageServerConfig(project);
            // Load symbols
            let symbols = await loadAllTargetSymbolsFromWorkspace(project.languageId, 0);
            assert.ok(symbols.length > 0, `${project.name} should have symbols`);
            symbols = await extractSymbolDocumentMapFromTaskList(project.path, symbols, project.tasklist!);
            
            // Sample symbols if needed
            if (sampleNumber > 0) {
                const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
                symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
            }
            console.log(`#### ${project.name}: Found ${symbols.length} symbols`);

            // Process each model sequentially
            for (const modelConfig of MODELS) {
                console.log(`#### Testing with model: ${modelConfig.model} ####`);
                
                const currentConfig = {
                    model: modelConfig.model,
                    provider: modelConfig.provider,
                    expProb: 1,
                    workspace: project.path,
                    ...privateConfig
                };
                getConfigInstance().updateConfig(currentConfig);

                // Process each generation type sequentially
                let fixtype = FixType.NOFIX;
                for (const generationType of GENERATION_TYPES) {
                    if (generationType === GenerationType.CFG) {
                        fixtype = FixType.ORIGINAL;
                    } else {
                        fixtype = FixType.NOFIX;
                    }
                    console.log(`#### Testing generation type: ${generationType} ####`);
                    try { 
                        await runGenerateTestCodeSuite(
                            generationType,
                            fixtype,
                            PromptType.WITHCONTEXT,
                            modelConfig.model,
                            modelConfig.provider,
                            symbols,
                            project.languageId
                        );
                        // await runGenerateTestCodeSuite(
                        //     generationType,
                        //     FixType.NOFIX,
                        //     PromptType.DETAILED,
                        //     modelConfig.model,
                        //     modelConfig.provider,
                        //     symbols,
                        //     project.languageId
                        // );
                    } catch (error) {
                        console.error(`#### Error: ${error}`);
                        console.error(`#### Retrying...`);
                        await runGenerateTestCodeSuite(
                            generationType,
                            fixtype,
                            PromptType.WITHCONTEXT,
                            modelConfig.model,
                            modelConfig.provider,
                            symbols,
                            project.languageId,
                            getConfigInstance().savePath
                        );
                    } finally {
                        console.log(`#### Retrying...`);
                    }
                }
            }
        }
    });
});


async function setLanguageServerConfig(project: ProjectConfig) {
    if (project.languageId === 'python') {
        await setPythonInterpreterPath(project.settings.pythonPath);
        const currentPythonInterpreterPath = await getPythonInterpreterPath();
        assert.ok(currentPythonInterpreterPath === project.settings.pythonPath, 'python interpreter path should be set as expected');
        console.log('Python interpreter used by extension:', await getPythonInterpreterPath());


        await setPythonExtraPaths([]);
        const oldPythonExtraPaths = await getPythonExtraPaths();
        console.log('oldPythonExtraPaths:', oldPythonExtraPaths);

        await setPythonExtraPaths(project.settings.extraPaths);
        const currentPythonExtraPaths = await getPythonExtraPaths();
        console.log('currentPythonExtraPaths:', currentPythonExtraPaths);
        assert.ok(currentPythonExtraPaths.length === project.settings.extraPaths.length, 'python extra paths should be set as expected');
        assert.ok(currentPythonExtraPaths.every((path, index) => path === project.settings.extraPaths[index]), 'python extra paths should be set as expected');
    }
}