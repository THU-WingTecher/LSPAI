import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DecodedToken, createSystemPromptWithDefUseMap, extractUseDefInfo } from "./token";
import {getPackageStatement, getDependentContext, DpendenceAnalysisResult, getImportStatement, summarizeClass} from "./retrieve";
import {getReferenceInfo} from "./reference";
import { TokenLimitExceededError } from "./invokeLLM";
import { ExpLogger, LLMLogs } from './log';
import { invokeLLM } from "./invokeLLM";
import { genPrompt, generateTestWithContext, inspectTest } from "./prompts/promptBuilder";
import { isFunctionSymbol, isValidFunctionSymbol, getFunctionSymbol, getFunctionSymbolWithItsParents, getSymbolDetail, parseCode } from './utils';
import { saveGeneratedCodeToFolder, saveGeneratedCodeToIntermediateLocation, findFiles, generateFileNameForDiffLanguage, saveToIntermediate } from './fileHandler';
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
	const privateConfig = loadPrivateConfig('');

	const model = 'gpt-4o-mini';
	const currentConfig = {
		model: model,
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.ORIGINAL,
        promptType: PromptType.DETAILED,
        workspace: workspace,
        parallelCount: 1,
        maxRound: 5,
		savePath: path.join(getTempDirAtCurWorkspace(), model),
        ...privateConfig
    }
	const folderPath = currentConfig.savePath;
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
		fileName,
		showGeneratedCode,
	);

	return finalCode;

}

// Helper functions for the main generator
async function initializeTestGeneration(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol, fullFileName: string, logger: ExpLogger): Promise<{ 
	languageId: string, 
	fileName: string
}> {
	const fileNameParts = fullFileName.split('/');
	const fileName = fileNameParts[fileNameParts.length - 1].split('.')[0];
	logger.log("start", "", null, "");

	const languageId = document.languageId;
	console.log('Language ID:', languageId);

	if (!functionSymbol || !isFunctionSymbol(functionSymbol) || !isValidFunctionSymbol(functionSymbol)) {
		vscode.window.showErrorMessage('No valid function symbol found!');
		throw new Error('Invalid function symbol');
	}

	return { languageId, fileName};
}

async function generateInitialTestCode(
	document: vscode.TextDocument,
	functionSymbol: vscode.DocumentSymbol,
	collectedData: any,
	languageId: string,
	fileName: string,
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
function getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor) {
    let currentLine = textEditor.visibleRanges[0].start.line;
    const endLine = textEditor.visibleRanges[0].end.line;
    let code = '';

    while (currentLine < endLine) {
        code += `${currentLine + 1}: ${textEditor.document.lineAt(currentLine).text} \n`;
        currentLine++;
    }
    return code;
}

// function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string) {
//     const decorationType = vscode.window.createTextEditorDecorationType({
//         after: {
//             contentText: ` ${suggestion.substring(0, 25) + "..."}`,
//             color: "grey",
//         },
//     });

//     const lineLength = editor.document.lineAt(line - 1).text.length;
//     const range = new vscode.Range(
//         new vscode.Position(line - 1, lineLength),
//         new vscode.Position(line - 1, lineLength),
//     );

//     const decoration = { range: range, hoverMessage: suggestion };

//     editor.setDecorations(decorationType, [decoration]);
// }

function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string) {
    const decorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ` ${suggestion.substring(0, 25) + "..."}`,
            color: "grey",
        },
    });

    const lineLength = editor.document.lineAt(line - 1).text.length;
    const range = new vscode.Range(
        new vscode.Position(line - 1, lineLength),
        new vscode.Position(line - 1, lineLength),
    );

    const decoration = { range: range, hoverMessage: suggestion };

    editor.setDecorations(decorationType, [decoration]);
}

