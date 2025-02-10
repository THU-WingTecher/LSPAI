import * as vscode from 'vscode';
import { getDiagnosticsForFilePath, DiagnosticsToString } from './diagnostic';
import { 
	experiment, 
	currentWorkspace,
	currentGenMethods,
	logCurrentSettings,
} from './experiment';
import * as path from 'path';
import * as fs from 'fs';
import { ExpLogs } from './log';
import { generateUnitTestForSelectedRange } from './generate';

export function deactivate() { }
export async function activate(context: vscode.ExtensionContext) {
	let config = vscode.workspace.getConfiguration();
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	const workspace = vscode.workspace.workspaceFolders!;
	// if (workspace && workspace[0].uri.fsPath !== currentWorkspace) {
	// 	// raise error
	// 	throw new Error("Current workspace is not set");
	// }
	console.log(`Current Workspace: ${workspace[0].uri.fsPath}`);
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.copilot', async () => {
        // Use Copilot's command for generating tests
        await vscode.commands.executeCommand('github.copilot.generateTests');
        vscode.window.showInformationMessage('Generate Tests executed!');
    });

    context.subscriptions.push(disposable);

	const disposable_exp = await vscode.commands.registerCommand('lspAi.JavaExperiment', async () => {
		vscode.window.showInformationMessage('LSPAI:JavaExperiment!');
		const language = "java";
		await experiment(language, currentGenMethods);
		// Handle results...
	});
	context.subscriptions.push(disposable_exp);

	const disposable2 = await vscode.commands.registerCommand('lspAi.GoExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "go";
		await experiment(language, currentGenMethods);
	});
	context.subscriptions.push(disposable2);

	const Pydisposable2 = await vscode.commands.registerCommand('lspAi.PythonExperiment', async () => {
		const language = "python";
		await experiment(language, currentGenMethods);
	});

	context.subscriptions.push(Pydisposable2);


	const disposable3 = vscode.commands.registerCommand('extension.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor!');
			return;
		}
		const testCode = await generateUnitTestForSelectedRange(editor.document, editor.selection.active);
	});

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
