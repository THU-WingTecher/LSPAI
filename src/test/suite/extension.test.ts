import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import * as fs from 'fs';
import path from 'path';
import { activate } from '../../lsp';
import { getDocUri } from '../../lsp';
import { generateUnitTestForAFunction } from '../../generate';
const dataFolder = path.join(__dirname, '../../../data');

	
suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	// test("Generate Unit Test", async () => {
	// 	const result = await generateUnitTestForAFunction("test.py", "test", "test", "test", "test", "test", "test", "test", "test");
	// 	console.log("result", result);
	// });
	// test('Check Language Server - Python', async () => {
    //     const result = await checkLS('test.py');
	// 	assert.strictEqual(result && result.length !== 0, true, 'Language server should return symbols');
    // });
	
	// test('Check Language Server - Java', async () => {
	// 	const result = await checkLS('Test.java');
	// 	assert.strictEqual(result && result.length !== 0, true, 'Language server should return symbols');
	// });

	// test('Check Language Server - Go', async () => {
	// 	const result = await checkLS('test.go');
	// 	assert.strictEqual(result && result.length !== 0, true, 'Language server should return symbols');
	// });

	// test('Check Language Server - TypeScript', async () => {
	// 	const result = await checkLS('test.ts');
	// 	console.log('result', result);
	// 	assert.strictEqual(result && result.length !== 0, true, 'Language server should return symbols');
	// });

});

async function checkLS(filename: string): Promise<vscode.DocumentSymbol[] | undefined> {
    const uri = getDocUri(filename);
    await activate(uri);
    // const document = await vscode.workspace.openTextDocument(uri);
	// console.log("all", vscode.extensions.all.map(e => e.id))
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
		'vscode.executeDocumentSymbolProvider',
		uri
	);
	// console.log("symbols", symbols);
	return symbols;
    // const pythonExt = vscode.extensions.getExtension('ms-python.python');

    // if (!pythonExt) {
    //     console.error('Python extension is not installed.');
    //     vscode.window.showErrorMessage("Python extension (ms-python.python) is missing.");
    //     return;
    // }

    // if (!pythonExt.isActive) {
    //     await pythonExt.activate();
    // }

    // const api = pythonExt.exports;

    // if (api.getDocumentSymbols) {  // Ensure the API has this method
    //     return api.getDocumentSymbols(uri);
    // } else {
    //     console.error('getDocumentSymbols API not found in ms-python.python');
    //     vscode.window.showErrorMessage("The Python extension does not provide the required API.");
    // }
	return 	;
}
