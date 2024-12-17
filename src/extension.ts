// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { getDecodedTokens, DecodedToken, getSourceFromDefinition } from './token';
import { invokeLLM, genPrompt, isBaseline } from './generate';
import { getFunctionSymbol, isValidFunctionSymbol, isFunctionSymbol, getFunctionSymbolWithItsParents, getSymbolDetail } from './utils';
import { classifyTokenByUri, processAndGenerateHierarchy, summarizeClass } from './retrieve';
import * as fs from 'fs';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
const TEST_PATH = "/vscode-llm-ut/experiments/commons-cli/results/";
const SRC = '/vscode-llm-ut/experiments/commons-cli/src/main/';
const MODEL = "llama3-70b" // gpt-4o-mini"; // llama3-70b
const GENMETHODS = [`naive_${MODEL}`, MODEL];

export function activate(context: vscode.ExtensionContext) {
	let config = vscode.workspace.getConfiguration();
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "llm-lsp-ut" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('llm-lsp-ut.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		experiment_java()
		vscode.window.showInformationMessage('Hello World from llm-lsp-ut!');
	});

	context.subscriptions.push(disposable);

	console.log("!!", vscode.commands.getCommands());


	const disposable2 = vscode.commands.registerCommand('extension.generateUnitTest', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor!');
			return;
		}

		const testCode = await generateUnitTestForSelectedRange(editor);

		// // 弹出窗口显示生成的单元测试代码
		// const testDocument = await vscode.workspace.openTextDocument({ content: testCode, language: languageId });
		// await vscode.window.showTextDocument(testDocument);

		// vscode.window.showInformationMessage(`Unit test for "${functionName}" generated!`);
	});

	context.subscriptions.push(disposable2);
}



async function experiment_java() : Promise<any> {

	function findJavaFiles(folderPath: string, javaFiles: string[] = []) {
		fs.readdirSync(folderPath).forEach(file => {
			const fullPath = path.join(folderPath, file);
			if (fs.statSync(fullPath).isDirectory()) {
				findJavaFiles(fullPath, javaFiles); // Recursively search in subdirectory
			} else if (file.endsWith('.java')) {
				javaFiles.push(fullPath);
			}
		});
	}
	const javaFiles: string[] = [];
	findJavaFiles(SRC, javaFiles);

	for (const filePath of javaFiles) {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
		const symbols = await getAllSymbols(document.uri);
		for (const symbol of symbols) {
			if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
				const curDocument = await vscode.workspace.openTextDocument(document.uri);
				const editor = await vscode.window.showTextDocument(curDocument);
				for (const method of GENMETHODS){
					const folderPath = `${TEST_PATH}${method}`;
					const fileName = getUniqueFileName(folderPath, `${symbol.name}Test.java`);
					const testCode = await generateUnitTestForAFunction(editor, symbol, fileName, method);
					if (testCode) {
						await saveGeneratedCodeToFolder(testCode, folderPath, fileName);
					}
				}
			}
		}
	}
}

async function getAllSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
	const allSymbols: vscode.DocumentSymbol[] = [];
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
		'vscode.executeDocumentSymbolProvider',
		uri
	);

	function collectSymbols(symbols: vscode.DocumentSymbol[]) {
		for (const symbol of symbols) {
			allSymbols.push(symbol);
			if (symbol.children.length > 0) {
				collectSymbols(symbol.children);
			}
		}
	}

	if (symbols) {
		collectSymbols(symbols);
	}

	return allSymbols;
}
async function saveGeneratedCodeToFolder(code: string, folderPath: string, fileName: string): Promise<void> {
	// Ensure the fileName contains only word characters and numbers

	const uri = vscode.Uri.file(`${folderPath}/${fileName}`);
	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.createFile(uri, { overwrite: false });

	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}

	await vscode.workspace.applyEdit(workspaceEdit);
	const document = await vscode.workspace.openTextDocument(uri);
	const edit = new vscode.WorkspaceEdit();
	edit.insert(uri, new vscode.Position(0, 0), code);
	await vscode.workspace.applyEdit(edit);
	await vscode.window.showTextDocument(document);
	const result = await document.save();
	if (!result) {
		vscode.window.showErrorMessage(`Failed to save generated code to ${uri.fsPath}! `);
	} else {
		vscode.window.showInformationMessage(`Generated code saved to ${uri.fsPath}`);
	}
}