export async function showDiffAndAllowSelection(newContent: string, languageId: string) {
    // Create a new untitled document with the new content
    const untitledDocument = await vscode.workspace.openTextDocument({ content: newContent, language: languageId });
    const editor = await vscode.window.showTextDocument(untitledDocument, vscode.ViewColumn.Beside);

    // Calculate the range for the entire document
    const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(newContent.length)
    );

    // Highlight the entire document
    // const highlightDecorationType = vscode.window.createTextEditorDecorationType({
    //     backgroundColor: 'rgba(100, 200, 255, 0.1)', // Light blue background
    // });
    
    // editor.setDecorations(highlightDecorationType, [fullRange]);

    // // Add buttons at the end of document
    // const buttonsDecorationType = vscode.window.createTextEditorDecorationType({
    //     after: {
    //         contentText: ' [Accept] [Reject]',
    //         color: 'blue',
    //         margin: '0 0 0 1em',
    //     }
    // });
    
    // Highlight the entire document as a change
    const changeDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.34)', // Light yellow background
        border: '1px solid yellow'
    });

    editor.setDecorations(changeDecorationType, [fullRange]);
	const editPromise = editor.edit(editBuilder => {
        const endPosition = editor.document.positionAt(newContent.length);
        editBuilder.insert(endPosition, '\n\n');
    });

    // Wait for the edit to complete before adding decorations
    await editPromise;
	const rejectLineNumber = editor.document.lineCount - 1;
	const acceptLineNumber = rejectLineNumber - 1;
	const rejectLineLength = editor.document.lineAt(rejectLineNumber).text.length;
	const acceptLineLength = editor.document.lineAt(acceptLineNumber).text.length;
    const rejectPosition = new vscode.Position(rejectLineNumber, rejectLineLength);
	const acceptPosition = new vscode.Position(acceptLineNumber, acceptLineLength);
    // Render "Accept" and "Reject" options in the editor
    const acceptDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ' [Accept]',
            color: 'green',
            margin: '0 0 0 1em',
            textDecoration: 'underline'
        }
    });
    const acceptRange = new vscode.Range(acceptPosition, acceptPosition);
    console.log(`acceptRange: ${acceptRange}`);
    const rejectDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ' [Reject]',
            color: 'red',
            margin: '0 0 0 1em',
            textDecoration: 'underline'
        }
    });

    // Place reject button on the same line as accept
    const rejectRange = new vscode.Range(rejectPosition, rejectPosition);
	console.log(`rejectRange: ${rejectRange}`);

    editor.setDecorations(acceptDecorationType, [acceptRange]);
    editor.setDecorations(rejectDecorationType, [rejectRange]);
    // Get the last line position

    const disposable = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor.document.uri.toString() !== untitledDocument.uri.toString()) {
            return;
        }
        
        const position = event.selections[0].active;
        
        // Check for Accept/Reject button clicks (both on last line)
        if (position.line === acceptLineNumber) {
			// Accept clicked
            const lineText = editor.document.lineAt(position.line).text;
            const lineLength = lineText.length;
			changeDecorationType.dispose();
			acceptDecorationType.dispose();
			rejectDecorationType.dispose();
			disposable.dispose();
			vscode.window.showInformationMessage('Changes accepted');
            }
            // If clicked after [Accept] where [Reject] would appear
            else if (position.line === rejectLineNumber) {
                // Reject clicked
                editor.edit(editBuilder => {
                    editBuilder.delete(new vscode.Range(
                        new vscode.Position(0, 0),
                        new vscode.Position(editor.document.lineCount, 0)
                    ));
                }).then(() => {
                    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    vscode.window.showInformationMessage('Changes rejected');
                });
                changeDecorationType.dispose();
                acceptDecorationType.dispose();
                rejectDecorationType.dispose();
                disposable.dispose();
            }
    });

    // Update hover provider to match the new button positions
    const hoverDisposable = vscode.languages.registerHoverProvider({ scheme: 'untitled', language: languageId }, {
        provideHover(document, position, token) {
			console.log(`current hover: ${position.line}, ${position.character}`);
            if (document.uri.toString() !== untitledDocument.uri.toString()) {
                return null;
            }
            
            if (position.line === acceptLineNumber) {
                // Hover for Accept button
                    return new vscode.Hover('Accept these changes');
                } 
                // Hover for Reject button
                else if (position.line === rejectLineNumber) {
                    return new vscode.Hover('Reject these changes and close the document');
                }
            
            return null;
        }
    });
    
    // Clean up hover provider when document closes
    const closeDisposable = vscode.workspace.onDidCloseTextDocument(doc => {
        if (doc.uri.toString() === untitledDocument.uri.toString()) {
            hoverDisposable.dispose();
            disposable.dispose();
            closeDisposable.dispose();
        }
    });
}
// export async function showDiffAndAllowSelection(newContent: string, languageId: string) {
//     // Create a new untitled document with the new content
//     const untitledDocument = await vscode.workspace.openTextDocument({ content: newContent, language: languageId });
//     const editor = await vscode.window.showTextDocument(untitledDocument, vscode.ViewColumn.Beside);

//     // Calculate the range for the entire document
//     const fullRange = new vscode.Range(
//         editor.document.positionAt(0),
//         editor.document.positionAt(newContent.length)
//     );

// 	applyDecoration(editor, 1, "This is a Unit Test for");

    // Highlight the entire document as a change
    // const changeDecorationType = vscode.window.createTextEditorDecorationType({
    //     backgroundColor: 'rgba(255,255,0,0.3)', // Light yellow background
    //     border: '1px solid yellow'
    // });

    // editor.setDecorations(changeDecorationType, [fullRange]);

    // // Render "Accept" and "Reject" options in the editor
    // const acceptDecorationType = vscode.window.createTextEditorDecorationType({
    //     after: {
    //         contentText: ' [Accept]',
    //         color: 'green',
    //         margin: '0 0 0 1em',
    //     	textDecoration: 'underline'
    //     }
    // });

    // const rejectDecorationType = vscode.window.createTextEditorDecorationType({
    //     after: {
    //         contentText: ' [Reject]',
    //         color: 'red',
    //         margin: '0 0 0 1em',
	// 		textDecoration: 'underline'
    //     }
    // });

    // editor.setDecorations(acceptDecorationType, [fullRange]);
    // editor.setDecorations(rejectDecorationType, [fullRange]);


	// // Add event listeners for clicking on the decorations
	// const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
	// 	const position = event.selections[0].active;
	// 	const lineText = event.textEditor.document.lineAt(position.line).text;
	//     console.log(`Cursor moved to line: ${position.line}, text: ${lineText}, Document: ${event.textEditor.document.uri}`);
	// 	if (lineText.includes('[Accept]')) {
	// 		vscode.commands.executeCommand('extension.acceptChanges');
	// 	} else if (lineText.includes('[Reject]')) {
	// 		vscode.commands.executeCommand('extension.rejectChanges');
	// 	}
	// });
