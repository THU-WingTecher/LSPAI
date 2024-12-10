// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { assert } from 'console';
import * as vscode from 'vscode';

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAI } from "openai";

import axios from 'axios';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getDecodedTokens } from './token';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
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

		// 获取当前使用的编程语言
		const languageId = editor.document.languageId;
		console.log('Language ID:', languageId);

		// 获取符号信息
		const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			editor.document.uri
		);

		if (!symbols) {
			vscode.window.showErrorMessage('No symbols found!');
			return;
		}

		const allUseMap = new Map<String, Array<vscode.Location>>();
		// 获取光标位置
		const position = editor.selection.active;
		const functionSymbol = getFunctionSymbol(symbols, position)!;
		const allDefMap = new Map<string, vscode.Location | null>();
		console.log('Inspecting all linked usages of inner symbols under function:', functionSymbol.name);
		await extractUseDefInfo(editor, functionSymbol, allDefMap);

		// Debug collected allDefMap
		for (const [word, location] of allDefMap) {
			if (location) {
				const sourceCode = await getSourceCodeFromProvidedDefinition({ range: location.range, uri: location.uri });
				console.log(`Source code for ${word} at ${location.uri.toString()}:`, sourceCode);
			}
		}


		let functionName: string | null = null;
		if (!functionSymbol || !isFunctionSymbol(functionSymbol)) {
			vscode.window.showErrorMessage('No valid function symbol found!');
			// functionName = await getFunctionNameWithLSP(editor, position);
		}
		// 	functionName = functionSymbol.name;
		// }
		// if (!functionName) {
		// 	return;
		// }
		functionName = functionSymbol.name;
		console.log('Function Symbol:', functionSymbol);

		// 获取该函数内所有变量的use-def信息
		// const [useMap, defMap] = await getUseDefInfo(editor.document, functionSymbol);
		// const parameters = findParametersOfFunction(defMap);
		// console.log('Function Parfameters:', parameters);

		console.log('Function definition:', functionSymbol.detail);


		if (!isValidFunctionSymbol(functionSymbol)) {
			return;
		};

		// 使用 LLM 生成单元测试
		const testCode = await generateTestCode(editor, functionSymbol, languageId);

		// // 弹出窗口显示生成的单元测试代码
		// const testDocument = await vscode.workspace.openTextDocument({ content: testCode, language: languageId });
		// await vscode.window.showTextDocument(testDocument);

		// vscode.window.showInformationMessage(`Unit test for "${functionName}" generated!`);
	});

	context.subscriptions.push(disposable2);
}

async function extractUseDefInfo(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol, allDefMap: Map<string, vscode.Location | null>) {
	// const alltokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
	// 	'vscode.provideDocumentSemanticTokens',
	// 	editor.document.uri,
	// );
	const decodedTokens = getDecodedTokens(editor, functionSymbol);

	// if (decodedTokens) {
		
	// 	for (let i = 0; i < tokens.data.length; i ++) {
	// 		const start = tokens.data[i];
	// 		const length = tokens.data[i + 1];
	// 		const tokenType = tokens.data[i + 2];
	// 		const range = new vscode.Range(
	// 			editor.document.positionAt(start),
	// 			editor.document.positionAt(start + length)
	// 		);
	// 		const word = editor.document.getText(range);
	// 		const position = new vscode.Position(range.start.line, range.start.character);
	// 		const definition = await vscode.commands.executeCommand<Array<vscode.Location>>(
	// 			'vscode.executeDefinitionProvider',
	// 			editor.document.uri,
	// 			position
	// 		);

	// 		if (definition && definition.length > 0) {
	// 			allDefMap.set(word, definition[0] || null);
	// 		}
	// 	}
	// }

	for (let start = functionSymbol.range.start.line; start <= functionSymbol.range.end.line; start++) { // enumerate each line
		let startChar = 0;
		while (startChar < editor.document.lineAt(start).text.length) { //enumerate each colum
			const lineText = editor.document.lineAt(start).text;
			let length = 0;
			let prev_defined: vscode.Location[] = [];
			let lastRange: vscode.Range | null = null;
			while (startChar + length <= lineText.length) {
				const end = startChar + length;
				const testrange = new vscode.Range(start, end, start, end + 0);
				const range = new vscode.Range(start, startChar, start, end);
				const position = new vscode.Position(testrange.start.line, testrange.start.character);
				const word = editor.document.getText(testrange);
				const definition = await vscode.commands.executeCommand<Array<vscode.Location>>(
					'vscode.executeDefinitionProvider',
					editor.document.uri,
					position
				);
				if (definition && definition.length === 0) {
					break;
				}
				if (definition && prev_defined.length > 0 && !prev_defined.some(def => def.range.isEqual(definition[0].range))) {
					break;
				}
				prev_defined = definition;
				lastRange = range;
				length++;
			}

			if (!prev_defined || prev_defined.length === 0) {
				startChar++;
				continue;
			}
			if (lastRange) {
				allDefMap.set(editor.document.getText(lastRange), prev_defined[0] || null);
				startChar = lastRange.end.character + 1;
			} else {
				startChar++;
			}
		}
	}
}

function isValidFunctionSymbol(functionSymbol: vscode.DocumentSymbol): boolean {
	if (!functionSymbol.name) {
		vscode.window.showErrorMessage('Function symbol has no name!');
		return false;
	}
	if (!functionSymbol.range) {
		vscode.window.showErrorMessage('Function symbol has no range!');
		return false;
	}
	return true;
}

