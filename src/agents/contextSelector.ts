import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as ini from 'ini';
import { invokeLLM } from '../invokeLLM';
import { DecodedToken, getDecodedTokensFromSybol, countUniqueDefinitions, getTokensFromStr } from '../token';
import { retrieveDef } from '../retrieve';
import { getReferenceInfo } from '../reference';
import { getSymbolDetail, formatToJSON, extractArrayFromJSON } from '../utils';
import { getAllSymbols } from '../lsp';
import { activate, getSymbolByLocation } from '../lsp';
import { clear } from 'console';
import { ContextSelectorConfig, findTemplateFile } from '../prompts/promptBuilder';
import { getConfigInstance } from '../config';
export interface ContextTerm {
    name: string;
    context?: string; // Optional context once retrieved
    example?: string; // Optional example once retrieved
    need_example?: boolean; // Whether the term needs example code
    need_definition?: boolean; // Whether the term needs context
    token?: DecodedToken;
    need_full_definition?: boolean; // Whether the term needs full definition
    hint?: string[]; // hint for the term
}

export function contextToString(contextTerms: ContextTerm[]): string {
    // Create a map to group items by relativePath
    const pathGroups = new Map<string, string[]>();
    
    for (const item of contextTerms) {
        if (item.hint && item.hint.includes("focal method") && stripLineNumbers(item.context!)) {
            // Keep focal method separate as it's special
            const content = `\n# FOCAL METHOD CONTEXT:\n${stripLineNumbers(item.context!)}`;
            pathGroups.set('focal', pathGroups.get('focal') || []);
            pathGroups.get('focal')!.push(content);
            continue;
        }

        if (item.token) {
            const relativePath = path.relative(getConfigInstance().workspace, item.token.definition[0].uri.path);
            pathGroups.set(relativePath, pathGroups.get(relativePath) || []);
            
            if (item.need_definition && item.context && item.context !== item.name) {
                const firstLineNum = extractFirstLineNumber(item.context);
                const lastLineNum = extractLastLineNumber(item.context);
                const content = `${firstLineNum}|||${lastLineNum}|||${item.name}\n${stripLineNumbers(item.context)}`;
                pathGroups.get(relativePath)!.push(content);
            }
            
            if (item.need_example && item.example && item.example !== item.name) {
                const firstLineNum = extractFirstLineNumber(item.example);
                const lastLineNum = extractLastLineNumber(item.example);
                const content = `${firstLineNum}|||${lastLineNum}|||${item.name}\n${stripLineNumbers(item.example)}`;
                pathGroups.get(relativePath)!.push(content);
            }
        }
    }

    // Build final string with deduplicated content
    const result: string[] = [];
    
    // Add focal method first if it exists
    if (pathGroups.has('focal')) {
        result.push(...pathGroups.get('focal')!);
    }

    // Add other groups
    for (const [path, contents] of pathGroups.entries()) {
        if (path === 'focal') continue;
        
        // First, remove redundant contexts by checking line number overlaps
        const uniqueRanges = removeRedundantContexts(contents);

        // Sort contents by line number
        const sortedContents = uniqueRanges.sort((a, b) => {
            const lineA = parseInt(a.split('|||')[0]) || 0;
            const lineB = parseInt(b.split('|||')[0]) || 0;
            return lineA - lineB;
        });

        if (sortedContents.length > 0) {
            result.push(`\n# ${path}`);
            
            // Add contents with "... existing code ..." between non-continuous sections
            let lastEndLine = 0;
            const processedContents = sortedContents.map(content => {
                const [startLine, endLine, ...rest] = content.split('|||');
                const start = parseInt(startLine);
                const end = parseInt(endLine);
                const actualContent = rest.join('|||');

                let resultContent = '';
                if (lastEndLine > 0 && start > lastEndLine + 1) {
                    resultContent += '... existing code ...\n';
                }
                resultContent += actualContent;
                lastEndLine = end;
                return resultContent;
            });

            result.push(processedContents.join('\n'));
        }
    }

    return result.join('\n');
}

