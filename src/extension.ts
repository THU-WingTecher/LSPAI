// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { DecodedToken, extractUseDefInfo } from './token';
import { invokeLLM, genPrompt, isBaseline, collectInfo, TokenLimitExceededError } from './generate';
import { closeActiveEditor, getFunctionSymbol, isValidFunctionSymbol, isFunctionSymbol, getFunctionSymbolWithItsParents, getSymbolDetail, parseCode } from './utils';
import { getpackageStatement, summarizeClass } from './retrieve';
import { getDiagnosticsForFilePath, DiagnosticsToString } from './diagnostic';
import { saveGeneratedCodeToFolder } from './fileHandler';
import {ChatMessage, Prompt, constructDiagnosticPrompt} from "./promptBuilder";
import { error } from 'console';
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
let WORKSPACE = "/vscode-llm-ut/experiments/commons-cli/";
let SRC = `${WORKSPACE}src/main/`;
let TEST_PATH = `${WORKSPACE}results_test/`;
let EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
let MODEL = "gpt-4o-mini" // gpt-4o-mini"; // llama3-70b
let GENMETHODS = [MODEL, `naive_${MODEL}`];
// let GENMETHODS = [MODEL];
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
		vscode.window.showInformationMessage('JavaExperiment!');
		const language = "java";
		WORKSPACE = "/vscode-llm-ut/experiments/commons-cli/";
		SRC = `${WORKSPACE}src/main/`;
		TEST_PATH = `${WORKSPACE}results_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}/`;
		EXP_LOG_FOLDER = `${TEST_PATH}logs/`;
		experiment(language)
		vscode.window.showInformationMessage('Experiment Ended!');
		
	});
	context.subscriptions.push(disposable_exp);

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

		const testCode = await generateUnitTestForSelectedRange(editor.document, editor.selection.active);

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
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function filterSymbolLessThanLine(symbols: vscode.DocumentSymbol[], line: number): vscode.DocumentSymbol[] {
	return symbols.filter(symbol => symbol.range.end.line-symbol.range.start.line < line);
}
export async function genUnitTestForFiles(Files: string[], language: string) : Promise<boolean[]> {
	const generatedResults = [];
	const suffix = getLanguageSuffix(language); 
	for (const filePath of Files) {
		for (let i = 0; i < Files.length; i++) {
			const filePath = Files[i];
			console.log(`#### Processing file ${i + 1} of ${Files.length}: ${filePath}`);
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
			console.log(`document.uri == ${document.uri}`);
			const symbols = await getAllSymbols(document.uri);
			console.log(`Found ${symbols.length} symbols in the document.`);
			const filteredSymbols = filterSymbolLessThanLine(symbols, 4);
			for (const symbol of filteredSymbols) {
				if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
					if (language === 'java' && !isPublic(symbol, document)) {
						continue;
					}
					const curDocument = await vscode.workspace.openTextDocument(document.uri);
					for (const method of GENMETHODS){
						const folderPath = `${TEST_PATH}${method}`;
						const fileSig = genFileNameWithGivenSymbol(document, symbol, language);
						const fileName = getUniqueFileName(folderPath, `${fileSig}Test.${suffix}`);
						generatedResults.push(await generateUnitTestForAFunction(curDocument, symbol, fileName, method));
					}
					await closeActiveEditor(curDocument);
					}
				}
			}
	}
	return generatedResults;
}

