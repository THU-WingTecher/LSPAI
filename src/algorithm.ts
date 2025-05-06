// ... existing code ...

import { ContextTerm } from "./agents/contextSelector";
import { DecodedToken } from "./token";

// 1. Define the type for the algorithm
type HelpfulnessAlgorithm = 'default' | 'alternative1';

let helpfulnessAlgorithm: HelpfulnessAlgorithm = 'default';
export function setHelpfulnessAlgorithm(algo: HelpfulnessAlgorithm) {
    helpfulnessAlgorithm = algo;
}

const SKIP_TYPES = ["builtinConstant", "comment", "string", "number", "boolean", "null", "undefined", "object", "array"];
export function needSkip(token: DecodedToken): boolean {
    return SKIP_TYPES.includes(token.type);
}

export function isFunctionArg(token: DecodedToken): boolean {
    // You can add more complex logic here later
    return token.type === "method" || token.type === "function";
}

export function isMutated(token: DecodedToken): boolean {
    return token.type === "assignment";
}

export function isReturnValue(token: DecodedToken): boolean {
    return token.type === "return";
}

export function isUsedInConditional(token: DecodedToken): boolean {
    return token.type === "conditional";
}

export function isUsedAsReturnValue(token: DecodedToken): boolean {
    return token.type === "return";
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
    if (isUsedInConditional(token) || isFunctionArg(token) || isMutated(token) || isReturnValue(token)) {
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

// --- Alternative Algorithm Example ---
function alternativeIsDefinitionHelpful(token: DecodedToken): boolean {
    // Example: Only functions are helpful
    return token?.type === 'function';
}

function alternativeIsReferenceHelpful(token: DecodedToken): boolean {
    // Example: Only if used as return value
    return isUsedAsReturnValue(token);
}

function alternativeGetContextTermsFromTokens(tokens: DecodedToken[]): ContextTerm[] {
    return tokens.map(token => ({
        name: token.word,
        need_definition: alternativeIsDefinitionHelpful(token),
        need_example: alternativeIsReferenceHelpful(token),
        context: "",
        example: "",
        token: token,
    }));
}

// 4. Main exported functions delegate to the selected algorithm
export function getContextTermsFromTokens(tokens: DecodedToken[]): ContextTerm[] {
    switch (helpfulnessAlgorithm) {
        case 'alternative1':
            return alternativeGetContextTermsFromTokens(tokens).filter(term => term.need_definition !== false && term.need_example !== false);
        case 'default':
        default:
            return defaultGetContextTermsFromTokens(tokens).filter(term => term.need_definition !== false && term.need_example !== false);
    }
}

export function isDefinitionHelpfulForUnitTest(token: DecodedToken): boolean {
    switch (helpfulnessAlgorithm) {
        case 'alternative1':
            return alternativeIsDefinitionHelpful(token);
        case 'default':
        default:
            return defaultIsDefinitionHelpful(token);
    }
}
export function isReferenceHelpfulForUnitTest(token: DecodedToken): boolean {
    switch (helpfulnessAlgorithm) {
        case 'alternative1':
            return alternativeIsReferenceHelpful(token);
        case 'default':
        default:
            return defaultIsReferenceHelpful(token);
    }
}

// ... existing code ...