// Helper function to remove redundant contexts based on line number overlaps
function removeRedundantContexts(contents: string[]): string[] {
    // Filter out type-related contexts first
    contents = contents.filter(content => {
        const lines = content.split('\n');
        if (lines.length < 2) return true; // Keep single line contents
        
        // Check if content is mostly type definitions
        const typeDefCount = lines.filter(line => 
            line.trim().match(/^[a-zA-Z_][a-zA-Z0-9_]*:\s*(int|str|bool|float|list|dict|set|tuple|any)$/i)
        ).length;
        
        // If more than 50% of lines are type definitions, filter it out
        return typeDefCount / lines.length < 0.5;
    });

    const ranges: Array<{
        start: number;
        end: number;
        name: string;
        content: string;
    }> = contents.map(content => {
        const [start, end, name, ...rest] = content.split('|||');
        return {
            start: parseInt(start),
            end: parseInt(end),
            name: name,
            content: content
        };
    });

    // Sort by start line and then by length (longer range first for same start)
    ranges.sort((a, b) => {
        if (a.start === b.start) {
            return (b.end - b.start) - (a.end - a.start); // Longer range first
        }
        return a.start - b.start;
    });

    const uniqueRanges: string[] = [];
    const processedNames = new Set<string>();
    
    if (ranges.length === 0) return [];
    
    for (let i = 0; i < ranges.length; i++) {
        const currentRange = ranges[i];
        
        // Skip if we've already included this term name
        if (processedNames.has(currentRange.name)) {
            continue;
        }
        
        // Check if this range is contained within any previously added ranges
        let isContained = false;
        for (const existingContent of uniqueRanges) {
            const [existingStart, existingEnd] = existingContent.split('|||').map(Number);
            if (currentRange.start >= existingStart && currentRange.end <= existingEnd) {
                isContained = true;
                break;
            }
        }
        
        if (!isContained) {
            // Check if this range can be merged with any existing range
            let merged = false;
            for (let j = 0; j < uniqueRanges.length; j++) {
                const [existingStart, existingEnd] = uniqueRanges[j].split('|||').map(Number);
                
                // If ranges overlap or are adjacent
                if (currentRange.start <= existingEnd + 1 && currentRange.end >= existingStart - 1) {
                    // Create merged range
                    const newStart = Math.min(existingStart, currentRange.start);
                    const newEnd = Math.max(existingEnd, currentRange.end);
                    uniqueRanges[j] = `${newStart}|||${newEnd}|||${currentRange.name}\n${stripLineNumbers(currentRange.content.split('\n').slice(1).join('\n'))}`;
                    merged = true;
                    break;
                }
            }
            
            if (!merged) {
                uniqueRanges.push(currentRange.content);
            }
        }
        
        processedNames.add(currentRange.name);
    }

    return uniqueRanges;
}

// Helper function to extract the first line number from a string with [L{number}] format
function extractFirstLineNumber(text: string): number {
    const match = text.match(/\[L(\d+)\]/);
    return match ? parseInt(match[1]) : 0;
}

// Helper function to extract the last line number from a string with [L{number}] format
function extractLastLineNumber(text: string): number {
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].match(/\[L(\d+)\]/);
        if (match) {
            return parseInt(match[1]);
        }
    }
    return 0;
}

// Helper function to strip line numbers from the text
function stripLineNumbers(text: string): string {
    return text.split('\n')
        .map(line => line.replace(/\[L\d+\] /, ''))
        .join('\n');
}

// export function contextToString(contextTerms: ContextTerm[]): string {
//     const result = [];
//     let context_info_str = "";
//     for (const item of contextTerms) {
//         if (item.hint && item.hint.includes("focal method")) {
//             result.push(`\n# FOCAL METHOD CONTEXT : ${item.name}\n${item.context}`);
//         }
//         if (item.token) {
//             const relativePath = path.relative(getConfigInstance().workspace, item.token!.definition[0].uri.path);
//             if (item.need_definition && item.context && item.context!=item.name) {
//                 result.push(`\n# ${relativePath}[${item.name}]\n${item.context}`);
//             }
//             if (item.need_example && item.example && item.example!=item.name) {
//                 result.push(`\n# ${relativePath}[${item.name}]\n${item.example}`);
//             }
//         }
//     }
//     if (result.length > 0) {
//         context_info_str = result.join('\n');
//     }
//     return context_info_str;
// }