async function parallelGenUnitTestForFiles(Files: string[], language: string) {
    const generatedResults: any[] = []; // To store generated results
    const suffix = getLanguageSuffix(language); // Get suffix based on language

    // Process each file in parallel
    const tasks = Files.map(async (filePath, index) => {
        console.log(`#### Processing file ${index + 1} of ${Files.length}: ${filePath}`);
        
        // Sleep asynchronously
        await sleep(1000); // Sleep for 1 second
        
        // Open the document asynchronously
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        console.log(`document.uri == ${document.uri}`);
        
        // Get symbols in parallel
        const symbols = await getAllSymbols(document.uri);
        console.log(`Found ${symbols.length} symbols in the document.`);
        
        // Parallelize symbol processing
        const symbolTasks = symbols.map(async (symbol) => {
            if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
                if (language === 'java' && !isPublic(symbol, document)) {
                    return; // Skip if not public
                }

                // Open the document again for the editor
                const curDocument = await vscode.workspace.openTextDocument(document.uri);
                // Process methods in parallel
                const methodTasks = GENMETHODS.map(async (method) => {
                    const folderPath = `${TEST_PATH}${method}`;
                    const fileSig = genFileNameWithGivenSymbol(document, symbol, language);
                    const fileName = getUniqueFileName(folderPath, `${fileSig}Test.${suffix}`);
                    
                    // Generate unit tests and store the result
                    const result = await generateUnitTestForAFunction(curDocument, symbol, fileName, method);
                    generatedResults.push(result);
                });

                // Wait for all method processing tasks to complete
                await Promise.all(methodTasks);

                // Close the editor after all tasks are done
                await closeActiveEditor(curDocument);
            }
        });

        // Wait for all symbol processing tasks to complete
        await Promise.all(symbolTasks);
    });

    // Wait for all file processing tasks to complete
    await Promise.all(tasks);

    // Return the generated results after all tasks are completed
    return generatedResults;
}

export async function experiment(language: string) : Promise<boolean[]> {
	logCurrentSettings()
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
	const num_parallel = 10;
	const batchSize = Math.ceil(Files.length / num_parallel);
	const generatedResults = [];

	for (let i = 0; i < num_parallel; i++) {
		const batch = Files.slice(i * batchSize, (i + 1) * batchSize);
		const results = await parallelGenUnitTestForFiles(batch, language);
		generatedResults.push(...results);
	}
	console.log('#### Experiment completed!');
	logCurrentSettings()
	return generatedResults;
}

function logCurrentSettings() {
	console.log(`Testing the folder of ${SRC}`);
	console.log(`saving the result to ${TEST_PATH}`);
	console.log(`Model: ${MODEL}`);
	console.log(`Methods: ${GENMETHODS}`);
	console.log(`Max Rounds: ${MAX_ROUNDS}`);
	console.log(`Experiment Log Folder: ${EXP_LOG_FOLDER}`);
}
function genFileNameWithGivenSymbol(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, language: string): string {
	const fileName = document.fileName.split('/').pop()!.replace(/\.\w+$/, '');
	const funcName = document.getText(symbol.selectionRange);
	const finalName = `${fileName}_${funcName}`;
	if (language === 'java') {
		const packageStatements = getpackageStatement(document)
		const packageStatement = packageStatements ? packageStatements[0] : '';
		const packageFolder = packageStatement.replace(";","").split(' ')[1].replace(/\./g, '/');
		return `${packageFolder}/${finalName}`;
	} else {
		return finalName;
	}
}

async function getAllSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
	const allSymbols: vscode.DocumentSymbol[] = [];
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
		'vscode.executeDocumentSymbolProvider',
		uri
	);
	console.log(`uri = ${uri}, symbols = ${symbols}`);
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

