import * as vscode from 'vscode';
import { generateUnitTestForSelectedRange } from './generate';
import { Configuration, getConfigInstance, PromptType, Provider, GenerationType, FixType, ProjectConfigName, getProjectWorkspace, getProjectLanguage } from './config';
import { invokeLLM } from './invokeLLM';
import { getAllSymbols } from './lsp/symbol';
import { getDecodedTokensFromSymbol } from './lsp/token';
import { setWorkspaceFolders, updateWorkspaceFolders } from './helper';
import { runGenerateTestCodeSuite } from './experiment';
import { loadAllTargetSymbolsFromWorkspace } from './lsp/symbol';
import { findMatchedSymbolsFromTaskList } from './experiment';
import { readSliceAndSaveTaskList } from './experiment/utils/helper';
import { getDiagnosticsForFilePath } from './lsp/diagnostic';
import { reloadJavaLanguageServer } from './lsp/helper';
import * as path from 'path';
import { runPipeline } from './ut_runner/runner';

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
		
		const runCommonsCliExperimentDisposable = vscode.commands.registerCommand('LSPRAG.runCommonsCliExperiment', async () => {
			try {
				const projectName = "commons-cli" as ProjectConfigName;
				const projectPath = getProjectWorkspace(projectName);
				const languageId = getProjectLanguage(projectName);
				const parallelCount = 8;
				const sampleNumber = 100;
				const currentConfig = {
					parallelCount: parallelCount,
					model: 'gpt-4o-mini',
					provider: 'openai' as Provider,
					expProb: 1,
					promptType: PromptType.DETAILED,
					workspace: projectPath,
				};
				
				getConfigInstance().updateConfig({
					...currentConfig
				});

				let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

				// Step 1: Setup for experiment - Configure Java source paths and classpath
				vscode.window.showInformationMessage('Setting up workspace and Java Language Server...');

				const javaOptions = vscode.workspace.getConfiguration().get('java') as Record<string, unknown>;
				console.log('Reachable java options keys:', Object.keys(javaOptions || {}));
				console.log('Reachable java options values:', JSON.stringify(javaOptions, null, 2));
				console.log('\n========== Reloading Java Language Server ==========');
				await reloadJavaLanguageServer();
				await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for Maven import to complete
				console.log('Java Language Server reload completed');
				
				// Open the test file to ensure Language Server analyzes it
				const testFilePath = "/LSPRAG/experiments/projects/commons-cli/src/lsprag/test/java/org/apache/commons/cli/CommandLine_getOptionValue_1682Test.java";
				const testFileUri = vscode.Uri.file(testFilePath);
				const document = await vscode.workspace.openTextDocument(testFileUri);
				await vscode.window.showTextDocument(document);
				console.log('\n========== Opened test file ==========');
				console.log('Test file path:', testFilePath);
				
				// Wait for Language Server to analyze the file
				await new Promise(resolve => setTimeout(resolve, 3000));
				
				// Get diagnostics after file is opened and analyzed
				console.log('\n========== Diagnostics for Test File ==========');
				const diagnostics = await getDiagnosticsForFilePath(testFilePath);
				console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
				
				// Verify that the file is on the classpath (should NOT have classpath error)
				const classpathErrors = diagnostics.filter(d => d.message.includes('is not on the classpath of project'));
				if (classpathErrors.length > 0) {
					vscode.window.showWarningMessage(`File should be on classpath. Found classpath errors: ${classpathErrors.map(d => d.message).join(', ')}`);
				}
				
				// If there are diagnostics, they should be actual code errors, not classpath issues
				if (diagnostics.length > 0) {
					console.log('Found diagnostics (should be code errors, not classpath issues):', diagnostics.map(d => d.message));
				}

				// Step 2: Prepare FUT with robustness scores for assertion generation analysis
				vscode.window.showInformationMessage('Preparing FUT symbols from task list...');
				const taskListPath = '/LSPRAG/experiments/config/commons-cli-robust-sample100.json';
				const sampledTaskListPath = await readSliceAndSaveTaskList(taskListPath, sampleNumber);
				
				// console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

				symbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);
				symbols = await findMatchedSymbolsFromTaskList(sampledTaskListPath, symbols, projectPath);

				if (symbols.length === 0) {
					vscode.window.showErrorMessage('symbols should not be empty');
					return;
				}
				console.log(`#### Number of symbols: ${symbols.length}`);
				vscode.window.showInformationMessage(`Loaded ${symbols.length} symbols for experiment`);

				// Step 3: Run LSPRAG-reflact; deepseek-coder; naive-experimental comparative experiment
				vscode.window.showInformationMessage('Starting LSPRAG experiment...');
				await runGenerateTestCodeSuite(
					GenerationType.LSPRAG,
					FixType.ORIGINAL,
					PromptType.WITHCONTEXT,
					'deepseek-chat',
					'deepseek' as Provider,
					symbols,
					languageId,
					undefined,
				);

				const cachedDir = getConfigInstance().savePath;
				let testsDir = path.join(getConfigInstance().savePath, "final");
				let testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
				let final_report_path = testsDir+'-final-report';

				vscode.window.showInformationMessage('Running pipeline for LSPRAG experiment...');
				await runPipeline(testsDir, final_report_path, testFileMapPath, {
					language: languageId,
					jobs: getConfigInstance().parallelCount,
					timeoutSec: 30,
				});

				vscode.window.showInformationMessage('Starting EXPERIMENTAL (WITHCONTEXT) experiment...');
				await runGenerateTestCodeSuite(
					GenerationType.EXPERIMENTAL,
					FixType.ORIGINAL,
					PromptType.WITHCONTEXT,
					'deepseek-chat',
					'deepseek' as Provider,
					symbols,
					languageId,
					undefined,
					cachedDir
				);
				testsDir = path.join(getConfigInstance().savePath, "final");
				testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
				final_report_path = testsDir+'-final-report';
				
				vscode.window.showInformationMessage('Running pipeline for EXPERIMENTAL (WITHCONTEXT) experiment...');
				await runPipeline(testsDir, final_report_path, testFileMapPath, {
					language: languageId,
					jobs: getConfigInstance().parallelCount,
					timeoutSec: 30,
				});

				vscode.window.showInformationMessage('Starting EXPERIMENTAL (NAIVE) experiment...');
				await runGenerateTestCodeSuite(
					GenerationType.EXPERIMENTAL,
					FixType.ORIGINAL,
					PromptType.NAIVE,
					'deepseek-chat',
					'deepseek' as Provider,
					symbols,
					languageId,
					undefined,
					cachedDir
				);
				testsDir = path.join(getConfigInstance().savePath, "final");
				testFileMapPath = path.join(getConfigInstance().savePath, "test_file_map.json");
				final_report_path = testsDir+'-final-report';
				
				vscode.window.showInformationMessage('Running pipeline for EXPERIMENTAL (NAIVE) experiment...');
				await runPipeline(testsDir, final_report_path, testFileMapPath, {
					language: languageId,
					jobs: getConfigInstance().parallelCount,
					timeoutSec: 30,
				});

				vscode.window.showInformationMessage('All experiments completed successfully!', {
					modal: true
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				console.error('Experiment failed:', error);
				vscode.window.showErrorMessage(`Experiment failed: ${errorMessage}`, {
					modal: true
				});
			}
		});
		
		context.subscriptions.push(runCommonsCliExperimentDisposable);

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