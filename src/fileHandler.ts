// fileHandler.ts
// VSCode-dependent file operations
import * as vscode from 'vscode';
import * as fs from 'fs';
import { WorkspaceEdit, workspace } from 'vscode';
import { getPackageStatement } from './lsp/definition';
import { getLanguageSuffix } from './language';
import { DEFAULT_FILE_ENCODING, getConfigInstance } from './config';
import { goSpecificEnvGen, sleep } from './helper';
import { ExpLogs } from './log';
import * as path from 'path';
import { generateTimestampString } from './config';
import { generateFileNameCore } from './experiment/utils/fileNameGenerator';

// Re-export VSCode-independent utilities for backward compatibility
export { findFiles, readTxtFile, saveContextTerms } from './fileUtils';

// Note: saveContextTerms and readTxtFile are now re-exported from fileUtils above

export function getTraditionalTestDirAtCurWorkspace(language: string): string {
    const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
    if (language === 'java') {
        return path.join(workspace, 'src', 'lsprag-tests');
    } else if (language === 'go') {
        return path.join(workspace, 'src', 'lsprag-tests');
    } else if (language === 'python') {
        return path.join(workspace, 'src', 'lsprag-tests');
    } else {
        return path.join(workspace, 'lsprag-tests');
    }
}

export function getTempDirAtCurWorkspace(): string {
    const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const testDir = path.join(workspace, `results_${generateTimestampString()}`);
    return testDir;
}

export function writeCodeToTempFile(code: string, extension: string = 'ts'): string {
    const tempDir = getTempDirAtCurWorkspace();
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

export async function showGeneratedCodeWithPreview(filePath: string, column: vscode.ViewColumn = vscode.ViewColumn.Beside): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
        preview: true,
        viewColumn: column
    });
    vscode.window.showInformationMessage(`Generated code has been saved to ${filePath}`);
}

export async function saveCode(code: string, folderName: string, fileName: string): Promise<string> {
    // if file exist, add a number to the end of the file right before the suffix 
    let fullPath = path.join(folderName, fileName);
    const folderPath = path.dirname(fullPath);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    fs.writeFileSync(fullPath, code, 'utf8');
    console.log(`Code saved to ${fullPath}`);
    return fullPath;
}

// export async function saveCode(code: string, folderName: string, fileName: string): Promise<string> {

//     const fullPath = path.join(folderName, fileName);
//     const folderPath = path.dirname(fullPath);
//     if (!fs.existsSync(folderPath)) {
//         fs.mkdirSync(folderPath, { recursive: true });
//     }
//     fs.writeFileSync(fullPath, code, 'utf8');
//     console.log(`Code saved to ${fullPath}`);
//     return fullPath;
// }


// Refactor existing functions to use saveCode
export async function saveGeneratedCodeToFolder(code: string, folderName: string, fileName: string): Promise<void> {
    await saveCode(code, folderName, fileName);
}

export async function saveGeneratedCodeToIntermediateLocation(code: string, fullfileName: string, folderName: string): Promise<string> {
    return await saveCode(code, folderName, fullfileName);
}

export async function saveGeneratedCodeToSpecifiedFolder(code: string, fullfileName: string, folderName: string): Promise<string> {
    return await saveCode(code, folderName, fullfileName);
}

export async function saveToIntermediate(
    testCode: string,
    currentSrcPath: string,
    fullFileName: string,
    folderName: string,
    language: string
): Promise<string> {
    let curSavePoint: string;

    if (language === "go") {
        curSavePoint = path.join(folderName, fullFileName);
        if (!fs.existsSync(path.dirname(curSavePoint))) {
            await goSpecificEnvGen(folderName, language, currentSrcPath);
            await sleep(1000);
        }
        fs.writeFileSync(curSavePoint, testCode, DEFAULT_FILE_ENCODING);
        console.log(`Generated code saved to ${curSavePoint}`);
    } else if (language === "java") {
        await saveCode(testCode, folderName, fullFileName); // for history keeping
        const javaTestPath = path.join(getConfigInstance().workspace, javaLspragTestPath);
        curSavePoint = await saveCode(testCode, javaTestPath, fullFileName);
    } else {
        curSavePoint = await saveCode(testCode, folderName, fullFileName);
    }
    return curSavePoint;
}

