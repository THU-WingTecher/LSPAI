import * as vscode from 'vscode';
import { getContextTermsFromTokens, getTokensInPaths } from '../../tokenAnalyzer';
import { SupportedLanguage } from '../../ast';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { ConditionAnalysis, Path, PathCollector } from '../../cfg/path';
import { getContextSelectorInstance, ContextTerm } from '../../agents/contextSelector';
import { getConfigInstance, PromptType } from '../../config';
import { parseCode } from '../../utils';
import { BaseTestGenerator } from '../base';
import { findTemplateFile, generateTestWithContext, loadPathTestTemplate } from '../../prompts/promptBuilder';
import { LLMLogs } from '../../log';
import { invokeLLM } from '../../invokeLLM';
import { ChatMessage } from '../../prompts/ChatMessage';
import { getPackageStatement, getImportStatement } from '../../retrieve';
import { LanguageTemplateManager } from '../../prompts/languageTemplateManager';
import { readTxtFile } from '../../fileHandler';
import { getReferenceInfo } from '../../reference';
// const unitTestTemplateForhandleShortAndLongOption = `package org.apache.commons.cli;
// {Replace With Needed Imports}

// public class DefaultParser_handleShortAndLongOption_0_1Test {

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_0() {
//     /*
//         where (
// \t(token.length() == 1)
// \t(options.hasShortOption(token))
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_1() {
//     /*
//         where (
// \t(token.length() == 1)
// \t!(options.hasShortOption(token))
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_2() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t(pos == -1)
// \t(options.hasShortOption(token))
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_3() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t(pos == -1)
// \t!(options.hasShortOption(token))
// \t(!getMatchingLongOptions(token).isEmpty())
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_4() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t(pos == -1)
// \t!(options.hasShortOption(token))
// \t!(!getMatchingLongOptions(token).isEmpty())
// \t(opt != null && options.getOption(opt).acceptsArg())
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_5() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t(pos == -1)
// \t!(options.hasShortOption(token))
// \t!(!getMatchingLongOptions(token).isEmpty())
// \t!(opt != null && options.getOption(opt).acceptsArg())
// \t(isJavaProperty(token))
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_6() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t(pos == -1)
// \t!(options.hasShortOption(token))
// \t!(!getMatchingLongOptions(token).isEmpty())
// \t!(opt != null && options.getOption(opt).acceptsArg())
// \t!(isJavaProperty(token))
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_7() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t!(pos == -1)
// \t(opt.length() == 1)
// \t(option != null && option.acceptsArg())
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_8() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t!(pos == -1)
// \t(opt.length() == 1)
// \t!(option != null && option.acceptsArg())
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_9() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t!(pos == -1)
// \t!(opt.length() == 1)
// \t(isJavaProperty(opt))
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleShortAndLongOption_0_1Test_10() {
//     /*
//         where (
// \t!(token.length() == 1)
// \t!(pos == -1)
// \t!(opt.length() == 1)
// \t!(isJavaProperty(opt))
// )
//     */
//     }
    
//     {Replace with needed setup}
//     {Write your test test function here}
// }
// `

// const unitTestTemplateForhandleConcatenatedOptions = `package org.apache.commons.cli;
// {Replace With Needed Imports}

// public class DefaultParser_handleConcatenatedOptions_0_1Test {

//     @Test
//     public void DefaultParser_handleConcatenatedOptions_0_1Test_0() {
//     /*
//         where (
// \t(!options.hasOption(ch))
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleConcatenatedOptions_0_1Test_1() {
//     /*
//         where (
// \t!(!options.hasOption(ch))
// \t(currentOption != null && token.length() != i + 1)
// )
//     */
//     }
    

//     @Test
//     public void DefaultParser_handleConcatenatedOptions_0_1Test_2() {
//     /*
//         where (
// \t!(!options.hasOption(ch))
// \t!(currentOption != null && token.length() != i + 1)
// )
//     */
//     }
    
// @Test
// public void {write your test function name here}() {
//     {Write your test code here}
// }
// }
// `


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
    let context_info_str = "";
    for (const item of context_info) {
        if (item.need_definition && item.context && item.context!=item.name) {
            result.push(`\n#### Definition of ${item.name}\n${item.context}`);
        }
        if (item.need_example && item.example && item.example!=item.name) {
            result.push(`\n#### Example of ${item.name}\n${item.example}`);
        }
    }
    if (result.length > 0) {
        context_info_str = result.join('\n');
    }
    const packageStatement = getPackageStatement(document, document.languageId);
    const importString = getImportStatement(document, document.languageId, functionSymbol);
    let systemPrompt = await readTxtFile(findTemplateFile("lspaiSystem.txt"));
    let userPrompt = await readTxtFile(findTemplateFile("lspaiUser_v2.txt"));
    let example = await readTxtFile(findTemplateFile("example1.txt"));
    // const prompts = template || loadPathTestTemplate();
    
    // if filname contains /, remove it

    // const systemPrompt = prompts.system_prompt;
    // let userPrompt = prompts.user_prompt;
    const conditionsWithIndex = conditionAnalyses.map((p, index) => `${index+1}. ${p.condition}`).join('\n')
    // Replace variables in the user prompt
    userPrompt = userPrompt
        .replace('{focal_method}', source_code)
        .replace('{conditions}', conditionsWithIndex)
        .replace('{context}', context_info_str)
        .replace('{test_format}', LanguageTemplateManager.getUnitTestTemplate(
            document.languageId,
            fileName,
            packageStatement ? packageStatement[0] : "",
            importString,
            []
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



	protected async collectInfo(conditions : ConditionAnalysis[] = []): Promise<ContextTerm[] | null> {
		let enrichedTerms: ContextTerm[] = [];
		const tokenCollectTime = Date.now();
		const contextSelector = await getContextSelectorInstance(this.document, this.functionSymbol);
		const identifiedTerms = await getContextTermsFromTokens(this.document, contextSelector.getTokens(), conditions);
		this.logger.log("getContextTermsFromTokens", (Date.now() - tokenCollectTime).toString(), null, "");
		if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - gathering context`, 20)) {
			return null;
		}
		const retreiveTime = Date.now();
		enrichedTerms = await contextSelector.gatherContext(identifiedTerms, this.functionSymbol);
        // get the reference of function Symbol
        const referenceStrings = await getReferenceInfo(this.document, this.functionSymbol.range, 60, false);
        const contextTermsForFunctionSymbol : ContextTerm = {
            name: this.functionSymbol.name,
            context: referenceStrings,
            need_example: true,
        }
        enrichedTerms.unshift(contextTermsForFunctionSymbol);
        this.logger.log("gatherContext", (Date.now() - retreiveTime).toString(), null, "");
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
            enrichedTerms = await this.collectInfo(conditionAnalyses);
			if (enrichedTerms === null) {
				return "";
			}
        }

        // Generate test
        // const promptObj = paths.length > 1 
        //     ? generateTestWithContextWithCFG(this.document, this.functionSymbol, functionText, enrichedTerms, paths, this.fileName)
        //     : generateTestWithContext(this.document, functionText, enrichedTerms, this.fileName);
        const generationStartTime = Date.now();
        const promptObj = await generateTestWithContextWithCFG(this.document, this.functionSymbol, functionText, enrichedTerms!, conditionAnalyses, this.fileName)
            // : generateTestWithContext(this.document, functionText, enrichedTerms, this.fileName);
        const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model};
        const testCode = await invokeLLM(promptObj, logObj);
        this.logger.log("generateTest", (Date.now() - generationStartTime).toString(), logObj, "");
        return parseCode(testCode);
    }
}