export class ContextSelector {
    private static instance: ContextSelector;
    private config: ContextSelectorConfig;
    private document: vscode.TextDocument;
    private tokens: DecodedToken[] = [];
    private targetSymbol: vscode.DocumentSymbol;

    private constructor(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol) {
        this.config = this.loadConfig();
        this.document = document;
        this.targetSymbol = targetSymbol;
    }
    // Move all async initialization logic here
    // private async initialize(): Promise<void> {
    //     await this.getAllTokens();
    //     // Any other async initialization
    // }
    public static async create(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol): Promise<ContextSelector> {
        return new ContextSelector(document, targetSymbol);
    }
    // public static async create(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol): Promise<ContextSelector> {
    //     const instance = new ContextSelector(document, targetSymbol);
    //     // await instance.initialize(); // Call async initialization here
    //     return instance;
    // }
    public static async getInstance(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol): Promise<ContextSelector> {
        if (!ContextSelector.instance) {
            ContextSelector.instance = await ContextSelector.create(document, targetSymbol);
        }
        return ContextSelector.instance;
    }

    public getTokens(): DecodedToken[] {
        return this.tokens;
    }

    public async loadTokens(): Promise<DecodedToken[]> {
        await activate(this.document.uri);
        const decodedTokens = await getDecodedTokensFromSybol(this.document, this.targetSymbol);
        this.tokens = decodedTokens;
        return decodedTokens;
    }
    /**
     * Loads configuration from the .ini file
     */
    private loadConfig(): ContextSelectorConfig {
        try {
            const configPath = findTemplateFile("contextSelector.ini");
            const configData = fs.readFileSync(configPath, 'utf8');
            return ini.parse(configData) as ContextSelectorConfig;
        } catch (error) {
            console.error('Error loading config, using defaults:', error);
            // Return default configuration if file can't be loaded
            return {
                general: {
                    max_terms: 5,
                    relevance_threshold: 0.6
                },
                prompts: {
                    identify_terms_system: "You are an expert code analyzer that identifies terms that need additional context for unit test generation. Focus on functions, classes, dependencies, and complex logic.",
                    identify_terms_user: "Analyze the following code and identify the top {max_terms} most important terms, functions, or concepts that would require additional context to write effective unit tests:\n\n{source_code}",
                    test_generation_user: "Focal method and its source code to test:\n\n{source_code}. Important terms' context information:\n\n{context_info}",
                    test_generation_system: "You are an expert software engineer specializing in unit testing. Your task is to generate comprehensive and effective unit tests that maximize coverage of the given focal methods. Analyze the provided focal method and ensure the generated tests cover as many lines as possible. Use the important terms or source codes as references to align with expected behavior. Follow the unit test format strictly, as provided. Ensure edge cases, boundary values, and possible failure points are tested. The test structure must be clean, maintainable, and efficient. Only output Code which wrapped by ```, and do not include any other text.",
                    test_inspection_system: "System prompt for test inspection",
                    test_inspection_user: "User prompt for test inspection"
                }
            };
        }
    }
    
    /**
     * Reloads configuration from the .ini file
     */
    public reloadConfig(): void {
        this.config = this.loadConfig();
    }
    
    public needKeyTermFilter(tokens: DecodedToken[] | null = null): boolean {
        let curTokens = tokens;
        if (!curTokens) {
            curTokens = this.tokens
        }
        // const uniqueDefinitions = countUniqueDefinitions(curTokens);
        // if (uniqueDefinitions > this.config.general.max_terms) {
        //     return true;
        // }
        const uniqueTokens = new Set(curTokens.map(token => token.word));
        if (uniqueTokens.size > this.config.general.max_terms) {
            return true;
        }
        console.log("needKeyTermFilter: the number of unique definitions is ", uniqueTokens.size, "Therefore we don't need to filter");
        return false;
    }

