import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DecodedToken, createSystemPromptWithDefUseMap, extractUseDefInfo } from "./token";
import {getPackageStatement, getDependentContext, DpendenceAnalysisResult, getImportStatement, summarizeClass} from "./retrieve";
import {getReferenceInfo} from "./reference";
import { TokenLimitExceededError } from "./invokeLLM";
import { LLMLogs, ExpLogs } from './log';
import { invokeLLM } from "./invokeLLM";
import { genPrompt, generateTestWithContext, inspectTest } from "./prompts/promptBuilder";
import { isFunctionSymbol, isValidFunctionSymbol, getFunctionSymbol, getFunctionSymbolWithItsParents, getSymbolDetail, parseCode } from './utils';
import { saveGeneratedCodeToFolder, saveGeneratedCodeToIntermediateLocation, findFiles, generateFileNameForDiffLanguage, saveToIntermediate, saveExperimentData } from './fileHandler';
import { getConfigInstance, GenerationType, PromptType, Provider, loadPrivateConfig } from './config';
import { getTempDirAtCurWorkspace } from './fileHandler';
import { getContextSelectorInstance } from './agents/contextSelector';
import { DiagnosticReport, fixDiagnostics } from './fix';

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

export async function collectInfo(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol, languageId: string, fileName: string): Promise<ContextInfo> {
	let mainFunctionDependencies = "";
	let dependentContext = "";
	let mainfunctionParent = "";
	let referenceCodes = "";
	let DefUseMap: DecodedToken[] = [];
	const textCode = document.getText(functionSymbol.range);
	const packageStatement = getPackageStatement(document, document.languageId);
	const importStatement = getImportStatement(document, document.languageId, functionSymbol);

	if (getConfigInstance().generationType !== GenerationType.NAIVE) {

		console.log('Inspecting all linked usages of inner symbols under function:', functionSymbol.name);
		DefUseMap = await extractUseDefInfo(document, functionSymbol);
		// console.log('collectinfo::DefUseMap', DefUseMap);
		const DependenciesInformation: DpendenceAnalysisResult = await getDependentContext(document, DefUseMap, functionSymbol);
		dependentContext = DependenciesInformation.dependencies.join('\n');
		mainFunctionDependencies = DependenciesInformation.mainFunctionDependencies.join('\n');
		mainfunctionParent = DependenciesInformation.mainfunctionParent.join('\n');
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
	};
}

export async function generateUnitTestForSelectedRange(document: vscode.TextDocument, position: vscode.Position): Promise<string> {
	// 获取符号信息
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
		'vscode.executeDocumentSymbolProvider',
		document.uri
	);

	if (!symbols) {
		vscode.window.showErrorMessage('No symbols found! - It seems language server is not running.');
		return "";
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

	const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
	const pathParts = workspace.split("/");
	const projectName = pathParts[pathParts.length - 1];
	const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));

	const model = 'gpt-4o-mini';
	const currentConfig = {
		model: model,
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.AGENT,
        promptType: PromptType.DETAILED,
        workspace: workspace,
        parallelCount: 1,
        maxRound: 5,
        ...privateConfig
    }
	const folderPath = path.join(getTempDirAtCurWorkspace(), projectName, model);
	getConfigInstance().updateConfig(currentConfig);

	const functionSymbol = getFunctionSymbol(symbols, position)!;
	
	// Generate the file paths
	const { fileName } = generateFileNameForDiffLanguage(document, functionSymbol, folderPath, document.languageId, [], 0);
	

	// Call generateUnitTestForAFunction with all required parameters
	// set the logs to specific folder, not the default one 
	const showGeneratedCode = true;

	const finalCode = await generateUnitTestForAFunction(
		workspace,
		document, 
		functionSymbol, 
		fileName, // fullFileName
		showGeneratedCode
	);

	return finalCode;

}

