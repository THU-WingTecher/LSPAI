import { spawn, ChildProcess } from 'child_process';
import { sign } from 'crypto';
import {
  createMessageConnection,
  MessageConnection,
  NotificationType,
  RequestType,
} from 'vscode-jsonrpc';
import { RequestCancellationReceiverStrategy } from 'vscode-jsonrpc/lib/common/connection';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import * as fs from 'fs';
import {
  InitializeParams,
  InitializeRequest,
  InitializeResult,
  InitializedNotification,
  DidChangeConfigurationNotification,
  DidOpenTextDocumentNotification,
  TextDocumentItem,
  Position
  // You can import other LSP structures (e.g. DidChangeConfigurationNotification, etc.)
} from 'vscode-languageserver-protocol';

// --------------------
// 1. SPAWN THE SERVER
// --------------------


export async function copilotServer() : Promise<MessageConnection> {
  const copilotProcess: ChildProcess = spawn(
    'node',
    [
      './node_modules/@github/copilot-language-server/dist/language-server.js',
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
async function signIn(connection: MessageConnection){
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
async function init(connection: MessageConnection) {
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
  focalMethodSource: string,
  testFileName: string,
  unitTestTemplate: string,
  languageCode: string
): Promise<any> {
  try {
    // 1) Create a “prompt” that provides context about what we want Copilot to do.
    const promptContent = `
/*
Language: ${languageCode}
Test File: ${testFileName}

Instructions / Template:
${unitTestTemplate}

Focal Method Source:
${focalMethodSource}

// Goal: Write comprehensive unit tests based on the above method and template.
*/
`;

    // 2) We’ll represent this prompt as if it were a file in the workspace.
    //    Construct a URI for it, and open the file (didOpen) so Copilot can index the text.
    const docUri = 'file:///virtual/TestGenerationPrompt.txt';
    const version = 1;

    const textDocument: TextDocumentItem = {
      uri: docUri,
      languageId: languageCode,
      version,
      text: promptContent
    };

    // Notify the server that this doc is open
    connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument
    });

    // 3) Build the request parameters for "panel completion."
    //    We typically pick a position near the end of the document
    //    so Copilot can see everything above it.
    const lines = promptContent.split('\n');
    const docLineCount = lines.length;
    const lastLineIndex = docLineCount > 0 ? docLineCount - 1 : 0;
    const lastLineLength = lines[lastLineIndex].length;

    const position: Position = {
      line: lastLineIndex,
      character: lastLineLength
    };

    const panelCompletionParams = {
      textDocument: {
        uri: docUri,
        version
      },
      position,
      // partialResultToken: 'some-optional-token'
    };

    // 4) Send the request to Copilot’s "panel completion" endpoint.
    //    This should return an object with an `items` array, each item having `insertText`, etc.
    console.log('Requesting Copilot panel completion for unit test generation...');
    const response = await connection.sendRequest(
      'textDocument/copilotPanelCompletion',
      panelCompletionParams
    );

    // 5) Log or return the result so you can display it to the user, etc.
    console.log('Panel Completion Response:', JSON.stringify(response, null, 2));

    return response;
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
  
  const response = await generateUnitTestsForFocalMethod(
    connection, // your MessageConnection
    focalMethod,
    testFileName,
    testTemplate,
    langCode
  );
  
  if (!response || !response.items || response.items.length === 0) {
    console.log('No suggestions were returned by Copilot.');
    return;
  }

  const firstSuggestion = response.items[0];
  const suggestedTestCode = firstSuggestion.insertText || '';

  console.log('Copilot suggestion chosen:', suggestedTestCode);

  // Step C: Actually create the test file on disk
  try {
    fs.writeFileSync(testFileName, suggestedTestCode, 'utf8');
    console.log(`Test file "${testFileName}" created successfully.`);
  } catch (err) {
    console.error(`Failed to create test file "${testFileName}":`, err);
    return;
  }
  // const docUri = '/LSPAI/src/copilot.ts'; // adapt to your local file
  // const docText = `function greet(name: string) {\n  return "Hello, " + name;\n}\n\n`;  
  // openTextDocument(docUri, docText);

  // // Wait a bit, then request an inline completion
  // await new Promise((resolve) => setTimeout(resolve, 2000));

  // // For example, let's request a completion at line 4, character 0
  // await requestInlineCompletion(docUri, 4, 0);

  // ... you can also sign out or handle partial acceptance, etc.
}

main().catch(console.error);
