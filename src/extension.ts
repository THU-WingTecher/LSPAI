import * as vscode from 'vscode';
import { 
	experiment, 
} from './experiment';
import { generateUnitTestForSelectedRange } from './generate';
import { methodsForExperiment } from './config';

export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	const workspace = vscode.workspace.workspaceFolders!;
	// if (workspace && workspace[0].uri.fsPath !== currentWorkspace) {
	// 	// raise error
	// 	throw new Error("Current workspace is not set");
	// }
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
		const models = ["gpt-4o-mini", "gpt-4o", "deepseek-chat"];
		// validate all model names 
		let taskListPath = "";

		const projectName = "commons-cli";
		taskListPath = `/LSPAI/experiments/data/${projectName}/taskList.json`;
		console.log(`taskListPath: ${taskListPath}`);

		let methodsForExperiment : string[] = [];
		const language = "java";
		for (const model of models) {
			methodsForExperiment = [model, `naive_${model}`];
			await experiment(language, methodsForExperiment, taskListPath);
		}

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

	// const disposable4 = await vscode.commands.registerCommand('lspAi.ReExperiment', async () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	const language = "java";
	// 	currentSrcPath = `${currentWorkspace}/src/main/`;
	// 	currentTestPath = `/vscode-llm-ut/experiments/commons-cli/results_1_15_2025__08_51_27/`;
	// 	currentExpLogPath = `${currentTestPath}logs/`;
	// 	currentHistoryPath = `${currentTestPath}history/`;

	// 	await reExperiment(language, currentGenMethods, currentTestPath);
	// 	vscode.window.showInformationMessage('Experiment Ended!');
	// });

	// context.subscriptions.push(disposable4);
}
export function deactivate() { }