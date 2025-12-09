import * as vscode from 'vscode';
import { getDecodedTokensFromSymbol } from '../../lsp/token';
import { retrieveDefs } from '../../lsp/definition';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { PathCollector } from '../../cfg/path';
import { SupportedLanguage } from '../../ast';

export interface MUTAnalysisResult {
    totalTokens: number;
    uniquePaths: number;
    externalDependencyTokens: number;
    comments: number;
}

/**
 * Analyzes a focal method (MUT - Method Under Test)
 * @param document The document containing the method
 * @param functionSymbol The symbol representing the method
 * @param languageId The language of the document
 * @returns Analysis results including token count, path count, external dependencies, and comment count
 */
export async function analyzeFocalMethod(
    document: vscode.TextDocument,
    functionSymbol: vscode.DocumentSymbol,
    languageId: string
): Promise<MUTAnalysisResult> {
    
    // 1. Analyze tokens using LSP
    const tokens = await getDecodedTokensFromSymbol(document, functionSymbol);
    const totalTokens = tokens.length;
    
    // 2. Analyze external dependencies using LSP
    const tokensWithDefs = await retrieveDefs(document, tokens);
    const externalDependencyTokens = tokensWithDefs.filter(token => 
        token.definition && 
        token.definition.length > 0 && 
        !functionSymbol.range.contains(token.definition[0].range)
    ).length;
    
    // 3. Analyze unique paths using CFG analyzer
    const functionText = document.getText(functionSymbol.range);
    let uniquePaths = 0;
    
    try {
        const builder = createCFGBuilder(languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(functionText);
        const pathCollector = new PathCollector(languageId);
        const paths = pathCollector.collect(cfg.entry);
        const minimizedPaths = pathCollector.minimizePaths(paths);
        uniquePaths = minimizedPaths.length;
    } catch (error) {
        console.error(`Failed to build CFG for language ${languageId}:`, error);
        uniquePaths = -1; // Indicate failure
    }
    
    // 4. Count comments using LSP (semantic tokens can identify comments)
    const comments = countComments(functionText, languageId);
    
    return {
        totalTokens,
        uniquePaths,
        externalDependencyTokens,
        comments
    };
}

/**
 * Counts the number of comments in the given code
 * @param code The source code
 * @param languageId The language identifier
 * @returns The number of comment lines
 */
function countComments(code: string, languageId: string): number {
    const commentPatterns = getCommentPatterns(languageId);
    let count = 0;
    
    for (const pattern of commentPatterns) {
        const matches = code.match(pattern);
        if (matches) {
            count += matches.length;
        }
    }
    
    return count;
}

/**
 * Returns regex patterns for comments based on language
 */
function getCommentPatterns(languageId: string): RegExp[] {
    switch (languageId.toLowerCase()) {
        case 'python':
            return [
                /#[^\n]*/g,           // Single-line comments
                /'''[\s\S]*?'''/g,    // Multi-line triple single quotes
                /"""[\s\S]*?"""/g     // Multi-line triple double quotes
            ];
        case 'java':
        case 'javascript':
        case 'typescript':
        case 'cpp':
        case 'c':
        case 'go':
            return [
                /\/\/[^\n]*/g,        // Single-line comments
                /\/\*[\s\S]*?\*\//g   // Multi-line comments
            ];
        default:
            return [
                /\/\/[^\n]*/g,        // Default: C-style single-line
                /\/\*[\s\S]*?\*\//g   // Default: C-style multi-line
            ];
    }
}