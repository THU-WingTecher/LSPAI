import * as vscode from 'vscode';
import { getContextTermsFromTokens, getTokensInPaths } from '../../tokenAnalyzer';
import { SupportedLanguage } from '../../ast';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { ConditionAnalysis, Path, PathCollector } from '../../cfg/path';
import { getContextSelectorInstance, ContextTerm, contextToString, ContextSelector } from '../../agents/contextSelector';
import { getConfigInstance, PromptType } from '../../config';
import { parseCode } from '../../utils';
import { BaseTestGenerator } from '../base';
import { conditionToPrompt, findTemplateFile, generateTestWithContext, loadPathTestTemplate } from '../../prompts/promptBuilder';
import { LLMLogs } from '../../log';
import { invokeLLM } from '../../invokeLLM';
import { ChatMessage } from '../../prompts/ChatMessage';
import { getPackageStatement, getImportStatement } from '../../retrieve';
import { getOuterSymbols } from '../../lsp';
import { LanguageTemplateManager } from '../../prompts/languageTemplateManager';
import { readTxtFile, saveContextTerms } from '../../fileHandler';
import { getReferenceInfo } from '../../reference';
import path from 'path';
import fs from 'fs';
import { getAllSymbols } from '../../lsp';
import { DecodedToken } from '../../token';
import { constructSourceCodeWithRelatedInfo } from '../../utils';

/**
 * Truncate context string to fit within token limit
 */
function truncateContextString(context: string, maxTokens: number): string {
    if (maxTokens <= 0) {
        return "";
    }
    
    const words = context.split(/\s+/);
    if (words.length <= maxTokens) {
        return context;
    }
    
    // Take the first maxTokens words
    const truncatedWords = words.slice(0, maxTokens);
    return truncatedWords.join(' ') + '...';
}

export async function generateTestWithContextWithCFG(
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol,
    source_code: string, 
    context_info: ContextTerm[], 
    conditionAnalyses: ConditionAnalysis[],
    fileName: string,
    template?: { system_prompt: string, user_prompt: string }
): Promise<ChatMessage[]> {
    const result = [];
    const packageStatement = getPackageStatement(document, document.languageId);
    const importString = getImportStatement(document, document.languageId, functionSymbol);
    let systemPrompt = await readTxtFile(findTemplateFile("lspragSystem.txt"));
    let userPrompt = await readTxtFile(findTemplateFile("lspragUser_v2.txt"));
    let example = await readTxtFile(findTemplateFile("example1.txt"));
    const source_code_str = await constructSourceCodeWithRelatedInfo(document, functionSymbol);
    
    // Get max token limitation
    const maxTokens = getConfigInstance().maxTokens;
    
    // Calculate tokens for non-context parts
    const testFormat = LanguageTemplateManager.getUnitTestTemplate(
        document.languageId,
        fileName,
        packageStatement ? packageStatement[0] : "",
        importString,
        conditionAnalyses.map(c=>conditionToPrompt(c))
    );
    
    // Create a temporary user prompt to estimate tokens
    const tempUserPrompt = userPrompt
        .replace('{focal_method}', source_code_str)
        .replace('{context}', '') // Empty context for estimation
        .replace('{test_format}', testFormat);
    
    const nonContextTokens = tempUserPrompt.split(/\s+/).length;
    const systemTokens = systemPrompt.split(/\s+/).length;
    
    // Calculate available tokens for context
    const availableTokensForContext = maxTokens - nonContextTokens - systemTokens;
    
    // Convert context_info to string and check if it needs pruning
    let context_info_str = contextToString(context_info);
    const contextTokens = context_info_str.split(/\s+/).length;
    
    // If context exceeds available tokens, prune it
    if (contextTokens > availableTokensForContext) {
        console.log(`Context tokens (${contextTokens}) exceed available tokens (${availableTokensForContext}). Pruning context...`);
        context_info_str = truncateContextString(context_info_str, availableTokensForContext);
        console.log(`Pruned context tokens: ${context_info_str.split(/\s+/).length}`);
    }
    
    // Replace variables in the user prompt
    userPrompt = userPrompt
        .replace('{focal_method}', source_code_str)
        .replace('{context}', context_info_str)
        .replace('{test_format}', testFormat);

    systemPrompt = systemPrompt
        .replace('{example}', example);
        
    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
}

