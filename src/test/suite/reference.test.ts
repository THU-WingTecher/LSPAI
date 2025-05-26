import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getContextSelectorInstance, ContextTerm } from '../../agents/contextSelector';
import { getConfigInstance, loadPrivateConfig, Provider, GenerationType, PromptType } from '../../config';
import { getDocUri, activate, setPythonExtraPaths, getPythonExtraPaths } from '../../lsp';
import { getAllSymbols } from '../../lsp';
import { selectOneSymbolFileFromWorkspace, setWorkspaceFolders } from '../../helper';
import { getSourcCodes } from '../../retrieve';
import { getContextTermsFromTokens } from '../../tokenAnalyzer';
import { PathCollector } from '../../cfg/path';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { SupportedLanguage } from '../../ast';
import { findReferences, getReferenceInfo } from '../../reference';

suite('Context Selector Agent Tests', () => {

    let languageId = "python";
    let symbolDocumentMap : {document: vscode.TextDocument, symbol: vscode.DocumentSymbol} | null = null;
    let contextSelector;
    let projectPath = "/LSPAI/experiments/projects/black";
    const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src")];
    
    test('Setting', async () => {
        await setPythonExtraPaths([]);
        const fileName = "__init__.py";
        const pyProjectPath = "/LSPAI/experiments/projects/black";
        const workspaceFolders = setWorkspaceFolders(pyProjectPath);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        const symbolName = "spellcheck_pyproject_toml_keys";
        symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        contextSelector = await getContextSelectorInstance(
          symbolDocumentMap.document, 
          symbolDocumentMap.symbol);
        const PythonExtraPath = await getPythonExtraPaths();
        console.log("Python Extra Path:", PythonExtraPath);
        assert.ok(symbolDocumentMap !== null, 'Should find symbol document map'); 
    });

    test('Debug Python Language Server Initialization', async () => {
        console.log("1. Checking Python Extension Status");
        const pythonExtension = vscode.extensions.getExtension('ms-python.python');
        console.log("Python Extension Found:", !!pythonExtension);
        console.log("Python Extension Active:", pythonExtension?.isActive);
        
        if (pythonExtension) {
            await pythonExtension.activate();
            console.log("Python Extension Activated");
            
            // Check if we can access the Python extension API
            const pythonApi = pythonExtension.exports;
            console.log("Python API available:", !!pythonApi);
        }
    
        console.log("2. Checking Pylance Status");
        const pylanceExtension = vscode.extensions.getExtension('ms-python.vscode-pylance');
        console.log("Pylance Extension Found:", !!pylanceExtension);
        console.log("Pylance Extension Active:", pylanceExtension?.isActive);
    
        // Get language server status
        const document = symbolDocumentMap!.document;
        // console.log("3. Checking Language Server Features");
        // const capabilities = await vscode.commands.executeCommand(
        //     'python.getLanguageServerStatus'
        // );
        // console.log("Language Server Capabilities:", capabilities);
    
        // Check if we can get symbols (this indicates the language server is working)
        const symbols = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );
        console.log("Symbol Provider Working:", !!symbols);
    });

    test('Debug Project Files Indexing', async () => {
        const pyProjectPath = "/LSPAI/experiments/projects/black";
        
        // First, let's list all Python files in the project
        let allPythonFiles: string[] = [];
        
        async function findPythonFiles(dir: string) {
            const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
            for (const [name, type] of files) {
                const fullPath = path.join(dir, name);
                if (type === vscode.FileType.Directory) {
                    await findPythonFiles(fullPath);
                } else if (name.endsWith('.py')) {
                    allPythonFiles.push(fullPath);
                }
            }
        }
        
        await findPythonFiles(pyProjectPath);
        console.log("Total Python files found:", allPythonFiles.length);
        
        // Now check if each file can be parsed by the language server
        for (const file of allPythonFiles.slice(0, 5)) { // Check first 5 files as sample
            const uri = vscode.Uri.file(file);
            const doc = await vscode.workspace.openTextDocument(uri);
            
            // Check for symbols
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );
            
            // Check for diagnostics
            const diagnostics = await vscode.languages.getDiagnostics(uri);
            
            console.log(`File ${path.basename(file)}:`);
            console.log(`- Can open: ${!!doc}`);
            console.log(`- Has symbols: ${!!symbols && symbols.length > 0}`);
            console.log(`- Diagnostics: ${diagnostics.length}`);
        }
    });

    test('Debug Import Resolution and Cross-file References', async () => {
        const document = symbolDocumentMap!.document;
        const symbol = symbolDocumentMap!.symbol;
        
        // 1. Check if imports are resolved
        const diagnostics = await vscode.languages.getDiagnostics(document.uri);
        const importDiagnostics = diagnostics.filter(d => 
            d.message.toLowerCase().includes('import') || 
            d.message.toLowerCase().includes('unable to resolve')
        );
        console.log("Import-related diagnostics:", importDiagnostics.map(d => ({
            message: d.message,
            range: d.range.start.line,
            character: d.range.start.character
        })));
        
        // 2. Try to find definition (if we can find definition, we should be able to find references)
        const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            document.uri,
            symbol.selectionRange.start
        );
        console.log("Definition found:", !!definitions && definitions.length > 0);
        if (definitions) {
            console.log("Definition locations:", definitions.map(d => d.uri.fsPath));
        }
        
        // 3. Check workspace symbol search (this shows if the symbol is indexed project-wide)
        const workspaceSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            symbol.name
        );
        console.log("Workspace symbols found:", !!workspaceSymbols && workspaceSymbols.length > 0);
        if (workspaceSymbols) {
            console.log("Symbol locations:", workspaceSymbols.map(s => s.location.uri.fsPath));
        }
        
        // 4. Try to find references with more details
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            document.uri,
            symbol.selectionRange.start
        );
        console.log("References found:", !!references && references.length > 0);
        if (references) {
            console.log("Reference details:", references.map(ref => ({
                file: ref.uri.fsPath,
                line: ref.range.start.line,
                character: ref.range.start.character
            })));
        }
    });

    test('Context Gathering for Terms - PYTHON ( focal method reference )', async () => {
        // Create some test terms
        const pythonExtension = vscode.extensions.getExtension('ms-python.python');
        if (pythonExtension) {
            console.log('activate python extension');
            await pythonExtension.activate();
        }
        
        // Then activate our extension
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }

        const fileName = "concurrency.py";
        const pyProjectPath = "/LSPAI/experiments/projects/black";
        const workspaceFolders = setWorkspaceFolders(pyProjectPath);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        const symbolName = "reformat_many";
        symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        contextSelector = await getContextSelectorInstance(
          symbolDocumentMap.document, 
          symbolDocumentMap.symbol);
        console.log("Finding Reference for function symbol:", symbolDocumentMap.symbol.name);
        const reference = await findReferences(symbolDocumentMap.document, symbolDocumentMap.symbol.selectionRange.start);
        console.log("Reference:", reference);
        await setPythonExtraPaths(blackModuleImportPath);
            // Add this before your test
        const afterAddPathsReference = await findReferences(symbolDocumentMap.document, symbolDocumentMap.symbol.selectionRange.start);
        console.log("After Add Paths Reference:", afterAddPathsReference);
        assert.ok(reference.length > 0, 'Should find reference for function symbol');
        // should include file uri , but it can be the same with symbol
        console.log(
            reference.map(ref => ref.uri.fsPath)
        )

        // console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    });

});