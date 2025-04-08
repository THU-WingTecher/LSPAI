import { getConfigInstance } from './config';
import { saveExperimentData } from './fileHandler';

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
export class ExpLogger {
	constructor(private expData: ExpLogs[], private model: string, private fullFileName: string, private functionName: string) { }

	log(process: string, time: string, llmInfo: LLMLogs | null, errMsg: string = "") {
		this.expData.push({
			llmInfo,
			process,
			time,
			method: this.model,
			fileName: this.fullFileName,
			function: this.functionName,
			errMsag: errMsg
		});
	}

	save(fileName: string) {
		saveExperimentData(this.expData, getConfigInstance().logSavePath, fileName, this.model);
	}
}
