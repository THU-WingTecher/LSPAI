import * as assert from 'assert';
import * as vscode from 'vscode';
import { loadAllTargetSymbolsFromWorkspace, experiment, sleep, setWorkspaceFolders } from '../../helper';
import { FixType, loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider } from '../../config';
import path from 'path';
import { generateFileNameForDiffLanguage, generateTimestampString } from '../../fileHandler';
import { ProjectName } from '../../config';
import fs from 'fs';
import { METHODS } from 'http';
suite('Utils Test Suite', () => {

    let currentSrcPath: string;
    let symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[];
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    vscode.workspace.updateWorkspaceFolders(0, 1, {
        uri: vscode.Uri.file(projectPath),
        name: path.basename(projectPath),
    });
    
    const workspace = getConfigInstance().workspace;
    const projectName = path.basename(workspace);
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.AGENT,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        parallelCount: 8,
        maxRound: 5,
        ...privateConfig
    }
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    
    test(`Prepare for Experiment for ChatUnitest Comparison (${projectName}), testing `, async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        getConfigInstance().updateConfig({
            expProb: 1,
        });

        const tasklistPath = `/LSPAI/experiments/settings/${projectName}/tasklist.json`

        if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
            currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
        } else {
            currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
        }
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        
        console.log('### Start Generating ###');
        console.log('Current Config:', getConfigInstance());
        // console.log('symbolDocumentMaps', symbolDocumentMaps.length);
        
        symbolDocumentMaps = await loadAllTargetSymbolsFromWorkspace('java');
        console.log('We are loading tasklist of chatunitTest, symbolDocumentMaps', symbolDocumentMaps.length);
        symbolDocumentMaps = await loadChatUnitestTaskList(tasklistPath, symbolDocumentMaps);
        console.log('### Final Methods to be tested', symbolDocumentMaps.length);
    });
    
    // test(`Generate Test Code for ${projectName} with AGENT`, async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }

    //     getConfigInstance().updateConfig({
    //         generationType: GenerationType.AGENT,
    //         fixType: FixType.GROUPED,
    //         promptType: PromptType.DETAILED,
    //         savePath: path.join(getConfigInstance().workspace, 
    //         `results_chatunitest_${getConfigInstance().generationType}_${getConfigInstance().promptType}_${generateTimestampString()}`,
    //         getConfigInstance().model),
    //     });

    //     // getConfigInstance().updateConfig({
    //     //     savePath: path.join(getConfigInstance().workspace, 
    //     //             `results_4omini_${getConfigInstance().generationType}_${getConfigInstance().promptType}_${generateTimestampString()}`,
    //     //             getConfigInstance().model),
    //     // });

    //     const generatedResults = await experiment(symbolDocumentMaps, currentSrcPath, 0);
        
    // });

});






// Helper function to get the fully qualified class name from document URI
function getClassNameFromDocument(document: vscode.TextDocument): string {
    const uri = document.uri;
    const classPath = uri.path.split('/src/main/java/').pop() || '';
    return classPath.replace('.java', '').replace(/\//g, '.');
  }
  
  // Helper function to clean up symbol names
  function getCleanedSymbolName(symbol: vscode.DocumentSymbol): string {
    return symbol.name.replace(/\.\.\./g, '[]').replace(/<.*>/g, '').replace(/<T>/g, "").trim();
  }
  
  // Find all matches
async function loadChatUnitestTaskList(tasklist: string, symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[]){
    assert.ok(getConfigInstance().workspace !== undefined, 'workspace should be set');

    const json = JSON.parse(fs.readFileSync(tasklist, 'utf8'));
    let matchedSymbols: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[] = [];
    const flattedJson: string[] = Object.values(json).flat() as string[];
    let additionalCases: string[] = [];
    if (getConfigInstance().workspace.includes("commons-csv")) {
        additionalCases = ['create()', 'create(CSVFormat)', 'build()'];
    } else if (getConfigInstance().workspace.includes("commons-cli")) {
        additionalCases.push(...symbolDocumentMaps.filter(({document, symbol}) => getCleanedSymbolName(symbol).startsWith("getParsedOptionValue(char")).map(symbol => symbol.symbol.name));
    }
    for (const entry of symbolDocumentMaps) {
        const className = getClassNameFromDocument(entry.document);
        const cleanedSymbol = getCleanedSymbolName(entry.symbol);
        const matched = json[className]?.includes(cleanedSymbol) ?? false;

        const methods = json[className];
        if (methods && methods.includes(cleanedSymbol)) {
          matchedSymbols.push(entry);
        }

        if (additionalCases.includes(cleanedSymbol)) {
            matchedSymbols.push(entry);
        }
        // console.log(`Checking class: ${className}`);
        // console.log(`  Symbol: ${cleanedSymbol}`);
        // console.log(`  Match found: ${matched}`);
      }

      let finalResult = matchedSymbols.map(({document, symbol}) => {
        return getCleanedSymbolName(symbol);
    });
    //   const redundant = finalResult.filter((item, index) => finalResult.indexOf(item) !== index);
    //   for (const item of redundant) {
    //       console.log(`Redundant: ${item}`);
    //       const symbols = matchedSymbols.filter(({symbol}) => getCleanedSymbolName(symbol) === item);
    //       // choose the bigger range one 
    //       const sortedSymbols = symbols.sort((a, b) => {
    //           const aRange = a.symbol.range.end.line - a.symbol.range.start.line;
    //           const bRange = b.symbol.range.end.line - b.symbol.range.start.line;
    //           return bRange - aRange;
    //         });
    //         // final results are saved at matchedSymbols
    //         const selectedSymbol = sortedSymbols[0];
    //         // before doing below attempts, we should remove the redundant one from matchedSymbols
    //         matchedSymbols = matchedSymbols.filter(({symbol}) => getCleanedSymbolName(symbol) !== item);
    //         matchedSymbols.push(selectedSymbol);
            
    //     }
    // finalResult = matchedSymbols.map(({document, symbol}) => {
    //     return getCleanedSymbolName(symbol);
    // });
    // get intersected between finalResult and flattedJson
    const intersected = finalResult.filter((method) => flattedJson.includes(method));
    const missing = flattedJson.filter((method: string) => !finalResult.includes(method));
    // const overUp = finalResult.filter((method) => !flattedJson.includes(method));
    // console.log(intersected);
    console.log("missing", missing);
    assert.ok(missing.length === 0, 'missing methods should be empty');

    return matchedSymbols;
}
