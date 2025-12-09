import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeFocalMethod } from '../../../ut_runner/analysis/mut_analyzer';
import { getAllSymbols } from '../../../lsp/symbol';
import { getConfigInstance } from '../../../config';

suite('MUT Analyzer Test Suite', () => {
    
    const currentConfig = {
        workspace: "/LSPRAG/src/test/fixtures/python"
    }
    getConfigInstance().updateConfig({...currentConfig});
    test('analyzeFocalMethod - Python function', async function() {
        const testUri = "/LSPRAG/src/test/fixtures/python/calculator.py"
        const tempUri = vscode.Uri.file(testUri);

        const document = await vscode.workspace.openTextDocument(tempUri);
        
        // Get symbols
        const symbols = await getAllSymbols(tempUri);
        const functionSymbol = symbols.find(s => s.name === 'compute');
        
        assert.ok(functionSymbol, 'Function symbol should be found');
        
        // Analyze the function
        const result = await analyzeFocalMethod(document, functionSymbol!, 'python');
        
        // Verify results
        assert.ok(result.totalTokens > 0, 'Should have tokens');
        assert.ok(result.comments > 0, 'Should have comments');
        assert.ok(result.uniquePaths > 0, 'Should have at least one path');
        
        console.log('Analysis Result:', result);

    });
    
});

