import * as assert from 'assert';
import * as vscode from 'vscode';
import { formatToJSON } from '../../utils';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, setWorkspaceFolders } from '../../helper';
import { FixType, loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider } from '../../config';
import path from 'path';
import { invokeLLM } from '../../invokeLLM';
suite('LLM invoke Test Suite', () => {

    const projectPath = "/LSPAI/experiments/projects/commons-csv";
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.AGENT,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        parallelCount: 1,
        maxRound: 3,
        savePath: path.join(__dirname, '../../../logs'),
        ...privateConfig
    }
    getConfigInstance().updateConfig({
        ...currentConfig
    });

    
    test('Check LLM response, testing ', async () => {
        // if (process.env.NODE_DEBUG !== 'true') {
        //     console.log('activate');
        //     await activate();
        // }
        const promptObj = [
            {
                role: 'system',
                content: 'You are a helpful assistant.'
            },
            {
                role: 'user',
                content: 'What is the capital of the moon?'
            }
        ]
        const response = await invokeLLM(promptObj, []);
        console.log('response ::', response);
        assert.ok(response && response.length > 0, 'response should not be empty');
        // getConfigInstance().updateConfig({
        //     generationType: GenerationType.EXPERIMENTAL,
        // });
    });
});