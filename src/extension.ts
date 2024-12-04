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

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

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

		// 获取光标位置
		const position = editor.selection.active;

		// 调用内置 LSP 客户端，获取光标下的定义
		const definitions = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
			'vscode.executeDefinitionProvider',
			editor.document.uri,
			position
		);

		if (!definitions || definitions.length === 0) {
			vscode.window.showErrorMessage('No function definition found!');
			return;
		}
		if (definitions.length > 1) {
			vscode.window.showErrorMessage('Multiple function definitions found!');
			return;
		}
		assert(definitions.length === 1);

		const a = definitions[0];

		var functionNameRange = null;
		if ((definitions[0] as vscode.Location).range !== undefined) {
			functionNameRange = (definitions[0] as vscode.Location).range;
		} else if ((definitions[0] as vscode.LocationLink).targetRange !== undefined) {
			functionNameRange = (definitions[0] as vscode.LocationLink).targetSelectionRange;
		} else {
			vscode.window.showErrorMessage('No function range found!');
			return;
		}

		// 获取函数签名等信息
		const functionName = editor.document.getText(functionNameRange);
		const functionSymbol = getFunctionSymbol(symbols, position)!;

		if (!functionSymbol) {
			vscode.window.showErrorMessage('No function symbol found!');
			return;
		}
		if (!isFunctionSymbol(functionSymbol)) {
			vscode.window.showErrorMessage(functionSymbol + 'is not a function symbol!');
			return;
		}
		assert(functionSymbol.name === functionName);


		console.log('Function Symbol:', functionSymbol);

		// 获取该函数内所有变量的use-def信息
		const [useMap, defMap] = await getUseDefInfo(editor.document, functionSymbol);
		const parameters = findParametersOfFunction(defMap);

		console.log('Function definition:', functionSymbol.detail);
		console.log('Function Parfameters:', parameters);

		// 使用 LLM 生成单元测试
		const testCode = await generateTestCode(editor, functionSymbol, languageId);

		// 弹出窗口显示生成的单元测试代码
		const testDocument = await vscode.workspace.openTextDocument({ content: testCode, language: languageId });
		await vscode.window.showTextDocument(testDocument);

		vscode.window.showInformationMessage(`Unit test for "${functionName}" generated!`);
	});

	context.subscriptions.push(disposable2);
}


type UseMap = Map<vscode.DocumentSymbol, Array<vscode.Location>>;
type DefMap = Map<vscode.DocumentSymbol, vscode.Location | null>;

// return the use-def information of every variable in the function
async function getUseDefInfo(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol): Promise<[UseMap, DefMap]> {
	const useMap = new Map<vscode.DocumentSymbol, Array<vscode.Location>>();
	const defMap = new Map<vscode.DocumentSymbol, vscode.Location | null>();


	for (const child of functionSymbol.children) {
		console.log('Child kind:', child.kind);
		if (child.kind === vscode.SymbolKind.Variable) {
			console.log('Function: ', functionSymbol.name, 'Variable: ', child.name);

			const childPosition = new vscode.Position(child.range.start.line, child.range.start.character);
			const references = await vscode.commands.executeCommand<vscode.Location[]>(
				'vscode.executeReferenceProvider',
				document.uri,
				childPosition
			);
			if (references) {
				useMap.set(child, references);
			} else {
				useMap.set(child, []);
			}

			const definition = await vscode.commands.executeCommand<vscode.Location>(
				'vscode.executeDefinitionProvider',
				document.uri,
				childPosition
			);
			if (definition) {
				defMap.set(child, definition);
			} else {
				defMap.set(child, null);
			}
		}
	}
	return [useMap, defMap];
}

function getFunctionSymbol(symbols: vscode.DocumentSymbol[], functionPosition: vscode.Position): vscode.DocumentSymbol | null {
	for (const symbol of symbols) {
		if (symbol.range.contains(functionPosition)) {
			return symbol;
		}
	}
	return null;
}

function isFunctionSymbol(symbol: vscode.DocumentSymbol): boolean {
	return symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method;
}

function findParametersOfFunction(defMap: DefMap): Array<vscode.DocumentSymbol> {
	const parameters: Array<vscode.DocumentSymbol> = [];
	for (const [symbol, definition] of defMap) {
		if (definition === null) {
			parameters.push(symbol);
		}
	}
	return parameters;
}

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
	const response2 = await axios.get('https://www.google.com');
	console.log(response2.data);

	console.log('1');
	const llm = new ChatOpenAI(
		{
			model: "gpt-4o",
			apiKey: "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"
		}
	);
	console.log('2');
	const chain = prompt.pipe(llm);
	console.log('3');
	// try {
	// 	const client = new OpenAI({
	// 		apiKey: "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",
	// 		httpAgent: new HttpsProxyAgent(proxy),
	// 	});
	// 	const b = await client.chat.completions.create({
	// 		messages: [{ role: 'user', content: 'Say this is a test' }],
	// 		model: 'gpt-4o',
	// 	});
	// 	console.log(b);

	// 	const a = await llm.invoke("hello");
	// 	console.log(a);
	// }
	// catch (e) {
	// 	console.log(e);
	// }
	// console.log(3.5);
	try {
		const response = await chain.invoke({ language: languageId, code: textCode, functionName: functionSymbol.name }); console.log('4');
		const result = response.content;
		// console.log('Generated test code:', result);
		return result as string;
	} catch (e) {
		console.log(e);
		return "!!";
	}

}
// This method is called when your extension is deactivated
export function deactivate() { }
