import * as vscode from 'vscode';


// import { TreeSitterBridge } from './tree-sitter-bridge';
// import { languageConfigs } from './language-configs';
export interface DecodedToken {
    id: string;
    word: string;
    line: number;
    startChar: number;
    length: number;
    type: string;
    modifiers: string[];
    definition: vscode.Location[];
    context: string;
    defSymbol: vscode.DocumentSymbol | null;
    defSymbolRange: vscode.Range | null; // since constants do not have a range
    document: vscode.TextDocument;
}

export interface Cached {
    symbols: vscode.DocumentSymbol[];
    doc: vscode.TextDocument;
}

export interface LSPCache {
    documentSymbols: Map<string, vscode.DocumentSymbol[]>;
    workspaceSymbols: Map<string, vscode.SymbolInformation[]>;
    definitions: Map<string, Map<string, vscode.Location[]>>; // uri -> position -> definitions
    references: Map<string, Map<string, vscode.Location[]>>; // uri -> position -> references
    hover: Map<string, Map<string, vscode.Hover[]>>; // uri -> position -> hover
    semanticTokens: Map<string, vscode.SemanticTokens>;
    semanticTokensLegend: Map<string, vscode.SemanticTokensLegend>;
    semanticTokensRange: Map<string, Map<string, vscode.SemanticTokens>>; // uri -> range -> tokens
    semanticTokensLegendRange: Map<string, Map<string, vscode.SemanticTokensLegend>>; // uri -> range -> legend
    codeActions: Map<string, Map<string, vscode.CodeAction[]>>; // uri -> range -> code actions
    typeDefinition: Map<string, Map<string, vscode.Definition | vscode.Location | null>>; // uri -> position -> type definition
}