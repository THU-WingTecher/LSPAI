import { spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import {
  createMessageConnection,
  MessageConnection,
} from 'vscode-jsonrpc';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import {
  InitializeParams,
  InitializeRequest,
  InitializeResult,
  InitializedNotification,
  DidChangeConfigurationNotification,
  DidOpenTextDocumentNotification,
  TextDocumentItem,
  Position,
  DidChangeTextDocumentNotification
  // You can import other LSP structures (e.g. DidChangeConfigurationNotification, etc.)
} from 'vscode-languageserver-protocol';
import { commentizeCode } from './utils';
import { _generateFileNameForDiffLanguage, saveGeneratedCodeToFolder } from './fileHandler';
import { workspace } from 'vscode';
import { getConfigInstance } from './config';
import { getUnitTestTemplateOnly } from './prompts/template';
import { sleep } from './helper';

// --------------------
// 1. SPAWN THE SERVER
// --------------------


export async function copilotServer() : Promise<MessageConnection> {
  const copilotProcess: ChildProcess = spawn(
    'node',
    [
      '/LSPAI/node_modules/@github/copilot-language-server/dist/language-server.js',
      '--stdio',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  // Alternatively, if you prefer the native binary (for macOS arm64):
  // const copilotProcess: ChildProcess = spawn(
  //   './node_modules/@github/copilot-language-server/native/darwin-arm64/copilot-language-server',
  //   ['--stdio'],
  //   { stdio: ['pipe', 'pipe', 'pipe'] }
  // );

  // Create an LSP connection over stdio
  const connection: MessageConnection = createMessageConnection(
    new StreamMessageReader(copilotProcess.stdout!),
    new StreamMessageWriter(copilotProcess.stdin!)
  );

  // -----------------
  // 2. ERROR HANDLING
  // -----------------
  copilotProcess.stderr?.on('data', (data) => {
    console.error('Copilot stderr:', data.toString());
  });

  connection.onError((error) => {
    console.error('Connection Error:', error);
  });

  connection.onClose(() => {
    console.log('Connection closed');
  });

  // You can also listen for server-initiated notifications/logs:
  connection.onNotification((method, params) => {
    console.log('[Notification] Method:', method, 'Params:', params);
  });

  // 3. Start listening for messages
  connection.listen();

  return connection
}

// ----------------------
// 4. INIT & SIGN-IN FLOW
// ----------------------
export async function signIn(connection: MessageConnection){
    try {
      const signInMethod = 'signIn';
      console.log('Sending signIn request...');

      const signInResult = await connection.sendRequest(signInMethod, {});
      console.log('signInResult:', signInResult);

      // [Notification] Method: window/logMessage Params: { type: 3, message: '[certificates] Removed 1 expired certificates' }
      // signInResult: {
      //   status: 'PromptUserDeviceFlow',
      //   userCode: 'E74C-A590',
      //   verificationUri: 'https://github.com/login/device',
      //   expiresIn: 899,
      //   interval: 5,
      //   command: {
      //     command: 'github.copilot.finishDeviceFlow',
      //     title: 'Sign in with GitHub',
      //     arguments: []
      //   }
      // }
      // Manual Execution needed, connect to verificationUri, and paste userCode, and then wait for seconds.
      // // }
      } catch (error) {
        console.error('Error in SignIn:', error);
      }
    }

    
export async function experimentWithCopilot(connection: any, symbolDocumentMaps: {document: vscode.TextDocument, symbol: vscode.DocumentSymbol}[], workspace: string, _round: number) : Promise<any[]> {
  const generatedResults: any[] = [];
  const num_parallel = getConfigInstance().parallelCount;
  for (const { document, symbol } of symbolDocumentMaps) {
    const fileName = _generateFileNameForDiffLanguage(document, symbol, getConfigInstance().savePath, 'python', [], -1)
    const response = await generateUnitTestsForFocalMethod(
      connection, // your MessageConnection
      document,
      document.uri.fsPath.replace(workspace, ''),
      document.getText(symbol.range),
      fileName,
      getUnitTestTemplateOnly(document, symbol, fileName),
      document.languageId
    );
  }
  return generatedResults;
}

export async function init(connection: MessageConnection) {
  try {
    // 4a) Send the 'initialize' request
    const initializeParams: InitializeParams = {
      processId: process.pid,
      workspaceFolders: [
        {
          uri: '/LSPAI', // adapt as needed
          name: 'MyWorkspace',
        },
      ],
      rootUri: '/LSPAI',
      capabilities: {
        // minimal for demonstration
        workspace: { workspaceFolders: true },
        textDocument: {
          synchronization: {},
        },
      },
      initializationOptions: {
        editorInfo: {
          name: 'MyEditor',
          version: '1.0.0',
        },
        editorPluginInfo: {
          name: 'MyEditorPlugin',
          version: '1.0.0',
        },
      }
    }
    console.log('sending initializing package')
    const initResult: InitializeResult = await connection.sendRequest(
      InitializeRequest.type,
      initializeParams
    );
    console.log('InitializeResult:', initResult);

    // 4b) 'initialized' notification
    console.log('sending initialized notification')
    connection.sendNotification(InitializedNotification.type, {});
    
    const configurationParams = {
      settings: {
        http: {
          proxy: 'http://127.0.0.1:23312',
          proxyStrictSSL: true,
          proxyKerberosServicePrincipal: 'spn',
        },
        telemetry: {
          telemetryLevel: 'all',
        },
        // 'github-enterprise': {
        //   uri: 'https://example.ghe.com',
        // },
      },
    };

    console.log('Sending didChangeConfiguration notification');
    connection.sendNotification(
      DidChangeConfigurationNotification.type,
      configurationParams
    );


  } catch (error) {
    console.error('Error in init::', error);
  }
}

// 5. Open a text document
function openTextDocument(connection: MessageConnection, uri: string, initialText: string) {
  // According to the LSP, we send a textDocument/didOpen notification
  connection.sendNotification('textDocument/didOpen', {
    textDocument: {
      uri,
      languageId: 'typescript',  // or your language
      version: 1,
      text: initialText,
    },
  });
  console.log(`Opened document: ${uri}`);
}

// 6. Request inline completions
async function requestInlineCompletion(connection: MessageConnection, uri: string, line: number, character: number) {
  // The method name is 'textDocument/inlineCompletion' in Copilot
  // (draft LSP extension). We'll build the request parameters:
  const inlineCompletionRequest = {
    textDocument: {
      uri,
      version: 1,
    },
    position: { line, character },
    context: {
      triggerKind: 2, // Typically means 'triggered by user typing'
    },
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true,
    },
  };

  try {
    const response = await connection.sendRequest(
      'textDocument/inlineCompletion',
      inlineCompletionRequest
    );
    console.log('Inline Completion Response:', response);
    // response.items -> array of completion items
    // Each item has insertText, range, command, etc.
  } catch (err) {
    console.error('Error requesting inline completion:', err);
  }
}

function testClassName(languageId: string){
  switch (languageId){
    case 'python':
      return 'class Test';
    case 'java':
      return 'public class';
    case 'go':
      return 'func Test';
    default:
      return 'Test';
  }
}

function findFarthestEmptyLineBeforeTarget(arr: (number | string)[], targetIndex: number): number {
  
  let farthestZero = -1;

  for (let i = targetIndex - 1; i >= 0; i--) {
      if (arr[i] === '') {
          farthestZero = i;
      } else {
          break;
      }
  }

  return farthestZero;
}

async function replaceImportsPlaceholder(connection: any, uriOfMethod: string, textDocument: TextDocumentItem, languageCode: string) {
  // Find the position of the placeholder
  
  const placeholder = testClassName(languageCode);
  const position = textDocument.text.indexOf(placeholder);
  
  if (position === -1) {
      return textDocument.text; // No placeholder found
  }

  // Calculate the position for completion request
  const textBeforePosition = textDocument.text.substring(0, position);
  const lines = textBeforePosition.split('\n');
  const line = findFarthestEmptyLineBeforeTarget(lines, lines.length );
  
  const character = 0; // Start of the next line
  console.log(textDocument.text.split('\n'), textDocument.text.split('\n')[line], line)

  // Request completion at the imports position
  const completionParams = {
      textDocument: { uri: textDocument.uri },
      position: { line, character },
      prompt: `the focal function is in the ${uriOfMethod} file. you need to import needed library including the ${uriOfMethod} file.`
  };

  const testText = await requestPanelCompletion(connection, completionParams);
  
  // Replace the placeholder with the generated imports
  return textDocument.text.slice(0, position) + testText + textDocument.text.slice(position);
}

async function requestPanelCompletion(connection: any, params: any): Promise<string> {
  const maxRetries = 3;  // Maximum number of retry attempts
  const retryDelay = 1000;  // Delay between retries in milliseconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await connection.sendRequest('textDocument/copilotPanelCompletion', params);
      
      if (response?.items?.[0]?.insertText) {
        console.log('response.items[0].insertText', response.items[0].insertText);
        return response.items[0].insertText;
      }
      
      console.log(`No suggestions returned by Copilot (attempt ${attempt}/${maxRetries})`);
      
      if (attempt < maxRetries) {
        console.log(`Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      console.error(`Error in attempt ${attempt}/${maxRetries}:`, error);
      
      if (attempt < maxRetries) {
        console.log(`Waiting ${retryDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  return ''; // Return empty string after all retries are exhausted
}

async function replaceSetupPlaceholder(connection: any, textDocument: TextDocumentItem, languageCode: string) {
  // Find the position of the placeholder
  const placeholder = '{Replace with needed setup}';
  const position = textDocument.text.indexOf(placeholder);
  
  if (position === -1) {
      return textDocument.text; // No placeholder found
  }

  // Calculate the position for completion request
  const lines = textDocument.text.substring(0, position).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;

  // Request completion at the imports position
  const completionParams = {
      textDocument: { uri: textDocument.uri },
      position: { line, character },
      prompt: 'Generate setup for the unit test of given focal method.'
  };

  const setUpText = await requestPanelCompletion(connection, completionParams);

  // Replace the placeholder with the generated imports
  return textDocument.text.replace(placeholder, setUpText);
}

async function waitUntilNotBusy(connection: MessageConnection): Promise<void> {
  return new Promise((resolve) => {
    const disposable = connection.onNotification('statusNotification', (params: any) => {
      if (params.busy === false) {
        // Dispose of the listener once we get a not-busy status
        disposable.dispose();
        resolve();
      }
    });
  });
}

async function replaceTestPlaceholder(connection: any, focalMethod: string, textDocument: TextDocumentItem, languageCode: string) {
  // Find the position of the placeholder
  const placeholder = testClassName(languageCode);
  const position = textDocument.text.indexOf(placeholder);
  const testTemplate = "Use Python's unittest framework for testing. Each test should have descriptive names and multiple expect statements.";
  const promptContent = `
  Focal Method Source: 
  ${focalMethod}
  Unit Test Template:
  ${testTemplate}`;

  if (position === -1) {
      return textDocument.text; // No placeholder found
  }

  // Calculate the position for completion request
  const textBeforePosition = textDocument.text.substring(0, position);
  const lines = textBeforePosition.split('\n');
  const line = lines.length + 1; // This will be the line of "class Test"
  console.log(textDocument.text.split('\n'), textDocument.text.split('\n')[line], line)
  const character = 0; // Start of the next line
  const allLines = textDocument.text.split('\n');
  const lineIndex = allLines.findIndex(line => line.includes(placeholder));
  // Request completion at the imports position
  const completionParams = {
      textDocument: { uri: textDocument.uri },
      position: { line, character },
      prompt: promptContent
  };

  const testText = await requestPanelCompletion(connection, completionParams);
  // Replace the placeholder with the generated imports
  return allLines.slice(0, lineIndex).join('\n') + testText + allLines.slice(lineIndex + 1).join('\n'); 
}

// async function requestPanelCompletion(connection: any, params: any) : Promise<string> {
//   // await waitUntilNotBusy(connection);
//   const response = await connection.sendRequest('textDocument/copilotPanelCompletion', params);
//   if (!response || !response.items || response.items.length === 0 || !response.items[0].insertText) {
//       console.log('No suggestions were returned by Copilot.');
//       return ''; // Remove placeholder if no suggestions
//   }
//   // Get the first suggestion
//   console.log('response.items[0].insertText', response.items[0].insertText);
//   return response.items[0].insertText;
// }
/**
 * Generates a set of unit-test suggestions for a given focal method by leveraging
 * Copilot’s panel completion endpoint (`textDocument/copilotPanelCompletion`).
 *
 * @param connection - A MessageConnection to the Copilot Language Server.
 * @param focalMethodSource - The source code of the focal method you want to test.
 * @param testFileName - The desired name of the test file (for context/prompting).
 * @param unitTestTemplate - A snippet or instructions describing your unit-test style or template.
 * @param languageCode - The programming language, e.g. "typescript", "javascript", "python".
 *
 * @returns The raw panel completion response from Copilot (usually contains an `items` array).
 */
export async function generateUnitTestsForFocalMethod(
  connection: MessageConnection,
  document: vscode.TextDocument,
  uriOfMethod: string,
  focalMethod: string,
  fileName: string,
  unitTestTemplate: string,
  languageCode: string
): Promise<any> {
  console.log('generateUnitTestsForFocalMethod', uriOfMethod, focalMethod, fileName, unitTestTemplate, languageCode)
  try {
    // 1) Create a “prompt” that provides context about what we want Copilot to do.

    let startContent = unitTestTemplate;
    // 2) We’ll represent this prompt as if it were a file in the workspace.
    //    Construct a URI for it, and open the file (didOpen) so Copilot can index the text.
    // Goal : testFileName is a real file and will be generated, 
    const version = 1;
    await saveGeneratedCodeToFolder(startContent, fileName);  
    const textDocument = await workspace.openTextDocument(fileName);
    const textDocumentItem: TextDocumentItem = {
      uri: textDocument.uri.fsPath,
      languageId: languageCode,
      version,
      text: textDocument.getText()
    };

    // Notify the server that this doc is open
    connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: textDocumentItem
    }); 
    await vscode.workspace.openTextDocument(document.uri);
    await vscode.window.showTextDocument(document); // Add this line to physically open the document

    connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri: document.uri.fsPath,
        languageId: document.languageId,
        version: document.version,
        text: document.getText()
      }
    }); 

    // Replace imports placeholder
    // const updatedContent = await replaceImportsPlaceholder(connection, uriOfMethod, textDocumentItem, languageCode);
    // if (updatedContent !== textDocumentItem.text) {
    //     // Save the updated content
    //     await saveGeneratedCodeToFolder(updatedContent, fileName);
    //     // Update the document
    //     textDocumentItem.text = updatedContent;
    //     textDocumentItem.version += 1;
    //     // Notify the server about the change
    //     connection.sendNotification(DidChangeTextDocumentNotification.type, {
    //         textDocument: {
    //             uri: textDocumentItem.uri,
    //             version: textDocumentItem.version
    //         },
    //         contentChanges: [{ text: updatedContent }]
    //     });
    //     console.log('Updated content:', updatedContent);
    // }

    // const secondUpdatedContent = await replaceSetupPlaceholder(connection, textDocumentItem, languageCode);
    // if (secondUpdatedContent !== textDocumentItem.text) {
    //     // Save the updated content
    //     await saveGeneratedCodeToFolder(secondUpdatedContent, fileName);
    //     // Update the document
    //     textDocumentItem.text = secondUpdatedContent;
    //     textDocumentItem.version += 1;
    //     // Notify the server about the change
    //     connection.sendNotification(DidChangeTextDocumentNotification.type, {
    //         textDocument: {
    //             uri: textDocumentItem.uri,
    //             version: textDocumentItem.version
    //         },
    //         contentChanges: [{ text: secondUpdatedContent }]
    //     });
    //     console.log('Second updated content:', secondUpdatedContent);
    // }

    const thirdUpdatedContent = await replaceTestPlaceholder(connection, focalMethod, textDocumentItem, languageCode);
    if (thirdUpdatedContent !== textDocumentItem.text) {
        // Save the updated content
        await saveGeneratedCodeToFolder(thirdUpdatedContent, fileName);
        // Update the document
        textDocumentItem.text = thirdUpdatedContent;
        textDocumentItem.version += 1;
        // Notify the server about the change
        connection.sendNotification(DidChangeTextDocumentNotification.type, {
            textDocument: {
                uri: textDocumentItem.uri,
                version: textDocumentItem.version
            },
            contentChanges: [{ text: thirdUpdatedContent }]
        });
        console.log('Third updated content:', thirdUpdatedContent);
    }
    return thirdUpdatedContent;
  } catch (error) {
    console.error('Error generating unit tests:', error);
    throw error;
  }
}

