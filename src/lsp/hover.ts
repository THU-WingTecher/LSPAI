import * as vscode from 'vscode';
import { VscodeRequestManager } from './vscodeRequestManager';
import { activate } from './helper';

/**
 * Extracts text content from hover contents, handling all possible types
 * @param contents The hover contents (can be MarkdownString, MarkedString, or array)
 * @returns The extracted text as a string
 */
export function getContentsText(contents: vscode.MarkdownString | vscode.MarkedString | Array<vscode.MarkdownString | vscode.MarkedString>): string {
    if (Array.isArray(contents)) {
        return contents.map(c => {
            if (typeof c === 'string') {
                return c;
            } else if (c instanceof vscode.MarkdownString) {
                return c.value;
            } else if (Array.isArray(c)) {
                // MarkedString as tuple [language, value]
                return c[1];
            } else if (typeof c === 'object' && 'value' in c) {
                // MarkedString as object { language, value }
                return (c as { value: string }).value;
            } else {
                return String(c);
            }
        }).join('\n');
    } else if (typeof contents === 'string') {
        return contents;
    } else if (contents instanceof vscode.MarkdownString) {
        return contents.value;
    } else if (Array.isArray(contents)) {
        // MarkedString as tuple
        return contents[1];
    } else if (typeof contents === 'object' && 'value' in contents) {
        // MarkedString as object
        return (contents as { value: string }).value;
    } else {
        return String(contents);
    }
}

/**
 * Gets hover information for a symbol and logs debug information
 * @param document The document containing the symbol
 * @param symbol The symbol to get hover information for
 * @param enableDebugLogging Whether to enable debug console logging (default: true)
 * @returns Array of hover results
 */
export async function getHover(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
    enableDebugLogging: boolean = true
): Promise<vscode.Hover[]> {
    // Activate the document first to ensure LSP is ready
    await activate(document.uri);
    
    // Try hover on the function name (selectionRange) instead of just range.start
    // selectionRange is typically the identifier/name of the symbol
    const hoverPosition = symbol.selectionRange.start;
    const hoverResults = await VscodeRequestManager.hover(document.uri, hoverPosition);
    
    if (enableDebugLogging) {
        console.log('=== Hover Debug ===');
        console.log(`Hover position: line ${hoverPosition.line}, char ${hoverPosition.character}`);
        console.log(`Hover results count: ${hoverResults.length}`);
        
        if (hoverResults.length > 0) {
            hoverResults.forEach((hover, index) => {
                console.log(`Hover ${index + 1}:`, {
                    contents: hover.contents,
                    range: hover.range,
                    contentsText: getContentsText(hover.contents)
                });
            });
        } else {
            console.log('No hover information available at this position');
            console.log('This might mean:');
            console.log('1. The language server doesn\'t provide hover at this position');
            console.log('2. The position is not on an identifier/symbol');
            console.log('3. The language server needs more time to analyze');
        }
        console.log('=== End Hover Debug ===');
    }
    
    return hoverResults;
}

/**
 * Extracts all text content from hover results
 * @param hoverResults Array of hover results
 * @returns Combined text content from all hover results
 */
export function extractHoverText(hoverResults: vscode.Hover[]): string {
    if (!hoverResults || hoverResults.length === 0) {
        return '';
    }
    
    return hoverResults
        .map(hover => getContentsText(hover.contents))
        .filter(text => text.length > 0)
        .join('\n');
}

/**
 * Counts comments in hover information text
 * @param hoverText The text extracted from hover information
 * @param languageId The language identifier for comment pattern matching
 * @returns The number of comments found
 */
export function countCommentsFromHover(hoverText: string, languageId: string): number {
    if (!hoverText || hoverText.length === 0) {
        return 0;
    }
    
    const commentPatterns = getCommentPatterns(languageId);
    let count = 0;
    
    for (const pattern of commentPatterns) {
        const matches = hoverText.match(pattern);
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

