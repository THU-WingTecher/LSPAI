import { ContextTerm } from '../../agents/contextSelector';
import { getContextTermsFromTokens } from '../../tokenAnalyzer';
import { SupportedLanguage } from '../../ast';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { PathCollector } from '../../cfg/path';
import { getContextSelectorInstance } from '../../agents/contextSelector';
import { getConfigInstance, PromptType } from '../../config';
import { parseCode } from '../../utils';
import { BaseTestGenerator } from '../base';
import { LLMLogs } from '../../log';
import { invokeLLM } from '../../invokeLLM';
import { LanguageTemplateManager } from '../../prompts/languageTemplateManager';
import { ChatMessage } from '../../prompts/ChatMessage';
import { getPackageStatement, getImportStatement } from "../../retrieve";
import * as vscode from 'vscode';
import { findTemplateFile, generateTestWithContext, loadPathTestTemplate } from '../../prompts/promptBuilder';

/**
 * Generates test with context information
 */
export function generateTestSymprompt(
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol,
    source_code: string, 
    context_info: ContextTerm[], 
    paths: any[],
    fileName: string,
    functionInfo: Map<string, string>
): ChatMessage[] {
    const result = [];
    let context_info_str = "";
    const packageStatement = getPackageStatement(document, document.languageId);
    const importString = getImportStatement(document, document.languageId, functionSymbol);
    const prompts = loadPathTestTemplate();
    
    // if filname contains /, remove it
    if (fileName.includes("/")) {
        fileName = fileName.split("/").pop() || fileName;
    }
    console.log(`### generateTestSymprompt::fileName: ${fileName}`);
    const systemPrompt = prompts.system_prompt
    let userPrompt = prompts.user_prompt;
    userPrompt = userPrompt
        .replace("Important terms' context information:\n\n{context_info}", context_info_str)
        .replace('{source_code}', source_code)
        .replace(
            '{unit_test_template}', 
            LanguageTemplateManager.getUnitTestTemplate(
            document.languageId, 
            fileName, 
            packageStatement ? packageStatement[0] : "",
            importString,
            paths.map((p) => p.path),
            functionInfo
        )
    );
    
    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
}

export class SymPromptTestGenerator extends BaseTestGenerator {
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
        const functionInfo = builder.getFunctionInfo();

        this.functionInfo.set('signature', functionInfo.get('signature') || "");
        
        const minimizedPaths = pathCollector.minimizePaths(paths);
        console.log(`### minimizedPaths: ${minimizedPaths}`);
        this.logger.log("collectCFGPaths", (Date.now() - pathCollectorStartTime).toString(), null, "");
        
        this.logger.saveCFGPaths(functionText, minimizedPaths);

        // Gather context if needed
        let enrichedTerms: ContextTerm[] = [];

        // Generate test
        console.log(`### generating test for ${this.functionSymbol.name} in ${this.document.uri.fsPath}`);
        const promptObj = generateTestSymprompt(this.document, this.functionSymbol, functionText, enrichedTerms, minimizedPaths, this.fileName, this.functionInfo)

        const logObj: LLMLogs = {tokenUsage: "", result: "", prompt: "", model: getConfigInstance().model};
        // const testCode = await invokeLLM(promptObj, logObj);
        // return parseCode(testCode);
        return "testing"
    }
}