import { generateTimestampString } from "../fileHandler";
import { VsCodeIdeUtils } from "../ideUtils";
import * as vscode from "vscode";
import { getLanguageSuffix } from "../language";
import { findFiles } from "../fileHandler";
import { getAllSymbols } from "../utils";
import { isSymbolLessThanLines } from "../experiment";
import { getReferenceInfo } from "../reference";
import * as path from 'path';
import { SRC_PATHS, ProjectName } from "../experiment";
const ideUtils = new VsCodeIdeUtils();
import * as fs from 'fs';
const TRAIN_DATA_FOLDER = "train_data";

interface TestData {
	testId: string;
	testCode: string;
	focalId: string;
	focalPosition: vscode.Position;
	testFilePath: string;
	sourceCode: string;
}

interface FTData {
	messages: {
		role: "system" | "user" | "assistant";
		content: string;
	}[];
}

function testDataToFTData(testData: TestData): FTData {
	return {
		messages: [
			{
				role: "system",
				content: "You are a helpful coding assistant."
			},
			{
				role: "user",
				content: testData.sourceCode
			},
			{
				role: "assistant",
				content: testData.testCode
			}
		]
	};
}

const rootForRepo = "/UniTSyn/data/repos";
export async function retrieveTestDataFromJsonForTests(filePath: string) : Promise<TestData[]> {

	const fileContent = fs.readFileSync(filePath, 'utf8');
	const testData: TestData[] = [];
	// Split file content by newlines and process each line as JSON
	const lines = fileContent.trim().split('\n');
	for (const line of lines) {
		if (line.trim()) {  // Skip empty lines
			const rawTestData = JSON.parse(line);
			const AtestData = await retrieveTestDataForATest(rawTestData);
			testData.push(AtestData);
		}
	}
	console.log(`Retrieved ${testData.length} test data from ${filePath}`);
	return testData;
}


async function retrieveTestDataForATest(data: any) : Promise<TestData> {
// input data format:
// {"test_id": "advantageous-konf/advantageous-konf-943a917/src/test/java/io/advantageous/config/JsConfigTest.java::testSimple", 
// "test_loc": [26, 4], 
// "test": "@Test\npublic void testSimple() throws Exception {\n\n    assertEquals(URI.create(\"http://localhost:8080/foo\"), config.get(\"uri\", URI.class));\n    assertEquals(URI.create(\"http://localhost:8080/foo\"), config.get(\"myURI\", URI.class));\n    assertEquals(1, config.getInt(\"int1\"));\n    assertEquals(asList(\"Foo\", \"Bar\"), config.getStringList(\"stringList\"));\n    assertEquals(\"rick\", config.getString(\"string1\"));\n    assertEquals(Object.class, config.get(\"myClass\", Class.class));\n    assertEquals(1.0, config.getDouble(\"double1\"), 0.001);\n    assertEquals(1L, config.getLong(\"long1\"));\n    assertEquals(1.0f, config.getFloat(\"float1\"), 0.001);\n    System.out.println(config.toString());\n}", 
// "focal_id": "get", 
// "focal_loc": [29, 69]}

    // 1. get the test id
    const testId = data.test_id;
    // 2. get the test code
    const testCode = data.test;
    // 3. get the focal id
    const focalId = data.focal_id;

	// 4. get the focal location
	const focalLoc = data.focal_loc;

	// 5. get the test location
	const testLoc = data.test_loc;
	
    // 6. get the source file path from test_id
	const testFilePath = path.join(rootForRepo, data.test_id.split("::")[0]);
    
    // 7. get the focal source code using focal location
    const [focalLine, focalColumn] = focalLoc;
    const position = new vscode.Position(focalLine - 1, focalColumn);
    
    // We'll need to:
    // 1. Open the source document
	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(testFilePath));
	const symbols = await getAllSymbols(document.uri);
	const focalSymbol = symbols.find(symbol => symbol.range.contains(position));
	let sourceCode = "";
	if (focalSymbol) {
		sourceCode = document.getText(focalSymbol.range);
	}
    
    return {
        testId,
        testCode,
        focalId,
        focalPosition: position,
        testFilePath,
		sourceCode,
    };
}

