import * as vscode from 'vscode';
import { DecodedToken, createSystemPromptWithDefUseMap, extractUseDefInfo } from "./token";
import {getPackageStatement, getDependentContext, DpendenceAnalysisResult, getImportStatement, summarizeClass} from "./retrieve";
import {getReferenceInfo} from "./reference";
import { TokenLimitExceededError } from "./invokeLLM";
import { currentGenMethods, currentTestPath, isBaseline, currentHistoryPath, currentExpLogPath, currentModel } from "./experiment";

import * as fs from 'fs';
import * as path from 'path';
import { LLMLogs, ExpLogs } from './log';
import { invokeLLM } from "./invokeLLM";
import { genPrompt, ChatMessage, Prompt, constructDiagnosticPrompt, FixSystemPrompt } from "./promptBuilder";
import { getAllSymbols, isFunctionSymbol, isValidFunctionSymbol, getFunctionSymbol, getFunctionSymbolWithItsParents, getSymbolDetail, parseCode } from './utils';
import { getDiagnosticsForFilePath, DiagnosticsToString } from './diagnostic';
import { saveGeneratedCodeToFolder, saveGeneratedCodeToIntermediateLocation, findFiles, generateFileNameForDiffLanguage, saveToIntermediate } from './fileHandler';
import { error } from 'console';
import * as os from 'os';

export interface ContextInfo {
	dependentContext: string;
	mainFunctionDependencies: string;
	mainfunctionParent: string;
	referenceCodes: string;
	SourceCode: string;
	languageId: string;
	functionSymbol: vscode.DocumentSymbol;
	fileName: string;
	packageString: string;
	importString: string;
}

export async function collectInfo(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol, languageId: string, fileName: string, method: string): Promise<ContextInfo> {
	let mainFunctionDependencies = "";
	let dependentContext = "";
	let mainfunctionParent = "";
	let referenceCodes = "";
	let DefUseMap: DecodedToken[] = [];
	const textCode = document.getText(functionSymbol.range);
	const packageStatement = getPackageStatement(document, document.languageId);
	const importStatement = getImportStatement(document, document.languageId, functionSymbol);

	if (!isBaseline(method)) {

		console.log('Inspecting all linked usages of inner symbols under function:', functionSymbol.name);
		DefUseMap = await extractUseDefInfo(document, functionSymbol);
		const DependenciesInformation: DpendenceAnalysisResult = await getDependentContext(document, DefUseMap, functionSymbol);
		dependentContext = DependenciesInformation.dependencies;
		mainFunctionDependencies = DependenciesInformation.mainFunctionDependencies;
		mainfunctionParent = DependenciesInformation.mainfunctionParent;
		referenceCodes = await getReferenceInfo(document, functionSymbol.selectionRange);

	}
	return {
		dependentContext: dependentContext,
		mainFunctionDependencies: mainFunctionDependencies,
		mainfunctionParent: mainfunctionParent,
		SourceCode: textCode,
		languageId: languageId,
		functionSymbol: functionSymbol,
		fileName: fileName,
		referenceCodes: referenceCodes,
		packageString: packageStatement ? packageStatement[0] : '',
		importString: importStatement ? importStatement : ''
	}
}

function getCurrentModel(): string {
	const config = vscode.workspace.getConfiguration('lspAi');
    return config.get<string>('model') ?? currentModel; // Fallback to currentModel if not set in settings
}

function getMaxRound(): number {
	const config = vscode.workspace.getConfiguration('lspAi');
    return config.get<number>('maxRound') ?? 5; // Fallback to 5 rounds if not set in settings
}

export async function generateUnitTestForSelectedRange(document: vscode.TextDocument, position: vscode.Position): Promise<void> {

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
		// const summarizedClass = await summarizeClass(document, functionSymbolWithParents[0], languageId);
		const parent = getSymbolDetail(document, functionSymbolWithParents[0]);
		const children = functionSymbolWithParents.slice(1).map(symbol => getSymbolDetail(document, symbol)).join(' ');
		targetCodeContextString = `${parent} { ${children} }`;
		console.log(`targetCodeContext, : ${targetCodeContextString}`);
	}

	const pathParts = vscode.workspace.workspaceFolders![0].uri.fsPath.split("/");
	const projectName = pathParts[pathParts.length - 1];
	const model = getCurrentModel();
	const folderPath = path.join(os.tmpdir(), projectName, model);
	const historyPath = path.join(folderPath, "history");
	const expLogPath = path.join(folderPath, "logs");
	const functionSymbol = getFunctionSymbol(symbols, position)!;
	
	// Generate the file paths
	const { fileName } = generateFileNameForDiffLanguage(document, functionSymbol, folderPath, document.languageId, []);
	
	// Call generateUnitTestForAFunction with all required parameters
	const finalCode = await generateUnitTestForAFunction(
		document, 
		functionSymbol, 
		model,
		getMaxRound(), // MAX_ROUNDS
		fileName, // fullFileName
		"", // method
		historyPath,
		expLogPath
	);
	// Create a new untitled document with the generated code
	const newDocument = await vscode.workspace.openTextDocument({
		language: languageId,
		content: finalCode
	});

	await vscode.window.showTextDocument(newDocument, { preview: true });

}

