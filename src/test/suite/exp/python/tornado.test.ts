import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { getDiagnosticsForFilePath, groupDiagnosticsByMessage, groupedDiagnosticsToString, getCodeAction, applyCodeActions } from '../../../../lsp/diagnostic';
import { randomlySelectOneFileFromWorkspace, setWorkspaceFolders } from '../../../../helper';
import { loadAllTargetSymbolsFromWorkspace } from "../../../../lsp/symbol";
import { selectOneSymbolFileFromWorkspace } from "../../../../lsp/symbol";
import { SRC_PATHS } from '../../../../config';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../../../lsp/helper';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../../../config';
import { ProjectName } from '../../../../config';
import { runGenerateTestCodeSuite, findMatchedSymbolsFromTaskList } from '../../../../experiment';
import { getSourcCodes } from '../../../../lsp/definition';
import { SupportedLanguage } from '../../../../ast';
import { createCFGBuilder } from '../../../../cfg/builderFactory';
import { ConditionAnalysis, PathCollector } from '../../../../cfg/path';
import { DecodedToken } from '../../../../lsp/types';
import { getContextTermsFromTokens } from '../../../../tokenAnalyzer';
import { getContextSelectorInstance, ContextTerm } from '../../../../agents/contextSelector';

suite('Experiment Test Suite', () => {
    const pythonInterpreterPath = "/root/miniconda3/envs/LSPRAG/bin/python";
    const projectPath = "/LSPRAG/experiments/projects/tornado";
    const taskListPath = '/LSPRAG/experiments/config/tornado-taskList.json';
    const pyExtraPath = [path.join(projectPath, "tornado"), projectPath];
    const sampleNumber = -1;
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

    test('set python interpreter path', async () => {
        await setPythonInterpreterPath(pythonInterpreterPath);
        const currentPythonInterpreterPath = await getPythonInterpreterPath();
        assert.ok(currentPythonInterpreterPath === pythonInterpreterPath, 'python interpreter path should be set as expected');

    });

    test('Language server recognizes installed environment libraries', async () => {
        // Set the desired Python interpreter path (update as needed)

        // Activate the Python extension and log the interpreter in use
        console.log('Python interpreter used by extension:', await getPythonInterpreterPath());

        // Open the test file and collect diagnostics
        await setPythonExtraPaths(pyExtraPath);
        const currentPythonExtraPaths = await getPythonExtraPaths();
        console.log('currentPythonExtraPaths:', currentPythonExtraPaths);
        assert.ok(currentPythonExtraPaths.length === pyExtraPath.length, 'python extra paths should be set as expected');
        assert.ok(currentPythonExtraPaths.every((path, index) => path === pyExtraPath[index]), 'python extra paths should be set as expected');
    });
    test('experiment helper functions', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        
        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        // const oneFile = randomlySelectOneFileFromWorkspace(languageId);
        // console.log(`#### One file: ${oneFile}`);
        
        // ==== LOAD TARGET SYMBOL ====
        // const fileName = "tokenize.py";
        // const symbolName = "detect_encoding";
        // const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        // console.log(`#### One file: ${symbolDocumentMap}`);
        // symbols.push(symbolDocumentMap);
        
        // ==== LOAD TARGET SYMBOL ====
        // ==== LOAD TARGET SYMBOL ====
        // const fileName2 = "tokenize.py";
        // const symbolName2 = "find_cookie";
        // const symbolDocumentMap2 = await selectOneSymbolFileFromWorkspace(fileName2, symbolName2, languageId);
        // console.log(`#### One file: ${symbolDocumentMap2}`);
        // symbols.push(symbolDocumentMap2);
        // ==== LOAD TARGET SYMBOL ====
        // ==== LOAD ALL SYMBOLS ====
        symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
        if (sampleNumber > 0) {
            const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
            symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
        }
        // symbols.unshift(symbolDocumentMap);
        // // ==== LOAD ALL SYMBOLS ====

        // // ==== LOAD SYMBOLS FROM TASK LIST ====
        symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);
        if (sampleNumber > 0) {
            const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
            symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
        }
        // // ==== LOAD SYMBOLS FROM TASK LIST ====
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });

    // test('Context Gathering for Terms - PYTHON', async () => {
    //     // Create some test terms
    //     const sourceCode = getSourcCodes(symbols[0]!.document, symbols[0]!.symbol);
    //     console.log("sourceCode", sourceCode);
    //     const builder = createCFGBuilder(languageId as SupportedLanguage);
    //     const cfg = await builder.buildFromCode(sourceCode);
    //     builder.printCFGGraph(cfg.entry);
    //     const pathCollector = new PathCollector(languageId);
    //     pathCollector.collect(cfg.entry);
    //     const functionInfo = builder.getFunctionInfo();
    //     const conditionAnalyses = pathCollector.getUniqueConditions();
    //     const contextSelector = await getContextSelectorInstance(
    //         symbols[0]!.document, 
    //         symbols[0]!.symbol);
    //     const tokens = await contextSelector!.loadTokens();
    //     // const tokens = contextSelector!.getTokens();
    //     console.log("tokens", tokens.map((t : DecodedToken) => t.word));
    //     // console.log("conditionAnalyses", conditionAnalyses.map((c : ConditionAnalysis) => c.condition));
    //     // console.log("conditionAnalyses.length", conditionAnalyses.length);
    //     // const identifiedTerms = await getContextTermsFromTokens(
    //     //     symbols[0]!.document, 
    //     //     symbols[0]!.symbol,
    //     //   tokens,
    //     //   conditionAnalyses, 
    //     //   functionInfo);
    //     // const enrichedTerms = await contextSelector!.gatherContext(identifiedTerms, symbolDocumentMap!.symbol);
    //     // console.log(`enrichedTerms: ${enrichedTerms.map((term: ContextTerm) => ("\nname: " + term.name + "\ncontext: " + term.context +"\nexample: " + term.example))}`);
    //     // console.log(`enrichedTerms: ${enrichedTerms.map((term: ContextTerm) => JSON.stringify(term, null, 2))}`);
    //     // assert.ok(enrichedTerms.length > 0, 'Should identify at least one context term');
    //     // const promptObj = await generateTestWithContextWithCFG(symbolDocumentMap!.document, symbolDocumentMap!.symbol, sourceCode, enrichedTerms!, conditionAnalyses, "testing")
    //     // console.log("promptObj:", promptObj[1].content);
    //     })

    test('Naive - gpt-4o-mini', async () => {
        await runGenerateTestCodeSuite(
            GenerationType.NAIVE,
            FixType.NOFIX,
            PromptType.DETAILED,
            'gpt-4o-mini',
            'openai' as Provider,
            symbols,
            languageId,
        );
    });

    // test('Symprompt - gpt-4o-mini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Naive - gpt-4o ', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Symprompt - gpt-4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Naive - deepseek-chat', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.NAIVE,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('Symprompt - deepseek-chat', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.SymPrompt,
    //         FixType.NOFIX,
    //         PromptType.DETAILED,
    //         'deepseek-chat',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId,
    //     );
    // });

    // test('AGENT - with context - deepseek-coder', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'deepseek-coder',
    //         'deepseek' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });
    
    // test('CFG - experimental - 4o-mini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.EXPERIMENTAL,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('AGENT - with context - 4omini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('CFG - experimental - 4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.EXPERIMENTAL,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

    // test('AGENT - with context - 4o', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.AGENT,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });

}); 