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
    { model: 'gpt-4o-mini', provider: 'openai' },
    // { model: 'gpt-4o', provider: 'openai' },
    // { model: 'deepseek-chat', provider: 'deepseek' },
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
        path: "/LSPAI/experiments/projects/logrus",
        languageId: 'go',
        name: 'logrus',
        tasklist: '/LSPAI/experiments/config/logrus-taskList.json',
    },
    {
        path: "/LSPAI/experiments/projects/cobra",
        languageId: 'go',
        name: 'cobra',
        tasklist: '/LSPAI/experiments/config/cobra-taskList.json',
    }
];

const JAVA_PROJECTS: ProjectConfig[] = [
    {
        path: "/LSPAI/experiments/projects/commons-cli",
        languageId: 'java',
        name: 'commons-cli',
        tasklist: '/LSPAI/experiments/config/commons-cli-taskList.json',
    },
    {
        path: "/LSPAI/experiments/projects/commons-csv",
        languageId: 'java',
        name: 'commons-csv',
        tasklist: '/LSPAI/experiments/config/commons-csv-taskList.json',
    }
];

const PYTHON_PROJECTS: ProjectConfig[] = [
    {
        path: "/LSPAI/experiments/projects/black",
        languageId: 'python',
        name: 'black',
        settings: {
            pythonPath: "/root/miniconda3/envs/lspai/bin/python",
            extraPaths: [
                path.join("/LSPAI/experiments/projects/black", "src/black"), 
                path.join("/LSPAI/experiments/projects/black", "src/blackd"), 
                path.join("/LSPAI/experiments/projects/black", "src/blib2to3"), 
                path.join("/LSPAI/experiments/projects/black", "src")  
            ]
        },
        tasklist: '/LSPAI/experiments/config/black-taskList.json',
    },
    {
        path: "/LSPAI/experiments/projects/tornado",
        languageId: 'python',
        name: 'tornado',
        settings: {
                pythonPath: "/root/miniconda3/envs/lspai/bin/python",
                extraPaths: [
                    path.join("/LSPAI/experiments/projects/tornado", "tornado"),    
                ]
            },
        tasklist: '/LSPAI/experiments/config/tornado-taskList.json',
        },
];

// const ALL_PROJECTS = [...GO_PROJECTS];
// const ALL_PROJECTS = [PYTHON_PROJECTS[1]];
const ALL_PROJECTS = [...PYTHON_PROJECTS, ...JAVA_PROJECTS, ...GO_PROJECTS];

// ... existing code ...

/**
 * Randomly sample symbols with uniformly distributed line counts
 * @param symbols Array of symbol-document pairs
 * @param sampleSize Number of symbols to sample (default: 50)
 * @returns Array of sampled symbols with uniform line count distribution
 */
function sampleSymbolsWithUniformLineDistribution(
    symbols: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[],
    sampleSize: number = 50
): { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[] {
    if (symbols.length <= sampleSize) {
        return symbols;
    }

    // Calculate line counts for all symbols
    const symbolsWithLineCounts = symbols.map(({ symbol, document }) => ({
        symbol,
        document,
        lineCount: symbol.range.end.line - symbol.range.start.line
    }));

    // Find min and max line counts
    const lineCounts = symbolsWithLineCounts.map(s => s.lineCount);
    const minLines = Math.min(...lineCounts);
    const maxLines = Math.max(...lineCounts);

    // Create line count buckets for uniform distribution
    const numBuckets = Math.min(10, maxLines - minLines + 1); // Use 10 buckets or fewer if range is small
    const bucketSize = Math.ceil((maxLines - minLines + 1) / numBuckets);
    
    // Group symbols into buckets based on line count
    const buckets: typeof symbolsWithLineCounts[] = Array.from({ length: numBuckets }, () => []);
    
    symbolsWithLineCounts.forEach(symbolData => {
        const bucketIndex = Math.min(
            Math.floor((symbolData.lineCount - minLines) / bucketSize),
            numBuckets - 1
        );
        buckets[bucketIndex].push(symbolData);
    });

    // Sample uniformly from each bucket
    const symbolsPerBucket = Math.ceil(sampleSize / numBuckets);
    const sampledSymbols: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[] = [];

    for (const bucket of buckets) {
        if (bucket.length === 0) continue;
        
        // Shuffle bucket and take up to symbolsPerBucket items
        const shuffled = bucket.sort(() => Math.random() - 0.5);
        const toTake = Math.min(symbolsPerBucket, bucket.length);
        
        for (let i = 0; i < toTake; i++) {
            sampledSymbols.push({
                symbol: shuffled[i].symbol,
                document: shuffled[i].document
            });
        }
    }

    // If we have more than sampleSize, randomly remove excess
    if (sampledSymbols.length > sampleSize) {
        const shuffled = sampledSymbols.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, sampleSize);
    }

    // If we have fewer than sampleSize, randomly add more from remaining symbols
    if (sampledSymbols.length < sampleSize) {
        const remainingSymbols = symbols.filter(symbolData => 
            !sampledSymbols.some(sampled => 
                sampled.symbol === symbolData.symbol && 
                sampled.document === symbolData.document
            )
        );
        
        const shuffled = remainingSymbols.sort(() => Math.random() - 0.5);
        const needed = sampleSize - sampledSymbols.length;
        
        for (let i = 0; i < Math.min(needed, shuffled.length); i++) {
            sampledSymbols.push(shuffled[i]);
        }
    }

    console.log(`#### Sampled ${sampledSymbols.length} symbols with uniform line distribution`);
    console.log(`#### Line count range: ${minLines} - ${maxLines} lines`);
    
    // Log distribution statistics
    const sampledLineCounts = sampledSymbols.map(s => s.symbol.range.end.line - s.symbol.range.start.line);
    const avgLines = sampledLineCounts.reduce((sum, count) => sum + count, 0) / sampledLineCounts.length;
    console.log(`#### Average line count: ${avgLines.toFixed(2)} lines`);

    return sampledSymbols;
}
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
            symbols = sampleSymbolsWithUniformLineDistribution(symbols, 50);
            assert.ok(symbols.length === 50, `${project.name} should have 50 symbols`);
            // symbols = await extractSymbolDocumentMapFromTaskList(project.path, symbols, project.tasklist!);
            
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