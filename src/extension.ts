// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { DecodedToken, extractUseDefInfo } from './token';
import { invokeLLM, genPrompt, isBaseline, collectInfo, TokenLimitExceededError, isLlama } from './generate';
import { closeActiveEditor, getFunctionSymbol, isValidFunctionSymbol, isFunctionSymbol, getFunctionSymbolWithItsParents, getSymbolDetail, parseCode, getAllSymbols } from './utils';
import { summarizeClass } from './retrieve';
import { getDiagnosticsForFilePath, DiagnosticsToString } from './diagnostic';
import { saveGeneratedCodeToFolder, getUniqueFileName, genFileNameWithGivenSymbol, saveGeneratedCodeToIntermediateLocation, findFiles, generateFileNameForDiffLanguage } from './fileHandler';
import {ChatMessage, Prompt, constructDiagnosticPrompt, FixSystemPrompt} from "./promptBuilder";
import { error } from 'console';
import { LLMLogs, ExpLogs } from './log';
import { PassThrough } from 'stream';
import { Document } from '@langchain/core/dist/documents/document';
import { getLanguageSuffix } from './language';
import {Agent } from "http";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
let TIMEOUT = 300*1000
let SEED = Date.now()
let WORKSPACE = "/vscode-llm-ut/experiments/commons-cli/";
let SRC = `${WORKSPACE}src/main/`;
let TEST_PATH = `${WORKSPACE}/results_test/`;
let EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
let HISTORY_PATH = `${TEST_PATH}history/`;
let MODEL = "deepseek-chat" // gpt-4o-mini"; // llama3-70b // deepseek-chat
let GENMETHODS = [MODEL, `naive_${MODEL}`];
// let GENMETHODS = [`naive_${MODEL}`];
let EXP_PROB_TO_TEST = 1;
let PARALLEL = 1;
// let GENMETHODS = [MODEL];
const MAX_ROUNDS = 5;

