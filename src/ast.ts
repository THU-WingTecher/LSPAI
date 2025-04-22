// In this code, we load a tree-sitter parser based on given language, 
// After loading the parser, we parse the given source code and print the AST

// import Parser = require('tree-sitter');
// const JavaScript = require('tree-sitter-javascript');

// const parser: Parser = new Parser();
// parser.setLanguage(JavaScript);

// const sourceCode: string = 'let x = 1; console.log(x);';
// const tree: Parser.Tree = parser.parse(sourceCode);

// console.log(tree.rootNode.toString());

import Parser = require('tree-sitter');

// type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'rust';
type SupportedLanguage = 'python' | 'go' | 'java' | 'cpp';

class ASTParser {
    private static instance: ASTParser;
    private parser: Parser;
    private currentLanguage: SupportedLanguage | null;
    private languageModules: Map<SupportedLanguage, any>;

    private constructor() {
        this.parser = new Parser();
        this.currentLanguage = null;
        this.languageModules = new Map();
    }

    public static getInstance(): ASTParser {
        if (!ASTParser.instance) {
            ASTParser.instance = new ASTParser();
        }
        return ASTParser.instance;
    }

    private async loadLanguageModule(language: SupportedLanguage): Promise<any> {
        if (this.languageModules.has(language)) {
            return this.languageModules.get(language);
        }

        try {
            const module = await import(`tree-sitter-${language}`);
            this.languageModules.set(language, module);
            return module;
        } catch (error) {
            throw new Error(`Failed to load language module for ${language}: ${error}`);
        }
    }

    public async setLanguage(language: SupportedLanguage): Promise<void> {
        if (this.currentLanguage === language) {
            return;
        }

        const languageModule = await this.loadLanguageModule(language);
        this.parser.setLanguage(languageModule);
        this.currentLanguage = language;
    }

    public parse(sourceCode: string): Parser.Tree {
        if (!this.currentLanguage) {
            throw new Error('Language not set. Call setLanguage() first.');
        }

        return this.parser.parse(sourceCode);
    }

    public getCurrentLanguage(): SupportedLanguage | null {
        return this.currentLanguage;
    }

    public clearLanguageCache(): void {
        this.languageModules.clear();
        this.currentLanguage = null;
    }
}

// Example usage:
async function parseCode(language: SupportedLanguage, code: string): Promise<Parser.Tree> {
    const parser = ASTParser.getInstance();
    await parser.setLanguage(language);
    return parser.parse(code);
}

export { ASTParser, SupportedLanguage, parseCode };