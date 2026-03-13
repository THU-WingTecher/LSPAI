import * as path from 'path';
import * as vscode from 'vscode';
import { generateUnitTestForAFunction } from '../generate';
import { getConfigInstance } from '../config';
import { generateFileNameForDiffLanguage, getFileName, saveCode } from '../fileHandler';
import { getAllSymbols } from '../lsp/symbol';
import { showDiffAndAllowSelection } from '../userInteraction';

export interface GenerateUnitTestCommandOptions {
	filePath?: string;
	functionName?: string;
	line?: number;
	character?: number;
	showGeneratedCode?: boolean;
	silent?: boolean;
}

export interface GenerateUnitTestCommandResult {
	finalCode: string;
	fullFileName: string;
	savedFilePath?: string;
	functionName: string;
	sourceFilePath: string;
}

function isCallableSymbol(symbol: vscode.DocumentSymbol): boolean {
	return symbol.kind === vscode.SymbolKind.Function
		|| symbol.kind === vscode.SymbolKind.Method
		|| symbol.kind === vscode.SymbolKind.Constructor;
}

function findSymbolByName(symbols: vscode.DocumentSymbol[], functionName: string): vscode.DocumentSymbol | null {
	const matched = symbols.filter(symbol => isCallableSymbol(symbol) && symbol.name === functionName);
	if (matched.length === 0) {
		return null;
	}
	return matched[0];
}

function getAvailableCallableNames(symbols: vscode.DocumentSymbol[]): string[] {
	return Array.from(new Set(
		symbols
			.filter(isCallableSymbol)
			.map(symbol => symbol.name)
	)).sort((left, right) => left.localeCompare(right));
}

function findSymbolByPosition(
	symbols: vscode.DocumentSymbol[],
	position: vscode.Position
): vscode.DocumentSymbol | null {
	const matched = symbols
		.filter(symbol => isCallableSymbol(symbol) && symbol.range.contains(position))
		.sort((left, right) => {
			const leftSpan = left.range.end.line - left.range.start.line;
			const rightSpan = right.range.end.line - right.range.start.line;
			return leftSpan - rightSpan;
		});

	return matched[0] ?? null;
}

async function resolveDocument(options?: GenerateUnitTestCommandOptions): Promise<vscode.TextDocument | null> {
	if (options?.filePath) {
		const document = await vscode.workspace.openTextDocument(options.filePath);
		await vscode.window.showTextDocument(document, {
			preview: true,
			preserveFocus: true
		});
		return document;
	}

	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return null;
	}

	return editor.document;
}

async function resolveTargetSymbol(
	document: vscode.TextDocument,
	options: GenerateUnitTestCommandOptions | undefined,
	symbols: vscode.DocumentSymbol[]
): Promise<vscode.DocumentSymbol | null> {
	if (options?.functionName) {
		return findSymbolByName(symbols, options.functionName);
	}

	let position: vscode.Position | null = null;
	if (options?.line !== undefined) {
		const zeroBasedLine = Math.max(0, options.line - 1);
		const zeroBasedCharacter = Math.max(0, options.character ?? 0);
		position = new vscode.Position(zeroBasedLine, zeroBasedCharacter);
	} else if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
		position = vscode.window.activeTextEditor.selection.active;
	}

	if (!position) {
		return null;
	}

	return findSymbolByPosition(symbols, position);
}

function showError(message: string, silent = false): void {
	if (!silent) {
		vscode.window.showErrorMessage(message);
	}
	console.error(message);
}

function showInfo(message: string, silent = false): void {
	if (!silent) {
		vscode.window.showInformationMessage(message);
	}
	console.log(message);
}

function getOutputFolder(workspace: string): string {
	const configuredSavePath = getConfigInstance().savePath;
	return path.isAbsolute(configuredSavePath)
		? configuredSavePath
		: path.join(workspace, configuredSavePath);
}

export async function runGenerateUnitTestCommand(
	options?: GenerateUnitTestCommandOptions
): Promise<GenerateUnitTestCommandResult | null> {
	const showGeneratedCode = options?.showGeneratedCode ?? true;
	const silent = options?.silent ?? false;
	const document = await resolveDocument(options);

	if (!document) {
		showError('Please open a file and select a function to generate unit test.', silent);
		return null;
	}

	const symbols = await getAllSymbols(document.uri);
	if (!symbols || symbols.length === 0) {
		showError('No symbols found! - It seems language server is not running.', silent);
		return null;
	}

	const functionSymbol = await resolveTargetSymbol(document, options, symbols);
	if (!functionSymbol) {
		const targetDescriptor = options?.functionName
			? `function "${options.functionName}"`
			: options?.line !== undefined
				? `line ${options.line}`
				: 'current selection';
		const availableNames = getAvailableCallableNames(symbols);
		const availableMessage = availableNames.length > 0
			? ` Available callables: ${availableNames.join(', ')}.`
			: '';
		showError(`No target function found for ${targetDescriptor}.${availableMessage}`, silent);
		return null;
	}

	const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspace) {
		showError('No workspace folder found. Please open the project folder in VS Code.', silent);
		return null;
	}

	getConfigInstance().updateConfig({
		workspace
	});

	const outputFolder = getOutputFolder(workspace);
	const fullFileName = generateFileNameForDiffLanguage(
		document,
		functionSymbol,
		outputFolder,
		document.languageId,
		[],
		0
	);

	try {
		const finalCode = await generateUnitTestForAFunction(
			workspace,
			document,
			functionSymbol,
			fullFileName,
			showGeneratedCode
		);

		if (!finalCode) {
			showError('Failed to generate unit test!', silent);
			return null;
		}

		let savedFilePath: string | undefined;
		if (showGeneratedCode) {
			const fileName = getFileName(fullFileName);
			showDiffAndAllowSelection(finalCode, document.languageId, fileName);
		} else {
			savedFilePath = await saveCode(
				finalCode,
				path.dirname(fullFileName),
				path.basename(fullFileName)
			);
		}

		showInfo('Unit test generated successfully!', silent);
		return {
			finalCode,
			fullFileName,
			savedFilePath,
			functionName: functionSymbol.name,
			sourceFilePath: document.uri.fsPath
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		showError(`Failed to generate unit test: ${errorMessage}`, silent);
		return null;
	}
}
