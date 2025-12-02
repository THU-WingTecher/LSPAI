import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import * as fs from 'fs';
import { getDiagnosticsForFilePath } from '../../../lsp/diagnostic';
import { randomlySelectOneFileFromWorkspace, setWorkspaceFolders, updateWorkspaceFolders, genPythonicSrcImportStatement } from '../../../helper';
import { loadAllTargetSymbolsFromWorkspace } from "../../../lsp/symbol";
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../../config';
import { VscodeRequestManager } from '../../../lsp/vscodeRequestManager';
import { isTestFile } from '../../../lsp/reference';

export interface SymbolRobustnessResult {
    symbolName: string;
    totalReferences: number;
    testReferences: number;
    robustnessScore: number;
    sourceCode: string;
    importString: string;
    lineNum: number;
    relativeDocumentPath: string;
}

// comment, number of cross-file dependencies, number of unique CFG   

export async function measureSymbolRobustness(
    symbol: vscode.DocumentSymbol, 
    document: vscode.TextDocument,
    workspacePath: string
): Promise<SymbolRobustnessResult> {
    // Use the symbol's selection range start position to find references
    const position = symbol.selectionRange.start;
    
    // 1. Load all references to the symbol
    const references = await VscodeRequestManager.references(document.uri, position);
    
    // 2. Count total references
    const totalReferences = references.length;
    
    // 3. Filter and count references from test files
    let testReferences = 0;
    for (const ref of references) {
        const refDocument = await vscode.workspace.openTextDocument(ref.uri);
        if (isTestFile(ref.uri, refDocument)) {
            testReferences++;
        }
    }
    
    // Calculate robustness score (ratio of test references to total references)
    const robustnessScore = totalReferences > 0 ? testReferences * 10 + totalReferences : 0;
    
    // Get additional symbol information
    const sourceCode = document.getText(symbol.range);
    let importString = "";
    if (document.languageId === "python") {
        importString = genPythonicSrcImportStatement(document.getText());
    }
    const lineNum = symbol.range.end.line - symbol.range.start.line;
    const relativeDocumentPath = path.relative(workspacePath, document.uri.fsPath);
    
    // Output the results
    console.log(`Symbol: ${symbol.name}`);
    console.log(`Total References: ${totalReferences}`);
    console.log(`Reference uri: ${references.map(r => r.uri.fsPath)}`);
    console.log(`Test References: ${testReferences}`);
    console.log(`Robustness Score: ${robustnessScore.toFixed(2)}`);
    
    return {
        symbolName: symbol.name,
        totalReferences,
        testReferences,
        robustnessScore,
        sourceCode,
        importString,
        lineNum,
        relativeDocumentPath
    };
}



suite('Experiment Test Suite', () => {
    const pythonInterpreterPath = "/root/miniconda3/envs/black/bin/python";
    const blackImportTestPath = "/LSPRAG/src/test/resources/black_module_import_test.py";
    const projectPath = "/LSPRAG/experiments/projects/tornado";
    const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src"), path.join(projectPath, "tests")];
    const languageId = "python";
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
    };
    // let testFilesPath = "/LSPRAG/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

    test('Setup workspace folders', async () => {
        const workspaceFolders = setWorkspaceFolders(projectPath);
        await updateWorkspaceFolders(workspaceFolders);
        console.log('Workspace folders updated to:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
        assert.ok(vscode.workspace.workspaceFolders, 'Workspace folders should be set');
        assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, projectPath, 'Workspace folder should match project path');
    });

    test('Language server recognizes installed environment libraries', async () => {
        // Set the desired Python interpreter path (update as needed)

        // Activate the Python extension and log the interpreter in use
        console.log('Python interpreter used by extension:', await getPythonInterpreterPath());

        // Open the test file and collect diagnostics
        const fileUri = vscode.Uri.file(blackImportTestPath);
        await vscode.workspace.openTextDocument(fileUri);
        await setPythonExtraPaths([]);
        const oldPythonExtraPaths = await getPythonExtraPaths();
        console.log('oldPythonExtraPaths:', oldPythonExtraPaths);
        
        // Wait for LSP server to process the configuration change and re-analyze
        console.log('Waiting for LSP server to re-analyze with empty paths...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second wait
        
        const oldDiagnostics = await getDiagnosticsForFilePath(blackImportTestPath);
        const oldImportErrors = oldDiagnostics.filter(d =>
            d.message.includes('No module named') ||
            d.message.includes('unresolved import') ||
            d.message.includes('not found') ||
            d.message.includes('Import')
        );  
        assert.ok(oldImportErrors.length > 0, 'should have import errors');
        await setPythonExtraPaths(blackModuleImportPath);
        const currentPythonExtraPaths = await getPythonExtraPaths();
        console.log('currentPythonExtraPaths:', currentPythonExtraPaths);
        assert.ok(currentPythonExtraPaths.length === blackModuleImportPath.length, 'python extra paths should be set as expected');
        assert.ok(currentPythonExtraPaths.every((path, index) => path === blackModuleImportPath[index]), 'python extra paths should be set as expected');
        
        // Wait for LSP server to process the configuration change and re-analyze
        console.log('Waiting for LSP server to re-analyze with correct paths...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second wait
        
        // Log diagnostics for debugging
        const newDiagnostics = await getDiagnosticsForFilePath(blackImportTestPath);
        console.log('newDiagnostics:', newDiagnostics);

        // Assert: No diagnostic about missing pandas or import errors
        const importErrors = newDiagnostics.filter(d =>
            d.message.includes('No module named') ||
            d.message.includes('unresolved import') ||
            d.message.includes('not found') ||
            d.message.includes('Import')
        );
        assert.strictEqual(importErrors.length, 0, 'Should not report missing pandas or import errors');
    });

    test('measureSymbolRobustness', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        
        // Load symbols from workspace
        const testSymbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);
        assert.ok(testSymbols.length > 0, 'Should have at least one symbol');
        
        // Collect all robustness results
        const results: SymbolRobustnessResult[] = [];
        for (const { symbol, document } of testSymbols) {
            console.log(`\n#### Testing symbol: ${symbol.name} from ${document.uri.fsPath}`);
            const result = await measureSymbolRobustness(symbol, document, projectPath);
            results.push(result);
        }
        
        // Sort by robustness score (descending - highest first)
        results.sort((a, b) => b.robustnessScore - a.robustnessScore);
        
        // Display sorted results
        console.log(`\n#### ========== SORTED RESULTS (by robustness score) ==========`);
        for (const result of results) {
            console.log(`Symbol: ${result.symbolName.padEnd(40)} | Total Refs: ${String(result.totalReferences).padStart(4)} | Test Refs: ${String(result.testReferences).padStart(4)} | Score: ${result.robustnessScore.toFixed(2)}`);
        }
        
        // Export results to JSON file
        const outputPath = path.join(projectPath, 'symbol_robustness_results.json');
        const jsonContent = JSON.stringify(results, null, 2);
        fs.writeFileSync(outputPath, jsonContent, 'utf-8');
        console.log(`\n#### Results exported to: ${outputPath}`);
    });
}); 