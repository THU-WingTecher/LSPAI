import * as vscode from 'vscode';
import { getDecodedTokensFromSymbol } from '../../lsp/token';
import { isInWorkspace, retrieveDefs } from '../../lsp/definition';
import { createCFGBuilder } from '../../cfg/builderFactory';
import { PathCollector } from '../../cfg/path';
import { SupportedLanguage } from '../../ast';
import { DecodedToken } from '../../lsp/types';
import { getHover, extractHoverText, countCommentsFromHover } from '../../lsp/hover';

export interface MUTAnalysisResult {
    totalTokens: number;
    uniquePaths: number;
    tokensInFileOutsideFunction: DecodedToken[];
    tokensInOtherDocuments: DecodedToken[];
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
    
    // Separate tokens into two categories:
    // - Tokens with definitions in the same file but outside function range
    // - Tokens with definitions in other documents
    const tokensInFileOutsideFunction: DecodedToken[] = [];
    const tokensInOtherDocuments: DecodedToken[] = [];
    
    for (const token of tokensWithDefs) {
        if (token.definition && token.definition.length > 0) {
            const firstDef = token.definition[0];
            
            // Check if definition is in the same file
            if (firstDef.uri.toString() === document.uri.toString()) {
                // Same file - check if outside function range
                if (!functionSymbol.range.contains(firstDef.range)) {
                    tokensInFileOutsideFunction.push(token);
                }
            } else {
                if (isInWorkspace(firstDef.uri.fsPath)) {
                    tokensInOtherDocuments.push(token);
                }
            }
        }
    }
    
    const externalDependencyTokens = tokensInFileOutsideFunction.length + tokensInOtherDocuments.length;
    
    // Debug logging for tokens
    console.log('=== MUT Analysis Debug ===');
    console.log(`Total tokens: ${totalTokens}`);
    console.log(`Tokens with definitions in same file (outside function): ${tokensInFileOutsideFunction.length}`);
    console.log('Tokens in same file (outside function):', 
        tokensInFileOutsideFunction.map(t => ({
            word: t.word,
            type: t.type,
            line: t.line,
            definition: t.definition?.[0] ? {
                uri: t.definition[0].uri.toString(),
                range: t.definition[0].range
            } : null
        }))
    );
    console.log(`Tokens with definitions in other documents: ${tokensInOtherDocuments.length}`);
    console.log('Tokens in other documents:', 
        tokensInOtherDocuments.map(t => ({
            word: t.word,
            type: t.type,
            line: t.line,
            definition: t.definition?.[0] ? {
                uri: t.definition[0].uri.toString(),
                range: t.definition[0].range
            } : null
        }))
    );
    
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
    
    // 4. Count comments from hover information
    // Hover information may contain documentation strings (docstrings) which are comments
    const hoverResults = await getHover(document, functionSymbol);
    const hoverText = extractHoverText(hoverResults);
    const comments = countCommentsFromHover(hoverText, languageId);
    
    // Debug logging for hover-based comments
    console.log('=== Hover Comments Debug ===');
    console.log(`Hover text extracted: ${hoverText.length} characters`);
    console.log(`Comments found in hover: ${comments}`);
    if (hoverText.length > 0) {
        console.log('Hover text preview:', hoverText.substring(0, 200));
    }
    console.log('=== End Hover Comments Debug ===');
    
    return {
        totalTokens,
        uniquePaths,
        externalDependencyTokens,
        comments,
        tokensInFileOutsideFunction,
        tokensInOtherDocuments
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
 * Extracts detailed information about comments for debugging
 * @param code The source code
 * @param languageId The language identifier
 * @returns Array of comment details with text and line numbers
 */
function extractCommentDetails(code: string, languageId: string): Array<{ text: string; line: number; type: string }> {
    const commentPatterns = getCommentPatterns(languageId);
    const commentDetails: Array<{ text: string; line: number; type: string }> = [];
    const lines = code.split('\n');
    
    for (const pattern of commentPatterns) {
        // Reset regex lastIndex to ensure fresh matching
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(code)) !== null) {
            const matchText = match[0];
            // Find the line number by counting newlines before the match
            const textBeforeMatch = code.substring(0, match.index);
            const lineNumber = textBeforeMatch.split('\n').length - 1;
            
            // Determine comment type
            let commentType = 'unknown';
            if (pattern.source.includes('#') || pattern.source.includes('//')) {
                commentType = 'single-line';
            } else if (pattern.source.includes('/*') || pattern.source.includes("'''") || pattern.source.includes('"""')) {
                commentType = 'multi-line';
            }
            
            commentDetails.push({
                text: matchText.trim().substring(0, 100), // Limit to first 100 chars
                line: lineNumber,
                type: commentType
            });
        }
    }
    
    return commentDetails;
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