async function getSourceCodeFromProvidedDefinition(value: { range: vscode.Range, uri: vscode.Uri }): Promise<string> {
	const document = await vscode.workspace.openTextDocument(value.uri);
	// 获取符号信息
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
		'vscode.executeDocumentSymbolProvider',
		value.uri
	);
	const symbol = getFunctionSymbol(symbols, value.range.start);
	if (!symbol) {
		return '';
	}
	return document.getText(symbol.range)
}

// type UseMap = Map<vscode.DocumentSymbol, Array<vscode.Location>>;
// type DefMap = Map<vscode.DocumentSymbol, vscode.Location | null>;

// return the use-def information of every variable in the function
// async function getUseDefInfo(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol): Promise<[UseMap, DefMap]> {
// 	const useMap = new Map<vscode.DocumentSymbol, Array<vscode.Location>>();
// 	const defMap = new Map<vscode.DocumentSymbol, vscode.Location | null>();


// 	for (const child of functionSymbol.children) {
// 		console.log('Child kind:', child.kind);
// 		if (child.kind === vscode.SymbolKind.Variable) {
// 			console.log('Function: ', functionSymbol.name, 'Variable: ', child.name);

// 			const childPosition = new vscode.Position(child.range.start.line, child.range.start.character);
// 			const references = await vscode.commands.executeCommand<vscode.Location[]>(
// 				'vscode.executeReferenceProvider',
// 				document.uri,
// 				childPosition
// 			);
// 			if (references) {
// 				useMap.set(child, references);
// 			} else {
// 				useMap.set(child, []);
// 			}

// 			const definition = await vscode.commands.executeCommand<vscode.Location>(
// 				'vscode.executeDefinitionProvider',
// 				document.uri,
// 				childPosition
// 			);
// 			if (definition) {
// 				defMap.set(child, definition);
// 			} else {
// 				defMap.set(child, null);
// 			}
// 		}
// 	}
// 	return [useMap, defMap];
// }

function getFunctionSymbol(symbols: vscode.DocumentSymbol[], functionPosition: vscode.Position): vscode.DocumentSymbol | null {
	for (const symbol of symbols) {
		if (symbol.children.length > 0) {
			const innerSymbol = getFunctionSymbol(symbol.children, functionPosition);
			if (innerSymbol) {
				return innerSymbol;
			}
		}
		if (symbol.range.contains(functionPosition)) {
			return symbol;
		}
	}
	return null;
}

async function getFunctionNameWithLSP(editor: vscode.TextEditor, position: vscode.Position): Promise<string | null> {
		// 调用内置 LSP 客户端，获取光标下的定义
		const definitions = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
			'vscode.executeDefinitionProvider',
			editor.document.uri,
			position
		);

		if (!definitions || definitions.length === 0) {
			vscode.window.showErrorMessage('No function definition found!');
			return null;
		}
		if (definitions.length > 1) {
			vscode.window.showErrorMessage('Multiple function definitions found!');
			return null;
		}
		assert(definitions.length === 1);

		var functionNameRange = null;
		if ((definitions[0] as vscode.Location).range !== undefined) {
			functionNameRange = (definitions[0] as vscode.Location).range;
		} else if ((definitions[0] as vscode.LocationLink).targetRange !== undefined) {
			functionNameRange = (definitions[0] as vscode.LocationLink).targetSelectionRange;
		} else {
			vscode.window.showErrorMessage('No function range found!');
			return null;
		}

		// 获取函数签名等信息
		return editor.document.getText(functionNameRange);
}

function isFunctionSymbol(symbol: vscode.DocumentSymbol): boolean {
	return symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method;
}

// function findParametersOfFunction(defMap: DefMap): Array<vscode.DocumentSymbol> {
// 	const parameters: Array<vscode.DocumentSymbol> = [];
// 	for (const [symbol, definition] of defMap) {
// 		if (definition === null) {
// 			parameters.push(symbol);
// 		}
// 	}
// 	return parameters;
// }

async function generateTestCode(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol, languageId: String): Promise<string> {
	// LLM生成单元测试代码

	const prompt = ChatPromptTemplate.fromTemplate(
		`
			Given the following {language} code:
			{code}
			
			Generate a unit test for the function "{functionName}" in {language}. 
			Make sure to follow best practices for writing unit tests. You should only generate the test code and neccessary code comment without any other word. You should not wrap the code in a markdown code block.
		`
	);

	const textCode = editor.document.getText(functionSymbol.range);
	const proxy = "http://166.111.83.92:12333";
	process.env.http_proxy = proxy;
	process.env.https_proxy = proxy;
	process.env.HTTP_PROXY = proxy;
	process.env.HTTPS_PROXY = proxy;
	process.env.OPENAI_PROXY_URL = proxy;
	// const response2 = await axios.get('https://www.google.com');
	// console.log(response2.data);

	console.log('1');
	const llm = new ChatOpenAI(
		{
			model: "gpt-4o-mini",
			apiKey: "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"
		}
	);
	console.log('2');
	const chain = prompt.pipe(llm);
	console.log('3');

	const promptContent = await prompt.format({ language: languageId, code: textCode, functionName: functionSymbol.name });
	console.log('Generated prompt:', promptContent);

	return "!!";
	// try {
	// 	const response = await chain.invoke({ language: languageId, code: textCode, functionName: functionSymbol.name }); 
	// 	console.log('4');
	// 	const result = response.content;
	// 	// console.log('Generated test code:', result);
	// 	return result as string;
	// } catch (e) {
	// 	console.log(e);
	// 	return "!!";
	// }

}
// This method is called when your extension is deactivated
export function deactivate() { }
