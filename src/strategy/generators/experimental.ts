import { ContextTerm } from '../../agents/contextSelector';
import { getContextTermsFromTokens } from '../../algorithm';
import { SupportedLanguage } from '../../ast';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { PathCollector } from '../../cfg/path';
import { getContextSelectorInstance } from '../../agents/contextSelector';
import { getConfigInstance, PromptType } from '../../config';
import { parseCode } from '../../utils';
import { BaseTestGenerator } from '../base';
import { generateTestWithContext } from '../../prompts/promptBuilder';
import { generateTestWithContextWithCFG } from '../../prompts/promptBuilder';
import { LLMLogs } from '../../log';
import { invokeLLM } from '../../invokeLLM';

export class ExperimentalTestGenerator extends BaseTestGenerator {
    async generateTest(): Promise<string> {
        const contextSelector = await getContextSelectorInstance(this.document, this.functionSymbol);
        const functionText = this.document.getText(this.functionSymbol.range);
        
        // Build CFG
        const builder = createCFGBuilder(this.languageId as SupportedLanguage);
        const cfgBuildingStartTime = Date.now();
        const cfg = await builder.buildFromCode(functionText);
        this.logger.log("buildCFG", (Date.now() - cfgBuildingStartTime).toString(), null, "");

        // Collect paths
        const pathCollectorStartTime = Date.now();
        const pathCollector = new PathCollector(this.languageId);
        const paths = pathCollector.collect(cfg.entry);
        const minimizedPaths = pathCollector.minimizePaths(paths);
        this.logger.log("collectCFGPaths", (Date.now() - pathCollectorStartTime).toString(), null, "");
        this.logger.saveCFGPaths(functionText, minimizedPaths);

        // Gather context if needed
        let enrichedTerms: ContextTerm[] = [];
        if (getConfigInstance().promptType === PromptType.WITHCONTEXT) {
            const identifiedTerms = getContextTermsFromTokens(contextSelector.getTokens());
            if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - gathering context`, 20)) {
                return '';
            }
            enrichedTerms = await contextSelector.gatherContext(identifiedTerms);
        }

        // Generate test
        const promptObj = paths.length > 1 
            ? generateTestWithContextWithCFG(this.document, this.functionSymbol, functionText, enrichedTerms, paths, this.fileName)
            : generateTestWithContext(this.document, functionText, enrichedTerms, this.fileName);

        const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model};
        const testCode = await invokeLLM(promptObj, logObj);
        return parseCode(testCode);
    }
}