// Helper functions for the main generator
async function initializeTestGeneration(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol, fullFileName: string): Promise<{ 
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
		method: getConfigInstance().model, 
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
	expData: ExpLogs[]
): Promise<string> {

	const promptObj = await genPrompt(collectedData, getConfigInstance().model, languageId);
	const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model};
	const startLLMTime = Date.now();
	try {
		const testCode = await invokeLLM(promptObj, logObj);
		const parsedCode = parseCode(testCode);
		expData.push({
			llmInfo: logObj,
			process: "invokeLLM",
			time: (Date.now() - startLLMTime).toString(),
			method: getConfigInstance().model,
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
				method: getConfigInstance().model,
				fileName,
				function: functionSymbol.name,
				errMsag: ""
			});
		}
		throw error;
	}
}
  
export async function generateUnitTestForAFunction(
	srcPath: string,
	document: vscode.TextDocument,
	functionSymbol: vscode.DocumentSymbol,
	fullFileName: string,
	showGeneratedCode: boolean = true,
): Promise<string> {
// Merge provided config with defaults
const model = getConfigInstance().model;
console.log(`Generating unit test for ${model} in ${fullFileName}`);

try {
	const { languageId, fileName, expData } = await initializeTestGeneration(
			document,
			functionSymbol,
			fullFileName
			);
	let testCode = "";
	let collectedData = {};
	// Step 1: Collect Info
	const startTime = Date.now();
	collectedData = await collectInfo(
						document,
						functionSymbol,
						languageId,
						fileName,
						);
	expData.push({
	llmInfo: null,
	process: "collectInfo",
	time: (Date.now() - startTime).toString(),
	method: model,
	fileName: fullFileName,
	function: functionSymbol.name,
	errMsag: ""
	});
	switch (getConfigInstance().generationType) {
		case GenerationType.ORIGINAL:
		// Step 2: Initial Test Generation
			testCode = await generateInitialTestCode(
			document,
			functionSymbol,
			collectedData,
			languageId,
			fullFileName,
			expData
			);
			testCode = parseCode(testCode);
			await saveToIntermediate(
				testCode,
				srcPath,
				fullFileName.split(getConfigInstance().model)[1],
				path.join(getConfigInstance().historyPath, getConfigInstance().model, "initial"),
				languageId
			);
			break;
		case GenerationType.AGENT:
			const contextSelector = await getContextSelectorInstance(
				document, 
				functionSymbol);
			const ContextStartTime = Date.now();
			const logObjForIdentifyTerms: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
			const identifiedTerms = await contextSelector.identifyContextTerms(document.getText(functionSymbol.range), logObjForIdentifyTerms);
			expData.push({
				llmInfo: logObjForIdentifyTerms,
				process: "identifyContextTerms",
				time: (Date.now() - ContextStartTime).toString(),
				method: model,
				fileName: fullFileName,
				function: functionSymbol.name,
				errMsag: ""
				});
			const gatherContextStartTime = Date.now();
			const enrichedTerms = await contextSelector.gatherContext(identifiedTerms);
			expData.push({
				llmInfo: null,
				process: "gatherContext",
				time: (Date.now() - gatherContextStartTime).toString(),
				method: model,
				fileName: fullFileName,
				function: functionSymbol.name,
				errMsag: ""
			});
			console.log("enrichedTerms", enrichedTerms);
			const generateTestWithContextStartTime = Date.now();
			const promptObj = generateTestWithContext(document, document.getText(functionSymbol.range), enrichedTerms, fileName);
			const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
			testCode = await invokeLLM(promptObj, logObj);
			testCode = parseCode(testCode);
			await saveToIntermediate(
				testCode,
				srcPath,
				fullFileName.split(model)[1],
				path.join(getConfigInstance().historyPath, model, "initial"),
				languageId
			);
			expData.push({	
				llmInfo: logObj,
				process: "generateTestWithContext",
				time: (Date.now() - generateTestWithContextStartTime).toString(),
				method: model,
				fileName: fullFileName,
				function: functionSymbol.name,
				errMsag: ""
			});
			break;
		case GenerationType.EXPERIMENTAL:
			const contextSelector_experimental = await getContextSelectorInstance(
				document, 
				functionSymbol);
			const ContextStartTime_experimental = Date.now();
			const logObjForIdentifyTerms_experimental: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
			const identifiedTerms_experimental = await contextSelector_experimental.identifyContextTerms(document.getText(functionSymbol.range), logObjForIdentifyTerms_experimental);
			expData.push({
				llmInfo: logObjForIdentifyTerms_experimental,
				process: "identifyContextTerms",
				time: (Date.now() - ContextStartTime_experimental).toString(),
				method: model,
				fileName: fullFileName,
				function: functionSymbol.name,
				errMsag: ""
				});
			const gatherContextStartTime_experimental = Date.now();
			const enrichedTerms_experimental = await contextSelector_experimental.gatherContext(identifiedTerms_experimental);
			expData.push({
				llmInfo: null,
				process: "gatherContext",
				time: (Date.now() - gatherContextStartTime_experimental).toString(),
				method: model,
				fileName: fullFileName,
				function: functionSymbol.name,
				errMsag: ""
			});
			console.log("enrichedTerms_experimental", enrichedTerms_experimental);
			const generateTestWithContextStartTime_experimental = Date.now();
			const promptObj_experimental = generateTestWithContext(document, document.getText(functionSymbol.range), enrichedTerms_experimental, fileName);
			const logObj_experimental: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
			testCode = await invokeLLM(promptObj_experimental, logObj_experimental);
			testCode = parseCode(testCode);
			await saveToIntermediate(
				testCode,
				srcPath,
				fullFileName.split(model)[1],
				path.join(getConfigInstance().historyPath, model, "initial"),
				languageId
			);
			expData.push({	
				llmInfo: logObj_experimental,
				process: "generateTestWithContext",
				time: (Date.now() - generateTestWithContextStartTime_experimental).toString(),
				method: model,
				fileName: fullFileName,
				function: functionSymbol.name,
				errMsag: ""
			});

			const inspectTestStartTime = Date.now();
			const promptObj_inspectTest = inspectTest(document.getText(functionSymbol.range), testCode);
			const logObj_inspectTest: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
			testCode = await invokeLLM(promptObj_inspectTest, logObj_inspectTest);
			testCode = parseCode(testCode);
			await saveToIntermediate(
				testCode,
				srcPath,
				fullFileName.split(model)[1],
				path.join(getConfigInstance().historyPath, model, "after_inspect"),
				languageId
			);
			expData.push({	
				llmInfo: logObj_inspectTest,
				process: "inspectTest",
				time: (Date.now() - inspectTestStartTime).toString(),
				method: model,
				fileName: fullFileName,
				function: functionSymbol.name,
				errMsag: ""
			});
			
			break;
	}

	
	// Step 3: Diagnostic Fix
	let diagnosticReport: DiagnosticReport | null = null;
	let finalCode: string = testCode;
	
	const fixstartTime = Date.now();
	const report = await fixDiagnostics(
		srcPath,
		testCode,
		collectedData,
		model,
		languageId,
		model,
		getConfigInstance().historyPath,
		fullFileName,
		expData,
		getConfigInstance().maxRound,
		showGeneratedCode
	);
	diagnosticReport = report.diagnosticReport;
	finalCode = report.finalCode;
	expData.push({
		llmInfo: null,
		process: "fixDiagnostics",
		time: (Date.now() - fixstartTime).toString(),
		method: model,
		fileName: fullFileName,
		function: functionSymbol.name,
		errMsag: ""
	});
	
	// Step 4: Save Results
	
	// Save diagnostic report
	const reportPath = path.join(getConfigInstance().logSavePath, model, `${fileName}_diagnostic_report.json`);
	fs.mkdirSync(path.dirname(reportPath), { recursive: true });
	console.log('generate::diagnosticReport', JSON.stringify(diagnosticReport, null, 2));
	fs.writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));

	await saveGeneratedCodeToFolder(finalCode, fullFileName);
	await saveExperimentData(expData, getConfigInstance().logSavePath, fileName, model);

	if (report.success) {
		return finalCode;
	} else {
		return '';
	}
} catch (error) {
	console.error('Failed to generate unit test:', error);
	vscode.window.showErrorMessage('Failed to generate unit test!');
	return '';
}
}

