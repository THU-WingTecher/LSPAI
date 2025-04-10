import * as path from 'path';
import * as vscode from 'vscode';
import { getConfigInstance, FixType } from './config';
import { groupDiagnosticsByMessage, groupedDiagnosticsToString, DiagnosticsToString, getDiagnosticsForFilePath } from './diagnostic';
import { saveToIntermediate, showGeneratedCodeWithPreview } from './fileHandler';
import { invokeLLM, TokenLimitExceededError } from './invokeLLM';
import { ExpLogs, LLMLogs, ExpLogger } from './log';
import { experimentalDiagnosticPrompt, constructDiagnosticPrompt, FixSystemPrompt } from './prompts/promptBuilder';
import { parseCode } from './utils';

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
	fullFileName: string,
	logger: ExpLogger): Promise<{ code: string; savePoint: string; diagnostics: vscode.Diagnostic[]; } | null> {
	console.log(`\n--- Round ${round} ---`);

	// Construct prompt for fixing
	let diagnosticPrompts;
	if (getConfigInstance().fixType === FixType.GROUPED) {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(curSavePoint));
		const groupedDiagnostics = groupDiagnosticsByMessage(diagnostics);
		const diagnosticReport = groupedDiagnosticsToString(groupedDiagnostics, document).join('\n');
		diagnosticPrompts = experimentalDiagnosticPrompt(
			currentCode,
			diagnosticReport
		);
	} else {
		// Get diagnostic messages
		const diagnosticMessages = await DiagnosticsToString(vscode.Uri.file(curSavePoint), diagnostics, method);
		if (!diagnosticMessages.length) {
			console.error('No diagnostic messages found!');
			return null;
		}
		const diagnosticUserPrompts = constructDiagnosticPrompt(
			currentCode,
			diagnosticMessages.join('\n'),
			collectedData.functionSymbol.name,
			collectedData.mainfunctionParent,
			collectedData.SourceCode
		);
		// Prepare chat messages
		diagnosticPrompts = [
			{ role: "system", content: FixSystemPrompt(languageId) },
			{ role: "user", content: diagnosticUserPrompts }
		];
	}
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
			fullFileName.split(method)[1],
			path.join(historyPath, method, round.toString()),
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
	fullFileName: string,
	logger: ExpLogger,
	MAX_ROUNDS: number): 
	Promise<{ finalCode: string; success: boolean; diagnosticReport: DiagnosticReport; }> {

	let round = 0;
	let finalCode = testCode;
	let curSavePoint = await saveToIntermediate(
		finalCode,
		srcPath,
		fullFileName.split(method)[1],
		path.join(historyPath, method, round.toString()),
		languageId
	);

	let diagnostics = await getDiagnosticsForFilePath(curSavePoint);
	const initialDiagnosticCount = diagnostics.length;
	const diagnosticHistory: DiagnosticRound[] = [];
	console.log('fixdiagnostics::diagnostics at round', round, diagnostics.map(diag => diag.message));
	while (round < MAX_ROUNDS && diagnostics.length > 0) {
		round++;
		// Record diagnostic changes for this round
		diagnosticHistory.push({
			round,
			diagnosticsFixed: diagnostics.length - diagnostics.length,
			remainingDiagnostics: diagnostics.length,
			diagnosticMessages: []
			// diagnosticMessages: await DiagnosticsToString(vscode.Uri.file(curSavePoint), diagnostics, method)
		});

		const result = await performFixingRound(
			srcPath,
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
			logger
		);

		diagnostics = result?.diagnostics || [];
		finalCode = result?.code || finalCode;
		curSavePoint = result?.savePoint || curSavePoint;
		// if (editor) {
		// 	await editor.edit(editBuilder => {
		// 		editBuilder.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), finalCode);
		// 	});
		// }
		if (!diagnostics) {
			console.log("No diagnostics found, breaking");
			break;
		}

	}
	if (diagnostics.length > 0) {
		console.log("Diagnostics not fixed, max round reached");
	}

	const diagnosticReport: DiagnosticReport = {
		initialDiagnostics: initialDiagnosticCount,
		finalDiagnostics: diagnostics.length,
		totalRounds: round,
		fixSuccess: diagnostics.length === 0,
		roundHistory: diagnosticHistory
	};
	
	return {
		finalCode,
		success: diagnostics.length === 0,
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