export function deactivate() { }
export async function activate(context: vscode.ExtensionContext) {
	let config = vscode.workspace.getConfiguration();
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	const workspace = vscode.workspace.workspaceFolders;
	if (workspace && workspace[0].uri.fsPath !== WORKSPACE) {
		WORKSPACE = workspace[0].uri.fsPath;
	}
	console.log(`Current Workspace: ${WORKSPACE}`);
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.copilot', async () => {
        // Use Copilot's command for generating tests
        await vscode.commands.executeCommand('github.copilot.generateTests');
        vscode.window.showInformationMessage('Generate Tests executed!');
    });

    context.subscriptions.push(disposable);

	const disposable_exp = await vscode.commands.registerCommand('llm-lsp-ut.JavaExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		vscode.window.showInformationMessage('LSPAI:JavaExperiment!');
		const language = "java";
		SRC = `${WORKSPACE}/src/main/`;
		TEST_PATH = `${WORKSPACE}/results_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}/`;
		EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
		HISTORY_PATH = `${TEST_PATH}history/`;
		EXP_PROB_TO_TEST = 1;
		PARALLEL = 30;
		MODEL = "deepseek-chat";
		GENMETHODS = [MODEL, `naive_${MODEL}`]		
		await experiment(language, GENMETHODS);		
	});
	context.subscriptions.push(disposable_exp);

	const disposable2 = await vscode.commands.registerCommand('llm-lsp-ut.GoExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "go";
		SRC = `${WORKSPACE}`;
		TEST_PATH = `${WORKSPACE}/results_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}/`;
		EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
		HISTORY_PATH = `${TEST_PATH}history/`;
		EXP_PROB_TO_TEST = 1;
		PARALLEL = 30;
		MODEL = "gpt-4o";
		GENMETHODS = [MODEL, `naive_${MODEL}`]		
		await experiment(language, GENMETHODS);
	});

	context.subscriptions.push(disposable2);

	const Pydisposable2 = await vscode.commands.registerCommand('llm-lsp-ut.PythonExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "python";
		// SRC = `${WORKSPACE}/src`;
		SRC = `${WORKSPACE}/crawl4ai`; // crawl4ai
		// SRC = `${WORKSPACE}/src`; // black
		TEST_PATH = `${WORKSPACE}/results_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}/`;
		EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
		HISTORY_PATH = `${TEST_PATH}history/`;
		EXP_PROB_TO_TEST = 1;
		PARALLEL = 50;
		GENMETHODS = [MODEL, `naive_${MODEL}`]		
		await experiment(language, GENMETHODS);
	});

	context.subscriptions.push(Pydisposable2);


	const disposable3 = vscode.commands.registerCommand('extension.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor!');
			return;
		}
		SRC = `${WORKSPACE}`;
		TEST_PATH = `${WORKSPACE}/selectedRange/`;
		EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
		HISTORY_PATH = `${TEST_PATH}history/`;
		const testCode = await generateUnitTestForSelectedRange(editor.document, editor.selection.active);
	});

	const diagnostic = vscode.commands.registerCommand('extension.getDiagnostic', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor!');
			return;
		}
		SRC = `${WORKSPACE}`;
		TEST_PATH = `${WORKSPACE}/selectedRange/`;
		EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
		HISTORY_PATH = `${TEST_PATH}history/`;
		let diagnostics = await getDiagnosticsForFilePath(editor.document.uri.fsPath);
		console.log(diagnostics)
	});

	context.subscriptions.push(diagnostic);

	const disposable4 = await vscode.commands.registerCommand('llm-lsp-ut.ReExperiment', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "java";
		SRC = `${WORKSPACE}/src/main/`;
		TEST_PATH = `/vscode-llm-ut/experiments/commons-cli/results_1_15_2025__08_51_27/`;
		EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
		HISTORY_PATH = `${TEST_PATH}history/`;

		await reExperiment(language, GENMETHODS, TEST_PATH);
		vscode.window.showInformationMessage('Experiment Ended!');
	});

	context.subscriptions.push(disposable4);
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function experiment(language: string, genMethods: string[]): Promise<void> {
	const results = await _experiment(language, genMethods);
	for (const method in results) {
		if (isLlama(method)) {
			TIMEOUT = TIMEOUT*2
		}
		console.log(method, 'Results:', results);
		const successCount = results[method].filter(result => result).length;
		console.log(`${method}-Success: ${successCount}/${results[method].length}`);
	}
	// if (EXP_PROB_TO_TEST === 1){
	// vscode.window.showInformationMessage('Experiment Ended! Re-Scan for leacked file');
	// await reExperiment(language, GENMETHODS, TEST_PATH);
	// vscode.window.showInformationMessage('Experiment Ended! Re-Re-Scan for leacked file');
	// await reExperiment(language, GENMETHODS, TEST_PATH);
	// } else {
	// 	console.log('EXP_PROB_TO_TEST is not 1, so no re experiment');
	// }
	vscode.window.showInformationMessage('Experiment Ended!');

}

async function generateUnitTestForSelectedRange(document: vscode.TextDocument, position: vscode.Position): Promise<void> {

	// 获取符号信息
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
		'vscode.executeDocumentSymbolProvider',
		document.uri
	);

	if (!symbols) {
		vscode.window.showErrorMessage('No symbols found! - It seems language server is not running.');
		return;
	}

	// const allUseMap = new Map<String, Array<vscode.Location>>();
	// 获取光标位置
	const functionSymbolWithParents = getFunctionSymbolWithItsParents(symbols, position)!;
	let targetCodeContextString = "";
	const languageId = document.languageId;

	if (functionSymbolWithParents.length > 0) {
		const summarizedClass = await summarizeClass(document, functionSymbolWithParents[0], languageId);
		const parent = getSymbolDetail(document, functionSymbolWithParents[0]);
		const children = functionSymbolWithParents.slice(1).map(symbol => getSymbolDetail(document, symbol)).join(' ');
		targetCodeContextString = `${parent} { ${children} }`;
		console.log(`targetCodeContext, : ${targetCodeContextString}`);
	}
	const folderPath = `${TEST_PATH}${GENMETHODS[1]}`;
	
	const functionSymbol = getFunctionSymbol(symbols, position)!;
	
	const res = generateFileNameForDiffLanguage(document, functionSymbol, folderPath, document.languageId, []);
	await generateUnitTestForAFunction(document, functionSymbol, res.fileName, GENMETHODS[0]);

}


