import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../../helper';
import { getConfigInstance, PromptType, Provider, GenerationType, FixType } from '../../../../config';
import { setupJavaTestEnvironment, updateJavaWorkspaceConfig, reloadJavaLanguageServer } from '../../../../lsp/helper';
import { runGenerateTestCodeSuite } from '../../../../experiment';
import { selectOneSymbolFileFromWorkspace } from '../../../../lsp/symbol';
import { loadAllTargetSymbolsFromWorkspace } from '../../../../lsp/symbol';
import { findMatchedSymbolsFromTaskList } from '../../../../experiment';
import { readSliceAndSaveTaskList } from '../../../../experiment/utils/helper';
import { getDiagnosticsForFilePath } from '../../../../lsp/diagnostic';

suite('Experiment Test Suite - JAVA', () => {
    const projectPath = "/LSPRAG/experiments/projects/commons-csv";
    const sampleNumber = 20;
    const languageId = 'java';
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 1,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
    };
    // let testFilesPath = "/LSPRAG/experiments/projects/commons-csv/src/main/java/org/apache/commons/cli";  
    getConfigInstance().updateConfig({
        ...currentConfig
    });

    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];

    test('Setup for experiment - Configure Java source paths and classpath', async () => {
        const workspaceFolders = setWorkspaceFolders(projectPath);
        try {
            await updateWorkspaceFolders(workspaceFolders);
            console.log('Workspace folders updated to:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
        } catch (error) {
            console.error('Error updating workspace folders:', error);
        }
        assert.ok(vscode.workspace.workspaceFolders, 'Workspace folders should be set');
        assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, projectPath, 'Workspace folder should match project path');
        
        // Configure Java source paths to include test directories
        // This is the Language Server equivalent of Maven's build-helper-maven-plugin
        // When java.project.sourcePaths is explicitly set, it overrides Maven's automatic detection
        const javaConfig = vscode.workspace.getConfiguration('java');
        
        // Explicitly set source paths (this overrides Maven's automatic source path detection)
        // Equivalent to adding test sources via build-helper-maven-plugin in pom.xml
        const sourcePaths = [
            'src/main/java',
            'src/test/java',
            'src/lsprag/test/java'  // Custom test source directory (equivalent to Maven plugin config)
        ];
        
        // Update Java source paths configuration
        // This tells the Language Server to use these paths instead of reading from pom.xml
        await javaConfig.update(
            'project.sourcePaths',
            sourcePaths,
            vscode.ConfigurationTarget.Workspace
        );
        console.log('Updated Java source paths (Language Server equivalent of Maven test-source):', sourcePaths);
        
        // Configure classpath (referencedLibraries) for Maven project
        // This includes compiled classes and Maven dependencies
        const currentReferencedLibraries = javaConfig.get<string[]>('project.referencedLibraries', []);
        const classpathPaths = [
            'target/classes',
            'target/test-classes',
            'target/dependency/**/*.jar'
        ];
        
        const updatedReferencedLibraries = [...currentReferencedLibraries];
        for (const classpathPath of classpathPaths) {
            if (!updatedReferencedLibraries.includes(classpathPath)) {
                updatedReferencedLibraries.push(classpathPath);
            }
        }
        
        // Update Java classpath configuration
        await javaConfig.update(
            'project.referencedLibraries',
            updatedReferencedLibraries,
            vscode.ConfigurationTarget.Workspace
        );
        console.log('Updated Java classpath (referencedLibraries):', updatedReferencedLibraries);
        
        // Enable Maven import if not already enabled
        const mavenEnabled = javaConfig.get<boolean>('imports.maven.enabled', true);
        if (!mavenEnabled) {
            await javaConfig.update(
                'imports.maven.enabled',
                true,
                vscode.ConfigurationTarget.Workspace
            );
            console.log('Enabled Maven import');
        }
        
        // Also update workspace settings file
        const lspragTestPath = path.join(projectPath, 'src/lsprag/test/java');
        await updateJavaWorkspaceConfig(lspragTestPath);
        
        // Wait for configuration to take effect
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify configuration was applied
        const verifyConfig = vscode.workspace.getConfiguration('java');
        const appliedSourcePaths = verifyConfig.get<string[]>('project.sourcePaths', []);
        console.log('Verified source paths after update:', appliedSourcePaths);
        assert.ok(appliedSourcePaths.includes('src/lsprag/test/java'), 'src/lsprag/test/java should be in source paths');
        
        // Clean workspace to force Language Server to reload with new configuration
        // This is critical for Maven projects where the Language Server might cache pom.xml settings
        try {
            await vscode.commands.executeCommand('java.clean.workspace');
            console.log('Cleaned Java workspace');
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.log('Could not clean Java workspace:', error);
        }
        
        // Trigger Java project configuration update
        try {
            await vscode.commands.executeCommand('java.projectConfiguration.update');
            console.log('Triggered Java project configuration update');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Longer wait for Maven projects
        } catch (error) {
            console.log('Could not trigger Java project update:', error);
        }
        
        // For Maven projects, we might need to reload the window or restart the Language Server
        // Try reloading the Java Language Server extension
        try {
            const javaExtension = vscode.extensions.getExtension('redhat.java');
            if (javaExtension && !javaExtension.isActive) {
                await javaExtension.activate();
                console.log('Activated Java extension');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (error) {
            console.log('Could not activate Java extension:', error);
        }
        
        // Open the test file to ensure Language Server analyzes it
        const testFilePath = "/LSPRAG/experiments/projects/commons-csv/src/lsprag/test/java/org/apache/commons/csv/CSVFormat_builder_6959Test.java";
        const testFileUri = vscode.Uri.file(testFilePath);
        const document = await vscode.workspace.openTextDocument(testFileUri);
        await vscode.window.showTextDocument(document);
        console.log('Opened test file:', testFilePath);
        
        // Wait for Language Server to analyze the file
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get diagnostics after file is opened and analyzed
        const diagnostics = await getDiagnosticsForFilePath(testFilePath);
        console.log('Diagnostics:', diagnostics);
        
        // Verify that the file is on the classpath (should NOT have classpath error)
        const classpathErrors = diagnostics.filter(d => d.message.includes('is not on the classpath of project'));
        assert.strictEqual(classpathErrors.length, 0, `File should be on classpath. Found classpath errors: ${classpathErrors.map(d => d.message).join(', ')}`);
        
        // If there are diagnostics, they should be actual code errors, not classpath issues
        if (diagnostics.length > 0) {
            console.log('Found diagnostics (should be code errors, not classpath issues):', diagnostics.map(d => d.message));
        }
    });

    // test('Prepare FUT original commons-csv-task list ( same with the ICSE-26 paper Table 3, and Table 5 ', async () => {
        
    //     const taskListPath = '/LSPRAG/experiments/config/commons-csv-taskList.json';
    //     symbols = await loadAllTargetSymbolsFromWorkspace(languageId);
    //     if (sampleNumber > 0) {
    //         const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
    //         symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    //     }
    //     symbols = await findMatchedSymbolsFromTaskList(taskListPath, symbols, projectPath);
    //     if (sampleNumber > 0) {
    //         const randomIndex = Math.floor(Math.random() * (symbols.length - sampleNumber));
    //         symbols = symbols.slice(randomIndex, randomIndex + sampleNumber);
    //     }

    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    //     console.log(`#### Number of symbols: ${symbols.length}`);
    // });

    // test('Prepare FUT with robustness scores for assertion generation analysis (commons-csv)', async () => {

    //     const taskListPath = '/LSPRAG/experiments/projects/commons-csv/symbol_robustness_results.json';
    //     const sampledTaskListPath = await readSliceAndSaveTaskList(taskListPath, 3);
        
    //     const workspaceFolders = setWorkspaceFolders(projectPath);
    //     // await updateWorkspaceFolders(workspaceFolders);
    //     console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

    //     symbols = await loadAllTargetSymbolsFromWorkspace(languageId, 0);
    //     symbols = await findMatchedSymbolsFromTaskList(sampledTaskListPath, symbols, projectPath);

    //     // // ==== LOAD SYMBOLS FROM TASK LIST ====
    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    //     console.log(`#### Number of symbols: ${symbols.length}`);
    // });

    // test('CFG - LSPRAG - 4o-mini', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.LSPRAG,
    //         FixType.ORIGINAL,
    //         PromptType.WITHCONTEXT,
    //         'gpt-4o-mini',
    //         'openai' as Provider,
    //         symbols,
    //         languageId
    //     );
    // });
    // test('CFG - experimental - deepseek-coder', async () => {
    //     await runGenerateTestCodeSuite(
    //         GenerationType.LSPRAG,
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
