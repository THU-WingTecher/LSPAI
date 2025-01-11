// fileHandler.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Uri, WorkspaceEdit, workspace } from 'vscode';
import * as vscode from 'vscode';
import { getPackageStatement, summarizeClass } from './retrieve';

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


export function genFileNameWithGivenSymbol(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, language: string): string {
    const fileName = document.fileName.split('/').pop()!.replace(/\.\w+$/, '');
    const funcName = document.getText(symbol.selectionRange);
    const finalName = `${fileName}_${funcName}`;
    if (language === 'java') {
        const packageStatements = getPackageStatement(document, document.languageId)
        const packageStatement = packageStatements ? packageStatements[0] : '';
        const packageFolder = packageStatement.replace(";","").split(' ')[1].replace(/\./g, '/');
        return `${packageFolder}/${finalName}`;
    } else {
        return finalName;
    }
}


export function getUniqueFileName(folderPath: string, baseName: string, suffix: string): string {
    let counter = 1;

    // Initial new file name with counter right before Test.${suffix}
    let newFileName = `${baseName}${counter}${suffix}`;
    
    // Check if the file exists, and increment the counter if it does
    while (fs.existsSync(`${folderPath}/${newFileName}`)) {
        counter++;
        newFileName = `${baseName}${counter}${suffix}`;
    }

    return `${folderPath}/${newFileName}`;
}
