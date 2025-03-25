// fileHandler.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceEdit, workspace } from 'vscode';
import { getPackageStatement } from './retrieve';
import { getLanguageSuffix } from './language';
import { DEFAULT_FILE_ENCODING, TIME_FORMAT_OPTIONS, getConfigInstance } from './config';
import { goSpecificEnvGen, sleep } from './helper';
import { ExpLogs } from './log';

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

export async function saveGeneratedCodeToFolder(code: string, fileName: string): Promise<void> {
	const folderPath = path.dirname(fileName);
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}

	fs.writeFileSync(fileName, code, 'utf8');
	console.log(`Generated code saved to ${fileName}`);
}

export async function saveGeneratedCodeToIntermediateLocation(code: string, fullfileName: string, folderName: string): Promise<string> {
    const fullPath = path.join(folderName, fullfileName);
	const folderPath = path.dirname(fullPath);
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}
    fs.writeFileSync(fullPath, code, 'utf8');
    console.log(`Generated code saved to ${fullPath}`);
    return fullPath;
}

export function findFiles(folderPath: string, Files: string[] = [], language:string, suffix:string) {
    fs.readdirSync(folderPath).forEach(file => {
        const fullPath = path.join(folderPath, file);
        if (fs.statSync(fullPath).isDirectory() && !path.basename(fullPath).startsWith('results_')) {
            findFiles(fullPath, Files, language, suffix); // Recursively search in subdirectory
        } else if (file.endsWith(`.${suffix}`) && !path.basename(fullPath).startsWith('results_')) {
            if (language === "go" && file.toLowerCase().includes('test')) {
            console.log(`Ignoring test file: ${fullPath}`);
            } else {
            Files.push(fullPath);
            }
        }
    });
}


