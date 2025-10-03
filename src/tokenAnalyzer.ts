// ... existing code ...

import { ContextTerm } from "./agents/contextSelector";
import { retrieveDef } from "./retrieve";
import { DecodedToken } from "./token";
import { getSymbolByLocation } from "./lsp";
import * as vscode from 'vscode';
import { ConditionAnalysis } from "./cfg/path";
// 1. Define the type for the algorithm
type HelpfulnessAlgorithm = 'default' | 'alternative1' | 'cfg';
const ASSIGNMENT_OPERATOR = "=";
let helpfulnessAlgorithm: HelpfulnessAlgorithm = 'cfg';
export function setHelpfulnessAlgorithm(algo: HelpfulnessAlgorithm) {
    helpfulnessAlgorithm = algo;
}

const SKIP_TYPES = ["builtinConstant", "comment", "string", "number", "boolean", "null", "undefined", "object", "array"];
export function needSkip(token: DecodedToken): boolean {
    return SKIP_TYPES.includes(token.type);
}

export function isReturnTypeBoolean(symbol: vscode.DocumentSymbol): boolean {
    return symbol.detail.includes("boolean");
}

export async function isReturnBoolean(token: DecodedToken): Promise<boolean> {
        // Example: Only functions are helpful
        // return getTokenInPaths(token, paths);
    if (!token.defSymbol) {
        await loadDefAndSaveToDefSymbol(token);
    }
    return token.defSymbol!==null && isReturnTypeBoolean(token.defSymbol);
}

export function isFunctionArg(token: DecodedToken): boolean {
    // You can add more complex logic here later
    return token.type === "method" || token.type === "function";
}

export function isMutated(token: DecodedToken): boolean {
    return token.type === "assignment";
}

export function isClass(token: DecodedToken): boolean {
    return token.type === "class";
}

export function isUsedAsReturnValue(token: DecodedToken): boolean {
    // todo: implement this
    return false;
}

export function isUsedAsFunctionArgument(token: DecodedToken): boolean {
    return token.type === "parameter";
}

export function isUsedAsMutatedVariable(token: DecodedToken): boolean {
    return token.type === "assignment";
}

// --- Default Algorithm ---
function defaultIsDefinitionHelpful(token: DecodedToken): boolean {
    if (!token || !token.type) {
        return false;
    }
    if (token.type === "method"){
        return true;
    }
    const helpfulTypes = ['function', 'class', 'method', 'global', 'member'];
    return helpfulTypes.includes(token.type);
}

function defaultIsReferenceHelpful(token: DecodedToken): boolean {
    if (!token) {
        return false;
    }
    if ( isFunctionArg(token) || isMutated(token)) {
        return true;
    }
    if (token.type && ['function', 'method'].includes(token.type)) {
        return true;
    }
    return false;
}

function defaultGetContextTermsFromTokens(tokens: DecodedToken[]): ContextTerm[] {
    return tokens.map(token => ({
        name: token.word,
        need_definition: defaultIsDefinitionHelpful(token),
        need_example: defaultIsReferenceHelpful(token),
        context: "",
        example: "",
    }));
}

// function returnTypeNotVoid(token: DecodedToken): boolean {
//     return isFunctionArg(token) && token.defSymbol !== null && !isReturnTypeVoid(token.defSymbol!);
// }

export function isReturnTypeVoid(symbol: vscode.DocumentSymbol): boolean {
    return symbol.detail.includes("void");
}

async function loadDefAndSaveToDefSymbol(token: DecodedToken) {
    await retrieveDef(token.document, token);
    if (token.definition && token.definition[0] && token.definition[0].range && token.definition.length > 0) {
        const defSymbolDoc = await vscode.workspace.openTextDocument(token.definition[0].uri);
        token.defSymbol = await getSymbolByLocation(defSymbolDoc, token.definition[0].range.start);
    }
}
// --- Alternative Algorithm Example ---
async function cfgBasedIsDefinitionHelpful(token: DecodedToken): Promise<boolean> {
    // Example: Only functions are helpful
    // return getTokenInPaths(token, paths);
    
    if (isFunctionArg(token)) {
        if (!token.defSymbol) {
            await loadDefAndSaveToDefSymbol(token);
        }
        return token.defSymbol!==null && !isReturnTypeVoid(token.defSymbol);
    }
    // currently, we do not give definition of Class, since it is too long
    return !isClass(token);    
}

