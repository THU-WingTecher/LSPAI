// ... existing code ...

import { ContextTerm } from "./agents/contextSelector";
import { retrieveDef } from "./retrieve";
import { DecodedToken } from "./token";
import { getSymbolByLocation } from "./lsp";
import * as vscode from 'vscode';
// 1. Define the type for the algorithm
type HelpfulnessAlgorithm = 'default' | 'alternative1' | 'cfg';

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
    if (!token || !token.type) return false;
    if (token.type === "method"){
        return true;
    }
    const helpfulTypes = ['function', 'class', 'method', 'global', 'member'];
    return helpfulTypes.includes(token.type);
}

function defaultIsReferenceHelpful(token: DecodedToken): boolean {
    if (!token) return false;
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
    if (token.definition && token.definition[0].range && token.definition.length > 0) {
        const defSymbolDoc = await vscode.workspace.openTextDocument(token.definition[0].uri);
        token.defSymbol = await getSymbolByLocation(defSymbolDoc, token.definition[0].range.start);
    }
}
// --- Alternative Algorithm Example ---
async function cfgBasedIsDefinitionHelpful(token: DecodedToken, paths: Set<string>): Promise<boolean> {
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

function cfgBasedIsReferenceHelpful(token: DecodedToken, paths: Set<string>): boolean {
    // Example: Only if used as return value
    return isUsedAsReturnValue(token);
}

function isTokenInPath(token: DecodedToken, path: any): boolean {
    // Get all conditions from the path segments
    return path.includes(token.word)
    const conditions = path.simple.split("&&")
    
    // Check if the token's word appears in any of the conditions
    return conditions.some((condition: string) => 
        condition.includes(token.word)
    );
}
// To get all tokens that appear in a path:
function getTokensInPath(tokens: DecodedToken[], path: any): DecodedToken[] {
    return tokens.filter(token => isTokenInPath(token, path));
}
export function getTokenInPaths(token: DecodedToken, paths: Set<string>): boolean {
    return Array.from(paths).some(path => isTokenInPath(token, path))
}
// To get all tokens that appear in any of the paths:
export function getTokensInPaths(tokens: DecodedToken[], paths: Set<string>): DecodedToken[] {
    return tokens.filter(token => 
        Array.from(paths).some(path => isTokenInPath(token, path))
    );
}
// Add this new function before getContextTermsFromTokens
function removeRedundantTokens(tokens: DecodedToken[]): DecodedToken[] {
    const uniqueTokens = new Map<string, DecodedToken>();
    
    for (const token of tokens) {
        if (!uniqueTokens.has(token.word)) {
            uniqueTokens.set(token.word, token);
        }
    }
    
    return Array.from(uniqueTokens.values());
}
async function cfgGetContextTermsFromTokens(tokens: DecodedToken[], paths: any): Promise<ContextTerm[]> {
    // comming tokens are all appeared in CFG path.
    return Promise.all(tokens.map(async token => ({
        name: token.word,
        need_definition: await cfgBasedIsDefinitionHelpful(token, paths),
        need_example: cfgBasedIsReferenceHelpful(token, paths),
        need_full_definition: isFunctionArg(token) && await isReturnBoolean(token),
        context: "",
        example: "",
        token: token,
    })));
}

// 4. Main exported functions delegate to the selected algorithm
export async function getContextTermsFromTokens(tokens: DecodedToken[], paths: Set<string> = new Set()): Promise<ContextTerm[]> {
    switch (helpfulnessAlgorithm) {
        case 'cfg':
            const tokensInPaths = getTokensInPaths(tokens, paths);
            const uniqueTokensInPaths = removeRedundantTokens(tokensInPaths);
            // console.log("uniqueTokensInPaths :", uniqueTokensInPaths)
            const filteredTerms = await cfgGetContextTermsFromTokens(uniqueTokensInPaths, paths);
            // console.log("filteredTerms :", filteredTerms)
            return filteredTerms.filter(term => term.need_definition == true || term.need_example == true);
        case 'default':
        default:
            return defaultGetContextTermsFromTokens(tokens).filter(term => term.need_definition == true || term.need_example == true);
    }
}

// export async function isDefinitionHelpfulForUnitTest(token: DecodedToken, paths: Set<string>): Promise<boolean> {
//     switch (helpfulnessAlgorithm) {
//         case 'cfg':
//             return await cfgBasedIsDefinitionHelpful(token, paths);
//         case 'default':
//         default:
//             return defaultIsDefinitionHelpful(token);
//     }
// }
// export function isReferenceHelpfulForUnitTest(token: DecodedToken, paths: Set<string>): boolean {
//     switch (helpfulnessAlgorithm) {
//         case 'cfg':
//             return cfgBasedIsReferenceHelpful(token, paths);
//         case 'default':
//         default:
//             return defaultIsReferenceHelpful(token);
//     }
// }

// ... existing code ...