function getUniqueFileName(folderPath: string, fileName: string): string {
    let counter = 1;
    
    // Find the part before 'Test.' and the 'Test.${suffix}' part
    const baseName = fileName.replace(/(Test\.\w+)$/, '');  // This removes 'Test.${suffix}'
    const suffix = fileName.replace(/^.*(Test\.\w+)$/, '$1');  // This isolates 'Test.${suffix}'

    // Initial new file name with counter right before Test.${suffix}
    let newFileName = `${baseName}${counter}${suffix}`;
    
    // Check if the file exists, and increment the counter if it does
    while (fs.existsSync(`${folderPath}/${newFileName}`)) {
        counter++;
        newFileName = `${baseName}${counter}${suffix}`;
    }

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

function isPublic(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): boolean {
	const funcDefinition = document.lineAt(symbol.selectionRange.start.line).text;
	return funcDefinition.includes('public') || false;
}

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

    let DefUseMap: DecodedToken[] = [];
    if (!isBaseline(method)) {
        console.log('Inspecting all linked usages of inner symbols under function:', functionSymbol.name);
        const startTime = Date.now()
		DefUseMap = await extractUseDefInfo(document, functionSymbol);
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
        return genResult;
    }

    // 使用 LLM 生成单元测试
    let testCode = "";
	const startTime = Date.now();

    const collectedData = await collectInfo(document, functionSymbol, DefUseMap, languageId, fileName, method);
	expData.push({llmInfo: null, process: "collectInfo", time: (Date.now() - startTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
    const promptObj = await genPrompt(collectedData, method);
	let logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: MODEL};
    const startLLMTime = Date.now();
	try {
		testCode = await invokeLLM(method, promptObj, logObj);
		testCode = parseCode(testCode);
		expData.push({llmInfo: logObj, process: "invokeLLM", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
		console.log('Generated Final test code:', testCode);
	} catch (error) {
		if (error instanceof TokenLimitExceededError) {
			console.warn('Token limit exceeded, continuing...');
			expData.push({llmInfo: logObj, process: "TokenLimitation", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
		} else {
			throw error;
		}
	}

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
			if (!diagnosticMessages.length) {
				error('No diagnostic messages found!');
			}

			try {
				aiResponse = await invokeLLM(method, promptObj.messages, fixlogObj);
				expData.push({llmInfo: fixlogObj, process: `FixWithLLM_${round}`, time: (Date.now() - fixStartTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: diagnosticMessages.join('\n')});
				console.log('AI Response:', aiResponse);
			} catch (error) {
				if (error instanceof TokenLimitExceededError) {
					console.warn('Token limit exceeded, continuing...');
					expData.push({llmInfo: logObj, process: "TokenLimitation", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
				} else {
					expData.push({llmInfo: logObj, process: "UnknownError", time: (Date.now() - startLLMTime).toString(), method: method, fileName: fullFileName, function: functionSymbol.name, errMsag: ""});
				}
				continue;
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
				await saveGeneratedCodeToFolder(newTestCode, fullFileName);
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
			genResult = true;
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

	console.log('Experiment data saved to experiment_data.json');

	return genResult;
}

async function generateUnitTestForSelectedRange(document: vscode.TextDocument, position: vscode.Position): Promise<void> {

		// 获取符号信息
		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			document.uri
		);

		if (!symbols) {
			vscode.window.showErrorMessage('No symbols found!');
			return;
		}

		// const allUseMap = new Map<String, Array<vscode.Location>>();
		// 获取光标位置
		const functionSymbolWithParents = getFunctionSymbolWithItsParents(symbols, position)!;
		let targetCodeContextString = "";
		if (functionSymbolWithParents.length > 0) {
			const summarizedClass = await summarizeClass(document, functionSymbolWithParents[0]);
			const parent = getSymbolDetail(document, functionSymbolWithParents[0]);
			const children = functionSymbolWithParents.slice(1).map(symbol => getSymbolDetail(document, symbol)).join(' ');
			targetCodeContextString = `${parent} { ${children} }`;
			console.log(targetCodeContextString);
		}
		const folderPath = `${TEST_PATH}${GENMETHODS[1]}`;
		
		const functionSymbol = getFunctionSymbol(symbols, position)!;
		
		const fileSig = genFileNameWithGivenSymbol(document, functionSymbol, document.languageId);
		const fileName = getUniqueFileName(folderPath, `${fileSig}Test.java`);
		await generateUnitTestForAFunction(document, functionSymbol, fileName, GENMETHODS[1]);

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