export function parseCopilotPanelResponse(response: any){

}
// ---------------------
// RUN THE FULL EXAMPLE
// ---------------------
async function main() {
  const connection = await copilotServer();
  await init(connection);
  await signIn(connection);


  // Now that we *hopefully* have an authenticated Copilot session,
  // let's open a text document, then request a completion.

  const focalMethod = `function greet(name) {
    return "Hello, " + name;
  }`;
  
  const testFileName = "greet.test.js";
  const testTemplate = "Use Jest for testing. Each test should have descriptive names and multiple expect statements.";
  const langCode = "javascript";
  
  // const response = await generateUnitTestsForFocalMethod(
  //   connection, // your MessageConnection
  //   focalMethod,
  //   testFileName,
  //   testTemplate,
  //   langCode
  // );
  
  // if (!response || !response.items || response.items.length === 0) {
  //   console.log('No suggestions were returned by Copilot.');
  //   return;
  // }

  // const firstSuggestion = response.items[0];
  // const suggestedTestCode = firstSuggestion.insertText || '';

  // console.log('Copilot suggestion chosen:', suggestedTestCode);

  // // Step C: Actually create the test file on disk
  // try {
  //   fs.writeFileSync(testFileName, suggestedTestCode, 'utf8');
  //   console.log(`Test file "${testFileName}" created successfully.`);
  // } catch (err) {
  //   console.error(`Failed to create test file "${testFileName}":`, err);
  //   return;
  // }
  const docUri = '/LSPAI/src/copilot.ts'; // adapt to your local file
  const docText = `function greet(name: string) {\n  return "Hello, " + name;\n}\n\n`;  
  openTextDocument(connection, docUri, docText);

  // Wait a bit, then request an inline completion
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // For example, let's request a completion at line 4, character 0
  await requestInlineCompletion(connection, docUri, 4, 0);

  // ... you can also sign out or handle partial acceptance, etc.
}

// main().catch(console.error);
