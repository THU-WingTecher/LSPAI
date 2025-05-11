import { getConfigInstance } from './config';
import fs from 'fs';
import path from 'path';
import { Path, PathResult } from './cfg/path';
import { DiagnosticReport } from './fix';

export interface ExpLogs {
    llmInfo : LLMLogs | null;
    process : string;
    time : string;
    method : string;
    fileName : string;
    function : string;
    errMsag : string;
}

export interface LLMLogs {
    tokenUsage : string;
    result : string;
    prompt : string;
    model : string;
}

export interface PromptLogData {
    timestamp: string;
    sourceFile: string;
    systemPrompt: string;
    userPrompt: string;
    paths: Array<{ code: string, path: string }>;
    finalPrompt: string;
}

export class ExpLogger {
	fileName: string;
	constructor(private expData: ExpLogs[], private model: string, private fullFileName: string, fileName: string, private functionName: string) {
		this.fileName = fileName;
	 }

	log(process: string, time: string, llmInfo: LLMLogs | null, errMsg: string = "") {
		this.expData.push({
			llmInfo,
			process,
			time,
			method: this.model,
			fileName: this.fileName,
			function: this.functionName,
			errMsag: errMsg
		});
	}

	save(fileName: string) {
		saveExperimentData(this.expData, getConfigInstance().logSavePath, fileName, this.model);
	}

	saveCFGPaths(functionText: string, paths: PathResult[]) {
		const folder = "paths";
		const folderPath = path.join(getConfigInstance().logSavePath, folder);
		const fileName = `${this.fileName}_paths.json`;
		const fullPath = path.join(folderPath, fileName);
		if (!fs.existsSync(path.dirname(fullPath))) {
			fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		}
		const pathLog = {
			sourceCode: functionText,
			paths: paths
		}

		fs.writeFileSync(fullPath, JSON.stringify(pathLog, null, 2));
	}

	saveDiagnosticReport(diagnosticReport: DiagnosticReport) {
		const folder = "diagnostic_report";
		const folderPath = path.join(getConfigInstance().logSavePath, folder);
		const fileName = `${this.fileName}.json`;
		const fullPath = path.join(folderPath, fileName);
		if (!fs.existsSync(path.dirname(fullPath))) {
			fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		}
		fs.writeFileSync(fullPath, JSON.stringify(diagnosticReport, null, 2));
	}

	savePromptLog(data: PromptLogData) {
		const folder = "prompts";
		const folderPath = path.join(getConfigInstance().logSavePath, folder);
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const fileName = `prompt_${this.fileName}_${timestamp}.json`;
		const fullPath = path.join(folderPath, fileName);
		if (!fs.existsSync(path.dirname(fullPath))) {
			fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		}
		
		const logData = {
			...data,
			timestamp: new Date().toISOString()
		};

		fs.writeFileSync(fullPath, JSON.stringify(logData, null, 2));
		return fullPath;
	}

}

async function saveExperimentData(expData: ExpLogs[], expLogPath: string, fileName: string, method: string) {
	const jsonFilePath = path.join(expLogPath, `${fileName}.json`);
	// const jsonFilePath = path.join(expLogPath, method, `${fileName}_${new Date().toLocaleString('en-US', { timeZone: 'CST', hour12: false }).replace(/[/,: ]/g, '_')}.json`);

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

	// const dir = path.dirname(jsonFilePath);
	// if (!fs.existsSync(dir)) {
	// 	fs.mkdirSync(dir, { recursive: true });
	// }

	// Check if file exists and initialize empty array if not
	// let jsonContent = [];
	// if (fs.existsSync(jsonFilePath)) {
	let	jsonContent = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
	// }

	// Append the current experiment's data
	jsonContent.push(...formattedData);

	// Write the updated data
	fs.writeFileSync(jsonFilePath, JSON.stringify(jsonContent, null, 2), 'utf8');
	console.log(`Experiment data saved to ${jsonFilePath}`);
}
