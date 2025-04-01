import * as assert from 'assert';
import * as vscode from 'vscode';
import { loadAllTargetSymbolsFromWorkspace, experiment, sleep, setWorkspaceFolders } from '../../helper';
import { FixType, loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider } from '../../config';
import path from 'path';
import { _generateFileNameForDiffLanguage, generateFileNameForDiffLanguage, generateTimestampString, saveGeneratedCodeToFolder } from '../../fileHandler';
import { ProjectName } from '../../config';
import { experimentWithCopilot, init, signIn, copilotServer } from '../../copilot';

suite('Utils Test Suite', () => {

    let currentSrcPath: string;
    let symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[];
    const projectPath = "/LSPAI/experiments/projects/black";
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
        parallelCount: 1,
        maxRound: 5,
        ...privateConfig
    }
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    
    getConfigInstance().updateConfig({
        savePath: path.join(getConfigInstance().workspace, 
                `results_4omini_${getConfigInstance().generationType}_${getConfigInstance().promptType}_${generateTimestampString()}`,
                getConfigInstance().model),
    });
    
    test(`Prepare for Experiment for ChatUnitest Comparison (${projectName}), testing `, async () => {
      if (process.env.NODE_DEBUG !== 'true') {
          console.log('activate');
          await activate();
      }
      getConfigInstance().updateConfig({
          expProb: 1,
      });

      if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
          currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
      } else {
          currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
      }
      console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
      
      console.log('### Start Generating ###');
      console.log('Current Config:', getConfigInstance());
      // console.log('symbolDocumentMaps', symbolDocumentMaps.length);
      
      symbolDocumentMaps = await loadAllTargetSymbolsFromWorkspace('python');
      console.log('We are loading tasklist of chatunitTest, symbolDocumentMaps', symbolDocumentMaps.length);
      });

      test(`Copilot Experiment`, async () => {
        const connection = await copilotServer();
        await init(connection, getConfigInstance().workspace);
        await signIn(connection);

        getConfigInstance().updateConfig({
            generationType: GenerationType.AGENT,
            fixType: FixType.GROUPED,
            promptType: PromptType.DETAILED,
            savePath: path.join(getConfigInstance().workspace, 
            `results_copilot_${getConfigInstance().generationType}_${getConfigInstance().promptType}_${generateTimestampString()}`,
            getConfigInstance().model),
        });

        const generatedResults = await experimentWithCopilot(connection, symbolDocumentMaps, currentSrcPath, 0);
        // await disconnect(connection);
      });

});
