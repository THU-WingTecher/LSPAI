import * as vscode from 'vscode';
import * as path from 'path';
import { getConfigInstance } from './config';
import { closeEditor } from './lsp/helper';
import { saveCode } from './fileHandler';

function getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor) {
    let currentLine = textEditor.visibleRanges[0].start.line;
    const endLine = textEditor.visibleRanges[0].end.line;
    let code = '';

    while (currentLine < endLine) {
        code += `${currentLine + 1}: ${textEditor.document.lineAt(currentLine).text} \n`;
        currentLine++;
    }
    return code;
}

// function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string) {
//     const decorationType = vscode.window.createTextEditorDecorationType({
//         after: {
//             contentText: ` ${suggestion.substring(0, 25) + "..."}`,
//             color: "grey",
//         },
//     });

//     const lineLength = editor.document.lineAt(line - 1).text.length;
//     const range = new vscode.Range(
//         new vscode.Position(line - 1, lineLength),
//         new vscode.Position(line - 1, lineLength),
//     );

//     const decoration = { range: range, hoverMessage: suggestion };

//     editor.setDecorations(decorationType, [decoration]);
// }

function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string) {
    const decorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ` ${suggestion.substring(0, 25) + "..."}`,
            color: "grey",
        },
    });

    const lineLength = editor.document.lineAt(line - 1).text.length;
    const range = new vscode.Range(
        new vscode.Position(line - 1, lineLength),
        new vscode.Position(line - 1, lineLength),
    );

    const decoration = { range: range, hoverMessage: suggestion };

    editor.setDecorations(decorationType, [decoration]);
}

export async function showDiffAndAllowSelection(newContent: string, languageId: string, fileName: string) {
    // Create a new untitled document with the new content
    const untitledDocument = await vscode.workspace.openTextDocument({ content: newContent, language: languageId });
    const editor = await vscode.window.showTextDocument(untitledDocument, vscode.ViewColumn.Beside);

    // Calculate the range for the entire document
    const fullRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(newContent.length)
    );

    const changeDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(181, 181, 104, 0.34)', // Light yellow background
        border: '1px solid yellow'
    });

    editor.setDecorations(changeDecorationType, [fullRange]);
	const editPromise = editor.edit(editBuilder => {
        const endPosition = editor.document.positionAt(newContent.length);
        editBuilder.insert(endPosition, '\n\n');
    });

    // Wait for the edit to complete before adding decorations
    await editPromise;
	const rejectLineNumber = editor.document.lineCount - 1;
	const acceptLineNumber = rejectLineNumber - 1;
	const rejectLineLength = editor.document.lineAt(rejectLineNumber).text.length;
	const acceptLineLength = editor.document.lineAt(acceptLineNumber).text.length;
    const rejectPosition = new vscode.Position(rejectLineNumber, rejectLineLength);
	const acceptPosition = new vscode.Position(acceptLineNumber, acceptLineLength);
    // Render "Accept" and "Reject" options in the editor
    const acceptDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ' [Accept]',
            color: 'green',
            margin: '0 0 0 1em',
            textDecoration: 'underline'
        }
    });
    const acceptRange = new vscode.Range(acceptPosition, acceptPosition);
    console.log(`acceptRange: ${acceptRange}`);
    const rejectDecorationType = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ' [Reject]',
            color: 'red',
            margin: '0 0 0 1em',
            textDecoration: 'underline'
        }
    });

    // Place reject button on the same line as accept
    const rejectRange = new vscode.Range(rejectPosition, rejectPosition);
	console.log(`rejectRange: ${rejectRange}`);

    editor.setDecorations(acceptDecorationType, [acceptRange]);
    editor.setDecorations(rejectDecorationType, [rejectRange]);
    // Get the last line position

    const disposable = vscode.window.onDidChangeTextEditorSelection(async (event) => {
        if (event.textEditor.document.uri.toString() !== untitledDocument.uri.toString()) {
            return;
        }
        
        const position = event.selections[0].active;
        
        // Check for Accept/Reject button clicks (both on last line)
        if (position.line === acceptLineNumber) {
			// Accept clicked
            const lineText = editor.document.lineAt(position.line).text;
            const lineLength = lineText.length;
			changeDecorationType.dispose();
			acceptDecorationType.dispose();
			rejectDecorationType.dispose();
			disposable.dispose();
			await closeEditor(editor);
			const savePath = path.join(getConfigInstance().workspace, getConfigInstance().savePath, fileName);
			await saveCode(newContent, "", savePath);
			// show document with the new content
			const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(savePath));
			await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
			// if (fs.existsSync(traditionalTestFilePath)) {
			// 	fs.unlinkSync(traditionalTestFilePath);
			// }
			// // closeEditor(editor);
			// if (editor.document.isUntitled) {
			// 	const uri = vscode.Uri.file(traditionalTestFilePath);
			// 	await vscode.workspace.fs.writeFile(uri, Buffer.from(newContent));
			// }
			// await closeEditor(editor);
            }
            // If clicked after [Accept] where [Reject] would appear
            else if (position.line === rejectLineNumber) {
                // Reject clicked
                changeDecorationType.dispose();
                acceptDecorationType.dispose();
                rejectDecorationType.dispose();
                disposable.dispose();
				await closeEditor(editor);
            }
			
    });

    // Update hover provider to match the new button positions
    const hoverDisposable = vscode.languages.registerHoverProvider({ scheme: 'untitled', language: languageId }, {
        provideHover(document, position, token) {
			console.log(`current hover: ${position.line}, ${position.character}`);
            if (document.uri.toString() !== untitledDocument.uri.toString()) {
                return null;
            }
            
            if (position.line === acceptLineNumber) {
                // Hover for Accept button
                    return new vscode.Hover('Accept these changes');
                } 
                // Hover for Reject button
                else if (position.line === rejectLineNumber) {
                    return new vscode.Hover('Reject these changes and close the document');
                }
            
            return null;
        }
    });
    
    // Clean up hover provider when document closes
    const closeDisposable = vscode.workspace.onDidCloseTextDocument(doc => {
        if (doc.uri.toString() === untitledDocument.uri.toString()) {
            hoverDisposable.dispose();
            disposable.dispose();
            closeDisposable.dispose();
        }
    });
}


export async function reportProgressWithCancellation(
    progress: vscode.Progress<{ message: string; increment: number }>,
    token: vscode.CancellationToken,
    message: string,
    increment: number
): Promise<boolean> {
    if (token.isCancellationRequested) {
		console.log(`Cancellation requested: ${message}`);
		vscode.window.showInformationMessage(`Cancellation requested`);
        return false;
    }
    progress.report({ message, increment });
    return true;
}