function isSymbolLessThanLines(symbol: vscode.DocumentSymbol, line: number): boolean {
	return symbol.range.end.line-symbol.range.start.line < line;
}

function goSpecificEnvGen(fullfileName: string, folderName: string, language: string): string {
    // Create the new folder path
    const fullPath = path.join(folderName, fullfileName);
    const newFolder = path.dirname(fullPath);
    const suffix = getLanguageSuffix(language); 
    const Files: string[] = [];

    // Find all source code files
    findFiles(SRC, Files, language, suffix);
	
    // Copy all source code files to the new folder, preserving directory structure
    Files.forEach(file => {
        // Calculate the relative destination directory and file name
        const relativeDir = path.relative(SRC, path.dirname(file)); // Get the relative directory
		console.log(path.dirname(file), relativeDir);
        const destDir = path.join(newFolder, relativeDir); // Destination directory for the file
        const destFile = path.join(destDir, path.basename(file)); // Complete destination file path

        // Ensure the destination directory exists
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Try to copy the file
        try {
            fs.copyFileSync(file, destFile); // Copy file to the destination
        } catch (err) {
            console.error(`Error copying file ${file} to ${destFile}: ${err}`);
        }
    });

    return fullPath; // Return the new folder path
}

async function parallelGenUnitTestForSymbols(symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[], 
										language: string, method: string, num_parallel: number) {
	const generatedResults: any[] = []; // To store generated results
	const folderPath = `${TEST_PATH}${method}`	
	// Generate a list of symbols and corresponding file names
	const filePaths: string[] = []
	if (language === 'go') {
		const res = goSpecificEnvGen('random', folderPath, language);
	}
	const symbolFilePairs = symbolDocumentMap.map(({symbol, document}) => {
;
		return generateFileNameForDiffLanguage(document, symbol, folderPath, language, filePaths);
	});

	// Process symbols in parallel batches
	for (let i = 0; i < symbolFilePairs.length; i += num_parallel) {
		const batch = symbolFilePairs.slice(i, i + num_parallel);
		const symbolTasks = batch.map(async ({ document, symbol, fileName }) => {
			console.log(`#### Processing symbol ${symbol.name}`);
			
			// Generate unit tests and store the result
			const result = await generateUnitTestForAFunction(document, symbol, fileName, method);
			vscode.window.showInformationMessage(`[Progress:${generatedResults.length}] Unit test (${method}) for ${symbol.name} generated!`);
			generatedResults.push(result);
		});
		await Promise.all(symbolTasks.map(task => 
			Promise.race([
				task,
				sleep(TIMEOUT).then(() => console.warn('Timeout exceeded for symbol processing'))
			])
		));
	}
	vscode.window.showInformationMessage(`Unit test for all ${symbolDocumentMap.map(item => item.symbol.name).join(', ')} generated!`);
	return generatedResults;
}


