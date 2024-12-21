// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { DecodedToken, extractUseDefInfo } from './token';
import { invokeLLM, genPrompt, isBaseline, collectInfo } from './generate';
import { getFunctionSymbol, isValidFunctionSymbol, isFunctionSymbol, getFunctionSymbolWithItsParents, getSymbolDetail, parseCode } from './utils';
import { classifyTokenByUri, processAndGenerateHierarchy, summarizeClass } from './retrieve';
import { getDiagnosticsForFilePath, DiagnosticsToString } from './diagnostic';
import {updateOriginalFile } from './fileHandler';
import {ChatMessage, Prompt, constructDiagnosticPrompt} from "./promptBuilder";
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
let WORKSPACE = "/vscode-llm-ut/experiments/commons-cli/";
let SRC = `${WORKSPACE}src/main/`;
let TEST_PATH = `${WORKSPACE}results_test/`;
let EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
let MODEL = "gpt-4o-mini" // gpt-4o-mini"; // llama3-70b
let GENMETHODS = [`naive_${MODEL}`, MODEL];
const MAX_ROUNDS = 5;
export function activate(context: vscode.ExtensionContext) {
	let config = vscode.workspace.getConfiguration();
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "llm-lsp-ut" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable_exp = vscode.commands.registerCommand('llm-lsp-ut.JavaExperiment', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('JavaExperiment!');
		const language = "java";
		WORKSPACE = "/vscode-llm-ut/experiments/commons-cli/";
		SRC = `${WORKSPACE}src/main/`;
		TEST_PATH = `${WORKSPACE}results_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}/`;
		EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
		experiment(language)
		
	});
	context.subscriptions.push(disposable_exp);

	const disposable = vscode.commands.registerCommand('llm-lsp-ut.JavaExperimentTest', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		console.log(`Testing the folder of ${SRC}`);
		console.log(`saving the result to ${TEST_PATH}`);
		console.log(`Model: ${MODEL}`);
		console.log(`Methods: ${GENMETHODS}`);
		console.log(`Max Rounds: ${MAX_ROUNDS}`);
		console.log(`Experiment Log Folder: ${EXP_LOG_FOLDER}`);
		const language = "java";
		experiment(language)
		vscode.window.showInformationMessage('JavaExperiment!');
	});

	context.subscriptions.push(disposable);

	const disposable3 = vscode.commands.registerCommand('llm-lsp-ut.GoExperiment', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		const language = "go";
		experiment(language)
		vscode.window.showInformationMessage('GoExperiment!');
	});

	context.subscriptions.push(disposable3);


	const disposable2 = vscode.commands.registerCommand('extension.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor!');
			return;
		}
		const testCode = await generateUnitTestForSelectedRange(editor);

		// // 弹出窗口显示生成的单元测试代码
		// const testDocument = await vscode.workspace.openTextDocument({ content: testCode, language: languageId });
		// await vscode.window.showTextDocument(testDocument);

		// vscode.window.showInformationMessage(`Unit test for "${functionName}" generated!`);
	});

	context.subscriptions.push(disposable2);
}
function getLanguageSuffix(language: string): string {
	const suffixMap: { [key: string]: string } = {
		'python': 'py',
		'go': 'go',
		'typescript': 'ts',
		'javascript': 'js',
		'java': 'java',
		'csharp': 'cs',
		'ruby': 'rb',
		'php': 'php',
		'cpp': 'cpp',
		'c': 'c',
		'swift': 'swift',
		'kotlin': 'kt',
		'rust': 'rs'
	};
	
	const suffix = suffixMap[language.toLowerCase()];
	if (!suffix) {
		throw new Error(`Unsupported language: ${language}. Please provide a language from the following list: ${Object.keys(suffixMap).join(', ')}`);
	}
	return suffix;
}

