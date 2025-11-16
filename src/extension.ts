import * as vscode from 'vscode';
import { generateUnitTestForSelectedRange } from './generate';
import { Configuration, getConfigInstance } from './config';
import { invokeLLM } from './invokeLLM';
import { getAllSymbols } from './lsp/symbol';
import { getDecodedTokensFromSymbol } from './lsp/token';

export async function activate(context: vscode.ExtensionContext) {

	
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
		const promptObj = [
			{
				role: 'system',
				content: 'You are a helpful assistant.'
			},
			{
				role: 'user',
				content: 'What is the capital of the moon?'
			}
		];
		const modelName = getConfigInstance().model;
		vscode.window.showInformationMessage(`Testing ${modelName} invoked LLM.`);
		const response = await invokeLLM(promptObj, []);
		if (response) {
			vscode.window.showInformationMessage('Successfully invoked LLM.',
				{
					modal: true
				}
			);
		} else {
			vscode.window.showErrorMessage('Failed to invoke LLM.',
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
	const disposable = vscode.commands.registerCommand('extension.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('Please open a file and select a function to generate unit test.');
			return;
		}

		const testCode = await generateUnitTestForSelectedRange(editor.document, editor.selection.active);

	});
	
	context.subscriptions.push(disposable);
	
	const showSettingsDisposable = vscode.commands.registerCommand('LSPRAG.showSettings', () => {
		const settings = [
			`Model: ${getConfigInstance().model}`,
			`Provider: ${getConfigInstance().provider}`,
			`Max Rounds: ${getConfigInstance().maxRound}`,
			`Experiment Probability: ${getConfigInstance().expProb}`,
			`Save Path: ${getConfigInstance().savePath}`,
			`Timeout: ${getConfigInstance().timeoutMs}`
		];
		
		vscode.window.showInformationMessage('Current Settings:', {
			detail: settings.join('\n'),
			modal: true
		});
	});
	context.subscriptions.push(showSettingsDisposable);


}
export function deactivate() { }