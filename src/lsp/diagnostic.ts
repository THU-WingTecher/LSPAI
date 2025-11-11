// diagnostic.ts
import * as vscode from 'vscode';
import * as path from 'path';
import {getDecodedTokensFromLine} from './token';
import { DecodedToken } from './types';
import { retrieveDefs } from './definition';
import {processParentDefinition, constructSymbolRelationShip, classifyTokenByUri} from './definition';
import { getSymbolUsageInfo } from './reference';
import { activate } from './helper';
import { GenerationType } from '../config';
import { getConfigInstance } from '../config';
import { wrapWithComment } from '../languageAgnostic';
import { VscodeRequestManager } from './vscodeRequestManager';
export enum DiagnosticTag {
    Unnecessary = 1,
    Deprecated
}

const pyFilterMessages = ["is not accessed"];
export function filterDiagnosticByMessage(diag: vscode.Diagnostic, languageId: string): boolean {
    if (languageId === "python") {
        // if the message is in the pyFilterMessages, we filter it out
        // return false if the message is in the pyFilterMessages
        if (pyFilterMessages.some(msg => diag.message.includes(msg))) {
            return false;
        }
    }
    return true;
}

export function chooseDiagnostic(diag: vscode.Diagnostic, languageId: string): boolean {
    if (languageId === "python") {
        // pylance sometimes reports error with warning severity
        // we do not filter, but we will filter out diag by its messages 
        return diag.severity <= vscode.DiagnosticSeverity.Warning && filterDiagnosticByMessage(diag, languageId);
    }
    return diag.severity < vscode.DiagnosticSeverity.Warning;
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

export async function getCodeAction(uri: vscode.Uri, diag: vscode.Diagnostic): Promise<vscode.CodeAction[]> {
    const codeActions = await VscodeRequestManager.codeActions(uri, diag.range);
    return codeActions as vscode.CodeAction[];
}

export async function applyCodeActions(targetUri: vscode.Uri, codeActions: vscode.CodeAction[]) {
    // Filter for quick fix actions only
    const quickFixes = codeActions.filter(action => 
        action.kind && action.kind.contains(vscode.CodeActionKind.QuickFix)
    );
    console.log('quickFixes', quickFixes);
    // Apply each quick fix
    for (const fix of quickFixes) {
        console.log('fix', fix);
        if (fix.edit) {
            // Double check we're only modifying the target file
            const edits = fix.edit.entries();
            const isTargetFileOnly = edits.every(([uri]) => uri.fsPath === targetUri.fsPath);
            
            if (isTargetFileOnly) {
                await vscode.workspace.applyEdit(fix.edit);
            }
        }
    }
}

export function markTestCodeWithDiagnostic(document: vscode.TextDocument, groupedDiagnostics: Map<string, vscode.Diagnostic[]>): string {
    const lines = document.getText().split('\n');
    const languageId = document.languageId;
    
    // Process each group of diagnostics
    for (const [message, diagnostics] of groupedDiagnostics) {
        // Sort diagnostics by line number in descending order to handle multi-line diagnostics correctly
        const sortedDiagnostics = [...diagnostics].sort((a, b) => 
            b.range.start.line - a.range.start.line
        );

        for (const diag of sortedDiagnostics) {
            const startLine = diag.range.start.line;
            const endLine = diag.range.end.line;
            const originalText = getLinesTexts(startLine, endLine, document);
            const errorMessage = `Error Group: "${message}"`;
            const markedText = `${originalText} ${wrapWithComment(errorMessage, languageId)}`;
            
            // Replace the content of all affected lines with the marked text
            lines[startLine] = markedText;
            // Clear any additional lines in multi-line diagnostics
            for (let i = startLine + 1; i <= endLine; i++) {
                lines[i] = '';
            }
        }
    }
    
    return lines.join('\n');
}

export function groupDiagnosticsByMessage(diagnostics: vscode.Diagnostic[]): Map<string, vscode.Diagnostic[]> {
    const groupedDiagnostics = new Map<string, vscode.Diagnostic[]>();
    
    for (const diag of diagnostics) {
        if (diag.relatedInformation){
            for (const info of diag.relatedInformation){
                console.log('info', info);
            }
        }
        const key = diag.message;
        if (!groupedDiagnostics.has(key)) {
            groupedDiagnostics.set(key, []);
        }
        groupedDiagnostics.get(key)!.push(diag);
    }

    return groupedDiagnostics;
}

export function groupedDiagnosticsToString(groupedDiagnostics: Map<string, vscode.Diagnostic[]>, document: vscode.TextDocument): string[] {
    const result: string[] = [];
    console.log('Grouped Diagnostics by Message:');
    console.log('==============================');
    for (const [message, diagList] of groupedDiagnostics) {
        result.push(`\nMessage: "${message}"`);
        result.push(`Number of occurrences: ${diagList.length}`);
        result.push('Locations:');
        diagList.forEach((diag, index) => {
            result.push(`  ${index + 1}. Line ${diag.range.start.line + 1}, ${getLinesTexts(diag.range.start.line, diag.range.end.line, document)}`);
        });
        result.push('------------------------------');
    }
    return result;
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
    const sortedDiagnostics = vscodeDiagnostics.filter(diag => diag.severity < vscode.DiagnosticSeverity.Warning);
    console.log(sortedDiagnostics.map(diag => diag.message));

    // Process each diagnostic separately
    const diagnosticMessages: string[] = [];
    diagnosticMessages.push('The error messages are:\n \`\`\`');
    const dependencyTokens: DecodedToken[] = [];
    for (const diag of sortedDiagnostics) {
        // Retrieve decoded tokens for the specific line
        const decodedTokens = await getDecodedTokensFromLine(document, diag.range.start.line);
        console.log(`Retrieved decoded tokens for line ${diag.range.start.line}:`, decodedTokens.map(token => token.word));
        await retrieveDefs(document, decodedTokens);
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
        if (getConfigInstance().generationType !== GenerationType.NAIVE) {
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

export async function getDiagnosticsForFilePath(filePath: string): Promise<vscode.Diagnostic[]> {
    // We should move file to the 
    // ${project.basedir}/src/lsprag/test/java --> to get the correct and fast diagnostics


    const uri = vscode.Uri.file(filePath);
    // const document = await vscode.workspace.openTextDocument(uri);
    // const text = document.getText();
    	// Close the editor with the saved version
    // console.log(text)
    await activate(uri);
    // const diagnostics = await getDiagnosticsForUri(uri);
    const diagnostics = await vscode.languages.getDiagnostics(uri);
    console.log('initial diagnostics', diagnostics.map(diag => diag.message));
    return diagnostics;
}

export async function getDiagnosticsForUri(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
    console.log('Initial diagnostics:', await vscode.languages.getDiagnostics(uri));
    await activate(uri);
    return new Promise((resolve, reject) => {
        try {
            // Get initial diagnostics
            let diagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(uri);
            
            // If we already have diagnostics, return them immediately
            if (diagnostics && diagnostics.length > 0) {
                console.log('Found initial diagnostics, returning immediately');
                return resolve(diagnostics);
            }

            let attempts = 0;
            const maxAttempts = 3;
            const retryInterval = 2000; // 2 seconds

            const checkDiagnostics = () => {
                diagnostics = vscode.languages.getDiagnostics(uri);
                if (diagnostics && diagnostics.length > 0) {
                    console.log('Found diagnostics on retry:', diagnostics);
                    cleanup();
                    return resolve(diagnostics);
                }

                attempts++;
                if (attempts >= maxAttempts) {
                    console.log('Max attempts reached, returning current diagnostics');
                    cleanup();
                    return resolve(diagnostics);
                }
            };

            // Set up a listener for diagnostics changes
            const diagnosticsChangedDisposable = vscode.languages.onDidChangeDiagnostics((event) => {
                if (event.uris.some(updatedUri => updatedUri.toString() === uri.toString())) {
                    console.log('Diagnostics changed event triggered for URI:', uri.toString());
                    diagnostics = vscode.languages.getDiagnostics(uri);
                    console.log('Updated diagnostics:', diagnostics);
                    cleanup();
                    resolve(diagnostics);
                }
            });

            const intervalId = setInterval(checkDiagnostics, retryInterval);

            const cleanup = () => {
                clearInterval(intervalId);
                diagnosticsChangedDisposable.dispose();
            };

            // Set a final timeout
            setTimeout(() => {
                console.log('Final timeout reached');
                cleanup();
                resolve(diagnostics);
            }, 10000); // 10 seconds total timeout

        } catch (error) {
            reject(new Error(`Error while fetching diagnostics: ${error}`));
        }
    });
}

export function getLinesTexts(startLine: number, endLine: number, document: vscode.TextDocument): string {
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

