import * as vscode from 'vscode';
import { GenerationType } from '../../config';
import { ExpLogger } from '../../log';
import { TestGenerationStrategy } from '../types';
import { AgentTestGenerator } from './agent';
import { SymPromptTestGenerator } from './symPrompt';
import { NaiveTestGenerator } from './naive';
import { CFGTestGenerator } from './cfg';
import { LSPRAGTestGenerator } from './lsprag';
import { LSPRAGReflectTestGenerator } from './lsprag_reflect';

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
	srcPath: string, // Added srcPath parameter
	cachedDir?: string, // Optional: reuse already-generated tests (used by EXPERIMENTAL reflect)
	cachedDraftTestCode?: string // Optional: preloaded cached draft test code (used by EXPERIMENTAL reflect)
): TestGenerationStrategy {
	switch (generationType) {
		case GenerationType.NAIVE:
		case GenerationType.ORIGINAL:
			return new NaiveTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		case GenerationType.SymPrompt:
			return new SymPromptTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		case GenerationType.AGENT:
			return new AgentTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		case GenerationType.CFG:
			return new CFGTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		case GenerationType.LSPRAG:
			return new LSPRAGTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		case GenerationType.EXPERIMENTAL:
			return new LSPRAGReflectTestGenerator(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath, cachedDir, cachedDraftTestCode);
		default:
			throw new Error(`Invalid generation type: ${generationType}`);
	}
}
