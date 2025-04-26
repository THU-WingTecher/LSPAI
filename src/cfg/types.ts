import Parser = require('tree-sitter');
import { SupportedLanguage } from '../ast';

export enum CFGNodeType {
    ENTRY = 'ENTRY',
    EXIT = 'EXIT',
    STATEMENT = 'STATEMENT',
    CONDITION = 'CONDITION',
    LOOP = 'LOOP',
    BLOCK = 'BLOCK',
    MERGED = 'MERGED',
    EXIT_MERGED = 'EXIT_MERGED'
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
}

export interface ControlFlowGraph {
    entry: CFGNode;
    exit: CFGNode;
    nodes: Map<string, CFGNode>;
    language: SupportedLanguage;
} 