    /**
     * Analyzes code to identify terms that need context for test generation
     * @param sourceCode The source code to analyze
     * @returns Array of terms that should be looked up for additional context
     */
    public async identifyContextTerms(sourceCode: string, logObj: any): Promise<ContextTerm[]> {
        // if (!this.needKeyTermFilter()) {
        //     return [];
        // }
        // Prepare prompt using the template from config
        const systemPrompt = this.config.prompts.identify_terms_system.replace('{max_terms}', this.config.general.max_terms.toString());
        const userPrompt = this.config.prompts.identify_terms_user
            .replace('{source_code}', sourceCode);
        
        const promptObj = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];
        
        try {
            console.log("promptObj", JSON.stringify(promptObj, null, 2));
            const response = await invokeLLM(promptObj, logObj);
            console.log("response", JSON.stringify(response, null, 2));
            return this.parseContextTermsFromResponse(response);
        } catch (error) {
            console.error('Error identifying context terms:', error);
            return [];
        }
    }

    public async identifyContextTermsWithCFG(sourceCode: string, tokens: string[], logObj: any): Promise<ContextTerm[]> {
        // const includedTokens = this.tokens.filter(token => tokens.includes(token.word));
        // if (!this.needKeyTermFilter(includedTokens)) {
        //     return [];
        // }
        // Prepare prompt using the template from config
        const systemPrompt = this.config.prompts.identify_terms_system.replace('{max_terms}', this.config.general.max_terms.toString());
        const userPrompt = this.config.prompts.identify_terms_user
            .replace('{source_code}', sourceCode);
        
        const promptObj = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];
        
        try {
            console.log("promptObj", JSON.stringify(promptObj, null, 2));
            const response = await invokeLLM(promptObj, logObj);
            console.log("response", JSON.stringify(response, null, 2));
            return this.parseContextTermsFromResponse(response);
        } catch (error) {
            console.error('Error identifying context terms:', error);
            return [];
        }
    }

    /**
     * Parses LLM response to extract context terms
     * Handles JSON format and falls back to regex if needed
     */
    public parseContextTermsFromResponse(response: string): ContextTerm[] {

        const result: ContextTerm[] = [];
        const jsonContent = formatToJSON(response);
        const jsonArray = extractArrayFromJSON(jsonContent);
        for (const term of jsonArray) {
            console.log("name", term);
            const termWithoutArgs = term.name.replace(/\(.*?\)/g, ''); // Remove argument parts
            const methodName = termWithoutArgs.split('.').pop();
            for (const token of this.tokens) {
                if (token.word === methodName) {
                    result.push({
                        name: token.word,
                        need_definition: term.need_definition,
                        need_example: term.need_example,
                        context: "",
                        example: "",
                    });
                    break;
                }
            }
        }
        return result;
}

    /**
     * Retrieves context for identified terms
     * @param terms Array of terms to get context for
     * @param functionSymbol Symbol of the focal method being analyzed
     * @returns Array of terms with their context and examples populated
     */
    public async gatherContext(terms: ContextTerm[], functionSymbol: vscode.DocumentSymbol | null): Promise<ContextTerm[]> {
        console.log(`[gatherContext] Starting to process ${terms.length} terms`);
        const enrichedTerms: ContextTerm[] = [];

        for (const term of terms) {
            const targetToken = this.tokens.find(token => token.word === term.name);
            if (!targetToken) {
                console.log(`[gatherContext] No matching token found for term: ${term.name}`);
                continue;
            }

            console.log(`[gatherContext] Processing term: ${term.name}`);
            const enrichedTerm = await this.enrichTermWithContext(term, targetToken, functionSymbol);
            if (enrichedTerm) {
                console.log(`[gatherContext] Successfully enriched term: ${term.name}`);
                enrichedTerms.push(enrichedTerm);
            } else {
                console.log(`[gatherContext] Failed to enrich term: ${term.name}`);
            }
        }

        console.log(`[gatherContext] Completed processing. Enriched ${enrichedTerms.length} terms`);
        return enrichedTerms;
    }

    private async enrichTermWithContext(
        term: ContextTerm, 
        targetToken: DecodedToken,
        functionSymbol: vscode.DocumentSymbol | null
    ): Promise<ContextTerm | null> {
        console.log(`[enrichTermWithContext] Starting to enrich term: ${term.name}`);
        const currentToken = await retrieveDef(this.document, targetToken);
        
        if (!this.isValidDefinition(currentToken)) {
            console.log(`[enrichTermWithContext] Invalid definition for term: ${term.name}`);
            return null;
        }

        if (!isInWorkspace(currentToken.definition[0].uri)) {
            console.log(`[enrichTermWithContext] Term ${term.name} is outside workspace: ${currentToken.definition[0].uri}`);
            return null;
        }

        console.log(`[enrichTermWithContext] Opening document for term: ${term.name}`);
        const defSymbolDoc = await vscode.workspace.openTextDocument(currentToken.definition[0].uri);
        let enriched = false;

        if (term.need_example) {
            console.log(`[enrichTermWithContext] Attempting to add example for: ${term.name}`);
            enriched = await this.addExampleToTerm(term, currentToken, defSymbolDoc);
            console.log(`[enrichTermWithContext] Example addition ${enriched ? 'successful' : 'failed'} for: ${term.name}`);
        }

        if (term.need_definition) {
            console.log(`[enrichTermWithContext] Attempting to add definition for: ${term.name}`);
            const defEnriched = await this.addDefinitionToTerm(term, currentToken, defSymbolDoc, functionSymbol);
            enriched = enriched || defEnriched;
            console.log(`[enrichTermWithContext] Definition addition ${defEnriched ? 'successful' : 'failed'} for: ${term.name}`);
        }

        if (!enriched) {
            console.log(`[enrichTermWithContext] No enrichment successful for: ${term.name}`);
            return null;
        }

        console.log(`[enrichTermWithContext] Successfully enriched term: ${term.name}`);
        return term;
    }

    private isValidDefinition(token: DecodedToken): boolean {
        const isValid = !!(token.definition && 
                 token.definition[0] && 
                 token.definition[0].uri && 
                 token.definition[0].range && 
                 token.definition.length > 0);
        console.log(`[isValidDefinition] Definition validity check: ${isValid}`);
        if (!isValid) {
            console.log(`[isValidDefinition] Definition ${token.word} is not valid: ${JSON.stringify(token.definition, null, 2)}`);
        }
        return isValid;
    }

    private async addExampleToTerm(
        term: ContextTerm, 
        token: DecodedToken, 
        defSymbolDoc: vscode.TextDocument
    ): Promise<boolean> {
        if (!token.definition[0].range) {
            console.log(`[addExampleToTerm] No range found for example: ${term.name}`);
            return false;
        }

        term.example = await getReferenceInfo(defSymbolDoc, token.definition[0].range, 50, false);
        const success = !!term.example;
        console.log(`[addExampleToTerm] Example ${success ? 'found' : 'not found'} for: ${term.name}`);
        return success;
    }

    private async addDefinitionToTerm(
        term: ContextTerm,
        token: DecodedToken,
        defSymbolDoc: vscode.TextDocument,
        functionSymbol: vscode.DocumentSymbol | null
    ): Promise<boolean> {
        if (!token.definition[0].range) {
            console.log(`[addDefinitionToTerm] No range found for definition: ${term.name}`);
            return false;
        }
        
        if (isBetweenFocalMethod(token.definition[0].range, functionSymbol)) {
            console.log(`[addDefinitionToTerm] Definition is within focal method: ${term.name}`);
            return false;
        }

        if (token.type === 'variable' || token.type === 'property') {
            console.log(`[addDefinitionToTerm] Processing ${token.type} definition for: ${term.name}`);
            return this.addVariableDefinition(term, token, defSymbolDoc);
        } else {
            console.log(`[addDefinitionToTerm] Processing method definition for: ${term.name}`);
            return this.addMethodDefinition(term, token, defSymbolDoc, functionSymbol);
        }
    }

    // private addVariableDefinition(
    //     term: ContextTerm,
    //     token: DecodedToken,
    //     defSymbolDoc: vscode.TextDocument
    // ): boolean {
    //     console.log(`[addVariableDefinition] Starting for: ${term.name}`);
    //     term.context = defSymbolDoc.lineAt(token.definition[0].range!.start.line).text.trim();
        
    //     if (this.document.getText(this.targetSymbol.range).includes(term.context)) {
    //         console.log(`[addVariableDefinition] Definition already in source code: ${term.name}`);
    //         term.context = "";
    //         return false;
    //     }
        
    //     console.log(`[addVariableDefinition] Successfully added definition for: ${term.name}`);
    //     return true;
    // }
    
    private addLineNumbers(text: string, startLine: number): string {
        return text.split('\n')
            .map((line, index) => `[L${startLine + index}] ${line}`)
            .join('\n');
    }

    private addVariableDefinition(
        term: ContextTerm,
        token: DecodedToken,
        defSymbolDoc: vscode.TextDocument
    ): boolean {
        console.log(`[addVariableDefinition] Starting for: ${term.name}`);
        const targetLine = defSymbolDoc.lineAt(token.definition[0].range!.start.line).text.trim();
        if (this.document.getText(this.targetSymbol.range).includes(targetLine)) {
            console.log(`[addVariableDefinition] Definition already in source code: ${term.name}`);
            term.context = "";
            return false;
        }

        const startLine = Math.max(0, token.definition[0].range!.start.line - 3);
        const endLine = Math.min(defSymbolDoc.lineCount - 1, token.definition[0].range!.start.line + 3);
        
        const contextLines = [];
        for (let i = startLine; i <= endLine; i++) {
            contextLines.push(defSymbolDoc.lineAt(i).text.trim());
        }
        term.context = this.addLineNumbers(contextLines.join('\n'), startLine + 1);
        
        console.log(`[addVariableDefinition] Successfully added definition for: ${term.name}`);
        return true;
    }

    private async addMethodDefinition(
        term: ContextTerm,
        token: DecodedToken,
        defSymbolDoc: vscode.TextDocument,
        functionSymbol: vscode.DocumentSymbol | null
    ): Promise<boolean> {
        console.log(`[addMethodDefinition] Starting for: ${term.name}`);
        
        if (token.defSymbol === null) {
            console.log(`[addMethodDefinition] Retrieving symbol for: ${term.name}`);
            token.defSymbol = await getSymbolByLocation(defSymbolDoc, token.definition[0].range!.start);
        }

        if (!token.defSymbol) {
            console.log(`[addMethodDefinition] No symbol found for: ${term.name}`);
            return false;
        }

        if (token.defSymbol === functionSymbol) {
            console.log(`[addMethodDefinition] Symbol matches focal method: ${term.name}`);
            return false;
        }

        const needFullDefinition = term.need_full_definition ?? false;
        console.log(`[addMethodDefinition] Getting ${needFullDefinition ? 'full' : 'partial'} definition for: ${term.name}`);
        const symbolDetail = await getSymbolDetail(defSymbolDoc, token.defSymbol, true);
        term.context = this.addLineNumbers(symbolDetail, token.defSymbol!.range.start.line + 1);
        
        console.log(`[addMethodDefinition] Successfully added definition for: ${term.name}`);
        return true;
    }
}
//     /**
//      * Retrieves context for identified terms
//      * @param terms Array of terms to get context for
//      * @param codebase Optional codebase information to help with context gathering
//      * @returns The same terms with description fields populated
//      */
//     public async gatherContext(terms: ContextTerm[], functionSymbol: vscode.DocumentSymbol | null): Promise<ContextTerm[]> {
        