export function generateFileNameForDiffLanguage(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, folderPath: string, language:string, generated: string[], round: number){
    const fileSig = genFileNameWithGivenSymbol(document, symbol, language);
    const suffix = getLanguageSuffix(language); // Get suffix based on language
    let fileName;
    let baseName;
    let disposableSuffix;
    // generate a random number between 0 and 1000
    const randomNameNumber = Math.floor(Math.random() * 1000);
    const randomName = `_${randomNameNumber}`;
    switch (language) {
        case "go":
            const testFileFormatForGo = "_test";
            fileName = `${fileSig}${testFileFormatForGo}.${suffix}`;
            baseName = fileName.replace(/(_test\.\w+)$/, '');  // This removes 'Test.${suffix}'
            disposableSuffix = fileName.replace(/^.*(_test\.\w+)$/, '$1');  // This isolates 'Test.${suffix}'
            break;
        case "java":
            const testFileFormatForJava = "Test";
            fileName = `${fileSig}${testFileFormatForJava}.${suffix}`;
            baseName = fileName.replace(/(Test\.\w+)$/, '');  // This removes 'Test.${suffix}'
            disposableSuffix = fileName.replace(/^.*(Test\.\w+)$/, '$1');  // This isolates 'Test.${suffix}'
            break;
        default:
            const uniTestFileFormat = "_test";
            fileName = `${fileSig}${uniTestFileFormat}.${suffix}`;
            baseName = fileName.replace(/(_test\.\w+)$/, '');  // This removes 'Test.${suffix}'
            disposableSuffix = fileName.replace(/^.*(_test\.\w+)$/, '$1');  // This isolates 'Test.${suffix}'
            break;
    }

    return getUniqueFileName(folderPath, baseName, disposableSuffix, generated, round);
}

/**
 * Generate file name with given symbol (VSCode version)
 * Uses shared core logic from experiment/fileNameGenerator.ts
 */
export function genFileNameWithGivenSymbol(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, language: string): string {
    // Import shared logic
    
    const fileName = document.fileName.split('/').pop()!;
    const funcName = document.getText(symbol.selectionRange);
    
    const packageString = language === 'java' ? (getPackageStatement(document, document.languageId)?.[0] || '') : '';
    const relativeFilePath = language === 'go' ? path.relative(vscode.workspace.rootPath!, document.fileName) : '';
    
    // Use shared core logic (no test suffix, no extension)
    return generateFileNameCore({
        sourceFileName: fileName,
        symbolName: funcName,
        languageId: language,
        packageString,
        relativeFilePath
    });
}

export function getUniqueFileName(folderPath: string, baseName: string, suffix: string, filePaths: string[], round: number): string {
    // Generate a random number between 1000 and 9999
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    
    // Create new file name with random number
    let newFileName;
    // if (round === -1) {
    newFileName = `${baseName}_${randomNum}${suffix}`;
    // } else {
        // newFileName = `${baseName}_${randomNum}${suffix}`;
    // }
    
    // Prepare the full path for the unique file
    const filePath = path.join(folderPath, newFileName);
    
    // Add the new file path to the list to prevent future name clashes
    filePaths.push(filePath);
    
    // Return the full path of the unique file name
    return filePath;
}

export function eraseContent(filePath: string): void {
    // erase all the content under the filePath
    console.log('erasing content', filePath);
    fs.writeFileSync(filePath, '', 'utf8');
}



const javaLspragTestPath = path.join('src', 'lsprag', 'test', 'java');
export function getFileName(fullFileName: string) {
	const savePath = path.join(getConfigInstance().savePath);
	const fileName = fullFileName.split(savePath)[1];
	if (fileName.startsWith("/")) {
		return fileName.replace("/", "");
	}
    if (fileName.includes("/")) {
        return fileName.split("/")[1];
    }
	return fileName;
}