export async function _experiment(language: string, methods: string[]) : Promise<{[key: string]: boolean[]}> {
	logCurrentSettings()
	const suffix = getLanguageSuffix(language); 
	const Files: string[] = [];
	findFiles(SRC, Files, language, suffix);
	const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];

	for (const filePath of Files) {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
		console.log(`#### Preparing symbols under file: ${filePath}`);
		const symbols = await getAllSymbols(document.uri);
		if (symbols) {
			for (const symbol of symbols) {
				if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
					// if (language === 'java' && !isPublic(symbol, document)) {
					// 	continue;
					// }
					if (isSymbolLessThanLines(symbol, 4)){
						continue;
					}
					if (Math.random() < EXP_PROB_TO_TEST) { 
						symbolDocumentMap.push({ symbol, document });
					}
				}
			}
		}
		console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
	}
	const generatedResults: { [key: string]: boolean[] } = {};
	for (const method of methods) {
		console.log(`#### Starting experiment for method: ${method}`);
		generatedResults[method] = await parallelGenUnitTestForSymbols(symbolDocumentMap, language, method, PARALLEL);
	}
	console.log('#### Experiment completed!');
	logCurrentSettings();
	return generatedResults;
}
export function isGenerated(document: vscode.TextDocument, target: vscode.DocumentSymbol, origFolderPath: string, tempFolderPath: string): boolean {
	const res = generateFileNameForDiffLanguage(document, target, tempFolderPath, document.languageId, [])
	if (fs.existsSync(res.fileName.replace(tempFolderPath, origFolderPath))) {
		return true;
	} else {
		return false;
	}
}
export async function reExperiment(language: string, methods: string[], origFilePath: string) : Promise<void> {
	logCurrentSettings()
	const tempFolderPath = `${TEST_PATH}temp_${Math.random().toString(36).substring(2, 15)}/`;
	const suffix = getLanguageSuffix(language); 

	function findFiles(folderPath: string, Files: string[] = []) {
		fs.readdirSync(folderPath).forEach(file => {
			const fullPath = path.join(folderPath, file);
			if (fs.statSync(fullPath).isDirectory()) {
				findFiles(fullPath, Files); // Recursively search in subdirectory
			} else if (file.endsWith(`.${suffix}`)) {
				if (language === "go" && file.toLowerCase().includes('test')) {
					console.log(`Ignoring test file: ${fullPath}`);
				} else {
					Files.push(fullPath);
				}
			}
		});
	}
	const Files: string[] = [];
	const Generated: string[] = [];
	findFiles(SRC, Files);
	const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];
	let origFinalFilePath;
	for (const method of methods) {
		for (const filePath of Files) {
				const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
				console.log(`#### Preparing symbols under file: ${filePath}`);
				const symbols = await getAllSymbols(document.uri);
				if (symbols) {
					for (const symbol of symbols) {
						if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
							origFinalFilePath = path.join(origFilePath, method);
							if (isGenerated(document, symbol, origFinalFilePath, path.join(tempFolderPath, method))){
								continue;
							}
							// if (language === 'java' && !isPublic(symbol, document)) {
							// 	continue;
							// }
							if (isSymbolLessThanLines(symbol, 4)){
								continue;
							}
							vscode.window.showInformationMessage(`Found leak file : ${origFinalFilePath}`);
							symbolDocumentMap.push({ symbol, document });
						}
					}
				}
				console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
			}
		const generatedResults: { [key: string]: boolean[] } = {};
		console.log(`#### Starting experiment for method: ${method}`);
		generatedResults[method] = await parallelGenUnitTestForSymbols(symbolDocumentMap, language, method, PARALLEL);
	}
	console.log('#### Experiment completed!');
	logCurrentSettings();
}

function logCurrentSettings() {
    console.log(`Testing the folder of ${SRC}`);
    console.log(`saving the result to ${TEST_PATH}`);
    console.log(`Model: ${MODEL}`);
    console.log(`Methods: ${GENMETHODS}`);
    console.log(`Max Rounds: ${MAX_ROUNDS}`);
    console.log(`Experiment Log Folder: ${EXP_LOG_FOLDER}`);
    console.log(`EXP_PROB_TO_TEST: ${EXP_PROB_TO_TEST}`);
    console.log(`PARALLEL: ${PARALLEL}`);
}

function isPublic(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): boolean {
	const funcDefinition = document.lineAt(symbol.selectionRange.start.line).text;
	return funcDefinition.includes('public') || false;
}

