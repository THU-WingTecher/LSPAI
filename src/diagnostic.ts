// diagnostic.ts
import * as vscode from 'vscode';
import {DecodedToken, getDecodedTokensFromLine, getDecodedTokensFromRange, retrieveDef} from './token';
import {getSymbolDetail} from './utils';
import {processParentDefinition, constructSymbolRelationShip, classifyTokenByUri} from './retrieve';
import { isBaseline } from './generate';
export enum DiagnosticTag {
    Unnecessary = 1,
    Deprecated
}

export function getSeverityString(severity: vscode.DiagnosticSeverity): string {
    switch (severity) {
        case vscode.DiagnosticSeverity.Error:
            return "Error";
        case vscode.DiagnosticSeverity.Warning:
            return "Warning";
        case vscode.DiagnosticSeverity.Information:
            return "Information";
        case vscode.DiagnosticSeverity.Hint:
            return "Hint";
        default:
            return "Unknown";
    }
}

export async function getDiagnosticsForFilePath(filePath: string): Promise<vscode.Diagnostic[]> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    console.log(text)
    return getDiagnosticsForUri(uri);
}

async function getDiagnosticsForUri(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
    console.log(vscode.languages.getDiagnostics(uri))
    return new Promise((resolve, reject) => {
        // Get initial diagnostics
        let diagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(uri);

        // Set up a listener for diagnostics changes
        const diagnosticsChangedDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
            console.log('Diagnostics changed event triggered');
            // Check if diagnostics for the saved file have changed
            diagnostics = vscode.languages.getDiagnostics(uri);
            console.log('Updated diagnostics:', diagnostics);
            diagnosticsChangedDisposable.dispose();  // Stop listening once we get the diagnostics
            console.log('Disposed diagnostics change listener');
            // Resolve the promise with the updated diagnostics
            resolve(diagnostics);
        });

        console.log('Waiting for diagnostics to be updated...');

        // Set a timeout to avoid hanging forever in case diagnostics don't change
        const timeout = setTimeout(() => {
            console.log('Timeout reached. Returning initial diagnostics.');
            diagnosticsChangedDisposable.dispose(); // Cleanup the listener if timeout occurs
            resolve(diagnostics); // Resolve with the initial diagnostics
        }, 20000);  // 5 seconds timeout (you can adjust this as needed)

        // Optionally, reject the promise if something goes wrong
        // reject(new Error('Error while fetching diagnostics'));
    });
}

// async function getDiagnosticsForUri(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
//     return new Promise((resolve, reject) => {
//         // Get initial diagnostics
//         let diagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(uri);
//         console.log('Initial diagnostics:', diagnostics);

//         // Set up a listener for diagnostics changes
//         const diagnosticsChangedDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
//             console.log('Diagnostics changed event triggered');

//             // Check if diagnostics for the saved file have changed
//             diagnostics = vscode.languages.getDiagnostics(uri);
//             console.log('Updated diagnostics:', diagnostics);

//             diagnosticsChangedDisposable.dispose();  // Stop listening once we get the diagnostics
//             console.log('Disposed diagnostics change listener');

//             // Resolve the promise with the updated diagnostics
//             resolve(diagnostics);
//         });

//         console.log('Waiting for diagnostics to be updated...');
//     });
// }

// export async function DiagnosticsToString(uri: vscode.Uri, vscodeDiagnostics: vscode.Diagnostic[]): Promise<string[]> {
//     // Sort diagnostics by severity (Error > Warning > Information > Hint)
//     const document = await vscode.workspace.openTextDocument(uri);
//     const sortedDiagnostics = vscodeDiagnostics.filter(diag => diag.severity === vscode.DiagnosticSeverity.Error);
//     console.log(sortedDiagnostics)
//     // Extract relevant information for each diagnostic to create prompts
//     const diagnosticMessages: string[] = sortedDiagnostics.map((diag, index) => {
//         return `${getSeverityString(diag.severity)} in ${document.getText(diag.range)}[Line ${diag.range.start.line}] : ${diag.message}`;
//     });
//     return diagnosticMessages;
// }

export async function DiagnosticsToString(uri: vscode.Uri, vscodeDiagnostics: vscode.Diagnostic[], method: string): Promise<string[]> {
    // Open the document
    const document = await vscode.workspace.openTextDocument(uri);

    // Attempt to find an active editor for the document
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());

    if (!editor) {
        vscode.window.showErrorMessage('No active editor found for the given URI.');
        return [];
    }

    // Filter diagnostics by severity (Error > Warning > Information > Hint)
    const sortedDiagnostics = vscodeDiagnostics.filter(diag => diag.severity === vscode.DiagnosticSeverity.Error);

    console.log(sortedDiagnostics);

    // Process each diagnostic separately
    const diagnosticMessages: string[] = [];
    const dependencyTokens: DecodedToken[] = [];
    for (const diag of sortedDiagnostics) {
        // Retrieve decoded tokens for the specific line
        const decodedTokens = await getDecodedTokensFromLine(editor, diag.range.start.line);
        await retrieveDef(editor, decodedTokens);
        dependencyTokens.push(...decodedTokens);
        const diagnosticMessage = `${getSeverityString(diag.severity)} in ${document.getText(diag.range)} [Line ${diag.range.start.line + 1}] : ${diag.message}`;
        diagnosticMessages.push(diagnosticMessage);
    }
    try {
        const tokenMap = await classifyTokenByUri(editor, dependencyTokens);
            
        // Retrieve symbol details for each token
        if (!isBaseline(method)) {
            const symbolMaps = await constructSymbolRelationShip(tokenMap);
            let dependencies = "";
            for (const def of symbolMaps) {
                const currDependencies = await processParentDefinition(def);
                dependencies += currDependencies;
            }
            diagnosticMessages.push(dependencies);
        }
    } catch (error) {
        console.error('Error processing diagnostics:', error);
    }
    console.log(diagnosticMessages);
    return diagnosticMessages;
}


// const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY'; // Replace with your OpenAI API key
// const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// interface OpenAIChatRequest {
//     model: string;
//     messages: { role: string; content: string }[];
//     max_tokens?: number;
//     temperature?: number;
// }

// interface OpenAIChatResponse {
//     choices: { message: { role: string; content: string } }[];
// }

// export async function getLLMResponse(prompt: string): Promise<string> {
//     const requestPayload: OpenAIChatRequest = {
//         model: 'gpt-4',
//         messages: [
//             { role: 'system', content: 'You are a helpful assistant that fixes code based on provided diagnostics.' },
//             { role: 'user', content: prompt }
//         ],
//         max_tokens: 1500,
//         temperature: 0.2
//     };

//     try {
//         const response = await axios.post<OpenAIChatResponse>(OPENAI_API_URL, requestPayload, {
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${OPENAI_API_KEY}`
//             }
//         });

//         const aiMessage = response.data.choices[0].message.content;
//         return aiMessage;
//     } catch (error) {
//         console.error('Error communicating with LLM:', error);
//         throw new Error('LLM communication failed');
//     }
// }