// Helper functions for the main generator
async function initializeTestGeneration(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol, method: string, fullFileName: string): Promise<{ 
	languageId: string, 
	fileName: string, 
	expData: ExpLogs[] 
}> {
	const expData: ExpLogs[] = [];
	const fileNameParts = fullFileName.split('/');
	const fileName = fileNameParts[fileNameParts.length - 1].split('.')[0];
	
	expData.push({
		llmInfo: null, 
		process: "start", 
		time: "", 
		method, 
		fileName: fullFileName, 
		function: functionSymbol.name, 
		errMsag: ""
	});

	const languageId = document.languageId;
	console.log('Language ID:', languageId);

	if (!functionSymbol || !isFunctionSymbol(functionSymbol) || !isValidFunctionSymbol(functionSymbol)) {
		vscode.window.showErrorMessage('No valid function symbol found!');
		throw new Error('Invalid function symbol');
	}

	return { languageId, fileName, expData };
}

async function generateInitialTestCode(
	document: vscode.TextDocument,
	functionSymbol: vscode.DocumentSymbol,
	collectedData: any,
	languageId: string,
	fileName: string,
	method: string,
	model: string,
	expData: ExpLogs[]
): Promise<string> {
	const startTime = Date.now();
	expData.push({
		llmInfo: null,
		process: "collectInfo",
		time: (Date.now() - startTime).toString(),
		method,
		fileName,
		function: functionSymbol.name,
		errMsag: ""
	});

	const promptObj = await genPrompt(collectedData, method, languageId);
	const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
	const startLLMTime = Date.now();

	try {
		const testCode = await invokeLLM(method, promptObj, logObj);
		const parsedCode = parseCode(testCode);
		expData.push({
			llmInfo: logObj,
			process: "invokeLLM",
			time: (Date.now() - startLLMTime).toString(),
			method,
			fileName,
			function: functionSymbol.name,
			errMsag: ""
		});
		return parsedCode;
	} catch (error) {
		if (error instanceof TokenLimitExceededError) {
			console.warn('Token limit exceeded, continuing...');
			expData.push({
				llmInfo: logObj,
				process: "TokenLimitation",
				time: (Date.now() - startLLMTime).toString(),
				method,
				fileName,
				function: functionSymbol.name,
				errMsag: ""
			});
		}
		throw error;
	}
}

async function performFixingRound(
	round: number,
	curSavePoint: string,
	currentCode: string,
	diagnostics: vscode.Diagnostic[],
	collectedData: any,
	method: string,
	languageId: string,
	model: string,
	historyPath: string,
	fullFileName: string,
	expData: ExpLogs[]
): Promise<{ code: string, savePoint: string, diagnostics: vscode.Diagnostic[] } | null> {
	console.log(`\n--- Round ${round} ---`);
	
	// Get diagnostic messages
	const diagnosticMessages = await DiagnosticsToString(vscode.Uri.file(curSavePoint), diagnostics, method);
	if (!diagnosticMessages.length) {
		console.error('No diagnostic messages found!');
		return null;
	}

	// Construct prompt for fixing
	const diagnosticPrompts = constructDiagnosticPrompt(
		currentCode,
		diagnosticMessages.join('\n'),
		collectedData.functionSymbol.name,
		collectedData.mainfunctionParent,
		collectedData.SourceCode
	);
	console.log('Constructed Diagnostic Messages:', diagnosticMessages);

	// Prepare chat messages
	const chatMessages: ChatMessage[] = [
		{ role: "system", content: FixSystemPrompt(languageId) },
		{ role: "user", content: diagnosticPrompts }
	];

	// Get AI response
	const fixlogObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: model};
	const fixStartTime = Date.now();
	let aiResponse: string;

	try {
		aiResponse = await invokeLLM(method, chatMessages, fixlogObj);
		expData.push({
			llmInfo: fixlogObj,
			process: `FixWithLLM_${round}`,
			time: (Date.now() - fixStartTime).toString(),
			method,
			fileName: fullFileName,
			function: collectedData.functionSymbol.name,
			errMsag: diagnosticMessages.join('\n')
		});
	} catch (error) {
		if (error instanceof TokenLimitExceededError) {
			console.warn('Token limit exceeded, continuing...');
		}
		expData.push({
			llmInfo: fixlogObj,
			process: error instanceof TokenLimitExceededError ? "TokenLimitation" : "UnknownError",
			time: (Date.now() - fixStartTime).toString(),
			method,
			fileName: fullFileName,
			function: collectedData.functionSymbol.name,
			errMsag: ""
		});
		return null;
	}

	// Parse and save the fixed code
	const fixedCode = parseCode(aiResponse);
	const saveStartTime = Date.now();
	
	try {
		const newSavePoint = await saveToIntermediate(
			fixedCode,
			fullFileName.split(method)[1],
			path.join(historyPath, method, round.toString()),
			languageId
		);
		
		expData.push({
			llmInfo: null,
			process: "saveGeneratedCodeToFolder",
			time: (Date.now() - saveStartTime).toString(),
			method,
			fileName: fullFileName,
			function: collectedData.functionSymbol.name,
			errMsag: ""
		});

		// Get updated diagnostics
		const diagStartTime = Date.now();
		const newDiagnostics = await getDiagnosticsForFilePath(newSavePoint);
		expData.push({
			llmInfo: null,
			process: "getDiagnosticsForFilePath",
			time: (Date.now() - diagStartTime).toString(),
			method,
			fileName: fullFileName,
			function: collectedData.functionSymbol.name,
			errMsag: ""
		});

		console.log(`Remaining Diagnostics after Round ${round}:`, newDiagnostics.length);
		
		return {
			code: fixedCode,
			savePoint: newSavePoint,
			diagnostics: newDiagnostics
		};
	} catch (error) {
		console.error('Failed to save or validate fixed code:', error);
		return null;
	}
}

