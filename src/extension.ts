import * as vscode from 'vscode';
import { generateUnitTestForSelectedRange } from './generate';
import { Configuration, getConfigInstance } from './config';
import path from 'path';
import { getCodeAction } from './lsp/diagnostic';
import { generateUnitTestsForFocalMethod, init, signIn, copilotServer } from './copilot';
import { GenerationType, PromptType, FixType, Provider } from './config';
import { extractSymbolDocumentMapFromTaskList, loadAllTargetSymbolsFromWorkspace, selectOneSymbolFileFromWorkspace } from './helper';
import { experimentWithCopilot } from './copilot';
import { generateTimestampString } from './fileHandler';
import { invokeLLM } from './invokeLLM';
import { runGenerateTestCodeSuite, findMatchedSymbolsFromTaskList } from './experiment';
import { activate as activateLSP, setPythonAnalysisExclude, setPythonAnalysisInclude, setPythonExtraPaths, setPythonInterpreterPath } from './lsp/helper';

async function runExperiment(configurations: any[], symbols: any[], languageId: string, projectPath: string, repeatCount: number) {
	for (let j = 0; j < repeatCount; j++) {
		Configuration.resetInstance();
		getConfigInstance().updateConfig({
			workspace: projectPath,
			expProb: 1
		});		
		for (let i = 0; i < configurations.length; i++) {
			const config = configurations[i];
			await runGenerateTestCodeSuite(
				config.generationType,
				config.fixType,
				config.promptType,
				config.model,
				config.provider,
				symbols,
				languageId,
			);
		}
	}
}

