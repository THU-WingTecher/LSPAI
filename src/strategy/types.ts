import { DiagnosticReport } from '../fix';


export interface TestGenerationStrategy {

	// generateTest(
	//     document: vscode.TextDocument,
	//     functionSymbol: vscode.DocumentSymbol,
	//     languageId: string,
	//     fileName: string,
	//     logger: ExpLogger,
	//     progress: vscode.Progress<{ message?: string; increment?: number }>,
	//     token: vscode.CancellationToken
	// ): Promise<string>;
	generateTest(): Promise<string>;
	fixTest(testCode: string): Promise<{ finalCode: string; diagnosticReport: DiagnosticReport | null; }>;
}
