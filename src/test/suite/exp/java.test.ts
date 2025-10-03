import * as assert from 'assert';
import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { loadAllTargetSymbolsFromWorkspace, setWorkspaceFolders, selectOneSymbolFileFromWorkspace, updateWorkspaceFolders } from '../../../helper';
import { SRC_PATHS } from '../../../config';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider, FixType } from '../../../config';
import { generateFileNameForDiffLanguage } from '../../../fileHandler';
import { generateUnitTestForAFunction } from '../../../generate';
import { ProjectName } from '../../../config';
import { runGenerateTestCodeSuite } from '../../../experiment';
import { getDiagnosticsForFilePath, getDiagnosticsForUri } from '../../../diagnostic';

export async function getJavaConfiguration(): Promise<{[key: string]: any}> {
    const config = vscode.workspace.getConfiguration('java');
    
    // Get common Java settings
    const settings = {
        // Project settings
        "project.referencedLibraries": config.get('project.referencedLibraries'),
        "project.sourcePaths": config.get('project.sourcePaths'),
        "project.outputPath": config.get('project.outputPath'),
        "project.explorer.showNonJavaResources": config.get('project.explorer.showNonJavaResources'),
        
        // JDK settings
        "jdk.home": config.get('jdk.home'),
        "java.home": config.get('home'),
        
        // Import settings
        "imports.gradle.wrapper.enabled": config.get('imports.gradle.wrapper.enabled'),
        "imports.maven.enabled": config.get('imports.maven.enabled'),
        "imports.exclusions": config.get('imports.exclusions'),
        
        // Completion settings
        "completion.enabled": config.get('completion.enabled'),
        "completion.guessMethodArguments": config.get('completion.guessMethodArguments'),
        
        // Format settings
        "format.enabled": config.get('format.enabled'),
        "format.settings.url": config.get('format.settings.url'),
        
        // Debug settings
        "debug.settings.hotCodeReplace": config.get('debug.settings.hotCodeReplace'),
        
        // Compiler settings
        "compiler.nullAnalysis.mode": config.get('compiler.nullAnalysis.mode'),
        
        // Configuration status
        "configuration.updateBuildConfiguration": config.get('configuration.updateBuildConfiguration'),
        "configuration.maven.userSettings": config.get('configuration.maven.userSettings')
    };

    return settings;
}


async function setupJavaTestEnvironment(projectPath: string) {

    // 3. Configure Java source paths to include both main and test paths
    const javaConfig = vscode.workspace.getConfiguration('java');
    await javaConfig.update('project.sourcePaths', [
        "src/main/java",
        "src/lsprag/test/java"  // Add your test directory
    ], vscode.ConfigurationTarget.Workspace);

    // 4. Wait for the language server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 5. Instead of clean workspace, just update project configuration
    try {
        console.log('executing java.projectConfiguration.update');
        await vscode.commands.executeCommand('java.projectConfiguration.update');
        // Add a shorter timeout
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Optionally, you can also try to force a compilation
        // console.log('executing java.workspace.compile');
        // await vscode.commands.executeCommand('java.workspace.compile');
    } catch (error) {
        console.error('Error updating Java configuration:', error);
    }

    // // 4. Wait for the language server to initialize
    // console.log('waiting for the language server to initialize');
    // await new Promise(resolve => setTimeout(resolve, 2000));
    
    // // 5. Reload Java language server
    // console.log('executing java.clean.workspace');
    // await vscode.commands.executeCommand('java.clean.workspace');
    // await new Promise(resolve => setTimeout(resolve, 2000));
    // console.log('executing java.projectConfiguration.update');
    // await vscode.commands.executeCommand('java.projectConfiguration.update');
}

suite('Experiment Test Suite - JAVA', () => {
    const projectPath = "/LSPRAG/experiments/projects/commons-cli";
    const sampleNumber = 20;
    const languageId = 'java';
    const testjavaPath = "/LSPRAG/experiments/projects/commons-cli/src/lsprag/test/java/org/apache/commons/cli/CommandLine_getOptionObject_0_1Test.java";
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
    test('JAVA - test diagnostic against java code', async () => {
        const workspaceFolders = setWorkspaceFolders(projectPath);
        await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        // await setupJavaTestEnvironment(projectPath);
        const config = await getJavaConfiguration();
        console.log('config', config);
        const result = await getDiagnosticsForFilePath(testjavaPath);
        console.log('result', result);
        assert.ok(result.length > 0);
        assert.ok(result.every(d => !d.message.includes("is not on the classpath of project")), "should not report missing java classpath");
    });

    // test('set JAVA configuration', async () => {
    // });

    // test('experiment helper functions', async () => {
    //     if (process.env.NODE_DEBUG !== 'true') {
    //         console.log('activate');
    //         await activate();
    //     }
        
    //     const workspaceFolders = setWorkspaceFolders(projectPath);
    //     // await updateWorkspaceFolders(workspaceFolders);
    //     console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
    //     // const oneFile = randomlySelectOneFileFromWorkspace(languageId);
    //     // console.log(`#### One file: ${oneFile}`);

    //     // ==== LOAD TARGET SYMBOL ====
    //     // const fileName = "DefaultParser.java";
    //     // const symbolName = "handleConcatenatedOptions";
    //     // const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
    //     // console.log(`#### One file: ${symbolDocumentMap}`);
    //     // symbols.push(symbolDocumentMap);
    //     // ==== LOAD TARGET SYMBOL ====
    //     // ==== LOAD TARGET SYMBOL ====
    //     const fileName2 = "DefaultParser.java";
    //     const symbolName2 = "handleShortAndLongOption";
    //     const symbolDocumentMap2 = await selectOneSymbolFileFromWorkspace(fileName2, symbolName2, languageId);
    //     console.log(`#### One file: ${symbolDocumentMap2}`);
    //     symbols.push(symbolDocumentMap2);
    //     // ==== LOAD TARGET SYMBOL ====
        
    //     // ==== LOAD ALL SYMBOLS ====
    //     symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
    //     if (sampleNumber > 0) {
    //         const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
    //         symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    //     }
    //     // ==== LOAD ALL SYMBOLS ====
    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    //     console.log(`#### Number of symbols: ${symbols.length}`);
    // });

    // // test('select target file name and symbol', async () => {
    // //     if (process.env.NODE_DEBUG !== 'true') {
    // //         console.log('activate');
    // //         await activate();
    // //     }
    // //     const fileName = "DefaultParser.java";
    // //     const symbolName = "handleConcatenatedOptions";
    // //     const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, 'java');
    // //     console.log(`#### One file: ${symbolDocumentMap}`);
    // //     symbols.push(symbolDocumentMap);
    // //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    // // });


    // test('CFG - experimental - deepseek-coder', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.EXPERIMENTAL,
    //         FixType.NOFIX,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
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
