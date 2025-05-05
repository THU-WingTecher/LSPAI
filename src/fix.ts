import * as path from 'path';
import * as vscode from 'vscode';
import { getConfigInstance } from './config';
import { groupDiagnosticsByMessage, groupedDiagnosticsToString, DiagnosticsToString, getDiagnosticsForFilePath, chooseDiagnostic } from './diagnostic';
import { saveToIntermediate, showGeneratedCodeWithPreview } from './fileHandler';
import { invokeLLM, TokenLimitExceededError } from './invokeLLM';
import { ExpLogs, LLMLogs, ExpLogger } from './log';
import { experimentalDiagnosticPrompt, constructDiagnosticPrompt, FixSystemPrompt } from './prompts/promptBuilder';
import { parseCode } from './utils';
import { reportProgressWithCancellation } from './generate';

function defaultReturn(finalCode: string) {
	return {
		finalCode,
		success: false,
		diagnosticReport: {
			initialDiagnostics: 0,
			finalDiagnostics: 0,
			totalRounds: 0,
			fixSuccess: false,
			roundHistory: []
		}
	};
}

export async function performFixingRound(
	srcPath: string,
	round: number,
	curSavePoint: string,
	currentCode: string,
	diagnostics: vscode.Diagnostic[],
	collectedData: any,
	method: string,
	languageId: string,
	model: string,
	historyPath: string,
	fileName: string,
	logger: ExpLogger): Promise<{ code: string; savePoint: string; diagnostics: vscode.Diagnostic[]; } | null> {
	console.log(`\n--- Round ${round} ---`);

	// Construct prompt for fixing
	let diagnosticPrompts;
	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(curSavePoint));
	const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
	const diagnosticReport = groupedDiagnosticsToString(groupedDiagnostics, document).join('\n');
	diagnosticPrompts = experimentalDiagnosticPrompt(
		currentCode,
		diagnosticReport
	);
	// } else {
	// 	// Get diagnostic messages
	// 	const diagnosticMessages = await DiagnosticsToString(vscode.Uri.file(curSavePoint), diagnostics, method);
	// 	if (!diagnosticMessages.length) {
	// 		console.error('No diagnostic messages found!');
	// 		return null;
	// 	}
	// 	const diagnosticUserPrompts = constructDiagnosticPrompt(
	// 		currentCode,
	// 		diagnosticMessages.join('\n'),
	// 		collectedData.functionSymbol.name,
	// 		collectedData.mainfunctionParent,
	// 		collectedData.SourceCode
	// 	);
	// 	// Prepare chat messages
	// 	diagnosticPrompts = [
	// 		{ role: "system", content: FixSystemPrompt(languageId) },
	// 		{ role: "user", content: diagnosticUserPrompts }
	// 	];

	// Get AI response
	const fixlogObj: LLMLogs = { tokenUsage: "", result: "", prompt: "", model: model };
	const fixStartTime = Date.now();
	let aiResponse: string;

	try {
		aiResponse = await invokeLLM(diagnosticPrompts, fixlogObj);
		logger.log(`FixWithLLM_${round}`, (Date.now() - fixStartTime).toString(), fixlogObj, "");
	} catch (error) {
		if (error instanceof TokenLimitExceededError) {
			console.warn('Token limit exceeded, continuing...');
		}
		logger.log(error instanceof TokenLimitExceededError ? "TokenLimitation" : "UnknownError", (Date.now() - fixStartTime).toString(), fixlogObj, "");
		return null;
	}

	// Parse and save the fixed code
	const fixedCode = parseCode(aiResponse);
	const saveStartTime = Date.now();

	try {
		const newSavePoint = await saveToIntermediate(
			fixedCode,
			srcPath,
			fileName,
			path.join(historyPath, getConfigInstance().model, round.toString()),
			languageId
		);

		logger.log("saveGeneratedCodeToFolder", (Date.now() - saveStartTime).toString(), null, "");

		// Get updated diagnostics
		const diagStartTime = Date.now();
		const newDiagnostics = await getDiagnosticsForFilePath(newSavePoint);
		logger.log("getDiagnosticsForFilePath", (Date.now() - diagStartTime).toString(), null, "");

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
export async function fixDiagnostics(
	srcPath: string,
	testCode: string,
	collectedData: any,
	method: string,
	languageId: string,
	model: string,
	historyPath: string,
	fileName: string,
	logger: ExpLogger,
	MAX_ROUNDS: number,
	progress: vscode.Progress<{ message: string; increment: number }>,
	token: vscode.CancellationToken
	): 
	Promise<{ finalCode: string; success: boolean; diagnosticReport: DiagnosticReport; }> {

	let round = 0;
	let finalCode = testCode;
	let curSavePoint = await saveToIntermediate(
		finalCode,
		srcPath,
		fileName,
		path.join(historyPath, getConfigInstance().model, round.toString()),
		languageId
	);
	if (!await reportProgressWithCancellation(progress, token, "Fixing - getting diagnostics ...", 10)) {
		return defaultReturn(finalCode);
	}
	let diagnostics = await getDiagnosticsForFilePath(curSavePoint);
	if (diagnostics.some(diag => diag.message.includes("only syntax errors are reported"))) {
		// This means the Language Server is not working, we need to stop the fixing process
		vscode.window.showWarningMessage("Only syntax errors are reported, please check the code again.");
		console.log("Only syntax errors are reported, please check the code again.");
		return defaultReturn(finalCode);
	}
	let filteredDiagnostics = diagnostics.filter(diagnostic => chooseDiagnostic(diagnostic, languageId));
    console.log('filtered diagnostics', filteredDiagnostics.map(diag => diag.message));

	const initialDiagnosticCount = filteredDiagnostics.length;
	const diagnosticHistory: DiagnosticRound[] = [];
	console.log('fixdiagnostics::diagnostics at round', round, filteredDiagnostics.map(diag => diag.message));
	while (round < MAX_ROUNDS && filteredDiagnostics.length > 0) {
		round++;
		// Record diagnostic changes for this round
		diagnosticHistory.push({
			round,
			diagnosticsFixed: filteredDiagnostics.length - filteredDiagnostics.length,
			remainingDiagnostics: filteredDiagnostics.length,
			diagnosticMessages: []
			// diagnosticMessages: await DiagnosticsToString(vscode.Uri.file(curSavePoint), diagnostics, method)
		});
		progress.report({ message: `Fixing - Round ${round}`, increment: 10 });
		const result = await performFixingRound(
			srcPath,
			round,
			curSavePoint,
			finalCode,
			filteredDiagnostics,
			collectedData,
			method,
			languageId,
			model,
			historyPath,
			fileName,
			logger
		);

		filteredDiagnostics = result?.diagnostics || [];
		finalCode = result?.code || finalCode;
		curSavePoint = result?.savePoint || curSavePoint;
		// if (editor) {
		// 	await editor.edit(editBuilder => {
		// 		editBuilder.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), finalCode);
		// 	});
		// }
		if (!filteredDiagnostics) {
			console.log("No diagnostics found, breaking");
			progress.report({ message: `Fixing Completed at Round ${round}`, increment: 10 })
			break;
		} else {
			progress.report({ message: `Fixing Not completed at Round ${round}`, increment: -10 });
		}

	}
	if (filteredDiagnostics.length > 0) {
		console.log("Diagnostics not fixed, max round reached");
		progress.report({ message: `Fixing Not completed at Round ${round}`, increment: -10 });
	}

	const diagnosticReport: DiagnosticReport = {
		initialDiagnostics: initialDiagnosticCount,
		finalDiagnostics: filteredDiagnostics.length,
		totalRounds: round,
		fixSuccess: filteredDiagnostics.length === 0,
		roundHistory: diagnosticHistory
	};
	
	return {
		finalCode,
		success: filteredDiagnostics.length === 0,
		diagnosticReport
	};
}
export interface DiagnosticRound {
	round: number;
	diagnosticsFixed: number;
	remainingDiagnostics: number;
	diagnosticMessages: string[];
}

export interface DiagnosticReport {
	initialDiagnostics: number;
	finalDiagnostics: number;
	totalRounds: number;
	fixSuccess: boolean;
	roundHistory: DiagnosticRound[];
}