function cfgBasedIsReferenceHelpful(token: DecodedToken): boolean {
    // Example: Only if used as return value
    return false;
}

function isTokenInPath(token: DecodedToken, path: any): boolean {
    // Get all conditions from the path segments
    return path.includes(token.word);
}
// To get all tokens that appear in a path:
function getTokensInPath(tokens: DecodedToken[], path: any): DecodedToken[] {
    return tokens.filter(token => isTokenInPath(token, path));
}
export function getTokenInPaths(token: DecodedToken, paths: Set<string>): boolean {
    return Array.from(paths).some(path => isTokenInPath(token, path));
}
// To get all tokens that appear in any of the paths:
export function getTokensInPaths(tokens: DecodedToken[], paths: Set<string>): DecodedToken[] {
    return tokens.filter(token => 
        Array.from(paths).some(path => isTokenInPath(token, path))
    );
}
// Add this new function before getContextTermsFromTokens
function removeRedundantTokens(tokens: ContextTerm[]): ContextTerm[] {
    const uniqueTokens = new Map<string, ContextTerm>();
    
    for (const token of tokens) {
        if (!uniqueTokens.has(token.name)) {
            uniqueTokens.set(token.name, token);
        } else {
            // Get existing token with the same name
            const existingToken = uniqueTokens.get(token.name)!;
            // Perform OR operation on need_definition and need_example
            existingToken.need_definition = existingToken.need_definition || token.need_definition;
            existingToken.need_example = existingToken.need_example || token.need_example;
            // Preserve other properties from the existing token
            uniqueTokens.set(token.name, existingToken);
        }
    }
    
    return Array.from(uniqueTokens.values());
}

// async function cfgGetContextTermsFromTokens(document: vscode.TextDocument, tokens: DecodedToken[], paths: any, functionInfo: Map<string, string> = new Map()): Promise<ContextTerm[]> {
//     // comming tokens are all appeared in CFG path.
//     // For definitions, we only care about tokens in paths
//     let tokenInSignature: DecodedToken[] = [];
//     let tokensRelatedWithPaths: DecodedToken[] = [];
//     // const uniqueTokens = removeRedundantTokens(tokens);
//     const tokensInPaths = getTokensInPaths(tokens, paths);
//     tokensRelatedWithPaths.push(...tokensInPaths);
//     // traverse all tokens and find out the token that is at same location with one of the tokensInPath 
//     for (const token of tokens) {
//         if (tokensInPaths.some(t => t.line === token.line && document.lineAt(token.line).text.includes(ASSIGNMENT_OPERATOR))) {
//             tokensRelatedWithPaths.push(token);
//         }
//     }

//     if (functionInfo.size > 0 && functionInfo.has('signature')) {
//          tokenInSignature = getTokensInPath(tokens, functionInfo.get('signature'));
//     }
//     // Process all tokens to create the unified structure
//     return Promise.all(tokens.map(async token => {
//         // For definition, only consider tokens in paths
//         const needDefinition = tokensRelatedWithPaths.includes(token) && 
//             await cfgBasedIsDefinitionHelpful(token, paths);
        
//         // For examples, consider all tokens
//         const needExample = tokenInSignature.includes(token) || cfgBasedIsReferenceHelpful(token, paths, functionInfo);
        