// main entry
async function generateUnitTestForAFunction(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol, fullFileName: string, method: string): Promise<boolean> {

	let genResult = false;
	const expData: ExpLogs[] = [];
	const overallStartTime = Date.now(); // Record the start time
	const fileNameParts = fullFileName.split('/');
	const fileName = fileNameParts[fileNameParts.length - 1].split('.')[0];
	expData.push({llmInfo: null, process: "start", time: "", method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
    // Log the start of the experiment
    
    // 获取当前使用的编程语言
    const languageId = document.languageId;
    console.log('Language ID:', languageId);

    let functionName: string | null = null;
    if (!functionSymbol || !isFunctionSymbol(functionSymbol)) {
        vscode.window.showErrorMessage('No valid function symbol found!');
    }

    functionName = functionSymbol.name;
    if (!isValidFunctionSymbol(functionSymbol)) {
        return genResult;
    }

    // 使用 LLM 生成单元测试
    let testCode = "";
	const startTime = Date.now();
	let originalCode = "";
    const collectedData = await collectInfo(document, functionSymbol, languageId, fileName, method);
	expData.push({llmInfo: null, process: "collectInfo", time: (Date.now() - startTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
    const promptObj = await genPrompt(collectedData, method, languageId);
	let prev_diagnostics;
	let logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: MODEL};
    const startLLMTime = Date.now();
	try {
		testCode = await invokeLLM(method, promptObj, logObj);
		testCode = parseCode(testCode);
		expData.push({llmInfo: logObj, process: "invokeLLM", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
		// console.log('Generated Final test code:', testCode);
	} catch (error) {
		if (error instanceof TokenLimitExceededError) {
			console.warn('Token limit exceeded, continuing...');
			expData.push({llmInfo: logObj, process: "TokenLimitation", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
		}
	}

	if (isBaseline(method)){
		saveGeneratedCodeToFolder(testCode, fullFileName);
		return true;
	}

    if (testCode) {
		let round = 0;
		let curSavePoint;
		let finalCode = testCode;
		const saveStartTime = Date.now();
		// curSavePoint = await saveGeneratedCodeToIntermediateLocation(testCode, fullFileName.split(method)[1], path.join(HISTORY_PATH, method, round.toString()));
		curSavePoint = await saveToIntermediate(finalCode, fullFileName.split(method)[1], path.join(HISTORY_PATH, method, round.toString()), languageId);
		expData.push({llmInfo: null, process: "saveGeneratedCodeToFolder", time: (Date.now() - saveStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
		// Fixing the code
		const diagStartTime = Date.now();
		let diagnostics = await getDiagnosticsForFilePath(curSavePoint);
		// curSavePoint = await goSpecificEnvGen(testCode, fullFileName.split(method)[1], path.join(HISTORY_PATH, method, fileName, round.toString()), languageId);
		// diagnostics = await getDiagnosticsForFilePath(curSavePoint);
		expData.push({llmInfo: null, process: "getDiagnosticsForFilePath", time: (Date.now() - diagStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
		while (round < MAX_ROUNDS && diagnostics.length > 0) {
			round++;
			console.log(`\n--- Round ${round} ---`);
			const diagnosticMessages = await DiagnosticsToString(vscode.Uri.file(curSavePoint), diagnostics, method);
			const diagnosticPrompts = constructDiagnosticPrompt(finalCode, diagnosticMessages.join('\n'), collectedData.functionSymbol.name, collectedData.mainfunctionParent, collectedData.SourceCode)
			console.log('Constructed Diagnostic Messages:', diagnosticMessages);
			const chatMessages: ChatMessage[] = [
				{ role: "system", content: FixSystemPrompt(languageId) },
				{ role: "user", content: diagnosticPrompts }
			];
		
			const promptObj: Prompt = { messages: chatMessages };
			let aiResponse: string;
			let fixlogObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: MODEL};
			const fixStartTime = Date.now();
			if (!diagnosticMessages.length) {
				error('No diagnostic messages found!');
			}

			try {
				aiResponse = await invokeLLM(method, promptObj.messages, fixlogObj);
				expData.push({llmInfo: fixlogObj, process: `FixWithLLM_${round}`, time: (Date.now() - fixStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: diagnosticMessages.join('\n')});
			} catch (error) {
				if (error instanceof TokenLimitExceededError) {
					console.warn('Token limit exceeded, continuing...');
					expData.push({llmInfo: logObj, process: "TokenLimitation", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
				} else {
					expData.push({llmInfo: logObj, process: "UnknownError", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
				}
				continue;
			}
	
			finalCode = parseCode(aiResponse);
			try {
				const saveStartTime = Date.now();
				originalCode = fs.readFileSync(curSavePoint, 'utf8');
				curSavePoint = await saveToIntermediate(finalCode, fullFileName.split(method)[1], path.join(HISTORY_PATH, method, round.toString()), languageId);
				expData.push({llmInfo: null, process: "saveGeneratedCodeToFolder", time: (Date.now() - saveStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
				console.log('Original file updated with AI-generated code.');
			} catch (error) {
				console.error('Failed to update the original file:', error);
				break;
			}
	
			// Step 7: Retrieve updated diagnostics
			prev_diagnostics = diagnostics;
			const diagStartTime2 = Date.now();
			diagnostics = await getDiagnosticsForFilePath(curSavePoint);
			expData.push({llmInfo: null, process: "getDiagnosticsForFilePath", time: (Date.now() - diagStartTime2).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
			// if (diagnostics.length > prev_diagnostics.length && originalCode) {
			// 	console.log('Diagnostics increased, reverting to original code.');
			// 	const outmostDir = path.dirname(curSavePoint).split(path.sep).pop()!;
			// 	const newOutmostDir = (parseInt(outmostDir) - 1).toString();
			// 	curSavePoint = path.join(path.dirname(path.dirname(curSavePoint)), newOutmostDir, path.basename(curSavePoint));
			// 	finalCode = fs.readFileSync(curSavePoint, 'utf8');
			// 	diagnostics = await getDiagnosticsForFilePath(curSavePoint);
			// 	expData.push({llmInfo: null, process: "getDiagnosticsForFilePath", time: (Date.now() - diagStartTime2).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
			// }
			console.log(`Remaining Diagnostics after Round ${round}:`, diagnostics.length);
		}


		if (diagnostics.length === 0) {
			genResult = true;
			await saveGeneratedCodeToFolder(finalCode, fullFileName);
			console.log('All diagnostics have been resolved.');
		} else {
			console.log(`Reached the maximum of ${MAX_ROUNDS} rounds with ${diagnostics.length} diagnostics remaining.`);
		}
    }

    if (!testCode) {
        vscode.window.showErrorMessage('Failed to generate unit test!');
        return genResult;
    }

    // Stop measuring the execution time
	expData.push({llmInfo: null, process: "End", time: (Date.now() - overallStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});

	// Append to CSV file
	const jsonFilePath = path.join(EXP_LOG_FOLDER, method, `${fileName}_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}.json`);

	// Prepare the data to be saved
	const formattedData = expData.map(log => {
		return {
		method: log.method,
		process: log.process,
		time: log.time,
		fileName: log.fileName,
		function: log.function,
		errMsag: log.errMsag,
		llmInfo: log.llmInfo ? {
			tokenUsage: log.llmInfo.tokenUsage,
			result: log.llmInfo.result,
			prompt: log.llmInfo.prompt,
			model: log.llmInfo.model
		} : null
		};
	});
	const dir = path.dirname(jsonFilePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	// Check if the file exists and if not, initialize an empty array
	let jsonContent = [];
	if (fs.existsSync(jsonFilePath)) {
		jsonContent = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
	}
	
	// Append the current experiment's data
	jsonContent.push(...formattedData);
	
	// Write the updated data to the JSON file
	fs.writeFileSync(jsonFilePath, JSON.stringify(jsonContent, null, 2), 'utf8');
	// Ensure the directory exists

	console.log(`Experiment data saved to ${jsonFilePath}`);

	return genResult;
}

export async function saveToIntermediate(testCode: string, fullFileName: string, folderName: string, language: string): Promise<string> {
	let curSavePoint;
	if (language == "go"){
		curSavePoint = path.join(folderName, fullFileName);
		if (!fs.existsSync(path.dirname(curSavePoint))){
			curSavePoint = await goSpecificEnvGen(fullFileName, folderName, language);
			await sleep(1000); // Sleep for 1 second
		}
		fs.writeFileSync(curSavePoint, testCode, 'utf8');
		console.log(`Generated code saved to ${curSavePoint}`);
	} else {
		curSavePoint = await saveGeneratedCodeToIntermediateLocation(testCode, fullFileName, folderName);
	}
	return curSavePoint;
}