//         const enrichedTerms: ContextTerm[] = [];
//         for (const term of terms) {
//             // Prepare prompt using the template from config
//             // find the symbol of term in AllTokens 
//             const targetToken = this.tokens.find(token => token.word === term.name);
//             let enriched = false;
//             if (targetToken) {
//                 const currentToken = await retrieveDef(this.document, targetToken);
//                 // const symbols = await getAllSymbols(this.document.uri);
//                 // const isDefUnderFocalMethod = isDefUnderFocalMethod(currentToken, functionSymbol);
//                 if (!currentToken.definition || !currentToken.definition[0] || !currentToken.definition[0].uri) {
//                     console.log(`No definition found for "${term.name}"`);
//                     continue;
//                 }

//                 if (isInWorkspace(currentToken.definition[0].uri)) {

//                     if (currentToken.definition && currentToken.definition[0].range && currentToken.definition.length > 0) {
//                             const defSymbolDoc = await vscode.workspace.openTextDocument(currentToken.definition[0].uri);
//                             if (term.need_example) {
//                                 if (currentToken.definition[0].range) {
//                                     term.example = await getReferenceInfo(defSymbolDoc, currentToken.definition[0].range, 20, false);
//                                     if (term.example) {
//                                         enriched = true;
//                                     }
//                                 }
//                              }
//                             if (term.need_definition) {
//                                 if (currentToken.definition[0].range && !isBetweenFocalMethod(currentToken.definition[0].range, functionSymbol)) {
//                                     if (currentToken.type == 'variable' || currentToken.type == 'property') {
//                                         // Some tokens don't have to find symbol, directly recall its definition
//                                         const defSymbolDoc = await vscode.workspace.openTextDocument(currentToken.definition[0].uri);
//                                         term.context = defSymbolDoc.lineAt(currentToken.definition[0].range.start.line).text.trim();
//                                         if (this.document.getText(this.targetSymbol.range).includes(term.context)) {
//                                             // we don't need to find the definition of the term if it is in the source code
//                                             term.context = "";
//                                         } else {
//                                             enriched = true;
//                                         }
//                                     } else {    
//                                         // fir method, functions, we need first find out its symbol to recall its definition
//                                         if (currentToken.defSymbol === null){
//                                             currentToken.defSymbol = await getSymbolByLocation(defSymbolDoc, currentToken.definition[0].range.start);
//                                         }
//                                         if (currentToken.defSymbol && currentToken.defSymbol !== functionSymbol) {
//                                             // if need_full_definition is not defined => false, defined && value is true => true, defined && value is false => false
//                                             const needFullDefinition = term.need_full_definition === undefined ? false : term.need_full_definition;
//                                             term.context = await getSymbolDetail(defSymbolDoc, currentToken.defSymbol, needFullDefinition);
//                                             enriched = true;
//                                             }
//                                     }
//                             }
//                         }
//                     } else {
//                         console.log(`No definition found for "${term.name}"`);
//                         continue;
//                     }
//                 } else {
//                     console.log(`word ${term.name} is out of workspace`);
//                     continue;
//                 }
//                 if (enriched) {
//                     enrichedTerms.push(term);
//                     // continue;
//                 } else {
//                     console.log(`No context found for "${term.name}"`);
//                 }
//             }
//         }
//         return enrichedTerms;
//     }
    
// }

/**
 * Checks if a token's definition is located between the start and end lines of a focal method
 * @param tokenRange The range of the token's definition
 * @param focalMethodSymbol The symbol representing the focal method
 * @returns true if the token's definition is between the focal method's lines, false otherwise
 */
function isBetweenFocalMethod(
    tokenRange: vscode.Range,
    focalMethodSymbol: vscode.DocumentSymbol | null
): boolean {
    if (!focalMethodSymbol) {
        return false;
    }

    return (
        tokenRange.start.line > focalMethodSymbol.range.start.line && 
        tokenRange.end.line < focalMethodSymbol.range.end.line
    );
}

// Export a convenience function to get the singleton instance
export async function getContextSelectorInstance(document: vscode.TextDocument, targetSymbol: vscode.DocumentSymbol): Promise<ContextSelector> {
    return await ContextSelector.getInstance(document, targetSymbol);
}

export function isInWorkspace(uri: vscode.Uri): boolean {
    return uri.fsPath.includes(getConfigInstance().workspace);
}