function getUniqueFileName(folderPath: string, fileName: string): string {
	let counter = 1;
	let newFileName = fileName.replace(/(\.\w+)$/, `_${counter}$1`);
	while (fs.existsSync(`${folderPath}/${newFileName}`)) {
		newFileName = fileName.replace(/(\.\w+)$/, `_${counter}$1`);
		counter++;
	}
	newFileName = newFileName.replace(/[^\w\d.]/g, '');
	return newFileName;
}

// async function getSummarizedContext(editor: vscode.TextEditor, functionSymbol: vscode.Position): Promise<string> {
// 	let res = "";
// 	const importStatements = getImportStatement(editor);
// 	const allSymbols = 
// 	// Get variables, classes, ... in the context of the function
// 	// Get all import libraries
// 	// From this file, get all the used varaiables, classes, ...
// 	return res;

// }



async function generateUnitTestForAFunction(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol, fileName: string, method: string): Promise<string | null> {
	
	// 获取当前使用的编程语言
	const languageId = editor.document.languageId;
	console.log('Language ID:', languageId);
	let DefUseMap: DecodedToken[] = [];
	if (!isBaseline(method)) {
		console.log('Inspecting all linked usages of inner symbols under function:', functionSymbol.name);
		DefUseMap = await extractUseDefInfo(editor, functionSymbol);
		console.log("DefUse Map length:", DefUseMap.length);
	} else {
		console.log("Baseline method");
	}
	let functionName: string | null = null;
	if (!functionSymbol || !isFunctionSymbol(functionSymbol)) {
		vscode.window.showErrorMessage('No valid function symbol found!');
		// functionName = await getFunctionNameWithLSP(editor, position);
	}

	functionName = functionSymbol.name;
	console.log('Function Symbol:', functionSymbol);
	console.log('Function definition:', functionSymbol.detail);

	if (!isValidFunctionSymbol(functionSymbol)) {
		return null;
	};

	// 使用 LLM 生成单元测试
	const promptObj = await genPrompt(editor, functionSymbol, DefUseMap, languageId, fileName, method);
	const testCode = await invokeLLM(method, promptObj);

	return testCode;
}

async function generateUnitTestForSelectedRange(editor: vscode.TextEditor): Promise<string | null> {

		// 获取符号信息
		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			editor.document.uri
		);

		if (!symbols) {
			vscode.window.showErrorMessage('No symbols found!');
			return null;
		}

		// const allUseMap = new Map<String, Array<vscode.Location>>();
		// 获取光标位置
		const position = editor.selection.active;
		const functionSymbolWithParents = getFunctionSymbolWithItsParents(symbols, position)!;
		let targetCodeContextString = "";
		if (functionSymbolWithParents.length > 0) {
			const summarizedClass = await summarizeClass(editor.document, functionSymbolWithParents[0]);
			const parent = getSymbolDetail(editor.document, functionSymbolWithParents[0]);
			const children = functionSymbolWithParents.slice(1).map(symbol => getSymbolDetail(editor.document, symbol)).join(' ');
			targetCodeContextString = `${parent} { ${children} }`;
			console.log(targetCodeContextString);
		}

	
		const parHoverInfo = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', editor.document.uri, functionSymbolWithParents[0].range.start);

		const functionSymbol = getFunctionSymbol(symbols, position)!;


		const fileName = getUniqueFileName(TEST_PATH, `${functionSymbol.name}Test.java`);
		const testCode = await generateUnitTestForAFunction(editor, functionSymbol, fileName, GENMETHODS[1]);
		if (!testCode) {
			vscode.window.showErrorMessage('Failed to generate unit test!');
			return null;
		}
		return testCode;
}

async function extractUseDefInfo(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol): Promise<DecodedToken[]>  {

	const decodedTokens = await getDecodedTokens(editor, functionSymbol);

	if (decodedTokens) {
		for (const token of decodedTokens) {
			const startPos = new vscode.Position(token.line, token.startChar);
			const endPos = new vscode.Position(token.line, token.startChar + token.length);
			const range = new vscode.Range(startPos, endPos);
			const word = editor.document.getText(range);
			const definition = await vscode.commands.executeCommand<Array<vscode.Location>>(
				'vscode.executeDefinitionProvider',
				editor.document.uri,
				startPos
			);
			token.word = word;
			token.definition = definition;
			console.log('Decoded token:', token);
		}
	}
	return decodedTokens;
}


// This method is called when your extension is deactivated
export function deactivate() { }
