import * as assert from 'assert';
import * as vscode from 'vscode';
import { loadAllTargetSymbolsFromWorkspace, experiment, sleep, setWorkspaceFolders } from '../../helper';
import { FixType, loadPrivateConfig, SRC_PATHS } from '../../config';
import { activate } from '../../lsp';
import { getConfigInstance, GenerationType, PromptType, Provider } from '../../config';
import path from 'path';
import { generateFileNameForDiffLanguage, generateTimestampString } from '../../fileHandler';
import { ProjectName } from '../../config';
import { experimentWithCopilot, init, signIn, copilotServer, generateUnitTestsForFocalMethod } from '../../copilot';

suite('copilot Test Suite', () => {

    let currentSrcPath: string;
    const sampleNumber = 2;
    const languageId = "python";
    let symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[];
    const projectPath = "/LSPAI/experiments/projects/black";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    // vscode.workspace.updateWorkspaceFolders(0, 1, {
    //     uri: vscode.Uri.file(projectPath),
    //     name: path.basename(projectPath),
    // });
    let symbols: {symbol: vscode.DocumentSymbol, document: vscode.TextDocument}[] = [];
    const workspace = getConfigInstance().workspace;
    const projectName = path.basename(workspace);
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.AGENT,
        promptType: PromptType.DETAILED,
        savePath: `${projectName}_copilot`,
        workspace: projectPath,
        parallelCount: 1,
        maxRound: 5,
        ...privateConfig
    }
    getConfigInstance().updateConfig({
        ...currentConfig
    });

      test('Basic Copilot Connection Test', async () => {
        // 1. Test server connection
        const connection = await copilotServer();
        assert.ok(connection, 'Connection should be established');

        // 2. Test initialization
        try {
            await init(connection, getConfigInstance().workspace);
            assert.ok(true, 'Initialization should succeed');
        } catch (error) {
            assert.fail(`Initialization failed: ${error}`);
        }

        // 3. Test basic message handling
        let notificationReceived = false;
        connection.onNotification((method, params) => {
            console.log('Received notification:', method, params);
            notificationReceived = true;
        });

        // 4. Test error handling
        connection.onError((error) => {
            console.error('Connection error:', error);
            assert.fail('Connection error occurred');
        });

        // 5. Test connection close
        connection.onClose(() => {
            console.log('Connection closed');
            assert.ok(true, 'Connection should close properly');
        });

        // Wait a bit to allow for any notifications
        await new Promise(resolve => setTimeout(resolve, 1000));
        assert.ok(notificationReceived, 'Should receive at least one notification');
    });

    test('Copilot Sign-in Status Test', async () => {
        // 1. Establish connection
        const connection = await copilotServer();
        assert.ok(connection, 'Connection should be established');
    
        // 2. Initialize the connection
        await init(connection, getConfigInstance().workspace);
    
        // 3. Test sign-in status
        try {
            const signInResult : any = await connection.sendRequest('signIn', {})!;
            console.log('Sign-in status:', signInResult);
    
            // Check if we're already signed in
            if (signInResult.status === 'AlreadySignedIn') {
                assert.ok(true, 'User is already signed in');
            } else if (signInResult.status === 'PromptUserDeviceFlow') {
                // If not signed in, we'll get a device flow response
                assert.ok(signInResult.userCode, 'Should receive a user code');
                assert.ok(signInResult.verificationUri, 'Should receive a verification URI');
                assert.ok(signInResult.expiresIn, 'Should receive expiration time');
                
                console.log('Sign-in required. Please visit:', signInResult.verificationUri);
                console.log('Enter code:', signInResult.userCode);
                
                // Wait for sign-in completion
                let signedIn = false;
                const checkInterval = setInterval(async () => {
                    try {
                        const status : any = await connection.sendRequest('signIn', {});
                        if (status.status === 'AlreadySignedIn') {
                            signedIn = true;
                            clearInterval(checkInterval);
                            assert.ok(true, 'Successfully signed in');
                        }
                    } catch (error) {
                        console.error('Error checking sign-in status:', error);
                    }
                }, signInResult.interval * 1000);
    
                // Wait for sign-in or timeout
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        clearInterval(checkInterval);
                        resolve(false);
                    }, signInResult.expiresIn * 1000);
    
                    const checkSignedIn = setInterval(() => {
                        if (signedIn) {
                            clearInterval(checkSignedIn);
                            clearTimeout(timeout);
                            resolve(true);
                        }
                    }, 1000);
                });
            } else {
                assert.fail(`Unexpected sign-in status: ${signInResult.status}`);
            }
        } catch (error) {
            assert.fail(`Sign-in check failed: ${error}`);
        }
    });

        test('experiment helper functions', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
            currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
        } else {
            currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
        }
        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        // const oneFile = randomlySelectOneFileFromWorkspace(languageId);
        // console.log(`#### One file: ${oneFile}`);

        // ==== LOAD TARGET SYMBOL ====
        // const fileName = "comments.py";
        // const symbolName = "_generate_ignored_nodes_from_fmt_skip";
        // const symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        // console.log(`#### One file: ${symbolDocumentMap}`);
        // symbols.push(symbolDocumentMap);
        // ==== LOAD TARGET SYMBOL ====
        // ==== LOAD TARGET SYMBOL ====
        // const fileName2 = "DefaultParser.java";
        // const symbolName2 = "handleShortAndLongOption";
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
        // ==== LOAD ALL SYMBOLS ====
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        console.log(`#### Number of symbols: ${symbols.length}`);
    });

    // test('Copilot Code Generation - Multiple Scenarios', async () => {
    //     const connection = await copilotServer();
    //     await init(connection, getConfigInstance().workspace);
    
    //     const testCases = [
    //         {
    //             name: 'Simple Python Function',
    //             code: `
    //             def multiply(a: int, b: int) -> int:
    //                 return a * b
    //             `,
    //             language: 'python'
    //         },
    //         {
    //             name: 'Simple JavaScript Function',
    //             code: `
    //             function divide(a, b) {
    //                 return a / b;
    //             }
    //             `,
    //             language: 'javascript'
    //         }
    //     ];
    
    //     for (const testCase of testCases) {
    //         const testDoc = await vscode.workspace.openTextDocument({
    //             content: testCase.code,
    //             language: testCase.language
    //         });
    
    //         const fileName = `test_${testCase.name.toLowerCase().replace(/\s+/g, '_')}.${testCase.language === 'python' ? 'py' : 'js'}`;
            
    //         try {
    //             const generatedTest = await generateUnitTestsForFocalMethod(
    //                 connection,
    //                 testDoc,
    //                 fileName,
    //                 testCase.code,
    //                 fileName,
    //                 `Use appropriate testing framework for ${testCase.language}`,
    //                 testCase.language
    //             );
    
    //             assert.ok(generatedTest, `Should generate test code for ${testCase.name}`);
    //             console.log(`Generated test for ${testCase.name}:`, generatedTest);
    //         } catch (error) {
    //             assert.fail(`Test generation failed for ${testCase.name}: ${error}`);
    //         }
    //     }
    // });
    
    test(`Prepare for Experiment for ChatUnitest Comparison (${projectName}), testing `, async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        getConfigInstance().updateConfig({
            expProb: 1,
        });

        if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
            currentSrcPath = path.join(workspace, SRC_PATHS[projectName as ProjectName]);
        } else {
            currentSrcPath = path.join(workspace, SRC_PATHS.DEFAULT);
        }
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        
        console.log('### Start Generating ###');
        console.log('Current Config:', getConfigInstance());
        // console.log('symbolDocumentMaps', symbolDocumentMaps.length);
        
        symbolDocumentMaps = await loadAllTargetSymbolsFromWorkspace('python');
        console.log('We are loading tasklist of chatunitTest, symbolDocumentMaps', symbolDocumentMaps.length);
        });

        test(`Copilot Experiment`, async () => {
        const connection = await copilotServer();
        // await init(connection, getConfigInstance().workspace);
        // await signIn(connection);
        getConfigInstance().updateConfig({
            generationType: GenerationType.AGENT,
            promptType: PromptType.DETAILED,
        });

        const generatedResults = await experimentWithCopilot(connection, symbols, currentSrcPath, 0);
        // await disconnect(connection);
        });
});
