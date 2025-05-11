import * as vscode from 'vscode';
import { GenerationType } from '../../config';
import { ExpLogger } from '../../log';
import { TestGenerationStrategy } from '../types';
import { AgentTestGenerator } from './agent';
import { CFGTestGenerator } from './cfg';
import { NaiveTestGenerator } from './naive';
import { ExperimentalTestGenerator } from './experimental';

// Factory to create the appropriate generator
export function createTestGenerator(
	generationType: GenerationType,
	document: vscode.TextDocument,
	functionSymbol: vscode.DocumentSymbol,
	languageId: string,
	fileName: string,
	logger: ExpLogger,
	progress: vscode.Progress<{ message?: string; increment?: number; }>,
	token: vscode.CancellationToken,
	srcPath: string // Added srcPath parameter
): TestGenerationStrategy {
	switch (generationType) {
		case GenerationType.NAIVE:
		case GenerationType.ORIGINAL:
			return new NaiveTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		case GenerationType.CFG:
			return new CFGTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		case GenerationType.AGENT:
			return new AgentTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		case GenerationType.EXPERIMENTAL:
			return new ExperimentalTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		default:
			throw new Error(`Invalid generation type: ${generationType}`);
	}
}
