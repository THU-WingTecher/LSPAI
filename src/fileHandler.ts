// fileHandler.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Uri, WorkspaceEdit, workspace } from 'vscode';
import * as vscode from 'vscode';

export function writeCodeToTempFile(code: string, extension: string = 'ts'): string {
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `fix_${Date.now()}.${extension}`);
    fs.writeFileSync(tempFilePath, code, { encoding: 'utf-8' });
    return tempFilePath;
}

export async function updateOriginalFile(filePath: string, newCode: string): Promise<void> {
    const edit = new WorkspaceEdit();
    const uri = vscode.Uri.file(filePath);
    const document = await workspace.openTextDocument(uri);
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
    );
    edit.replace(uri, fullRange, newCode);
    await workspace.applyEdit(edit);
}

export async function saveGeneratedCodeToFolder(code: string, fileName: string): Promise<void> {
	const folderPath = path.dirname(fileName);
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}

	fs.writeFileSync(fileName, code, 'utf8');
	console.log(`Generated code saved to ${fileName}`);
}
