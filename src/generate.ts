import * as vscode from 'vscode';
import * as path from 'path';
import { DecodedToken, extractUseDefInfo } from "./token";
import {getPackageStatement, getDependentContext, DpendenceAnalysisResult, getImportStatement} from "./retrieve";
import {getReferenceInfo} from "./reference";
import { TokenLimitExceededError } from "./invokeLLM";
import { ExpLogger, LLMLogs } from './log';
import { invokeLLM } from "./invokeLLM";
import { genPrompt, generateTestWithContext, generateTestWithContextWithCFG } from "./prompts/promptBuilder";
import { isFunctionSymbol, isValidFunctionSymbol, getFunctionSymbol, parseCode } from './utils';
import { generateFileNameForDiffLanguage, saveToIntermediate, saveCode, getFileName } from './fileHandler';
import { getConfigInstance, GenerationType, PromptType, FixType } from './config';
import { ContextTerm, getContextSelectorInstance } from './agents/contextSelector';
import { DiagnosticReport, fixDiagnostics } from './fix';
import { SupportedLanguage } from './ast';
import { PathCollector } from './cfg/path';
import { getContextTermsFromTokens } from './algorithm';
import { reportProgressWithCancellation, showDiffAndAllowSelection } from './userInteraction';
import { createCFGBuilder } from './cfg/builderFactory';
import { ChatMessage } from './prompts/ChatMessage';

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
	const lastFileName = fileName.split("/").pop()!;
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
		fileName: lastFileName,
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
	// const functionSymbolWithParents = getFunctionSymbolWithItsParents(symbols, position)!;
	// let targetCodeContextString = "";

	// if (functionSymbolWithParents.length > 0) {
	// 	// const summarizedClass = await summarizeClass(document, functionSymbolWithParents[0], languageId);
	// 	const parent = getSymbolDetail(document, functionSymbolWithParents[0]);
	// 	const children = functionSymbolWithParents.slice(1).map(symbol => getSymbolDetail(document, symbol)).join(' ');
	// 	targetCodeContextString = `${parent} { ${children} }`;
	// 	console.log(`targetCodeContext, : ${targetCodeContextString}`);
	// }

	const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;

	const currentConfig = {
        workspace: workspace,
    }
	getConfigInstance().updateConfig(currentConfig);
	// const projectName = pathParts[pathParts.length - 1];
	// const privateConfig = loadPrivateConfig('');

	// const model = 'gpt-4o-mini';
	const functionSymbol = getFunctionSymbol(symbols, position)!;
	
	// Generate the file paths
	const fullFileName  = generateFileNameForDiffLanguage(document, 
		functionSymbol, path.join(workspace,getConfigInstance().savePath), 
		document.languageId, [], 0);
	

	// Call generateUnitTestForAFunction with all required parameters
	// set the logs to specific folder, not the default one 
	const showGeneratedCode = true;
	try {
		const finalCode = await generateUnitTestForAFunction(
			workspace,
			document,
			functionSymbol,
			fullFileName,
			showGeneratedCode,
		);
		
		if (finalCode){
			vscode.window.showInformationMessage('Unit test generated successfully!');
			if (showGeneratedCode) {
				const fileName = getFileName(fullFileName);
				showDiffAndAllowSelection(finalCode, document.languageId, fileName);
			} else {
				saveCode(finalCode, "", fullFileName);
			}
			return finalCode;
		} else {
			vscode.window.showErrorMessage('Failed to generate unit test!');
			return '';
		}
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to generate unit test: ${error}`);
		return '';
	}

}

// Helper functions for the main generator
async function initializeTestGeneration(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol, fullFileName: string, logger: ExpLogger): Promise<void> {
	// basically, its the last part of the file name
	// for java, it is the file name without the path
	// for other languages, it is the file name with the path
	// for example, the fileName is org.commons.cli.CommandLineTest.java

	logger.log("start", "", null, "");

	const languageId = document.languageId;
	console.log('Language ID:', languageId);

	if (!functionSymbol || !isFunctionSymbol(functionSymbol) || !isValidFunctionSymbol(functionSymbol)) {
		vscode.window.showErrorMessage('No valid function symbol found!');
		throw new Error('Invalid function symbol');
	}

}

async function generateInitialTestCode(
	collectedData: any,
	languageId: string,
	logger: ExpLogger
): Promise<string> {

	const promptObj = await genPrompt(collectedData, getConfigInstance().model, languageId);
	const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model};
	const startLLMTime = Date.now();
	try {
		const testCode = await invokeLLM(promptObj, logObj);
		const parsedCode = parseCode(testCode);
		logger.log("invokeLLM", (Date.now() - startLLMTime).toString(), logObj, "");
		return parsedCode;
	} catch (error) {
		if (error instanceof TokenLimitExceededError) {
			console.warn('Token limit exceeded, continuing...');
			logger.log("TokenLimitation", (Date.now() - startLLMTime).toString(), logObj, "");
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
	inExperiment: boolean = false
): Promise<string> {
// Merge provided config with defaults
const model = getConfigInstance().model;
const fileName = getFileName(fullFileName);
const logger = new ExpLogger([], model, fullFileName, fileName, functionSymbol.name);
const languageId = document.languageId;

return vscode.window.withProgress({
	location: vscode.ProgressLocation.Notification,
	title: "Generating Unit Test",
	cancellable: true
}, async (progress, token) => {

	console.log(`Generating unit test for ${model} in ${fullFileName}`);
	try {
        if (!await reportProgressWithCancellation(progress, token, "Preparing for test generation...", 10)) {
            return '';
        }
		await initializeTestGeneration(
			document,
			functionSymbol,
			fullFileName,
			logger
			);
		let testCode = "";
		let collectedData = {};
		// Step 1: Collect Info

		// progress.report({ message: "Generating test structure...", increment: 20 });
		switch (getConfigInstance().generationType) {
			case GenerationType.NAIVE:
			case GenerationType.ORIGINAL:
			// Step 2: Initial Test Generation
				if (!await reportProgressWithCancellation(progress, token, "Collecting info...", 20)) {
					return '';
				}
				const startTime = Date.now();
				collectedData = await collectInfo(
					document,
					functionSymbol,
					languageId,
					fileName,
				);
				logger.log("collectInfo", (Date.now() - startTime).toString(), null, "");
				if (!await reportProgressWithCancellation(progress, token, `[${getConfigInstance().generationType} mode] - generating initial test code`, 20)) {
					return '';
				}
				testCode = await generateInitialTestCode(
				collectedData,
				languageId,
				logger
				);
				testCode = parseCode(testCode);

				break;

			case GenerationType.CFG:
				const contextSelectorForCFG = await getContextSelectorInstance(
					document, 
					functionSymbol);
				const functionText = document.getText(functionSymbol.range);
				const builder = createCFGBuilder(document.languageId as SupportedLanguage);
				const cfgBuildingStartTime = Date.now();
				const cfg = await builder.buildFromCode(functionText);
				logger.log("buildCFG", (Date.now() - cfgBuildingStartTime).toString(), null, "");
				const pathCollectorStartTime = Date.now();
				const pathCollector = new PathCollector(document.languageId);
				const paths = pathCollector.collect(cfg.entry);
				const minimizedPaths = pathCollector.minimizePaths(paths);
				logger.log("collectCFGPaths", (Date.now() - pathCollectorStartTime).toString(), null, "");
				logger.saveCFGPaths(functionText, minimizedPaths);
				const ContextStartTime2 = Date.now();
				const logObjForIdentifyTerms2: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
				let enrichedTerms2: ContextTerm[] = [];
				if (getConfigInstance().promptType === PromptType.WITHCONTEXT) {
					const identifiedTerms2 = getContextTermsFromTokens(contextSelectorForCFG.getTokens());
					logger.log("identifyContextTerms", (Date.now() - ContextStartTime2).toString(), logObjForIdentifyTerms2, "");
					if (!await reportProgressWithCancellation(progress, token, `[${getConfigInstance().generationType} mode] - gathering context`, 20)) {
						return '';
					}

					const gatherContextStartTime2 = Date.now();
					enrichedTerms2 = await contextSelectorForCFG.gatherContext(identifiedTerms2);
					logger.log("gatherContext", (Date.now() - gatherContextStartTime2).toString(), null, "");
					console.log("enrichedTerms", enrichedTerms2);
				}
				// const identifiedTerms = await contextSelectorForCFG.identifyContextTerms(functionText, []);

				// const enrichedTerms = await contextSelectorForCFG.gatherContext(identifiedTerms);
				// const enrichedTerms: ContextTerm[] = [];
				// console.log("enrichedTerms", enrichedTerms);
				let promptObj2: ChatMessage[] = [];
				const generateTestWithContextStartTime2 = Date.now();
				if (paths.length > 1) {
					promptObj2 = generateTestWithContextWithCFG(
						document, 
						functionSymbol,
						document.getText(functionSymbol.range), 
						enrichedTerms2, 
						paths, 
						fileName
					);
				} else {
					promptObj2 = generateTestWithContext(
						document, 
						document.getText(functionSymbol.range), 
						enrichedTerms2, 
						fileName
					);
				}
				const logObj2: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
				testCode = await invokeLLM(promptObj2, logObj2);
				testCode = parseCode(testCode);
				logger.log("generateTestWithContext", (Date.now() - generateTestWithContextStartTime2).toString(), logObj2, "");
				if (!await reportProgressWithCancellation(progress, token, `[${getConfigInstance().generationType} mode] - generating test with context`, 20)) {
					return '';
				}
				logger.save(fileName);
				
				break;

			case GenerationType.AGENT:
				if (!await reportProgressWithCancellation(progress, token, `[${getConfigInstance().generationType} mode] - identifying context terms`, 20)) {
					return '';
				}
				const contextSelector = await getContextSelectorInstance(
					document, 
					functionSymbol);
				if (!await reportProgressWithCancellation(progress, token, `[${getConfigInstance().generationType} mode] - gathering context`, 20)) {
					return '';
				}
				let enrichedTerms: ContextTerm[] = [];
				if (getConfigInstance().promptType === PromptType.WITHCONTEXT) {
					
					const ContextStartTime = Date.now();
					const logObjForIdentifyTerms: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
					// const identifiedTerms = await contextSelector.identifyContextTerms(document.getText(functionSymbol.range), logObjForIdentifyTerms);
					const identifiedTerms = getContextTermsFromTokens(contextSelector.getTokens());
					logger.log("identifyContextTerms", (Date.now() - ContextStartTime).toString(), logObjForIdentifyTerms, "");
					const gatherContextStartTime = Date.now();
					enrichedTerms = await contextSelector.gatherContext(identifiedTerms);
					logger.log("gatherContext", (Date.now() - gatherContextStartTime).toString(), null, "");
					console.log("enrichedTerms", enrichedTerms);

					if (!await reportProgressWithCancellation(progress, token, `[${getConfigInstance().generationType} mode] - generating test with context`, 20)) {
						return '';
					}
				}
				const generateTestWithContextStartTime = Date.now();
				const promptObj = generateTestWithContext(document, document.getText(functionSymbol.range), enrichedTerms, fileName);
				const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
				testCode = await invokeLLM(promptObj, logObj);
				testCode = parseCode(testCode);

				logger.log("generateTestWithContext", (Date.now() - generateTestWithContextStartTime).toString(), logObj, "");
				
				logger.save(fileName);
				break;
			case GenerationType.EXPERIMENTAL:
				break;
			default:
				throw new Error(`Invalid generation type: ${getConfigInstance().generationType}`);
		}

		await saveToIntermediate(
			testCode,
			srcPath,
			fileName,
			path.join(getConfigInstance().savePath, "initial"),
			languageId
		);

		if (getConfigInstance().generationType === GenerationType.NAIVE || getConfigInstance().fixType === FixType.NOFIX) {
			if (!await reportProgressWithCancellation(progress, token, `[${getConfigInstance().generationType} mode] - completed`, 50)) {
				return '';
			}
			return testCode;
		}

		// Step 3: Diagnostic Fix
		let diagnosticReport: DiagnosticReport | null = null;
		let finalCode: string = testCode;

		const fixstartTime = Date.now();
		const report = await fixDiagnostics(
			srcPath,
			testCode,
			document.getText(functionSymbol.range),
			model,
			languageId,
			model,
			getConfigInstance().historyPath,
			fileName,
			logger,
			getConfigInstance().maxRound,
			progress,
			token
		);
		diagnosticReport = report.diagnosticReport;
		finalCode = report.finalCode;
		logger.log("fixDiagnostics", (Date.now() - fixstartTime).toString(), null, "");
		
		// Step 4: Save Results
		
		// Save diagnostic report
		if (!await reportProgressWithCancellation(progress, token, "Finalizing test code...", 10)) {
			return '';
		}
		// const reportPath = path.join(getConfigInstance().logSavePath, `${fileName}_diagnostic_report.json`);
		// fs.mkdirSync(path.dirname(reportPath), { recursive: true });
		// console.log('generate::diagnosticReport', JSON.stringify(diagnosticReport, null, 2));
		// fs.writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));
		logger.saveDiagnosticReport(diagnosticReport);
		await saveToIntermediate(
			finalCode,
			srcPath,
			fileName,
			path.join(getConfigInstance().savePath, "final"),
			languageId
		);
		// await saveGeneratedCodeToFolder(finalCode, path.join(getConfigInstance().workspace, getConfigInstance().savePath), fileName);
		logger.save(fileName);

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
	});
}

