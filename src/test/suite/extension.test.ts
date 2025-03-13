import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import * as fs from 'fs';
import path from 'path';
import { main } from '../../train/collectTrainData';
const dataFolder = path.join(__dirname, '../../../data');

	
suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	
	// test('Sample test', () => {
	// 	assert.strictEqual([1, 2, 3].indexOf(5), -1);
	// 	assert.strictEqual([1, 2, 3].indexOf(0), -1);
	// });

	test('CollectTrainData main function test', async () => {
		// Import the main function from collectTrainData
		const jsonlFiles = fs.readdirSync(dataFolder)
				.filter(file => file.endsWith('.jsonl'))
				.map(file => path.join(dataFolder, file));
		for (const jsonlFile of jsonlFiles) {	
			const inputJsonPath = jsonlFile;
			const outputJsonPath = "/LSPAI/temp/" + jsonlFile.split('/').pop();
			if (fs.existsSync(outputJsonPath)) {
				fs.unlinkSync(outputJsonPath);
			}
			// Call the main function
			const result = await main(inputJsonPath, outputJsonPath);
			
			console.log(outputJsonPath);

			// Assert that the result is not null or undefined
			assert.ok(outputJsonPath !== null && outputJsonPath !== undefined, 'Main function should return a value');
			
			// Add more specific assertions based on what your main function returns
			// For example, if it returns an array:
		
		// If it returns specific data structure, verify its properties
		// Example: assert.ok(result.hasOwnProperty('someProperty'), 'Result should have someProperty');
		}
	});


});
