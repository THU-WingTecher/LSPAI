import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { ContextSelector } from '../../../agents/contextSelector';
import { GenerationType, getConfigInstance, PromptType } from '../../../config';
import { setWorkspaceFolders } from '../../../helper';
import { getSymbolFromDocument } from '../../../lsp/symbol';
import { getContextTermsFromAllTokens } from '../../../tokenAnalyzer';

suite('LSP-Features: Global Constant Context Test', () => {
    const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
    const pythonProjectPath = path.join(fixturesDir, 'python');

    test('Python - Global variable context fallback test', async function() {
        getConfigInstance().updateConfig({
            workspace: pythonProjectPath,
            generationType: GenerationType.CFG_FALLBACK,
            promptType: PromptType.WITHCONTEXT
        });

        const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
        console.log(`Python workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const fileUri = vscode.Uri.file(path.join(pythonProjectPath, 'global_constant.py'));
        const document = await vscode.workspace.openTextDocument(fileUri);
        const symbol = await getSymbolFromDocument(document, 'complex_calculation');
        assert.ok(symbol, 'Should find complex_calculation function');

        const contextSelector = await ContextSelector.create(document, symbol!);
        const tokens = await contextSelector.loadTokens();
        const globalToken = tokens.find(t => t.word === 'c');
        assert.ok(globalToken, 'Should find global variable token c');

        const contextTerms = await getContextTermsFromAllTokens(symbol!, tokens);
        const globalTerm = contextTerms.find(term => term.name === 'c');
        assert.ok(globalTerm, 'Should collect global variable term c');
        assert.ok(globalTerm!.need_definition, 'Should request definition context for c');

        const enrichedTerms = await contextSelector.gatherContext(contextTerms, symbol!);
        const enrichedGlobalTerm = enrichedTerms.find(term => term.name === 'c');
        assert.ok(enrichedGlobalTerm, 'Should enrich context for global variable c');
        assert.ok(enrichedGlobalTerm!.context?.includes('c = 2'), 'Should include global variable definition in context');
    });
});
