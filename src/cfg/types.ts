import Parser = require('tree-sitter');
import { SupportedLanguage } from '../ast';

export interface LoopContext {
    node: CFGNode;
    breakNodes: CFGNode[];
    continueNodes: CFGNode[];
    exitMergedNode: CFGNode;
}

export enum CFGNodeType {
    ENTRY = 'ENTRY',
    EXIT = 'EXIT',
    STATEMENT = 'STATEMENT',
    CONDITION = 'CONDITION',
    LOOP = 'LOOP',
    BLOCK = 'BLOCK',
    MERGED = 'MERGED',
    EXIT_MERGED = 'EXIT_MERGED',
    BREAK = 'BREAK',
    CONTINUE = 'CONTINUE',
    FINALLY = 'FINALLY',
    TRY = 'TRY',
    CATCH = 'CATCH',
    ELSE = 'ELSE',
    // THROW = 'THROW',
    // RETURN = 'RETURN',
    // YIELD = 'YIELD',
    // RAISE = 'RAISE',
}

export interface CustomSyntaxNode extends Parser.SyntaxNode {
    conditionNode: Parser.SyntaxNode;
}

export interface CFGNode {
    id: string;
    text: string;
    type: CFGNodeType;
    astNode: Parser.SyntaxNode;
    successors: CFGNode[];
    predecessors: CFGNode[];
    // For conditions and loops
    trueBlock?: CFGNode;
    falseBlock?: CFGNode;
    isLoopBackEdge?: boolean;  // Mark edges that go back to loop start
    isLoopBreak?: boolean;     // Mark break statements
    isLoopContinue?: boolean;  // Mark continue statements
}

export interface ControlFlowGraph {
    entry: CFGNode;
    exit: CFGNode;
    nodes: Map<string, CFGNode>;
    language: SupportedLanguage;
} 