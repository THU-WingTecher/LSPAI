import * as vscode from 'vscode';
import { getConfigInstance, GenerationType, FixType } from '../config';
import { DiagnosticReport, fixDiagnostics } from '../fix';
import { ContextInfo, collectInfo } from '../generate';
import { ExpLogger } from '../log';
import { reportProgressWithCancellation } from '../userInteraction';
import { TestGenerationStrategy } from './types';
import { ContextTerm, getContextSelectorInstance } from '../agents/contextSelector';
import { getContextTermsFromTokens } from '../tokenAnalyzer';
import { ConditionAnalysis } from '../cfg/path';
import { saveContextTerms } from '../fileHandler';

export abstract class BaseTestGenerator implements TestGenerationStrategy {
	constructor(
		protected readonly document: vscode.TextDocument,
		protected readonly functionSymbol: vscode.DocumentSymbol,
		protected readonly languageId: string,
		protected readonly fileName: string,
		protected readonly logger: ExpLogger,
		protected readonly progress: vscode.Progress<{ message?: string; increment?: number; }>,
		protected readonly token: vscode.CancellationToken,
		protected readonly srcPath: string, // Added srcPath parameter
		protected readonly sourceCode: string = "",
		protected readonly functionInfo: Map<string, string> = new Map()
	) { 
		this.sourceCode = this.document.getText(this.functionSymbol.range);
		this.functionInfo.set('name', this.document.getText(this.functionSymbol.selectionRange));
		console.log("this.functionInfo.get('name')",this.functionInfo.get('name'));
	}

	abstract generateTest(): Promise<string>;

	protected async collectInfo(conditions : ConditionAnalysis[] = []): Promise<ContextTerm[] | null> {
		let enrichedTerms: ContextTerm[] = [];
		const tokenCollectTime = Date.now();
		const contextSelector = await getContextSelectorInstance(this.document, this.functionSymbol);
		const identifiedTerms = await getContextTermsFromTokens(this.document, this.functionSymbol, contextSelector.getTokens(), conditions);
		this.logger.log("getContextTermsFromTokens", (Date.now() - tokenCollectTime).toString(), null, "");
		if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - gathering context`, 20)) {
			return null;
		}
		const retreiveTime = Date.now();
		enrichedTerms = await contextSelector.gatherContext(identifiedTerms, this.functionSymbol);
		this.logger.log("gatherContext", (Date.now() - retreiveTime).toString(), null, "");
		await saveContextTerms(this.sourceCode, enrichedTerms, getConfigInstance().logSavePath!, this.fileName);
		return enrichedTerms;
	}

	protected async reportProgress(message: string, increment: number): Promise<boolean> {
		return reportProgressWithCancellation(this.progress, this.token, message, increment);
	}

	protected async collectBasicInfo(): Promise<ContextInfo | null> {
		if (!await this.reportProgress("Collecting info...", 20)) {
			return null;
		}
		const startTime = Date.now();
		const info = await collectInfo(
			this.document,
			this.functionSymbol,
			this.languageId,
			this.fileName
		);
		this.logger.log("collectInfo", (Date.now() - startTime).toString(), null, "");
		return info;
	}

	async fixTest(testCode: string): Promise<{ finalCode: string; diagnosticReport: DiagnosticReport | null; }> {
		if (getConfigInstance().generationType === GenerationType.NAIVE || getConfigInstance().fixType === FixType.NOFIX) {
			if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - completed`, 50)) {
				return { finalCode: '', diagnosticReport: null };
			}
			return { finalCode: testCode, diagnosticReport: null };
		}

		const fixstartTime = Date.now();
		const report = await fixDiagnostics(
			this.srcPath,
			testCode,
			this.document.getText(this.functionSymbol.range),
			getConfigInstance().model,
			this.languageId,
			getConfigInstance().model,
			getConfigInstance().historyPath,
			this.fileName,
			this.logger,
			getConfigInstance().maxRound,
			this.progress,
			this.token
		);

		this.logger.log("fixDiagnostics", (Date.now() - fixstartTime).toString(), null, "");
		return {
			finalCode: report.finalCode,
			diagnosticReport: report.diagnosticReport
		};
	}
}
