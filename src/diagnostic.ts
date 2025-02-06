// diagnostic.ts
import * as vscode from 'vscode';
import * as path from 'path';
import {DecodedToken, getDecodedTokensFromLine, getDecodedTokensFromRange, retrieveDef} from './token';
import {closeActiveEditor} from './utils';
import {processParentDefinition, constructSymbolRelationShip, classifyTokenByUri} from './retrieve';
import { isBaseline } from './experiment';
import { getSymbolUsageInfo } from './reference';
export enum DiagnosticTag {
    Unnecessary = 1,
    Deprecated
}

function chooseDiagnostic(diag: vscode.Diagnostic): boolean {
    return diag.severity <= vscode.DiagnosticSeverity.Warning
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
    	// Close the editor with the saved version
    // console.log(text)
    const diagnostics = await getDiagnosticsForUri(uri);
    const filteredDiagnostics = diagnostics.filter(diagnostic => chooseDiagnostic(diagnostic));
    return filteredDiagnostics;
}

async function getDiagnosticsForUri(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
    console.log('Initial diagnostics:', vscode.languages.getDiagnostics(uri));

    return new Promise((resolve, reject) => {
        try {
            // Get initial diagnostics
            let diagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(uri);

            // Set up a listener for diagnostics changes
            const diagnosticsChangedDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
                if (event.uris.some(updatedUri => updatedUri.toString() === uri.toString())) {
                    console.log('Diagnostics changed event triggered for URI:', uri.toString());

                    // Update diagnostics
                    diagnostics = vscode.languages.getDiagnostics(uri);
                    console.log('Updated diagnostics:', diagnostics);

                    // Clear the timeout to prevent it from firing
                    clearTimeout(timeout);

                    // Dispose the listener to avoid memory leaks
                    diagnosticsChangedDisposable.dispose();
                    console.log('Disposed diagnostics change listener');

                    // Resolve the promise with the updated diagnostics
                    resolve(diagnostics);
                }
            });

            console.log('Waiting for diagnostics to be updated...');

            // Set a timeout to avoid hanging forever in case diagnostics don't change
            const timeout = setTimeout(() => {
                console.log('Timeout reached. Returning initial diagnostics.');
                diagnosticsChangedDisposable.dispose(); // Cleanup the listener if timeout occurs
                resolve(diagnostics); // Resolve with the initial diagnostics
            }, 10000);  // 10 seconds timeout (adjust as needed)

        } catch (error) {
            reject(new Error(`Error while fetching diagnostics: ${error}`));
        }
    });
}

function getLinesTexts(startLine: number, endLine: number, document: vscode.TextDocument): string {
    let fullText = '';
    for (let line = startLine; line <= endLine; line++) {
        fullText += document.lineAt(line).text.trim() + '\n';  // Trim and append each line
    }
    fullText = fullText.trim();  // Optional: Remove any extra trailing newline
    console.log(fullText);
    return fullText;
}

function getDiagnosticRelatedInfo(uri: vscode.Uri, diag: vscode.Diagnostic): string {
    let relatedInfo = '';
    if (diag.relatedInformation){
        for (const info of diag.relatedInformation) {
            relatedInfo += `${info.message} from ${path.relative(uri.fsPath, info.location.uri.fsPath)}\n`;
        }
    }
    return relatedInfo;
}

export async function DiagnosticsToString(uri: vscode.Uri, vscodeDiagnostics: vscode.Diagnostic[], method: string): Promise<string[]> {
    // Open the document
    const document = await vscode.workspace.openTextDocument(uri);

    // // Attempt to find an active editor for the document

    // // Close the editor if found

    // if (!editor) {
    //     vscode.window.showErrorMessage('No active editor found for the given URI.');
    //     return [];
    // }

    // Filter diagnostics by severity (Error > Warning > Information > Hint)
    const sortedDiagnostics = vscodeDiagnostics.filter(diag => chooseDiagnostic(diag));

    console.log(sortedDiagnostics);

    // Process each diagnostic separately
    const diagnosticMessages: string[] = [];
    diagnosticMessages.push('The error messages are:\n \`\`\`');
    const dependencyTokens: DecodedToken[] = [];
    for (const diag of sortedDiagnostics) {
        // Retrieve decoded tokens for the specific line
        const decodedTokens = await getDecodedTokensFromLine(document, diag.range.start.line);
        console.log(`Retrieved decoded tokens for line ${diag.range.start.line}:`, decodedTokens.map(token => token.word));
        await retrieveDef(document, decodedTokens);
        dependencyTokens.push(...decodedTokens);
        // const diagnosticMessage = `${getSeverityString(diag.severity)} in ${document.getText(diag.range)} [Line ${diag.range.start.line + 1}] : ${diag.message}`;
        const diagnosticMessage = `${getSeverityString(diag.severity)} at : ${getLinesTexts(diag.range.start.line, diag.range.end.line, document)} [Line ${diag.range.start.line + 1}] : ${diag.message}`;
        console.log(`Pushing Diagnostic message: ${diagnosticMessage}`);
        diagnosticMessages.push(diagnosticMessage);
        const relInfo = getDiagnosticRelatedInfo(uri, diag);
        if (relInfo){
            diagnosticMessages.push(relInfo);
        }
    }
    try {
        const tokenMap = await classifyTokenByUri(document, dependencyTokens);
            
        // Retrieve symbol details for each token
        if (!isBaseline(method)) {
            console.log('Processing symbol relationships...');
            const symbolMaps = await constructSymbolRelationShip(tokenMap);
            let dependencies = "\`\`\`\nRefer below information and fix the error\n\`\`\`";
            for (const def of symbolMaps) {
                console.log('Processing symbol map:', def);
                const currDependencies = await processParentDefinition(def, '', "dependent", true);
                dependencies += currDependencies;
            }
            if (dependencyTokens.length > 0) {
                const refString = await getSymbolUsageInfo(document, dependencyTokens);
                diagnosticMessages.push(refString);
            }
            if (symbolMaps.length > 0) {
                diagnosticMessages.push(dependencies);
            } else {
                console.warn('No symbol relationships found.');
                console.log(diagnosticMessages.join('\n'));
            }
        }
    } catch (error) {
        console.error('Error processing diagnostics:', error);
    }
    diagnosticMessages.push('\`\`\`');
    console.log(`final diagnosticMessages: ${diagnosticMessages}`);
    // await closeActiveEditor(editor);
    return diagnosticMessages;
}

