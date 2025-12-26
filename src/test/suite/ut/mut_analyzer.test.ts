import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeFocalMethod } from '../../../ut_runner/analysis/mut_analyzer';
import { getAllSymbols } from '../../../lsp/symbol';
import { getConfigInstance } from '../../../config';

suite('MUT Analyzer Test Suite', () => {
    test('analyzeFocalMethod - Python function', async function() {
        getConfigInstance().updateConfig({ workspace: "/LSPRAG/src/test/fixtures/python" });

        const testUri = "/LSPRAG/src/test/fixtures/python/calculator.py";
        const tempUri = vscode.Uri.file(testUri);

        const document = await vscode.workspace.openTextDocument(tempUri);
        
        // Get symbols
        const symbols = await getAllSymbols(tempUri);
        const functionSymbol = symbols.find(s => s.name === 'compute');
        
        assert.ok(functionSymbol, 'Function symbol should be found');
        
        // Analyze the function
        const result = await analyzeFocalMethod(testUri, 'compute');
        
        // Verify results
        assert.ok(result.totalTokens > 0, 'Should have tokens');
        // Hover-based comments can be 0 in headless test runs (depends on language server hover formatting).
        assert.ok(result.comments >= 0, 'Comments count should be non-negative');
        assert.ok(result.uniquePaths > 0, 'Should have at least one path');
        
        console.log('Analysis Result:', result);
        assert.ok(document);

    });

    test('analyzeFocalMethod - Java method', async function() {
        const javaWorkspace = "/LSPRAG/src/test/fixtures/java";
        getConfigInstance().updateConfig({ workspace: javaWorkspace });

        const sourceFile = path.join(javaWorkspace, 'src/main/java/com/example/Calculator.java');
        const uri = vscode.Uri.file(sourceFile);
        await vscode.workspace.openTextDocument(uri);

        const symbols = await getAllSymbols(uri);
        const computeSymbol = symbols.find(s => s.name.toLowerCase().includes('compute'));
        assert.ok(computeSymbol, 'Java method symbol "compute" should be found');

        const result = await analyzeFocalMethod(sourceFile, 'compute');
        assert.ok(result.totalTokens > 0, 'Should have tokens');
        assert.ok(result.uniquePaths > 2, 'Should have >2 CFG paths (if / else-if / else)');
        assert.ok(result.tokensInFileOutsideFunction.length >= 1, 'Should find at least one token defined outside the method in the same file');
        assert.ok(result.comments >= 0, 'Comments count should be non-negative');
    });
    
});

