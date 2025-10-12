import * as vscode from 'vscode';
import { getContextTermsFromTokens, getTokensInPaths } from '../../tokenAnalyzer';
import { SupportedLanguage } from '../../ast';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { ConditionAnalysis, Path, PathCollector } from '../../cfg/path';
import { getContextSelectorInstance, ContextTerm, contextToString, ContextSelector } from '../../agents/contextSelector';
import { getConfigInstance, PromptType } from '../../config';
import { parseCode } from '../../lsp/utils';
import { BaseTestGenerator } from '../base';
import { conditionToPrompt, findTemplateFile, generateTestWithContext, loadPathTestTemplate } from '../../prompts/promptBuilder';
import { LLMLogs } from '../../log';
import { invokeLLM } from '../../invokeLLM';
import { ChatMessage } from '../../prompts/ChatMessage';
import { getPackageStatement, getImportStatement } from '../../lsp/definition';
import { getOuterSymbols } from '../../lsp/symbol';
import { LanguageTemplateManager } from '../../prompts/languageTemplateManager';
import { readTxtFile, saveContextTerms } from '../../fileHandler';
import { getReferenceInfo } from '../../lsp/reference';
import { DecodedToken } from '../../lsp/types';
import { constructSourceCodeWithRelatedInfo } from '../../lsp/utils';

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
    const context_info_str = contextToString(context_info);
    const packageStatement = getPackageStatement(document, document.languageId);
    const importString = getImportStatement(document, document.languageId, functionSymbol);
    let systemPrompt = await readTxtFile(findTemplateFile("lspragSystem_wo_ex.txt"));
    let userPrompt = await readTxtFile(findTemplateFile("lspragUser_v2.txt"));
    let example = await readTxtFile(findTemplateFile("example1.txt"));
    const source_code_str = await constructSourceCodeWithRelatedInfo(document, functionSymbol);
    // const prompts = template || loadPathTestTemplate();
    
    // if filname contains /, remove it

    // const systemPrompt = prompts.system_prompt;
    // let userPrompt = prompts.user_prompt;
    // const conditionsWithIndex = conditionAnalyses.map((p, index) => `${index+1}. ${p.condition}`).join('\n')
    const conditionsWithIndex = [""];
    // Replace variables in the user prompt
    userPrompt = userPrompt
        .replace('{focal_method}', source_code_str)
        // .replace('{conditions}', conditionsWithIndex)
        .replace('{context}', context_info_str)
        .replace('{test_format}', LanguageTemplateManager.getUnitTestTemplate(
            document.languageId,
            fileName,
            packageStatement ? packageStatement[0] : "",
            importString,
            // conditionAnalyses.map(c=>conditionToPrompt(c))
            [""]
        ));

    systemPrompt = systemPrompt
        .replace('{example}', example);
    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
}
// export function constructConditionPrompt(pathCollector: PathCollector, context_info: ContextTerm[]): string {
//     // Get conditions and their analyses
//     const conditionAnalyses = pathCollector.getUniqueConditions();
    
//     const result: string[] = [];
    
//     // Group context terms by their line number
//     const termsByLine = new Map<number, ContextTerm[]>();
//     for (const term of context_info) {
//         const line = term.token?.line ?? 0;
//         if (!termsByLine.has(line)) {
//             termsByLine.set(line, []);
//         }
//         termsByLine.get(line)!.push(term);
//     }
    
//     // Process each condition in order of depth
//     for (const analysis of conditionAnalyses) {
//         const { condition, dependencies } = analysis;
        
//         // Add the condition
//         result.push(`\n### Condition: ${condition}`);
        
//         // Add related symbols and their contexts
//         result.push("#### Related symbols:");
        
//         // Find context terms for dependencies, maintaining line order
//         const relatedTerms: ContextTerm[] = [];
//         for (const dep of dependencies) {
//             // Find all terms with matching name
//             for (const [line, terms] of termsByLine) {
//                 for (const term of terms) {
//                     if (term.name === dep) {
//                         relatedTerms.push(term);
//                     }
//                 }
//             }
//         }
        
//         // Sort by line number to maintain original code order
//         relatedTerms.sort((a, b) => (a.token?.line ?? 0) - (b.token?.line ?? 0));
        
//         // Add each term's definition and example
//         for (const term of relatedTerms) {
//             if (term.need_definition && term.context && term.context !== term.name) {
//                 result.push(`\n#### Definition of ${term.name}\n${term.context}`);
//             }
//             if (term.need_example && term.example && term.example !== term.name) {
//                 result.push(`\n#### Example of ${term.name}\n${term.example}`);
//             }
//         }
//     }
    
//     return result.join('\n');
// }

export class ExperimentalTestGenerator extends BaseTestGenerator {

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
        // get the reference of function Symbol
        const referenceStrings = await getReferenceInfo(this.document, this.functionSymbol.selectionRange, 60, false);
        const contextTermsForFunctionSymbol : ContextTerm = {
            name: this.functionSymbol.name,
            context: referenceStrings,
            need_example: true,
            hint: ["focal method"]
        };
        enrichedTerms.unshift(contextTermsForFunctionSymbol);
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