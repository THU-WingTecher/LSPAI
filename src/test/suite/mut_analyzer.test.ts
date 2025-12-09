import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeFocalMethod } from '../../ut_runner/analysis/mut_analyzer';
import { getAllSymbols } from '../../lsp/symbol';

suite('MUT Analyzer Test Suite', () => {
    
    test('analyzeFocalMethod - Python function', async function() {
        this.timeout(60000);
        
        // Sample Python code with a function
        const sampleCode = `
def calculate_sum(a, b):
    # This is a comment
    """
    Multi-line docstring
    """
    if a > 0:
        result = a + b
    else:
        result = b
    return result
`;
        
        // Create a temporary file
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
        const tempFile = path.join(workspaceRoot, 'temp_test.py');
        const tempUri = vscode.Uri.file(tempFile);
        
        try {
            // Write the test file
            await vscode.workspace.fs.writeFile(tempUri, Buffer.from(sampleCode, 'utf-8'));
            
            // Open the document
            const document = await vscode.workspace.openTextDocument(tempUri);
            
            // Get symbols
            const symbols = await getAllSymbols(tempUri);
            const functionSymbol = symbols.find(s => s.name === 'calculate_sum');
            
            assert.ok(functionSymbol, 'Function symbol should be found');
            
            // Analyze the function
            const result = await analyzeFocalMethod(document, functionSymbol!, 'python');
            
            // Verify results
            assert.ok(result.totalTokens > 0, 'Should have tokens');
            assert.ok(result.comments > 0, 'Should have comments');
            assert.ok(result.uniquePaths > 0, 'Should have at least one path');
            
            console.log('Analysis Result:', result);
            
        } finally {
            // Clean up
            try {
                await vscode.workspace.fs.delete(tempUri);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    });
    
    test('analyzeFocalMethod - Java function', async function() {
        this.timeout(60000);
        
        const sampleCode = `
public class Calculator {
    // Calculate sum
    public int calculateSum(int a, int b) {
        /* This is a multi-line
           comment */
        if (a > 0) {
            return a + b;
        } else {
            return b;
        }
    }
}
`;
        
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
        const tempFile = path.join(workspaceRoot, 'Calculator.java');
        const tempUri = vscode.Uri.file(tempFile);
        
        try {
            await vscode.workspace.fs.writeFile(tempUri, Buffer.from(sampleCode, 'utf-8'));
            const document = await vscode.workspace.openTextDocument(tempUri);
            
            const symbols = await getAllSymbols(tempUri);
            const functionSymbol = symbols.find(s => s.name === 'calculateSum');
            
            assert.ok(functionSymbol, 'Function symbol should be found');
            
            const result = await analyzeFocalMethod(document, functionSymbol!, 'java');
            
            assert.ok(result.totalTokens > 0, 'Should have tokens');
            assert.ok(result.comments > 0, 'Should have comments');
            assert.ok(result.uniquePaths > 0, 'Should have at least one path');
            
            console.log('Java Analysis Result:', result);
            
        } finally {
            try {
                await vscode.workspace.fs.delete(tempUri);
            } catch (e) {
                // Ignore
            }
        }
    });
});

