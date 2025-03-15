import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { ControlFlowAnalyzer } from '../../cfg';
import { activate, getDocUri } from '../../lsp';

suite('Control Flow Graph Analysis Test Suite', () => {
    let analyzer: ControlFlowAnalyzer;

    // test('Simple Sequential Statements - Python', async () => {
    //     const result = await analyzeCFGFromFile('cfg_test.py');
        
    //     // Verify nodes
    //     assert.strictEqual(result.nodes.length, 3, 'Should have 3 statement nodes');
        
    //     // Verify edges (sequential flow)
    //     assert.strictEqual(result.edges.length, 2, 'Should have 2 sequential edges');
    //     assert.strictEqual(result.edges[0].type, 'sequential');
    //     assert.strictEqual(result.edges[1].type, 'sequential');
        
    //     // Verify execution path
    //     assert.strictEqual(result.paths.length, 1, 'Should have 1 execution path');
    //     assert.strictEqual(result.paths[0].length, 3, 'Path should contain 3 nodes');
    // });

    // test('Loop Structure - Java', async () => {
    //     const result = await analyzeCFGFromFile('cfg_test.java');
        
    //     // Verify loop node
    //     const loopNode = result.nodes.find(n => n.type === 'loop');
    //     assert.ok(loopNode, 'Should have a loop node');
        
    //     // Verify loop edges
    //     const loopBackEdge = result.edges.find(e => e.type === 'loop-back');
    //     assert.ok(loopBackEdge, 'Should have a loop-back edge');
    // });
});


async function analyzeCFGFromFile(filename: string): Promise<{
    nodes: any[],
    edges: any[],
    paths: string[][]
}> {
    const uri = getDocUri(filename);
    await activate(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    
    const analyzer = new ControlFlowAnalyzer(document);
    const range = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );
    await analyzer.analyze(range);
    return analyzer.getCFG();
}
