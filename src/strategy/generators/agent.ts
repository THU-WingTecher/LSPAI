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
		const contextSelector = await getContextSelectorInstance(this.document, this.functionSymbol);

		let enrichedTerms: ContextTerm[] = [];
		if (getConfigInstance().promptType === PromptType.WITHCONTEXT) {
			if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - identifying context terms`, 20)) {
				return '';
			}

			const identifiedTerms = await getContextTermsFromTokens(contextSelector.getTokens());
			if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - gathering context`, 20)) {
				return '';
			}

			enrichedTerms = await contextSelector.gatherContext(identifiedTerms);
		}

		const promptObj = generateTestWithContext(
			this.document,
			this.document.getText(this.functionSymbol.range),
			enrichedTerms,
			this.fileName
		);

		const logObj: LLMLogs = { tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model };
		const testCode = await invokeLLM(promptObj, logObj);
		return parseCode(testCode);
	}
}
