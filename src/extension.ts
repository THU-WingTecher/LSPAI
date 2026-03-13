import * as vscode from 'vscode';
import { Configuration, getConfigInstance } from './config';
import { getAllSymbols } from './lsp/symbol';
import { getDecodedTokensFromSymbol } from './lsp/token';
import { runLLMHealthcheck } from './llmHealthcheck';
import { GenerateUnitTestCommandOptions, runGenerateUnitTestCommand } from './commands/generateUnitTestCommand';
import { getCurrentSettingsLines } from './currentSettings';

export async function activate(context: vscode.ExtensionContext) {

	try {
		const workspace = vscode.workspace.workspaceFolders;

		if (!Configuration.isTestingEnvironment() && workspace && workspace.length > 0) {	
			console.log(`Workspace: ${workspace[0].uri.fsPath}`);
			getConfigInstance().updateConfig({
				workspace: workspace[0].uri.fsPath
			});
		} else {
			console.log(`No workspace found`);
		}


				const testLLMDisposable = vscode.commands.registerCommand('extension.testLLM', async () => {
				const config = getConfigInstance();
				const modelName = config.model;
				const provider = config.provider;
				const timeoutSeconds = Math.round(config.timeoutMs / 1000);
				console.log(`testLLM command started. provider=${provider}, model=${modelName}, timeout=${timeoutSeconds}s`);
				try {
					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: `Testing ${provider}/${modelName}`,
							cancellable: false
						},
							async (progress) => {
								progress.report({
									message: `Waiting for LLM response (timeout: ${timeoutSeconds}s)`
								});
								const result = await runLLMHealthcheck();
								vscode.window.showInformationMessage(
									`Successfully invoked LLM: ${result.response}`,
									{
										modal: true
									}
								);
						}
					);
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					console.error('testLLM command failed:', error);
					vscode.window.showErrorMessage(`Test LLM failed: ${errorMessage}`,
						{
							modal: true
						}
					);
				}
			});
		
		context.subscriptions.push(testLLMDisposable);
		
		const testLSPDisposable = vscode.commands.registerCommand('extension.testLSP', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Please open a file to test language server functionality.');
				return;
			}

			const document = editor.document;
			const uri = document.uri;

			try {
				// Test 1: Symbol Finding
				vscode.window.showInformationMessage('Testing symbol finding...');
				const symbols = await getAllSymbols(uri);
				console.log(`Found ${symbols.length} symbols in ${uri.fsPath}`);
				console.log('Symbols:', symbols.map(s => s.name));

				if (symbols.length === 0) {
					vscode.window.showWarningMessage('No symbols found. Language server may not be initialized yet.');
					return;
				}

				// Test 2: Token Extraction
				vscode.window.showInformationMessage('Testing token extraction...');
				const firstFunctionSymbol = symbols.find(s => 
					s.kind === vscode.SymbolKind.Function || 
					s.kind === vscode.SymbolKind.Method
				);

				if (!firstFunctionSymbol) {
					vscode.window.showWarningMessage('No function/method symbol found for token extraction test.');
					return;
				}

				const tokens = await getDecodedTokensFromSymbol(document, firstFunctionSymbol);
				console.log(`Extracted ${tokens.length} tokens from symbol: ${firstFunctionSymbol.name}`);
				console.log('Tokens:', tokens.map(t => t.word));

				// Show success message with results
				const message = `LSP Test Success!\nSymbols: ${symbols.length}\nTokens from "${firstFunctionSymbol.name}": ${tokens.length}`;
				vscode.window.showInformationMessage(message,
					{
						modal: true
					}
				);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				console.error('LSP test failed:', error);
				vscode.window.showErrorMessage(`LSP test failed: ${errorMessage}`,
					{
						modal: true
					}
				);
			}
		});
		
		context.subscriptions.push(testLSPDisposable);
		const disposable = vscode.commands.registerCommand('extension.generateUnitTest', async (options?: GenerateUnitTestCommandOptions) => {
			return runGenerateUnitTestCommand(options);
		});
		
		context.subscriptions.push(disposable);
		
		const showSettingsDisposable = vscode.commands.registerCommand('LSPRAG.showSettings', () => {
			const settings = getCurrentSettingsLines();
			
			vscode.window.showInformationMessage('Current Settings:', {
				detail: settings.join('\n'),
				modal: true
			});
		});
		context.subscriptions.push(showSettingsDisposable);

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Failed to activate LSPRAG extension:', error);
		vscode.window.showErrorMessage(`LSPRAG activation failed: ${errorMessage}`, 
			{
				modal: true
			}
		);
	}
}
export function deactivate() { }
