import * as vscode from 'vscode';
import * as path from 'path';
import { DecodedToken, extractUseDefInfo } from "./token";
import {getPackageStatement, getDependentContext, DpendenceAnalysisResult, getImportStatement, constructSymbolRelationShip} from "./retrieve";
import {getReferenceInfo} from "./reference";
import { TokenLimitExceededError } from "./invokeLLM";
import { ExpLogger, LLMLogs } from './log';
import { invokeLLM } from "./invokeLLM";
import { genPrompt, generateTestWithContext, generateTestWithContextWithCFG } from "./prompts/promptBuilder";
import { isFunctionSymbol, isValidFunctionSymbol, getFunctionSymbol, parseCode } from './utils';
import { generateFileNameForDiffLanguage, saveToIntermediate, saveCode, getFileName } from './fileHandler';
import { getConfigInstance, GenerationType, PromptType } from './config';
import { ContextTerm, getContextSelectorInstance } from './agents/contextSelector';
import { SupportedLanguage } from './ast';
import { PathCollector } from './cfg/path';
import { getContextTermsFromTokens } from './tokenAnalyzer';
import { reportProgressWithCancellation, showDiffAndAllowSelection } from './userInteraction';
import { createCFGBuilder } from './cfg/builderFactory';
import { ChatMessage } from './prompts/ChatMessage';
import { BaseTestGenerator } from './strategy/base';
import { createTestGenerator } from './strategy/generators/factory';


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
// async function initializeTestGeneration(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol, fullFileName: string, logger: ExpLogger): Promise<void> {
// 	// basically, its the last part of the file name
// 	// for java, it is the file name without the path
// 	// for other languages, it is the file name with the path
// 	// for example, the fileName is org.commons.cli.CommandLineTest.java

// 	logger.log("start", "", null, "");

// 	const languageId = document.languageId;
// 	console.log('Language ID:', languageId);

// 	if (!functionSymbol || !isFunctionSymbol(functionSymbol) || !isValidFunctionSymbol(functionSymbol)) {
// 		vscode.window.showErrorMessage('No valid function symbol found!');
// 		throw new Error('Invalid function symbol');
// 	}

// }

export async function generateUnitTestForAFunction(
    srcPath: string,
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol,
    fullFileName: string,
    showGeneratedCode: boolean = true,
    inExperiment: boolean = false
): Promise<string> {
    const model = getConfigInstance().model;
    const fileName = getFileName(fullFileName);
    const logger = new ExpLogger([], model, fullFileName, fileName, functionSymbol.name);
    const languageId = document.languageId;

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Generating Unit Test",
        cancellable: true
    }, async (progress, token) => {
        try {
            if (!await reportProgressWithCancellation(progress, token, "Preparing for test generation...", 10)) {
                return '';
            }

            const generator = createTestGenerator(
                getConfigInstance().generationType,
                document,
                functionSymbol,
                languageId,
                fileName,
                logger,
                progress,
                token,
				srcPath
            );

            const testCode = await generator.generateTest();
            await saveToIntermediate(
                testCode,
                srcPath,
                fileName,
                path.join(getConfigInstance().savePath, "initial"),
                languageId
            );

            const { finalCode, diagnosticReport } = await generator.fixTest(testCode);
            
            if (!await reportProgressWithCancellation(progress, token, "Finalizing test code...", 10)) {
                return '';
            }

            if (diagnosticReport) {
                logger.saveDiagnosticReport(diagnosticReport);
            }

            await saveToIntermediate(
                finalCode,
                srcPath,
                fileName,
                path.join(getConfigInstance().savePath, "final"),
                languageId
            );
            
            logger.save(fileName);
            return finalCode;

        } catch (error) {
            console.error('Failed to generate unit test:', error);
            vscode.window.showErrorMessage('Failed to generate unit test!');
            return '';
        }
    });
}