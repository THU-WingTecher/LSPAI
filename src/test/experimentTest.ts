import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { generateUnitTestForAFunction } from '../generate';
import { getConfigInstance } from '../config';
import { getTempDirAtCurWorkspace } from '../fileHandler';


suite('Extension Test Suite', () => {
    test('Run Experiment', async () => {
        // Get environment variables
        const srcPath = process.env.EXPERIMENT_SRC_PATH!;
        const targetFile = process.env.EXPERIMENT_TARGET_FILE!;
        const functionName = process.env.EXPERIMENT_FUNCTION_NAME!;

        // Wait for extension to activate
        await vscode.commands.executeCommand('workbench.action.files.openFolder', 
            vscode.Uri.file(srcPath));
        
        // Open the target file
        const document = await vscode.workspace.openTextDocument(
            path.join(srcPath, targetFile)
        );

        // Get the symbols
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (!symbols) {
            throw new Error('No symbols found in the document');
        }

        // Find the target function symbol
        const functionSymbol = findFunctionSymbol(symbols, functionName);
        if (!functionSymbol) {
            throw new Error(`Function ${functionName} not found`);
        }

        // Setup output paths
        const projectName = path.basename(srcPath);
        const outputDir = getTempDirAtCurWorkspace();
        const historyPath = path.join(outputDir, projectName, getConfigInstance().model, 'history');
        const expLogPath = path.join(outputDir, projectName, getConfigInstance().model, 'logs');

        // Generate the test
        const result = await generateUnitTestForAFunction(
            srcPath,
            document,
            functionSymbol,
            "",
            false // Don't show preview
        );

        assert.ok(result, 'Should generate test code');
    });
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