async function experiment(language: string) : Promise<any> {
	console.log(`Testing the folder of ${SRC}`);
	console.log(`saving the result to ${TEST_PATH}`);
	console.log(`Model: ${MODEL}`);
	console.log(`Methods: ${GENMETHODS}`);
	console.log(`Max Rounds: ${MAX_ROUNDS}`);
	console.log(`Experiment Log Folder: ${EXP_LOG_FOLDER}`);
	const suffix = getLanguageSuffix(language); 

	function findFiles(folderPath: string, Files: string[] = []) {
		fs.readdirSync(folderPath).forEach(file => {
			const fullPath = path.join(folderPath, file);
			if (fs.statSync(fullPath).isDirectory()) {
				findFiles(fullPath, Files); // Recursively search in subdirectory
			} else if (file.endsWith(`.${suffix}`)) {
				Files.push(fullPath);
			}
		});
	}
	const Files: string[] = [];
	findFiles(SRC, Files);

	for (const filePath of Files) {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
		const symbols = await getAllSymbols(document.uri);
		for (const symbol of symbols) {
			if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
				const curDocument = await vscode.workspace.openTextDocument(document.uri);
				const editor = await vscode.window.showTextDocument(curDocument);
				for (const method of GENMETHODS){
					const folderPath = `${TEST_PATH}${method}`;
					const fileSig = genFileNameWithGivenSymbol(document, symbol);
					const fileName = getUniqueFileName(folderPath, `${fileSig}Test.${suffix}`);
					await generateUnitTestForAFunction(editor, symbol, fileName, method);
				}
			}
		}
	}
}

function genFileNameWithGivenSymbol(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): string {

	const fileName = document.fileName.split('/').pop()!.replace(/\.\w+$/, '');
	const funcName = document.getText(symbol.selectionRange);
	const finalName = `${fileName}_${funcName}`;
	return finalName
}

async function getAllSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
	const allSymbols: vscode.DocumentSymbol[] = [];
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
		'vscode.executeDocumentSymbolProvider',
		uri
	);

	function collectSymbols(symbols: vscode.DocumentSymbol[]) {
		for (const symbol of symbols) {
			allSymbols.push(symbol);
			if (symbol.children.length > 0) {
				collectSymbols(symbol.children);
			}
		}
	}

	if (symbols) {
		collectSymbols(symbols);
	}

	return allSymbols;
}
async function saveGeneratedCodeToFolder(code: string, fileName: string): Promise<void> {
	// Ensure the fileName contains only word characters and numbers

	const uri = vscode.Uri.file(fileName);
	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.createFile(uri, { overwrite: false });
	const folderPath = path.dirname(fileName);
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}

	await vscode.workspace.applyEdit(workspaceEdit);
	const document = await vscode.workspace.openTextDocument(uri);
	const edit = new vscode.WorkspaceEdit();
	edit.insert(uri, new vscode.Position(0, 0), code);
	await vscode.workspace.applyEdit(edit);
	await vscode.window.showTextDocument(document);
    const result = await document.save();
    console.log(`Save result: ${result}`);

    if (!result) {
        vscode.window.showErrorMessage(`Failed to save generated code to ${uri.fsPath}! `);
    } else {
        vscode.window.showInformationMessage(`Generated code saved to ${uri.fsPath}`);
    }
}

function getUniqueFileName(folderPath: string, fileName: string): string {
	let counter = 1;
	let newFileName = fileName.replace(/(\.\w+)$/, `_${counter}$1`);
	while (fs.existsSync(`${folderPath}/${newFileName}`)) {
		newFileName = fileName.replace(/(\.\w+)$/, `_${counter}$1`);
		counter++;
	}
	newFileName = newFileName.replace(/[^\w\d.]/g, '');
	return `${folderPath}/${newFileName}`;
}

// async function getSummarizedContext(editor: vscode.TextEditor, functionSymbol: vscode.Position): Promise<string> {
// 	let res = "";
// 	const importStatements = getImportStatement(editor);
// 	const allSymbols = 
// 	// Get variables, classes, ... in the context of the function
// 	// Get all import libraries
// 	// From this file, get all the used varaiables, classes, ...
// 	return res;

// }

interface ExpLogs {
	llmInfo : LLMLogs | null;
	process : string;
	time : string;
	method : string;
	fileName : string;
	function : string;
	errMsag : string;
}

interface LLMLogs {
	tokenUsage : string;
	result : string;
	prompt : string;
	model : string;
}

