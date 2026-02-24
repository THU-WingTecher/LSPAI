import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import * as fs from 'fs';
import { randomlySelectOneFileFromWorkspace, setWorkspaceFolders, updateWorkspaceFolders, genPythonicSrcImportStatement } from '../../../helper';
import { loadAllTargetSymbolsFromWorkspace } from "../../../lsp/symbol";
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath, setPythonAnalysisInclude, setPythonAnalysisExclude, setupPythonLSP, reloadJavaLanguageServer } from '../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType, LANGUAGE_IDS, getProjectLanguage, ProjectConfigName, getProjectSrcPath, getProjectWorkspace, getProjectPythonExe, getProjectPythonPath } from '../../../config';
import { VscodeRequestManager } from '../../../lsp/vscodeRequestManager';
export interface SymbolRobustnessResult {
    symbolName: string;
    totalReferences: number;
    testReferences: number;
    robustnessScore: number;
    sourceCode: string;
    importString: string;
    lineNum: number;
    location: number;
    relativeDocumentPath: string;
}


// symbolname not found : "get_valid_history_without_current"
// file with "pacman", file with "pacman_not_found"

// comment, number of cross-file dependencies, number of unique CFG   
const importStringCache = new Map<string, string>();

function dedupeSymbols(
    symbols: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[]
): { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[] {
    const seen = new Set<string>();
    const result: { symbol: vscode.DocumentSymbol; document: vscode.TextDocument }[] = [];
    for (const entry of symbols) {
        const { symbol, document } = entry;
        const key = `${document.uri.fsPath}::${symbol.name}::${symbol.range.start.line}:${symbol.range.start.character}-${symbol.range.end.line}:${symbol.range.end.character}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(entry);
    }
    return result;
}

function isInProjectPath(uri: vscode.Uri, projectPath: string): boolean {
    const refPath = uri.fsPath;
    const normalizedProjectPath = path.normalize(projectPath);
    const normalizedRefPath = path.normalize(refPath);
    return normalizedRefPath.startsWith(normalizedProjectPath);
}

function isTestFilePath(uri: vscode.Uri): boolean {
    const refPath = uri.fsPath.toLowerCase();
    return (
        refPath.includes('/test/') ||
        refPath.includes('/tests/') ||
        refPath.includes('/spec/') ||
        refPath.includes('/__tests__/') ||
        /\.(test|spec)\.(js|ts|jsx|tsx)$/.test(refPath)
    );
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findReferencesByText(
    symbolName: string,
    workspacePath: string,
    includeGlob: string,
    maxResults: number
): Promise<vscode.Location[]> {
    const references: vscode.Location[] = [];
    const includePattern = new vscode.RelativePattern(workspacePath, includeGlob);
    const excludePattern = new vscode.RelativePattern(
        workspacePath,
        '**/{.git,node_modules,out,dist,build,__pycache__,lsprag-workspace}/**'
    );
    const files = await vscode.workspace.findFiles(includePattern, excludePattern);
    const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g');
    const yieldEvery = Number(process.env.LSPRAG_TEXT_REF_YIELD_EVERY ?? 5);
    for (let i = 0; i < files.length; i++) {
        if (yieldEvery > 0 && i > 0 && i % yieldEvery === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }
        const uri = files[i];
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const start = doc.positionAt(match.index);
            const end = doc.positionAt(match.index + match[0].length);
            references.push(new vscode.Location(uri, new vscode.Range(start, end)));
            if (maxResults > 0 && references.length >= maxResults) {
                return references;
            }
        }
    }
    return references;
}

function findReferencesInDocument(
    document: vscode.TextDocument,
    symbolName: string,
    maxResults: number
): vscode.Location[] {
    const references: vscode.Location[] = [];
    const text = document.getText();
    const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const start = document.positionAt(match.index);
        const end = document.positionAt(match.index + match[0].length);
        references.push(new vscode.Location(document.uri, new vscode.Range(start, end)));
        if (maxResults > 0 && references.length >= maxResults) {
            break;
        }
    }
    return references;
}

export async function measureSymbolRobustness(
    symbol: vscode.DocumentSymbol, 
    document: vscode.TextDocument,
    workspacePath: string
): Promise<SymbolRobustnessResult> {
    // Use the symbol's selection range start position to find references
    const position = symbol.selectionRange.start;
    
    // 1. Load all references to the symbol
    const defaultMaxRefs = document.languageId === "python" ? 200 : 500;
    const maxRefs = Number(process.env.LSPRAG_MAX_REFERENCES ?? defaultMaxRefs);
    const useLspReferences = process.env.LSPRAG_USE_LSP_REFERENCES === 'true';
    let allReferences: vscode.Location[] = [];
    if (document.languageId === "python" && !useLspReferences) {
        if (symbol.name.startsWith('_')) {
            allReferences = findReferencesInDocument(document, symbol.name, maxRefs);
        } else {
            allReferences = await findReferencesByText(symbol.name, workspacePath, "**/*.py", maxRefs);
        }
    } else {
        const referenceTimeoutMs = Number(process.env.LSPRAG_REFERENCE_TIMEOUT_MS ?? 3000);
        allReferences = await Promise.race([
            VscodeRequestManager.references(document.uri, position),
            new Promise<vscode.Location[]>(resolve => setTimeout(() => resolve([]), referenceTimeoutMs))
        ]);
        if (!allReferences.length) {
            console.log(`Reference lookup timed out after ${referenceTimeoutMs}ms for symbol: ${symbol.name}`);
        }
    }
    
    // 2. Filter references to only include those within the project path.
    const references = allReferences.filter(ref => isInProjectPath(ref.uri, workspacePath));
    const cappedReferences = maxRefs > 0 ? references.slice(0, maxRefs) : references;
    
    // Log references outside project for debugging
    const outsideProject = allReferences.filter(ref => !isInProjectPath(ref.uri, workspacePath));
    if (outsideProject.length > 0) {
        // console.log(`  Filtered out ${outsideProject.length} references outside project path:`);
        outsideProject.forEach(ref => console.log(`    - ${ref.uri.fsPath}`));
    }
    
    // 3. Count total references (only within project)
    const totalReferences = cappedReferences.length;
    
    // 4. Filter and count references from test files
    let testReferences = 0;
    for (let i = 0; i < cappedReferences.length; i++) {
        if (i > 0 && i % 50 === 0) {
            await new Promise(resolve => setImmediate(resolve));
        }
        const ref = cappedReferences[i];
        if (isTestFilePath(ref.uri)) {
            testReferences++;
        }
    }
    
    // 5. Calculate robustness score (ratio of test references to total references)
    const robustnessScore = totalReferences > 0 ? testReferences * 10 + totalReferences : 0;
    
    // Get additional symbol information
    const sourceCode = document.getText(symbol.range);
    let importString = "";
    const includeImportString = process.env.LSPRAG_INCLUDE_IMPORTS === 'true';
    if (includeImportString && document.languageId === "python") {
        const cacheKey = document.uri.toString();
        const cached = importStringCache.get(cacheKey);
        if (cached !== undefined) {
            importString = cached;
        } else {
            importString = genPythonicSrcImportStatement(document.getText());
            importStringCache.set(cacheKey, importString);
        }
    }
    const lineNum = symbol.range.end.line - symbol.range.start.line;
    const location = symbol.range.start.line;
    const relativeDocumentPath = path.relative(workspacePath, document.uri.fsPath);
    
    // Output the results
    console.log(`Symbol: ${symbol.name}`);
    console.log(`Total References: ${totalReferences}`);
    const maxLogRefs = Number(process.env.LSPRAG_LOG_REFERENCE_LIMIT ?? 20);
    const logRefs = cappedReferences.slice(0, Math.max(0, maxLogRefs));
    const logRefsText = logRefs.map(r => r.uri.fsPath).join(',');
    if (cappedReferences.length < references.length) {
        console.log(`Reference uri: ${cappedReferences.length} of ${references.length} (capped by LSPRAG_MAX_REFERENCES)`);
    } else if (maxLogRefs > 0 && cappedReferences.length > maxLogRefs) {
        console.log(`Reference uri: ${logRefsText} ... (${cappedReferences.length} total)`);
    } else {
        console.log(`Reference uri: ${logRefsText}`);
    }
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
        location,
        relativeDocumentPath
    };
}

suite('Experiment Test Suite', () => {
    // const projectName = "commons-cli";
    const projectNameEnv = process.env.TEST_PROJECT_NAME;
    if (!projectNameEnv) {
        throw new Error('Missing required TEST_PROJECT_NAME. Pass --projectName=<name> when running tests.');
    }    
    const projectName = projectNameEnv as ProjectConfigName;
    const pythonInterpreterPath = getProjectPythonExe(projectName) as string;
    const pythonExtraPaths = getProjectPythonPath(projectName);
    const languageId = getProjectLanguage(projectName as ProjectConfigName);
    const projectPath = getProjectWorkspace(projectName as ProjectConfigName);
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
            await setupPythonLSP(pythonExtraPaths, pythonInterpreterPath);
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
        const rawSymbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);
        const testSymbols = dedupeSymbols(rawSymbols);
        if (testSymbols.length !== rawSymbols.length) {
            console.log(`#### Deduped symbols: ${rawSymbols.length} -> ${testSymbols.length}`);
        }
        assert.ok(testSymbols.length > 0, 'Should have at least one symbol');
        
        // Collect all robustness results
        const results: SymbolRobustnessResult[] = [];
        for (const { symbol, document } of testSymbols) {
            console.log(`\n#### Testing symbol: ${symbol.name} from ${document.uri.fsPath}`);
            if (getConfigInstance().getProjectName() === 'dataclasses-json' && symbol.name === "default"){
                continue;
            }
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
        const outputPath = path.join(projectPath, 'symbol_robustness_results-all.json');
        const jsonContent = JSON.stringify(results, null, 2);
        fs.writeFileSync(outputPath, jsonContent, 'utf-8');
        console.log(`\n#### Results exported to: ${outputPath}`);
    });
}); 
