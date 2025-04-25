import Parser from 'web-tree-sitter';
import * as vscode from 'vscode';

export interface LanguageConfig {
    id: string;
    parser: string; // Path to .wasm file
    highlights: string; // Path to highlights.scm
    injections?: string; // Optional path to injections.scm
}

export interface Token {
    id: string;
    word: string; 
}

export interface DecodedToken {
    id: string;
    word: string;
    line: number;
    startChar: number;
    length: number;
    type: string;
    modifiers: string[];
    definition: any[];
    context: string;
    defSymbol: any;
}
