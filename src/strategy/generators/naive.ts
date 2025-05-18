import { getConfigInstance } from '../../config';
import { invokeLLM } from '../../invokeLLM';
import { TokenLimitExceededError } from '../../invokeLLM';
import { LLMLogs } from '../../log';
import { genPrompt } from '../../prompts/promptBuilder';
import { parseCode } from '../../utils';
import { BaseTestGenerator } from '../base';


export async function generateInitialTestCode(
	collectedData: any,
	logObj: LLMLogs
): Promise<string> {

	const promptObj = await genPrompt(collectedData, getConfigInstance().generationType);
	try {
		const testCode = await invokeLLM(promptObj, logObj);
		const parsedCode = parseCode(testCode);
		return parsedCode;
	} catch (error) {
		if (error instanceof TokenLimitExceededError) {
			console.warn('Token limit exceeded, continuing...');
		}
		throw error;
	}
}

export class NaiveTestGenerator extends BaseTestGenerator {
	async generateTest(): Promise<string> {
		const collectedData = await this.collectBasicInfo();
		if (!collectedData) return '';

		if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - generating initial test code`, 20)) {
			return '';
		}
		const generationStartTime = Date.now();
		const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model};

		const testCode = await generateInitialTestCode(
			collectedData,
			logObj
		);
		this.logger.log("generateTest", (Date.now() - generationStartTime).toString(), logObj, "");
		return parseCode(testCode);
	}
}