export class CFGTestGenerator extends BaseTestGenerator {

	protected async collectInfo(conditions : ConditionAnalysis[] = [], functionInfo: Map<string, string> = new Map()): Promise<ContextTerm[] | null> {
		let enrichedTerms: ContextTerm[] = [];
		const tokenCollectTime = Date.now();
		const contextSelector = await ContextSelector.create(this.document, this.functionSymbol);
        const tokens = await contextSelector.loadTokens();
		// const identifiedTerms = await getContextTermsFromTokens(this.document, this.functionSymbol, contextSelector.getTokens(), conditions, functionInfo);
        // const tokens = contextSelector.getTokens();
        console.log("source code", this.document.getText(this.functionSymbol.range));
        console.log("tokens", tokens.map((t : DecodedToken) => t.word));
        console.log("conditions", conditions.map((c : ConditionAnalysis) => c.condition));
        // console.log("functionInfo", functionInfo.get());
        const identifiedTerms = await getContextTermsFromTokens(
            this.document, 
            this.functionSymbol,
            tokens,
            conditions, 
            functionInfo);
        this.logger.log("getContextTermsFromTokens", (Date.now() - tokenCollectTime).toString(), null, "");
		if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - gathering context`, 20)) {
			return null;
		}
		const retreiveTime = Date.now();
		enrichedTerms = await contextSelector.gatherContext(identifiedTerms, this.functionSymbol);
        this.logger.log("gatherContext-1", (Date.now() - retreiveTime).toString(), null, "");
        const retreiveTime2 = Date.now();
        // get the reference of function Symbol
        const referenceStrings = await getReferenceInfo(this.document, this.functionSymbol.selectionRange, 60, false);
        const contextTermsForFunctionSymbol : ContextTerm = {
            name: this.functionSymbol.name,
            context: referenceStrings,
            need_example: true,
            hint: ["focal method"]
        };
        enrichedTerms.unshift(contextTermsForFunctionSymbol);
        this.logger.log("gatherContext-2", (Date.now() - retreiveTime2).toString(), null, "");
        this.logger.log("gatherContext", (Date.now() - retreiveTime).toString(), null, "");
        saveContextTerms(this.sourceCode, enrichedTerms, getConfigInstance().logSavePath!, this.fileName);
		return enrichedTerms;
	}


    async generateTest(): Promise<string> {
        const functionText = this.document.getText(this.functionSymbol.range);
        
        // Build CFG
        const cfgBuildingStartTime = Date.now();
        const builder = createCFGBuilder(this.languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(functionText);
        this.logger.log("buildCFG", (Date.now() - cfgBuildingStartTime).toString(), null, "");
        
        // Collect paths
        const pathCollectorStartTime = Date.now();
        const pathCollector = new PathCollector(this.languageId);
        const paths = pathCollector.collect(cfg.entry);
        const minimizedPaths = pathCollector.minimizePaths(paths);
        const conditionAnalyses = pathCollector.getUniqueConditions();
        this.logger.log("collectCFGPaths", (Date.now() - pathCollectorStartTime).toString(), null, "");
        this.logger.saveCFGPaths(functionText, minimizedPaths);
        
        // Gather context if needed
        let enrichedTerms;
        if (getConfigInstance().promptType === PromptType.WITHCONTEXT) {
            enrichedTerms = await this.collectInfo(conditionAnalyses, builder.getFunctionInfo());
			if (enrichedTerms === null) {
				return "";
			}
        }

        // Generate test
        const generationStartTime = Date.now();
        const promptObj = await generateTestWithContextWithCFG(this.document, this.functionSymbol, functionText, enrichedTerms!, conditionAnalyses, this.fileName);
        const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model};
        console.log("promptObj:", promptObj[1].content);
        const testCode = await invokeLLM(promptObj, logObj);
        this.logger.log("generateTest", (Date.now() - generationStartTime).toString(), logObj, "");
        return parseCode(testCode);
        // return "testing";
    }
}