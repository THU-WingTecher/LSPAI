import * as path from 'path';
import * as vscode from 'vscode';
import { getConfigInstance, FixType } from './config';
import { groupDiagnosticsByMessage, groupedDiagnosticsToString, DiagnosticsToString, getDiagnosticsForFilePath } from './diagnostic';
import { saveToIntermediate, showGeneratedCodeWithPreview } from './fileHandler';
import { invokeLLM, TokenLimitExceededError } from './invokeLLM';
import { ExpLogs, LLMLogs } from './log';
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
	expData: ExpLogs[]): Promise<{ code: string; savePoint: string; diagnostics: vscode.Diagnostic[]; } | null> {
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
		expData.push({
			llmInfo: fixlogObj,
			process: `FixWithLLM_${round}`,
			time: (Date.now() - fixStartTime).toString(),
			method,
			fileName: fullFileName,
			function: collectedData.functionSymbol.name,
			errMsag: ""
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
			srcPath,
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
export async function fixDiagnostics(
	srcPath: string,
	testCode: string,
	collectedData: any,
	method: string,
	languageId: string,
	model: string,
	historyPath: string,
	fullFileName: string,
	expData: ExpLogs[],
	MAX_ROUNDS: number,
	showGeneratedCode: boolean): Promise<{ finalCode: string; success: boolean; diagnosticReport: DiagnosticReport; }> {

	let round = 0;
	let finalCode = testCode;
	let curSavePoint = await saveToIntermediate(
		finalCode,
		srcPath,
		fullFileName.split(method)[1],
		path.join(historyPath, method, round.toString()),
		languageId
	);
	if (showGeneratedCode) {
		await showGeneratedCodeWithPreview(curSavePoint);
	}

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
			expData
		);

		diagnostics = result?.diagnostics || [];
		finalCode = result?.code || finalCode;
		curSavePoint = result?.savePoint || curSavePoint;
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