export async function collectTrainData(language: string) : Promise<void> {
	
	let currentSrcPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
	const projectName = vscode.workspace.workspaceFolders![0].name;
	if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
		currentSrcPath = path.join(currentSrcPath, SRC_PATHS[projectName as ProjectName]);
	} else {
		currentSrcPath = path.join(currentSrcPath, SRC_PATHS.DEFAULT);
	}
	const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;
	const folderPath = path.join(workspace, TRAIN_DATA_FOLDER + generateTimestampString());
	const expLogPath = path.join(folderPath, "logs");

    console.log(`Testing the folder of ${currentSrcPath}`);
    console.log(`saving the result to ${folderPath}`);
	const suffix = getLanguageSuffix(language);             
	const Files: string[] = [];
	findFiles(currentSrcPath, Files, language, suffix);	
	const symbolDocumentMap: { symbol: vscode.DocumentSymbol, document: vscode.TextDocument }[] = [];
	
	for (const filePath of Files) {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));	
		console.log(`#### Preparing symbols under file: ${filePath}`);
		const symbols = await getAllSymbols(document.uri);
		if (symbols) {
			for (const symbol of symbols) {
				if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
					symbolDocumentMap.push({ symbol, document });
				}
			}
		}
		console.log(`#### Currently ${symbolDocumentMap.length} symbols.`);
	}

    for (const symbolDocument of symbolDocumentMap) {
        const functionName = symbolDocument.symbol.name;
        // const functionBody = symbolDocument.document.getText(symbolDocument.symbol.location.range);
		const functionCode = symbolDocument.document.getText(symbolDocument.symbol.range);
        const referenceInfo = await getReferenceInfo(symbolDocument.document, symbolDocument.symbol.selectionRange, -1);
		
        // const testCodes = await getTestCodes(symbolDocument.symbol);
    }
}




// async function getTestCodes(function: vscode.DocumentSymbol) {
//     // get the all related test codes.
//     const relatedCodes = await ideUtils.references(function.location.uri, function.location.range.start);
    
//     for (const code of relatedCodes) {
//         // Somehow determine whether the related codes are test codes.
//         // If yes, add them to the testCodes array.
//         // If no, ignore them.
//         // Return the testCodes array.
//     }
    
//     return testCodes;
// }

async function saveTestDataToJsonl(testData: TestData[], outputPath: string): Promise<void> {
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Write each test data as a separate line in JSONL format
    const writeStream = fs.createWriteStream(outputPath);
    for (const data of testData) {
        const jsonLine = JSON.stringify(data) + '\n';
        writeStream.write(jsonLine);
    }
    writeStream.end();

    console.log(`Saved ${testData.length} test data entries to ${outputPath}`);
}

async function main(inputJsonPath: string, outputJsonPath: string): Promise<void> {
    try {
        // Step 1: Retrieve test data from input JSON
        console.log(`Reading test data from ${inputJsonPath}...`);
        const testData = await retrieveTestDataFromJsonForTests(inputJsonPath);
        
        // Step 2: Convert test data to FT data format
        console.log('Converting to FT data format...');
        const ftDataArray = testData.map(testDataToFTData);
        
        // Step 3: Save the FT data to JSONL format
        console.log(`Saving FT data to ${outputJsonPath}...`);
        const writeStream = fs.createWriteStream(outputJsonPath);
        for (const ftData of ftDataArray) {
            const jsonLine = JSON.stringify(ftData) + '\n';
            writeStream.write(jsonLine);
        }
        writeStream.end();
        
        console.log('Processing completed successfully!');

    } catch (error) {
        console.error('Error processing data:', error);
        throw error;
    }
}

// Export the main function so it can be called from other modules
export { main };