async function generateUnitTestForAFunction(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol, fullFileName: string, method: string): Promise<void> {
	const expData: ExpLogs[] = [];
	const overallStartTime = Date.now(); // Record the start time
	const fileNameParts = fullFileName.split('/');
	const fileName = fileNameParts[fileNameParts.length - 1].split('.')[0];
	expData.push({llmInfo: null, process: "start", time: "", method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
    // Log the start of the experiment
    
    // Start measuring execution time for the function
    console.time('Function Execution Time');

    // 获取当前使用的编程语言
    const languageId = editor.document.languageId;
    console.log('Language ID:', languageId);

    let DefUseMap: DecodedToken[] = [];
    if (!isBaseline(method)) {
        console.log('Inspecting all linked usages of inner symbols under function:', functionSymbol.name);
        const startTime = Date.now()
		DefUseMap = await extractUseDefInfo(editor, functionSymbol);
		expData.push({llmInfo: null, process: "extractUseDefInfo", time: (Date.now() - startTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
        console.log("DefUse Map length:", DefUseMap.length);
    } else {
        console.log("Baseline method");
    }

    let functionName: string | null = null;
    if (!functionSymbol || !isFunctionSymbol(functionSymbol)) {
        vscode.window.showErrorMessage('No valid function symbol found!');
    }

    functionName = functionSymbol.name;
    if (!isValidFunctionSymbol(functionSymbol)) {
        return;
    }

    // 使用 LLM 生成单元测试
    let testCode = "";
	const startTime = Date.now();

    const collectedData = await collectInfo(editor, functionSymbol, DefUseMap, languageId, fileName, method);
	expData.push({llmInfo: null, process: "collectInfo", time: (Date.now() - startTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
    const promptObj = await genPrompt(collectedData, method);
	let logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: MODEL};
    const startLLMTime = Date.now();
	testCode = await invokeLLM(method, promptObj, logObj);
    testCode = parseCode(testCode);
	expData.push({llmInfo: logObj, process: "invokeLLM", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
    console.log('Generated Final test code:', testCode);

    if (testCode) {
		const saveStartTime = Date.now();
        await saveGeneratedCodeToFolder(testCode, fullFileName);
		expData.push({llmInfo: null, process: "saveGeneratedCodeToFolder", time: (Date.now() - saveStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
		// Fixing the code
		let round = 0;
		const diagStartTime = Date.now();
		let diagnostics = await getDiagnosticsForFilePath(fullFileName);
		expData.push({llmInfo: null, process: "getDiagnosticsForFilePath", time: (Date.now() - diagStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
		while (round < MAX_ROUNDS && diagnostics.length > 0) {
			round++;
			console.log(`\n--- Round ${round} ---`);
			const testCodeFromFile = fs.readFileSync(fullFileName, 'utf8');
			testCode = testCodeFromFile;
			const diagnosticMessages = await DiagnosticsToString(vscode.Uri.file(fullFileName), diagnostics, method);
			const diagnosticPrompts = constructDiagnosticPrompt(testCode, diagnosticMessages.join('\n'), collectedData.functionSymbol.name, collectedData.mainfunctionParent, collectedData.SourceCode)
			console.log('Constructed Diagnostic Prompts:', diagnosticPrompts);
			const chatMessages: ChatMessage[] = [
				{ role: "system", content: "" },
				{ role: "user", content: diagnosticPrompts }
			];
		
			const promptObj: Prompt = { messages: chatMessages };
			let aiResponse: string;
			let fixlogObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: MODEL};
			const fixStartTime = Date.now();
			try {
				aiResponse = await invokeLLM(method, promptObj.messages, fixlogObj);
				expData.push({llmInfo: fixlogObj, process: `FixWithLLM_${round}`, time: (Date.now() - fixStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: diagnosticMessages.join('\n')});
				console.log('AI Response:', aiResponse);
			} catch (error) {
				console.error('Failed to get response from LLM:', error);
				break;
			}
	
			// Step 4: Write AI-generated code to a temporary file
			const newTestCode = parseCode(aiResponse);
			console.log('Generated Final test code:', newTestCode);
			// const tempFilePath = writeCodeToTempFile(newTestCode);
			// console.log(`AI-generated code written to temporary file: ${tempFilePath}`);
	
			// // Step 5: Read the generated code (assuming it's intended to fix the original file)
			// const generatedCode = fs.readFileSync(tempFilePath, 'utf-8');
	
			// Step 6: Update the original file with the generated code
			try {
				const saveStartTime = Date.now();
				await updateOriginalFile(fullFileName, newTestCode);
				expData.push({llmInfo: null, process: "saveGeneratedCodeToFolder", time: (Date.now() - saveStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
				console.log('Original file updated with AI-generated code.');
			} catch (error) {
				console.error('Failed to update the original file:', error);
				break;
			}
	
			// Step 7: Retrieve updated diagnostics
			const diagStartTime2 = Date.now();
			diagnostics = await getDiagnosticsForFilePath(fullFileName);
			expData.push({llmInfo: null, process: "getDiagnosticsForFilePath", time: (Date.now() - diagStartTime2).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
			console.log(`Remaining Diagnostics after Round ${round}:`, diagnostics.length);
		}
	
		if (diagnostics.length === 0) {
			console.log('All diagnostics have been resolved.');
		} else {
			console.log(`Reached the maximum of ${MAX_ROUNDS} rounds with ${diagnostics.length} diagnostics remaining.`);
		}
    }

    if (!testCode) {
        vscode.window.showErrorMessage('Failed to generate unit test!');
        return;
    }

    // Stop measuring the execution time
    console.timeEnd('Function Execution Time');
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

	console.log('Experiment data saved to experiment_data.json');

}

async function generateUnitTestForSelectedRange(editor: vscode.TextEditor): Promise<void> {

		// 获取符号信息
		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			editor.document.uri
		);

		if (!symbols) {
			vscode.window.showErrorMessage('No symbols found!');
			return;
		}

		// const allUseMap = new Map<String, Array<vscode.Location>>();
		// 获取光标位置
		const position = editor.selection.active;
		const functionSymbolWithParents = getFunctionSymbolWithItsParents(symbols, position)!;
		let targetCodeContextString = "";
		if (functionSymbolWithParents.length > 0) {
			const summarizedClass = await summarizeClass(editor.document, functionSymbolWithParents[0]);
			const parent = getSymbolDetail(editor.document, functionSymbolWithParents[0]);
			const children = functionSymbolWithParents.slice(1).map(symbol => getSymbolDetail(editor.document, symbol)).join(' ');
			targetCodeContextString = `${parent} { ${children} }`;
			console.log(targetCodeContextString);
		}
		const folderPath = `${TEST_PATH}${GENMETHODS[1]}`;
		
		const functionSymbol = getFunctionSymbol(symbols, position)!;
		
		const fileSig = genFileNameWithGivenSymbol(editor.document, functionSymbol);
		const fileName = getUniqueFileName(folderPath, `${fileSig}Test.java`);
		await generateUnitTestForAFunction(editor, functionSymbol, fileName, GENMETHODS[1]);

}



// This method is called when your extension is deactivated
export function deactivate() { }

// async function generateUnitTestForAFunction(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol, fileName: string, method: string): Promise<void> {
	
// 	// 获取当前使用的编程语言
// 	const languageId = editor.document.languageId;
// 	console.log('Language ID:', languageId);
// 	let DefUseMap: DecodedToken[] = [];
// 	if (!isBaseline(method)) {
// 		console.log('Inspecting all linked usages of inner symbols under function:', functionSymbol.name);
// 		DefUseMap = await extractUseDefInfo(editor, functionSymbol);
// 		console.log("DefUse Map length:", DefUseMap.length);
// 	} else {
// 		console.log("Baseline method");
// 	}
// 	let functionName: string | null = null; 
// 	if (!functionSymbol || !isFunctionSymbol(functionSymbol)) {
// 		vscode.window.showErrorMessage('No valid function symbol found!');
// 		// functionName = await getFunctionNameWithLSP(editor, position);
// 	}

// 	functionName = functionSymbol.name;
// 	console.log('Function Symbol:', functionSymbol);
// 	console.log('Function definition:', functionSymbol.detail);

// 	if (!isValidFunctionSymbol(functionSymbol)) {
// 		return;
// 	};

// 	// 使用 LLM 生成单元测试

// 	let testCode = "";
// 	const collectedData = await collectInfo(editor, functionSymbol, DefUseMap, languageId, fileName, method);
// 	const promptObj = await genPrompt(collectedData, method);
// 	testCode = await invokeLLM(method, promptObj);
// 	testCode = parseCode(testCode);
// 	console.log('Generated Final test code:', testCode);
// 	if (testCode) {
// 		await saveGeneratedCodeToFolder(testCode, fileName);
// 		fixDiagnostics(fileName, method, testCode, collectedData.functionSymbol.name, collectedData.mainfunctionParent, collectedData.SourceCode);
// 	}
// 	if (!testCode) {
// 		vscode.window.showErrorMessage('Failed to generate unit test!');
// 		return;
// 	}
// }
