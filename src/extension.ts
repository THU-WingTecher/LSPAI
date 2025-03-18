import * as vscode from 'vscode';
import { 
	experiment, 
	reExperiment
} from './experiment';
import { generateUnitTestForSelectedRange } from './generate';
import { getConfigInstance } from './config';
import { collectTrainData, main } from './train/collectTrainData';
import * as fs from 'fs';
import path from 'path';
export async function activate(context: vscode.ExtensionContext) {

	const workspace = vscode.workspace.workspaceFolders;

	if (workspace && workspace.length > 0) {	
		console.log(`Workspace: ${workspace[0].uri.fsPath}`);
	} else {
		console.log(`No workspace found`);
	}
	console.log(`Model: ${getConfigInstance().model}`);
	console.log(`Methods: ${getConfigInstance().methodsForExperiment}`);
	console.log(`Max Rounds: ${getConfigInstance().maxRound}`);
	console.log(`EXP_PROB_TO_TEST: ${getConfigInstance().expProb}`);
	console.log(`PARALLEL: ${getConfigInstance().parallelCount}`);


	
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
		await experiment(language, getConfigInstance().methodsForExperiment);
		// Handle results...
	});
	context.subscriptions.push(disposable_exp);

	const disposable2 = await vscode.commands.registerCommand('lspAi.GoExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "go";
		await experiment(language, getConfigInstance().methodsForExperiment);
	});
	context.subscriptions.push(disposable2);

	const Pydisposable2 = await vscode.commands.registerCommand('lspAi.PythonExperiment', async () => {
		const language = "python";
		await experiment(language, getConfigInstance().methodsForExperiment);
	});

	context.subscriptions.push(Pydisposable2);

	const disposable4 = await vscode.commands.registerCommand('lspAi.ReExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "java";
		const currentGenMethods = ["deepseek-reasoner"];
		const currentTestPath = `/LSPAI/experiments/projects/commons-cli/results_2_26_2025__11_45_35`;
		// inspect whether the currentTestPath is endswith any of currentGenMethod
		const isModelSynced = currentGenMethods.some(method => method.endsWith(getConfigInstance().model));
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

	const collectTrainDataDisposable = await vscode.commands.registerCommand('lspAi.CollectTrainData', async () => {
		// const dataFolder = path.join(__dirname, '../data');
		const dataFolder = "/UniTSyn/data/focal";

		const jsonlFiles = fs.readdirSync(dataFolder)
		.filter(file => file.endsWith('.jsonl'))
		.map(file => path.join(dataFolder, file));
		for (const jsonlFile of jsonlFiles) {	
			console.log("jsonlFile: ", jsonlFile);
			const inputJsonPath = jsonlFile;
			const outputJsonPath = "/LSPAI/temp/" + jsonlFile.split('/').pop();
			if (fs.existsSync(outputJsonPath)) {
				fs.unlinkSync(outputJsonPath);
			}
	// Call the main function
	const result = await main(inputJsonPath, outputJsonPath);
	
	console.log(outputJsonPath);

			// Assert that the result is not null or undefined

		}
	});
	context.subscriptions.push(collectTrainDataDisposable);

	const showSettingsDisposable = vscode.commands.registerCommand('lspAi.showSettings', () => {
		const settings = [
			`Model: ${getConfigInstance().model}`,
			`Methods: ${getConfigInstance().methodsForExperiment}`,
			`Max Rounds: ${getConfigInstance().maxRound}`,
			`Experiment Probability: ${getConfigInstance().expProb}`,
			`Parallel Count: ${getConfigInstance().parallelCount}`,
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