import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getContextSelectorInstance, ContextTerm } from '../../../agents/contextSelector';
import { getConfigInstance, Provider, GenerationType, PromptType } from '../../../config';
import { getDocUri, activate, setPythonExtraPaths } from '../../../lsp/helper';
import { getAllSymbols } from '../../../lsp/symbol';
import { selectOneSymbolFileFromWorkspace, setWorkspaceFolders } from '../../../helper';
import { getSourcCodes } from '../../../lsp/definition';
import { getContextTermsFromTokens } from '../../../tokenAnalyzer';
import { PathCollector } from '../../../cfg/path';
import { createCFGBuilder } from '../../../cfg/builderFactory';
import { SupportedLanguage } from '../../../ast';
import { getReferenceInfo } from '../../../lsp/reference';
import { DecodedToken } from '../../../lsp/types';

suite('Token collecting test - python', () => {
    // Test file path - adjust this to point to a real file in your test fixture
    
    // Update config with source path
    const projectPath = "/LSPRAG/experiments/projects/black";
    const currentConfig = {
        model: 'gpt-4o-mini',
        provider: 'openai' as Provider,
        expProb: 0.2,
        generationType: GenerationType.AGENT,
        promptType: PromptType.DETAILED,
        workspace: projectPath,
        parallelCount: 1,
        maxRound: 3,
        savePath: path.join(__dirname, '../../../logs'),
    };
    getConfigInstance().updateConfig({
        ...currentConfig
    });
    // getConfigInstance().updateConfig({
    //     model: 'deepseek-reasoner',
    //     provider: 'deepseek',
    //     ...privateConfig
    // });
    getConfigInstance().logAllConfig();    
    let languageId = "python";
    let symbolDocumentMap : {document: vscode.TextDocument, symbol: vscode.DocumentSymbol} | null = null;
    let contextSelector;
    test('Context Gathering for Terms - PYTHON ( focal method reference )', async () => {
        // Create some test terms
    //    def is_split_before_delimiter(leaf: Leaf, previous: Optional[Leaf] = None) -> Priority:
    // """Return the priority of the `leaf` delimiter, given a line break before it.

    // The delimiter priorities returned here are from those delimiters that would
    // cause a line break before themselves.

    // Higher numbers are higher priority.
    // """
    // if is_vararg(leaf, within=VARARGS_PARENTS | UNPACKING_PARENTS):
    //     # * and ** might also be MATH_OPERATORS but in this case they are not.
    //     # Don't treat them as a delimiter.
    //     return 0

    // if (
    //     leaf.type == token.DOT
    //     and leaf.parent
    //     and leaf.parent.type not in {syms.import_from, syms.dotted_name}
    //     and (previous is None or previous.type in CLOSING_BRACKETS)
    // ):
    //     return DOT_PRIORITY
    // # ... existing code ...
    // if (
    //     leaf.type in MATH_OPERATORS
    //     and leaf.parent
    //     and leaf.parent.type not in {syms.factor, syms.star_expr}
    // ):
    //     return MATH_PRIORITIES[leaf.type]

    // if leaf.type in COMPARATORS:
    //     return COMPARATOR_PRIORITY

    // if (
    //     leaf.type == token.STRING
    //     and previous is not None
    //     and previous.type == token.STRING
    // ):
    //     return STRING_PRIORITY

    // if leaf.type not in {token.NAME, token.ASYNC}:
    //     return 0

    // if (
    //     leaf.value == "for"
    //     and leaf.parent
    //     and leaf.parent.type in {syms.comp_for, syms.old_comp_for}
    //     or leaf.type == token.ASYNC
    // ):
    //     if (
    //         not isinstance(leaf.prev_sibling, Leaf)
    //         or leaf.prev_sibling.value != "async"
    //     ):
    //         return COMPREHENSION_PRIORITY

    // if (
    //     leaf.value == "if"
    //     and leaf.parent
    //     and leaf.parent.type in {syms.comp_if, syms.old_comp_if}
    // ):
    //     return COMPREHENSION_PRIORITY

    // if leaf.value in {"if", "else"} and leaf.parent and leaf.parent.type == syms.test:
    //     return TERNARY_PRIORITY

    // if leaf.value == "is":
    //     return COMPARATOR_PRIORITY

    // if (
    //     leaf.value == "in"
    //     and leaf.parent
    //     and leaf.parent.type in {syms.comp_op, syms.comparison}
    //     and not (
    //         previous is not None
    //         and previous.type == token.NAME
    //         and previous.value == "not"
    //     )
    // ):
    //     return COMPARATOR_PRIORITY

    // if (
    //     leaf.value == "not"
    //     and leaf.parent
    //     and leaf.parent.type == syms.comp_op
    //     and not (
    //         previous is not None
    //         and previous.type == token.NAME
    //         and previous.value == "is"
    //     )
    // ):
    //     return COMPARATOR_PRIORITY

    // if leaf.value in LOGIC_OPERATORS and leaf.parent:
    //     return LOGIC_PRIORITY

    // return 0

        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        const blackModuleImportPath = [path.join(projectPath, "src/black"), path.join(projectPath, "src/blackd"), path.join(projectPath, "src/blib2to3"), path.join(projectPath, "src")];
        await setPythonExtraPaths(blackModuleImportPath);
        const fileName = "brackets.py";
        const pyProjectPath = "/LSPRAG/experiments/projects/black";
        const workspaceFolders = setWorkspaceFolders(pyProjectPath);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
        const symbolName = "is_split_before_delimiter";
        symbolDocumentMap = await selectOneSymbolFileFromWorkspace(fileName, symbolName, languageId);
        contextSelector = await getContextSelectorInstance(
          symbolDocumentMap.document, 
          symbolDocumentMap.symbol);
        const tokens = contextSelector!.getTokens();
        console.log("tokens", tokens.map((t : DecodedToken) => t.word));
        const expectedTokens = [   
            "is_vararg",
            "VARARGS_PARENTS",
            "CLOSING_BRACKETS",
            "MATH_PRIORITIES",
        ];
        assert.ok(tokens.some((t : DecodedToken) => expectedTokens.includes(t.word)), 'Should include is_vararg');
        // console.log("enrichedTerms", JSON.stringify(enrichedTerms, null, 2));
    });

});