//         return {
//             name: token.word,
//             need_definition: needDefinition,
//             need_example: needExample,
//             need_full_definition: isFunctionArg(token) && await isReturnBoolean(token),
//             context: "",
//             example: "",
//             token: token,
//         };
//     }));
// }
async function cfgGetContextTermsFromTokens(
    document: vscode.TextDocument, 
    tokens: DecodedToken[], 
    conditions: ConditionAnalysis[],
    functionInfo: Map<string, string> = new Map()
    ): Promise<ContextTerm[]> {
    // comming tokens are all appeared in CFG path.
    // For definitions, we only care about tokens in paths
    let tokenInSignature: DecodedToken[] = [];
    let tokensRelatedWithPaths: DecodedToken[] = [];
    // Map to store which paths each token is related to
    const tokenPathMap = new Map<DecodedToken, Set<string>>();
    
    // Find tokens in paths and record which paths they appear in
    for (const token of tokens) {
        const relatedPaths: Set<string> = new Set();
        for (const condition of conditions) {
            if (isTokenInPath(token, condition.condition)) {
                relatedPaths.add(condition.condition);
                condition.dependencies.add(token.word);
            }
        }
        
        if (relatedPaths.size > 0) {
            tokenPathMap.set(token, relatedPaths);
            tokensRelatedWithPaths.push(token);
        }
    }
    
    // Find tokens on same line as a token in paths
    for (const token of tokens) {
        if (!tokensRelatedWithPaths.includes(token) && 
            tokensRelatedWithPaths.some(t => t.line === token.line && 
            document.lineAt(token.line).text.includes(ASSIGNMENT_OPERATOR))) {
            // Find which path the token on the same line is related to
            const sameLineToken = tokensRelatedWithPaths.find(t => t.line === token.line);
            if (sameLineToken && tokenPathMap.has(sameLineToken)) {
                tokenPathMap.set(token, tokenPathMap.get(sameLineToken)!);
                tokensRelatedWithPaths.push(token);
            }
        }
    }

    if (functionInfo.size > 0 && functionInfo.has('signature')) {
         tokenInSignature = getTokensInPath(tokens, functionInfo.get('signature'));
    }
    
    // Process all tokens to create the unified structure
    return Promise.all(tokens.map(async token => {
        // For definition, only consider tokens in paths
        const needDefinition = tokensRelatedWithPaths.includes(token) && 
            await cfgBasedIsDefinitionHelpful(token);
        
        // For examples, consider all tokens
        const needExample = tokenInSignature.includes(token) || cfgBasedIsReferenceHelpful(token);
        
        // Get the associated paths for this token
        const relatedPaths = tokenPathMap.get(token) || new Set<string>();
        
        return {
            name: token.word,
            need_definition: needDefinition,
            need_example: needExample,
            need_full_definition: isFunctionArg(token), // && await isReturnBoolean(token),
            context: "",
            example: "",
            token: token,
            hint: relatedPaths.size > 0 ? Array.from(relatedPaths) : undefined, // Add the hint field with related paths
        };
    }));
}
/**
 * Removes the focal method from context terms to avoid redundant information
 * @param contextTerms List of context terms to filter
 * @param focalMethodName Name of the focal method to exclude
 * @returns Filtered list of context terms without the focal method
 */
function removeFocalMethodFromContextTerms(contextTerms: ContextTerm[], focalMethodName: string): ContextTerm[] {
    return contextTerms.filter(term => term.name !== focalMethodName);
}
// 4. Main exported functions delegate to the selected algorithm
export async function getContextTermsFromTokens(
    document: vscode.TextDocument, 
    symbol: vscode.DocumentSymbol,
    tokens: DecodedToken[], 
    conditions: ConditionAnalysis[], 
    functionInfo: Map<string, string> = new Map()
): Promise<ContextTerm[]> {
    switch (helpfulnessAlgorithm) {
        case 'cfg':
            // console.log("tokens :", tokens)
            const needContextTerms = await cfgGetContextTermsFromTokens(document, tokens, conditions, functionInfo);
            const filteredTerms = needContextTerms.filter(term => term.need_definition === true || term.need_example === true);
            let uniqueTokens = removeRedundantTokens(filteredTerms);
            uniqueTokens = removeFocalMethodFromContextTerms(uniqueTokens, symbol.name);
            console.log("needContextTerms :", uniqueTokens.map(term => [term.name, term.need_definition, term.need_example]));
            return uniqueTokens;
        case 'default':
        default:
            return defaultGetContextTermsFromTokens(tokens).filter(term => term.need_definition === true || term.need_example === true);
    }
};