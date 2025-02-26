import * as vscode from 'vscode';
import { 
	experiment, 
	reExperiment
} from './experiment';
import { generateUnitTestForSelectedRange } from './generate';
import { methodsForExperiment, currentModel, maxRound, currentExpProb, currentParallelCount, currentTimeout } from './config';

export async function activate(context: vscode.ExtensionContext) {

	const workspace = vscode.workspace.workspaceFolders!;
	console.log(`Workspace: ${workspace[0].uri.fsPath}`);
	console.log(`Model: ${currentModel}`);
	console.log(`Methods: ${methodsForExperiment}`);
	console.log(`Max Rounds: ${maxRound}`);
	console.log(`EXP_PROB_TO_TEST: ${currentExpProb}`);
	console.log(`PARALLEL: ${currentParallelCount}`);

	
	const disposable = vscode.commands.registerCommand('extension.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('Please open a file and select a function to generate unit test.');
			return;
		}

		// Show progress indicator
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Generating unit test...",
			cancellable: false
		}, async (progress) => {
			try {
				const testCode = await generateUnitTestForSelectedRange(editor.document, editor.selection.active);
				if (testCode) {
					// Create a new untitled document with the generated code
					const newDocument = await vscode.workspace.openTextDocument({
						language: editor.document.languageId,
						content: testCode
					});
					await vscode.window.showTextDocument(newDocument, { preview: true });
					vscode.window.showInformationMessage('Unit test generated successfully!');
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to generate unit test: ${error}`);
			}
		});
	});
	context.subscriptions.push(disposable);

	const disposable_exp = await vscode.commands.registerCommand('lspAi.JavaExperiment', async () => {
		vscode.window.showInformationMessage('LSPAI:JavaExperiment!');
		const language = "java";
		await experiment(language, methodsForExperiment);
		// Handle results...
	});
	context.subscriptions.push(disposable_exp);

	const disposable2 = await vscode.commands.registerCommand('lspAi.GoExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "go";
		await experiment(language, methodsForExperiment);
	});
	context.subscriptions.push(disposable2);

	const Pydisposable2 = await vscode.commands.registerCommand('lspAi.PythonExperiment', async () => {
		const language = "python";
		await experiment(language, methodsForExperiment);
	});

	context.subscriptions.push(Pydisposable2);

	const disposable4 = await vscode.commands.registerCommand('lspAi.ReExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "java";
		const currentGenMethods = ["deepseek-reasoner"]
		const currentTestPath = `/LSPAI/experiments/projects/commons-cli/results_2_26_2025__11_45_35`;
		// inspect whether the currentTestPath is endswith any of currentGenMethod
		const isModelSynced = currentGenMethods.some(method => method.endsWith(currentModel));
		if (!isModelSynced) {
			vscode.window.showErrorMessage('Current Model Setting is not correct.');
			return;
		}
		const isEndsWith = currentGenMethods.some(method => currentTestPath.endsWith(method));
		if (isEndsWith) {
			vscode.window.showErrorMessage('The current test path should not end gen methods.');
			return;
		}

		await reExperiment(language, currentGenMethods, currentTestPath);
	});

	context.subscriptions.push(disposable4);

	const showSettingsDisposable = vscode.commands.registerCommand('lspAi.showSettings', () => {
		const settings = [
			`Model: ${currentModel}`,
			`Methods: ${methodsForExperiment}`,
			`Max Rounds: ${maxRound}`,
			`Experiment Probability: ${currentExpProb}`,
			`Parallel Count: ${currentParallelCount}`,
			`Timeout: ${currentTimeout}`
		];
		
		vscode.window.showInformationMessage('Current Settings:', {
			detail: settings.join('\n'),
			modal: true
		});
	});
	context.subscriptions.push(showSettingsDisposable);
}
export function deactivate() { }