export async function activate(context: vscode.ExtensionContext) {

	// const telemetry = TelemetryService.initialize(context);
    
    // // Check for consent
    // await telemetry.ensurePrivacyConsent();

    // Example usage in your existing code
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('extension.generateUnitTest', async () => {
    //         try {
    //             // Your existing code
    //             telemetry.logEvent('generateUnitTest', {
    //                 success: true,
    //                 duration: 1000,
    //                 // other relevant data
    //             });
    //         } catch (error) {
    //             telemetry.logError(error as Error, {
    //                 command: 'generateUnitTest',
    //                 // other relevant error context
    //             });
    //         }
    //     })
    // );
	
	const workspace = vscode.workspace.workspaceFolders;

	if (!Configuration.isTestingEnvironment() && workspace && workspace.length > 0) {	
		console.log(`Workspace: ${workspace[0].uri.fsPath}`);
		getConfigInstance().updateConfig({
			workspace: workspace[0].uri.fsPath
		});
	} else {
		console.log(`No workspace found`);
	}
	console.log(`Model: ${getConfigInstance().model}`);
	console.log(`Methods: ${getConfigInstance().methodsForExperiment}`);
	console.log(`Max Rounds: ${getConfigInstance().maxRound}`);
	console.log(`EXP_PROB_TO_TEST: ${getConfigInstance().expProb}`);
	console.log(`PARALLEL: ${getConfigInstance().parallelCount}`);

	const copilotExperimentDisposable = vscode.commands.registerCommand('LSPRAG.CopilotExperiment', async () => {
		const language = "go";
		let taskListPath = "";

		// if (language === "java") {
		//  Since Java project's symbol providers are not consistent.
		// 	const projectName = getConfigInstance().workspace.split("/").pop();
		// 	taskListPath = `/LSPRAG/experiments/data/${projectName}/taskList.json`;
		// 	console.log(`taskListPath: ${taskListPath}`);
		// }

		try {
		// Show progress indicator
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Running Copilot Experiment...",
			cancellable: false
		}, async (progress) => {
			// Initialize Copilot connection
			const connection = await copilotServer();
			await init(connection, getConfigInstance().workspace);
			await signIn(connection);
	
			// Load symbols from workspace
			getConfigInstance().updateConfig({
			expProb: 1,
			savePath: path.join(
				getConfigInstance().workspace, 
				`results_copilot_${getConfigInstance().generationType}_${getConfigInstance().promptType}_${generateTimestampString()}`,
				getConfigInstance().model
			)
			});

			let symbolDocumentMaps = await loadAllTargetSymbolsFromWorkspace(language);
			if (taskListPath) {
				console.log(`from current ${symbolDocumentMaps.length} symbolDocumentMaps,  symbols will be used.`);
				symbolDocumentMaps = await extractSymbolDocumentMapFromTaskList(
					getConfigInstance().workspace,
					symbolDocumentMaps,
					taskListPath
				);
				console.log(`after extracting, ${symbolDocumentMaps.length} symbolDocumentMaps will be used.`);
			}
			// await saveTaskList(symbolDocumentMaps, getConfigInstance().workspace, getConfigInstance().savePath);
			// Update config for the experiment
	
			// Run the experiment
			const results = await experimentWithCopilot(
			connection,
			symbolDocumentMaps,
			vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
			0
			);
	
			vscode.window.showInformationMessage('Copilot experiment completed successfully!');
		});
		} catch (error) {
		vscode.window.showErrorMessage(`Failed to run Copilot experiment: ${error}`);
		}
	});
	
	context.subscriptions.push(copilotExperimentDisposable);

	const pythonBlackExperimentDisposable = vscode.commands.registerCommand('LSPRAG.PythonBlackExperiment', async () => {
		const pythonInterpreterPath = "/root/miniconda3/envs/lsprag/bin/python";
		const projectPath = "/LSPRAG/experiments/projects/black";
		const blackModuleImportPath = [
			path.join(projectPath, "src/black"), 
			path.join(projectPath, "src/blackd"), 
			path.join(projectPath, "src/blib2to3"), 
			path.join(projectPath, "src")
		];
		const languageId = "python";
		const taskListPath = '/LSPRAG/experiments/config/black-taskList.json';

		try {
			// Show progress indicator
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Running Python Black Experiment...",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Setting up Python environment..." });

				// Set up Python interpreter and extra paths
				await setPythonInterpreterPath(pythonInterpreterPath);
				await setPythonExtraPaths(blackModuleImportPath);
				// await setPythonAnalysisInclude(["tests/**/*.py"]);
				// await setPythonAnalysisExclude(["**/lsprag-workspace/**/*.py"]);

				progress.report({ message: "Activating language server..." });
				
				// Activate language server if not in testing environment
				if (process.env.NODE_DEBUG !== 'true') {
					await activateLSP();
				}

				progress.report({ message: "Loading symbols from workspace..." });
				
				// Load all target symbols from workspace
				let symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
				symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);

				// let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];
				// // Filter symbols using task list
				// const fileName2 = "trans.py";
				// const symbolName2 = "iter_fexpr_spans";
				// const symbolDocumentMap2 = await selectOneSymbolFileFromWorkspace(fileName2, symbolName2, languageId);
				// console.log(`#### One file: ${symbolDocumentMap2}`);
				// symbols.push(symbolDocumentMap2);
				// if (symbols.length === 0) {
				// 	throw new Error('No symbols found matching the task list');
				// }

				progress.report({ message: `Running experiment on ${symbols.length} symbols...` });

				const repeatCount = 2 ; 
				const configurations = [
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'gpt-4o-mini',
						provider: 'openai' as Provider,
					},
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'gpt-4o',
						provider: 'openai' as Provider,
					},
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'deepseek-chat',
						provider: 'deepseek' as Provider,
					},
				];

				await runExperiment(configurations, symbols, languageId, projectPath, repeatCount);

				vscode.window.showInformationMessage(`Python Black experiment completed successfully! Processed ${symbols.length} symbols.`);
			});
		} catch (error) {
			console.error('Python Black experiment failed:', error);
			vscode.window.showErrorMessage(`Failed to run Python Black experiment: ${error}`);
		}
	});
	
	context.subscriptions.push(pythonBlackExperimentDisposable);

	const pythonTornadoExperimentDisposable = vscode.commands.registerCommand('LSPRAG.PythonTornadoExperiment', async () => {
		const pythonInterpreterPath = "/root/miniconda3/envs/lsprag/bin/python";
		const projectPath = "/LSPRAG/experiments/projects/tornado";
		const tornadoModuleImportPath = [
			path.join(projectPath, "tornado"), 
		];
		const languageId = "python";
		const taskListPath = '/LSPRAG/experiments/config/tornado-taskList.json';

		try {
			// Show progress indicator
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Running Python Tornado Experiment...",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Setting up Python environment..." });

				// Set up Python interpreter and extra paths
				await setPythonInterpreterPath(pythonInterpreterPath);
				await setPythonExtraPaths(tornadoModuleImportPath);
				// await setPythonAnalysisInclude(["tests/**/*.py"]);
				// await setPythonAnalysisExclude(["**/lsprag-workspace/**/*.py"]);

				progress.report({ message: "Activating language server..." });
				
				// Activate language server if not in testing environment
				if (process.env.NODE_DEBUG !== 'true') {
					await activateLSP();
				}

				progress.report({ message: "Loading symbols from workspace..." });
				
				// Load all target symbols from workspace
				let symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
				symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);

				// let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];
				// // Filter symbols using task list
				// const fileName2 = "trans.py";
				// const symbolName2 = "iter_fexpr_spans";
				// const symbolDocumentMap2 = await selectOneSymbolFileFromWorkspace(fileName2, symbolName2, languageId);
				// console.log(`#### One file: ${symbolDocumentMap2}`);
				// symbols.push(symbolDocumentMap2);
				// if (symbols.length === 0) {
				// 	throw new Error('No symbols found matching the task list');
				// }

				progress.report({ message: `Running experiment on ${symbols.length} symbols...` });

				// Update config for the experiment
				getConfigInstance().updateConfig({
					workspace: projectPath,
					expProb: 1
				});

				// Run the main experiment
				await runGenerateTestCodeSuite(
					GenerationType.CFG,
					FixType.ORIGINAL,
					PromptType.WITHCONTEXT,
					'gpt-4o-mini',
					'openai' as Provider,
					symbols,
					languageId,
				);
				await runGenerateTestCodeSuite(
					GenerationType.CFG,
					FixType.ORIGINAL,
					PromptType.WITHCONTEXT,
					'gpt-4o',
					'openai' as Provider,
					symbols,
					languageId,
				);
				// Run the main experiment
				await runGenerateTestCodeSuite(
					GenerationType.CFG,
					FixType.ORIGINAL,
					PromptType.WITHCONTEXT,
					'deepseek-chat',
					'deepseek' as Provider,
					symbols,
					languageId,
				);
				vscode.window.showInformationMessage(`Python Black experiment completed successfully! Processed ${symbols.length} symbols.`);
			});
		} catch (error) {
			console.error('Python Black experiment failed:', error);
			vscode.window.showErrorMessage(`Failed to run Python Black experiment: ${error}`);
		}
	});
	
	context.subscriptions.push(pythonBlackExperimentDisposable);

	const javaCliExperimentDisposable = vscode.commands.registerCommand('LSPRAG.javaCliExperiment', async () => {
		const projectPath = "/LSPRAG/experiments/projects/commons-cli";
		const languageId = "java";
		const taskListPath = '/LSPRAG/experiments/config/commons-cli-taskList.json';

		try {
			// Show progress indicator
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Running Java Commons-cli Experiment...",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Activating language server..." });
				
				// Activate language server if not in testing environment
				if (process.env.NODE_DEBUG !== 'true') {
					await activateLSP();
				}

				progress.report({ message: "Loading symbols from workspace..." });
				
				// Load all target symbols from workspace
				let symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
				symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);

				progress.report({ message: `Running experiment on ${symbols.length} symbols...` });

				// Update config for the experiment
				getConfigInstance().updateConfig({
					workspace: projectPath,
					expProb: 1
				});

				// Run the main experiment
				await runGenerateTestCodeSuite(
					GenerationType.CFG,
					FixType.ORIGINAL,
					PromptType.WITHCONTEXT,
					'gpt-4o-mini',
					'openai' as Provider,
					symbols,
					languageId,
				);
				await runGenerateTestCodeSuite(
					GenerationType.CFG,
					FixType.ORIGINAL,
					PromptType.WITHCONTEXT,
					'gpt-4o',
					'openai' as Provider,
					symbols,
					languageId,
				);
				// Run the main experiment
				await runGenerateTestCodeSuite(
					GenerationType.CFG,
					FixType.ORIGINAL,
					PromptType.WITHCONTEXT,
					'deepseek-chat',
					'deepseek' as Provider,
					symbols,
					languageId,
				);
				vscode.window.showInformationMessage(`Java Commons-cli experiment completed successfully! Processed ${symbols.length} symbols.`);
			});
		} catch (error) {
			console.error('Java Commons-cli experiment failed:', error);
			vscode.window.showErrorMessage(`Failed to run Java Commons-cli experiment: ${error}`);
		}
	});
	
	context.subscriptions.push(javaCliExperimentDisposable);

	const javaCsvExperimentDisposable = vscode.commands.registerCommand('LSPRAG.javaCsvExperiment', async () => {
		const projectPath = "/LSPRAG/experiments/projects/commons-csv";
		const languageId = "java";
		const taskListPath = '/LSPRAG/experiments/config/commons-csv-taskList.json';

		try {
			// Show progress indicator
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Running Java Commons-csv Experiment...",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Activating language server..." });
				
				// Activate language server if not in testing environment
				if (process.env.NODE_DEBUG !== 'true') {
					await activateLSP();
				}

				progress.report({ message: "Loading symbols from workspace..." });
				
				// Load all target symbols from workspace
				let symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
				symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);

				progress.report({ message: `Running experiment on ${symbols.length} symbols...` });

				const repeatCount = 4 ; 
				const configurations = [
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'gpt-4o-mini',
						provider: 'openai' as Provider,
					},
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'gpt-4o',
						provider: 'openai' as Provider,
					},
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'deepseek-chat',
						provider: 'deepseek' as Provider,
					},
				];

				await runExperiment(configurations, symbols, languageId, projectPath, repeatCount);
				vscode.window.showInformationMessage(`Java Commons-csv experiment completed successfully! Processed ${symbols.length} symbols.`);
			});
		} catch (error) {
			console.error('Java Commons-csv experiment failed:', error);
			vscode.window.showErrorMessage(`Failed to run Java Commons-csv experiment: ${error}`);
		}
	});
	
	context.subscriptions.push(javaCsvExperimentDisposable);

	const goLogrusExperimentDisposable = vscode.commands.registerCommand('LSPRAG.goLogrusExperiment', async () => {
		const projectPath = "/LSPRAG/experiments/projects/logrus";
		const languageId = "go";
		const taskListPath = '/LSPRAG/experiments/config/logrus-taskList.json';

		try {
			// Show progress indicator
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Running Go Logrus Experiment...",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Activating language server..." });
				
				// Activate language server if not in testing environment
				if (process.env.NODE_DEBUG !== 'true') {
					await activateLSP();
				}

				progress.report({ message: "Loading symbols from workspace..." });
				
				// Load all target symbols from workspace
				let symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
				symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);

				progress.report({ message: `Running experiment on ${symbols.length} symbols...` });

				// Update config for the experiment
				getConfigInstance().updateConfig({
					workspace: projectPath,
					expProb: 1
				});
				const repeatCount = 3 ; 
				const configurations = [
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'gpt-4o-mini',
						provider: 'openai' as Provider,
					},
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'gpt-4o',
						provider: 'openai' as Provider,
					},
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'deepseek-chat',
						provider: 'deepseek' as Provider,
					},
				];

				await runExperiment(configurations, symbols, languageId, projectPath, repeatCount);

				vscode.window.showInformationMessage(`Go Logrus experiment completed successfully! Processed ${symbols.length} symbols.`);
			});
		} catch (error) {
			console.error('Go Logrus experiment failed:', error);
			vscode.window.showErrorMessage(`Failed to run Go Logrus experiment: ${error}`);
		}
	});
	
	context.subscriptions.push(goLogrusExperimentDisposable);

	const goCobraExperimentDisposable = vscode.commands.registerCommand('LSPRAG.goCobraExperiment', async () => {
		const projectPath = "/LSPRAG/experiments/projects/cobra";
		const languageId = "go";
		const taskListPath = '/LSPRAG/experiments/config/cobra-taskList.json';

		try {
			// Show progress indicator
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Running Go Cobra Experiment...",
				cancellable: false
			}, async (progress) => {
				progress.report({ message: "Activating language server..." });
				
				// Activate language server if not in testing environment
				if (process.env.NODE_DEBUG !== 'true') {
					await activateLSP();
				}

				progress.report({ message: "Loading symbols from workspace..." });
				
				// Load all target symbols from workspace
				let symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
				symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);

				progress.report({ message: `Running experiment on ${symbols.length} symbols...` });

				// Update config for the experiment
				getConfigInstance().updateConfig({
					workspace: projectPath,
					expProb: 1
				});
				const repeatCount = 3 ; 
				const configurations = [
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'gpt-4o-mini',
						provider: 'openai' as Provider,
					},
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'gpt-4o',
						provider: 'openai' as Provider,
					},
					{
						generationType: GenerationType.CFG,
						fixType: FixType.ORIGINAL,
						promptType: PromptType.WITHCONTEXT,
						model: 'deepseek-chat',
						provider: 'deepseek' as Provider,
					},
				];

				await runExperiment(configurations, symbols, languageId, projectPath, repeatCount);
				vscode.window.showInformationMessage(`Go Cobra experiment completed successfully! Processed ${symbols.length} symbols.`);
			});
		} catch (error) {
			console.error('Go Cobra experiment failed:', error);
			vscode.window.showErrorMessage(`Failed to run Go Cobra experiment: ${error}`);
		}
	});
	
	context.subscriptions.push(goCobraExperimentDisposable);

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

		const response = await invokeLLM(promptObj, []);
		if (response) {
			vscode.window.showInformationMessage('Successfully invoked LLM.');
		} else {
			vscode.window.showErrorMessage('Failed to invoke LLM.');
		}
	});
	
	context.subscriptions.push(testLLMDisposable);
	const disposable = vscode.commands.registerCommand('extension.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('Please open a file and select a function to generate unit test.');
			return;
		}

		// telemetry.logEvent('generateUnitTest', {
		// 	success: true,
		// 	duration: 1000,
		// 	// other relevant data
		// }); 
		const testCode = await generateUnitTestForSelectedRange(editor.document, editor.selection.active);

	});
	
	context.subscriptions.push(disposable);
	
	const showSettingsDisposable = vscode.commands.registerCommand('LSPRAG.showSettings', () => {
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

	const diagnosticDisposable = vscode.commands.registerCommand('extension.diagnostic', async () => {

		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('Please open a file and select a function to generate unit test.');
			return;
		}
		
		// const filepath = "/LSPRAG/experiments/projects/commons-csv/src/test/java/org/apache/commons/csv/CSVFormat_getIgnoreEmptyLines1Test.java";
		// const uri = vscode.Uri.file(filepath);
		const document = editor.document;
		const diagnostics = await vscode.languages.getDiagnostics(document.uri);
		const codeActions = await getCodeAction(document.uri, diagnostics[0]);
		for (const diagnostic of diagnostics) {
			console.log('diagnostics', diagnostics);
			const codeActions = await getCodeAction(editor.document.uri, diagnostic);
			
			// Filter for quick fix actions only
			const quickFixes = codeActions.filter(action => 
				action.kind && action.kind.contains(vscode.CodeActionKind.QuickFix)
			);
	
			// Apply each quick fix
			for (const fix of quickFixes) {
				console.log('fix', fix);
				if (fix.edit) {
					// Double check we're only modifying the target file
					const edits = fix.edit.entries();
					const isTargetFileOnly = edits.every(([uri]) => uri.fsPath === 	document.uri.fsPath);
					
					if (isTargetFileOnly) {
						await vscode.workspace.applyEdit(fix.edit);
					}
				}
			}
		}
	});

	// const disposable_exp = await vscode.commands.registerCommand('LSPRAG.JavaExperiment', async () => {
	// 	vscode.window.showInformationMessage('LSPRAG:JavaExperiment!');
	// 	const language = "java";
	// 	await experiment(language, getConfigInstance().methodsForExperiment);
	// 	// Handle results...
	// });
	// context.subscriptions.push(disposable_exp);

	// const disposable2 = await vscode.commands.registerCommand('LSPRAG.GoExperiment', async () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	const language = "go";
	// 	await experiment(language, getConfigInstance().methodsForExperiment);
	// });
	// context.subscriptions.push(disposable2);

	// const Pydisposable2 = await vscode.commands.registerCommand('LSPRAG.PythonExperiment', async () => {
	// 	const language = "python";
	// 	await experiment(language, getConfigInstance().methodsForExperiment);
	// });

	// context.subscriptions.push(Pydisposable2);

	// const disposable4 = await vscode.commands.registerCommand('LSPRAG.ReExperiment', async () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	const language = "java";
	// 	const currentGenMethods = ["deepseek-reasoner"];
	// 	const currentTestPath = `/LSPRAG/experiments/projects/commons-cli/results_2_26_2025__11_45_35`;
	// 	// inspect whether the currentTestPath is endswith any of currentGenMethod
	// 	const isModelSynced = currentGenMethods.some(method => method.endsWith(getConfigInstance().model));
	// 	if (!isModelSynced) {
	// 		vscode.window.showErrorMessage('Current Model Setting is not correct.');
	// 		return;
	// 	}
	// 	const isEndsWith = currentGenMethods.some(method => currentTestPath.endsWith(method));
	// 	if (isEndsWith) {
	// 		vscode.window.showErrorMessage('The current test path should not end gen methods.');
	// 		return;
	// 	}

	// 	await reExperiment(language, currentGenMethods, currentTestPath);
	// });

	// context.subscriptions.push(disposable4);

}
export function deactivate() { }