import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import * as fs from 'fs';
import { randomlySelectOneFileFromWorkspace, setWorkspaceFolders, updateWorkspaceFolders, genPythonicSrcImportStatement } from '../../../helper';
import { loadAllTargetSymbolsFromWorkspace } from "../../../lsp/symbol";
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath, setPythonAnalysisInclude, setPythonAnalysisExclude, setupPythonLSP, reloadJavaLanguageServer } from '../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType, LANGUAGE_IDS, getProjectLanguage, ProjectConfigName, getProjectSrcPath, getProjectWorkspace } from '../../../config';
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

function isInProjectPath(uri: vscode.Uri, projectPath: string): boolean {
    const refPath = uri.fsPath;
    const normalizedProjectPath = path.normalize(projectPath);
    const normalizedRefPath = path.normalize(refPath);
    return normalizedRefPath.startsWith(normalizedProjectPath);
}

export async function measureSymbolRobustness(
    symbol: vscode.DocumentSymbol, 
    document: vscode.TextDocument,
    workspacePath: string
): Promise<SymbolRobustnessResult> {
    // Use the symbol's selection range start position to find references
    const position = symbol.selectionRange.start;
    
    // 1. Load all references to the symbol
    const allReferences = await VscodeRequestManager.references(document.uri, position);
    
    // 2. Filter references to only include those within the project path
    const references = allReferences.filter(ref => isInProjectPath(ref.uri, workspacePath));
    
    // Log references outside project for debugging
    const outsideProject = allReferences.filter(ref => !isInProjectPath(ref.uri, workspacePath));
    if (outsideProject.length > 0) {
        console.log(`  Filtered out ${outsideProject.length} references outside project path:`);
        outsideProject.forEach(ref => console.log(`    - ${ref.uri.fsPath}`));
    }
    
    // 3. Count total references (only within project)
    const totalReferences = references.length;
    
    // 4. Filter and count references from test files
    let testReferences = 0;
    for (const ref of references) {
        const refDocument = await vscode.workspace.openTextDocument(ref.uri);
        if (isTestFile(ref.uri, refDocument)) {
            testReferences++;
        }
    }
    
    // 5. Calculate robustness score (ratio of test references to total references)
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
    const projectName = "commons-csv";
    
    const languageId = getProjectLanguage(projectName as ProjectConfigName);
    const projectPath = getProjectWorkspace(projectName as ProjectConfigName);
    const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src"), path.join(projectPath, "tests")];
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
        if (languageId === "python") {  
            await setupPythonLSP(blackModuleImportPath, pythonInterpreterPath);
        } else if (languageId === "java") {
            await reloadJavaLanguageServer();
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for Maven import to complete
        } else {
            throw new Error(`Unsupported language: ${languageId}`);
        }
        assert.ok(vscode.workspace.workspaceFolders, 'Workspace folders should be set');
        assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, projectPath, 'Workspace folder should match project path');
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