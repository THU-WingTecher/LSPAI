// ... existing code ...

import { ContextTerm } from "./agents/contextSelector";
import { DecodedToken } from "./token";
import * as vscode from 'vscode';
// 1. Define the type for the algorithm
type HelpfulnessAlgorithm = 'default' | 'alternative1' | 'cfg';

let helpfulnessAlgorithm: HelpfulnessAlgorithm = 'default';
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

export function isMethodOrFunctionReturnBoolean(token: DecodedToken): boolean {
    return isFunctionArg(token) && isReturnTypeBoolean(token.defSymbol!);
}

export function isFunctionArg(token: DecodedToken): boolean {
    // You can add more complex logic here later
    return token.type === "method" || token.type === "function";
}

export function isMutated(token: DecodedToken): boolean {
    return token.type === "assignment";
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

function returnTypeNotVoid(token: DecodedToken): boolean {
    return isFunctionArg(token) && !isReturnTypeVoid(token.defSymbol!);
}

export function isReturnTypeVoid(symbol: vscode.DocumentSymbol): boolean {
    return symbol.detail.includes("void");
}
// --- Alternative Algorithm Example ---
function cfgBasedIsDefinitionHelpful(token: DecodedToken, paths: Set<string>): boolean {
    // Example: Only functions are helpful
    return (getTokenInPaths(token, paths) && returnTypeNotVoid(token)) || isUsedAsFunctionArgument(token);
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
function cfgGetContextTermsFromTokens(tokens: DecodedToken[], paths: any): ContextTerm[] {
    return tokens.map(token => ({
        name: token.word,
        need_definition: cfgBasedIsDefinitionHelpful(token, paths),
        need_example: cfgBasedIsReferenceHelpful(token, paths),
        context: "",
        example: "",
        token: token,
    }));
}

// 4. Main exported functions delegate to the selected algorithm
export function getContextTermsFromTokens(tokens: DecodedToken[], paths: Set<string> = new Set()): ContextTerm[] {
    switch (helpfulnessAlgorithm) {
        case 'cfg':
            return cfgGetContextTermsFromTokens(tokens, paths).filter(term => term.need_definition !== false && term.need_example !== false);
        case 'default':
        default:
            return defaultGetContextTermsFromTokens(tokens).filter(term => term.need_definition !== false && term.need_example !== false);
    }
}

export function isDefinitionHelpfulForUnitTest(token: DecodedToken, paths: Set<string>): boolean {
    switch (helpfulnessAlgorithm) {
        case 'cfg':
            return cfgBasedIsDefinitionHelpful(token, paths);
        case 'default':
        default:
            return defaultIsDefinitionHelpful(token);
    }
}
export function isReferenceHelpfulForUnitTest(token: DecodedToken, paths: Set<string>): boolean {
    switch (helpfulnessAlgorithm) {
        case 'cfg':
            return cfgBasedIsReferenceHelpful(token, paths);
        case 'default':
        default:
            return defaultIsReferenceHelpful(token);
    }
}

// ... existing code ...