async function fixDiagnostics(
	testCode: string,
	collectedData: any,
	method: string,
	languageId: string,
	model: string,
	historyPath: string,
	fullFileName: string,
	expData: ExpLogs[],
	MAX_ROUNDS: number
): Promise<{ finalCode: string, success: boolean }> {
	let round = 0;
	let finalCode = testCode;
	let curSavePoint = await saveToIntermediate(
		finalCode,
		fullFileName.split(method)[1],
		path.join(historyPath, method, round.toString()),
		languageId
	);

	let diagnostics = await getDiagnosticsForFilePath(curSavePoint);

	while (round < MAX_ROUNDS && diagnostics.length > 0) {
		round++;
		const result = await performFixingRound(
			round,
			curSavePoint,
			finalCode,
			diagnostics,
			collectedData,
			method,
			languageId,
			model,
			historyPath,
			fullFileName,
			expData
		);
		
		if (!result) break;
		
		finalCode = result.code;
		curSavePoint = result.savePoint;
		diagnostics = result.diagnostics;
	}

	return {
		finalCode,
		success: diagnostics.length === 0
	};
}

function getDefaultValue(): any {
	return {
		"method": "",
		"model": "",
		"MAX_ROUNDS": 5,
		"fullFileName": "",
		"historyPath": "",
		"expLogPath": ""
	}
}
// Main function
export async function generateUnitTestForAFunction(
	document: vscode.TextDocument,
	functionSymbol: vscode.DocumentSymbol,
	model: string,
	MAX_ROUNDS: number,
	fullFileName: string,
	method: string,
	historyPath: string,
	expLogPath: string,
): Promise<string> {

	if (method === "") {
		method = model;
	}
	console.log(`Generating unit test for ${method} in ${fullFileName}`);
	console.log(`MAX_ROUNDS: ${MAX_ROUNDS}`);
	console.log(`historyPath: ${historyPath}`);
	console.log(`expLogPath: ${expLogPath}`);
	// need give default value if thoes values are empty
	try {
		const { languageId, fileName, expData } = await initializeTestGeneration(
			document,
			functionSymbol,
			method,
			fullFileName
		);

		const collectedData = await collectInfo(document, functionSymbol, languageId, fileName, method);

		const testCode = await generateInitialTestCode(
			document,
			functionSymbol,
			collectedData,
			languageId,
			fileName,
			method,
			model,
			expData
		);

		if (isBaseline(method)) {
			await saveGeneratedCodeToFolder(testCode, fullFileName);
			return '';
		}

		const { finalCode, success } = await fixDiagnostics(
			testCode,
			collectedData,
			method,
			languageId,
			model,
			historyPath,
			fullFileName,
			expData,
			MAX_ROUNDS
		);

		await saveGeneratedCodeToFolder(finalCode, fullFileName);
		await saveExperimentData(expData, fileName, method);

		return finalCode;
	} catch (error) {
		console.error('Failed to generate unit test:', error);
		vscode.window.showErrorMessage('Failed to generate unit test!');
		return '';
	}
}

async function saveExperimentData(expData: ExpLogs[], fileName: string, method: string) {
	const jsonFilePath = path.join(currentExpLogPath, method, `${fileName}_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}.json`);

	// Prepare the data to be saved
    const formattedData = expData.map(log => ({
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
    }));

	const dir = path.dirname(jsonFilePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

    // Check if file exists and initialize empty array if not
	let jsonContent = [];
	if (fs.existsSync(jsonFilePath)) {
		jsonContent = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
	}
	
	// Append the current experiment's data
	jsonContent.push(...formattedData);
	
    // Write the updated data
	fs.writeFileSync(jsonFilePath, JSON.stringify(jsonContent, null, 2), 'utf8');
	console.log(`Experiment data saved to ${jsonFilePath}`);
}