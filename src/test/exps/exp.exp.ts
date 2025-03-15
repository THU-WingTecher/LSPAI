import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { generateUnitTestForAFunction } from '../../generate';
import { currentModel, currentPromptType, maxRound, methodsForExperiment, PromptType } from '../../config';
import { getTempDirAtCurWorkspace } from '../../fileHandler';
import { activate } from '../../lsp';
import { _experiment } from '../../experiment';


suite('Extension Test Suite', () => {
    test('Test Prompt Type', () => {
        console.log(`Prompt Type: ${currentPromptType}`);
        if (currentPromptType == "basic") {
            assert.strictEqual(currentPromptType, PromptType.BASIC);
        } else if (currentPromptType == "detailed") {
            assert.strictEqual(currentPromptType, PromptType.DETAILED);
        } else if (currentPromptType == "concise") {
            assert.strictEqual(currentPromptType, PromptType.CONCISE);
        }
    });
    
    // test('Run Experiment', async () => {
    //     // Get environment variables

    //     // const srcPath = "/LSPAI/experiments/projects/commons-cli";
    //     // const targetFile = "src/main/java/org/apache/commons/cli/GnuParser.java";
    //     // const functionName = "flatten";
    //     const srcPath = process.env.EXPERIMENT_SRC_PATH!;
    //     const promptType = process.env.EXPERIMENT_PROMPT_TYPE!;
    //     // const targetFile = process.env.EXPERIMENT_TARGET_FILE!;
    //     // const functionName = process.env.EXPERIMENT_FUNCTION_NAME!;

    //     // Wait for extension to activate
    //     console.log("srcPath: ", srcPath);
    //     // await vscode.commands.executeCommand('workbench.action.files.openFolder', 
    //     //     vscode.Uri.file(srcPath));
        
    //     // Open the target file
    //     // const finalPath = path.join(srcPath, targetFile);
    //     await activate();
    //     const language = "java";
    //     console.log("running experiment");
    //     const results = await _experiment(srcPath, language, methodsForExperiment);
	// 	console.log(results);

    // });
});

function findFunctionSymbol(symbols: vscode.DocumentSymbol[], functionName: string): vscode.DocumentSymbol | undefined {
    for (const symbol of symbols) {
        if (symbol.name === functionName && symbol.kind === vscode.SymbolKind.Function) {
            return symbol;
        }
        if (symbol.children) {
            const found = findFunctionSymbol(symbol.children, functionName);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}