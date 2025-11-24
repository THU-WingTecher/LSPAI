import * as vscode from 'vscode';
import { VscodeRequestManager } from './vscodeRequestManager';


export async function getCodeAction(uri: vscode.Uri, diag: vscode.Diagnostic): Promise<vscode.CodeAction[]> {
    const codeActions = await VscodeRequestManager.codeActions(uri, diag.range);
    return codeActions as vscode.CodeAction[];
}
