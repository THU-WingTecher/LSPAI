import { getContextSelectorInstance, ContextTerm } from '../../agents/contextSelector';
import { getContextTermsFromTokens } from '../../tokenAnalyzer';
import { getConfigInstance, PromptType } from '../../config';
import { invokeLLM } from '../../invokeLLM';
import { LLMLogs } from '../../log';
import { generateTestWithContext } from '../../prompts/promptBuilder';
import { parseCode } from '../../utils';
import { BaseTestGenerator } from '../base';


export class AgentTestGenerator extends BaseTestGenerator {
	async generateTest(): Promise<string> {
		
		let enrichedTerms;
		if (getConfigInstance().promptType === PromptType.WITHCONTEXT) {
			enrichedTerms = await this.collectInfo();
			if (enrichedTerms === null) {
				return "";
			}
		}
		const promptObj = generateTestWithContext(
			this.document,
			this.document.getText(this.functionSymbol.range),
			enrichedTerms!,
			this.fileName
		);

		const logObj: LLMLogs = { tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model };
		const generationStartTime = Date.now();
		const testCode = await invokeLLM(promptObj, logObj);
		this.logger.log("generateTest", (Date.now() - generationStartTime).toString(), logObj, "");
		return parseCode(testCode);
	}
}