// }

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
const logger = new ExpLogger([], model, fullFileName, functionSymbol.name);


return vscode.window.withProgress({
	location: vscode.ProgressLocation.Notification,
	title: "Generating Unit Test",
	cancellable: true
}, async (progress, token) => {

	console.log(`Generating unit test for ${model} in ${fullFileName}`);
	try {
		progress.report({ message: "Analyzing function structure...", increment: 20 });
		const { languageId, fileName } = await initializeTestGeneration(
				document,
				functionSymbol,
				fullFileName,
				logger
				);
		let testCode = "";
		let collectedData = {};
		// Step 1: Collect Info

		// progress.report({ message: "Generating test structure...", increment: 20 });
		progress.report({ message: "Generating test cases...", increment: 20 });
		switch (getConfigInstance().generationType) {
			case GenerationType.NAIVE:
			case GenerationType.ORIGINAL:
			// Step 2: Initial Test Generation
				const startTime = Date.now();
				collectedData = await collectInfo(
									document,
									functionSymbol,
									languageId,
									fileName,
									);
				logger.log("collectInfo", (Date.now() - startTime).toString(), null, "");
				testCode = await generateInitialTestCode(
				document,
				functionSymbol,
				collectedData,
				languageId,
				fullFileName,
				logger
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
				logger.log("identifyContextTerms", (Date.now() - ContextStartTime).toString(), logObjForIdentifyTerms, "");
				const gatherContextStartTime = Date.now();
				const enrichedTerms = await contextSelector.gatherContext(identifiedTerms);
				logger.log("gatherContext", (Date.now() - gatherContextStartTime).toString(), null, "");
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
				logger.log("generateTestWithContext", (Date.now() - generateTestWithContextStartTime).toString(), logObj, "");
				break;
			case GenerationType.EXPERIMENTAL:
				const contextSelector_experimental = await getContextSelectorInstance(
					document, 
					functionSymbol);
				const ContextStartTime_experimental = Date.now();
				const logObjForIdentifyTerms_experimental: LLMLogs = {tokenUsage: "", result: "", prompt: "", model};
				const identifiedTerms_experimental = await contextSelector_experimental.identifyContextTerms(document.getText(functionSymbol.range), logObjForIdentifyTerms_experimental);
				logger.log("identifyContextTerms", (Date.now() - ContextStartTime_experimental).toString(), logObjForIdentifyTerms_experimental, "");
				const gatherContextStartTime_experimental = Date.now();
				const enrichedTerms_experimental = await contextSelector_experimental.gatherContext(identifiedTerms_experimental);
				logger.log("gatherContext", (Date.now() - gatherContextStartTime_experimental).toString(), null, "");
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
				logger.log("generateTestWithContext", (Date.now() - generateTestWithContextStartTime_experimental).toString(), logObj_experimental, "");

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
				logger.log("inspectTest", (Date.now() - inspectTestStartTime).toString(), logObj_inspectTest, "");
				
				break;
		}

		if (getConfigInstance().generationType === GenerationType.NAIVE) {
			return testCode;
		}

		// Step 3: Diagnostic Fix
		let diagnosticReport: DiagnosticReport | null = null;
		let finalCode: string = testCode;

		const fixstartTime = Date.now();
		progress.report({ message: "Fixing Unit Test Codes ...", increment: 20 });
		const report = await fixDiagnostics(
			srcPath,
			testCode,
			collectedData,
			model,
			languageId,
			model,
			getConfigInstance().historyPath,
			fullFileName,
			logger,
			getConfigInstance().maxRound,
		);
		diagnosticReport = report.diagnosticReport;
		finalCode = report.finalCode;
		logger.log("fixDiagnostics", (Date.now() - fixstartTime).toString(), null, "");
		
		// Step 4: Save Results
		
		// Save diagnostic report
		progress.report({ message: "Finalizing test code...", increment: 40 });
		const reportPath = path.join(getConfigInstance().logSavePath, model, `${fileName}_diagnostic_report.json`);
		fs.mkdirSync(path.dirname(reportPath), { recursive: true });
		console.log('generate::diagnosticReport', JSON.stringify(diagnosticReport, null, 2));
		fs.writeFileSync(reportPath, JSON.stringify(diagnosticReport, null, 2));

		await saveGeneratedCodeToFolder(finalCode, fullFileName);
		if (showGeneratedCode) {
			showDiffAndAllowSelection(fullFileName, testCode);
		}
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