export function _generateFileNameForDiffLanguage(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, folderPath: string, language:string, generated: string[], round: number){
    const fileSig = genFileNameWithGivenSymbol(document, symbol, language);
    const suffix = getLanguageSuffix(language); // Get suffix based on language
    let fileName;
    let baseName;
    let disposableSuffix;
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

export function generateFileNameForDiffLanguage(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, folderPath: string, language:string, generated: string[], round: number){
    const fileSig = genFileNameWithGivenSymbol(document, symbol, language);
    const suffix = getLanguageSuffix(language); // Get suffix based on language
    let fileName;
    let baseName;
    let disposableSuffix;
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

    return { document, symbol, fileName: getUniqueFileName(folderPath, baseName, disposableSuffix, generated, round) };
}

export function genFileNameWithGivenSymbol(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, language: string): string {
    const fileName = document.fileName.split('/').pop()!.replace(/\.\w+$/, '');
    const funcName = document.getText(symbol.selectionRange);
    const finalName = `${fileName}_${funcName}`;
    if (language === 'java') {
        const packageStatements = getPackageStatement(document, document.languageId);
        const packageStatement = packageStatements ? packageStatements[0] : '';
        const packageFolder = packageStatement.replace(";", "").split(' ')[1].replace(/\./g, '/');
        return `${packageFolder}/${finalName}`;
    } else if (language === 'go'){
        const relPath = path.relative(vscode.workspace.rootPath!, document.fileName);
        return `${relPath.replace(".go","")}_${funcName}`;
    } else {
        return finalName;
    }
}


export function getUniqueFileName(folderPath: string, baseName: string, suffix: string, filePaths: string[], round: number): string {
    let counter = 1;

    // Initial new file name with counter right before Test.${suffix}
    let newFileName = `${baseName}_${round}_${counter}${suffix}`;
    
    // Check if the file name is unique by checking the folder and filePaths
    while (filePaths.map(f => f.toLowerCase()).includes(path.join(folderPath, newFileName).toLowerCase()) || fs.existsSync(path.join(folderPath, newFileName))) {
        counter++;
        newFileName = `${baseName}_${round}_${counter}${suffix}`;
    }
    
    // Prepare the full path for the unique file
    const filePath = path.join(folderPath, newFileName);
    
    // Add the new file path to the list to prevent future name clashes
    filePaths.push(filePath);
    
    // Return the full path of the unique file name
    return filePath;
}


export async function saveGeneratedCodeToSpecifiedFolder(code: string, fullfileName: string, folderName: string): Promise<string> {
    // We should move file to the 
    // ${project.basedir}/src/lspai/test/java --> to get the correct and fast diagnostics
    // <plugin>
    //     <groupId>org.codehaus.mojo</groupId>
    //     <artifactId>build-helper-maven-plugin</artifactId>
    //     <version>3.5.0</version>
    //     <executions>
    //         <execution>
    //             <id>add-test-source</id>
    //             <phase>generate-test-sources</phase>
    //             <goals>
    //                 <goal>add-test-source</goal>
    //             </goals>
    //             <configuration>
    //                 <sources>
    //                     <!-- Add your additional test source directory -->
    //                     <source>${project.basedir}/src/test/java</source>
    //                     <source>${project.basedir}/src/lspai/test/java</source>
    //                 </sources>
    //             </configuration>
    //         </execution>
    //     </executions>
    // </plugin>
    const fullPath = path.join(folderName, fullfileName);
	const folderPath = path.dirname(fullPath);
	if (!fs.existsSync(folderPath)) {
		fs.mkdirSync(folderPath, { recursive: true });
	}
    fs.writeFileSync(fullPath, code, 'utf8');
    console.log(`Generated code saved to ${fullPath}`);
    return fullPath;
}

export function eraseContent(filePath: string): void {
    // erase all the content under the filePath
    console.log('erasing content', filePath);
    fs.writeFileSync(filePath, '', 'utf8');
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
            curSavePoint = await goSpecificEnvGen(folderName, language, currentSrcPath);
            await sleep(1000);
        }
        fs.writeFileSync(curSavePoint, testCode, DEFAULT_FILE_ENCODING);
        console.log(`Generated code saved to ${curSavePoint}`);
    } else if (language === "java") {
    
        await saveGeneratedCodeToIntermediateLocation( // for history keeping
            testCode,
            fullFileName,
            folderName
        );
        const javaTestPath = path.join(getConfigInstance().workspace, javaLspaiTestPath);
        curSavePoint = await saveGeneratedCodeToSpecifiedFolder(
            testCode,
            fullFileName,
            javaTestPath
        );
    } else {
        curSavePoint = await saveGeneratedCodeToIntermediateLocation(
            testCode,
            fullFileName,
            folderName
        );
    }
    return curSavePoint;

}// Function to generate timestamp string for folder names
export function generateTimestampString(): string {
    return new Date()
        .toLocaleString('en-US', TIME_FORMAT_OPTIONS)
        .replace(/[/,: ]/g, '_');
}

const javaLspaiTestPath = path.join('src', 'lspai', 'test', 'java');
export async function saveExperimentData(expData: ExpLogs[], expLogPath: string, fileName: string, method: string) {
	const jsonFilePath = path.join(expLogPath, method, `${fileName}_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}.json`);

	// Prepare the data to be saved
	const formattedData = expData.map(log => ({
		method: log.method,
		process: log.process,
		time: log.time,
		fileName: log.fileName,
		function: log.function,
		errMsag: log.errMsag,
		llmInfo: log.llmInfo ? {
			tokenUsage: log.llmInfo.tokenUsage,
			result: log.llmInfo.result,
			prompt: log.llmInfo.prompt,
			model: log.llmInfo.model
		} : null
	}));

	const dir = path.dirname(jsonFilePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	// Check if file exists and initialize empty array if not
	let jsonContent = [];
	if (fs.existsSync(jsonFilePath)) {
		jsonContent = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
	}

	// Append the current experiment's data
	jsonContent.push(...formattedData);

	// Write the updated data
	fs.writeFileSync(jsonFilePath, JSON.stringify(jsonContent, null, 2), 'utf8');
	console.log(`Experiment data saved to ${jsonFilePath}`);
}
