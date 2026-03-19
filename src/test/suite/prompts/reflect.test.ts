import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfigInstance } from '../../../config';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../helper';
import { activate, setupPythonLSP } from '../../../lsp/helper';
import { getSymbolFromDocument } from '../../../lsp/symbol';
import { constructSourceCodeWithRelatedInfo } from '../../../lsp/utils';
import { buildAssertionReflectionPrompt } from '../../../strategy/generators/lsprag_reflect';
import { detectRedefinedAssertions, prettyPrintDefTree } from '../../../ut_runner/analysis/assertion_detector';
import { LLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';

suite('PROMPTS - reflect', () => {
	test('reflection prompt contains draft test + def tree + redefined symbols + invoked signatures', async () => {
		const projectPath = '/LSPRAG/src/test/fixtures/python';
		const interpreterPath = '/root/miniconda3/envs/black/bin/python';
		const sourceFile = path.join(projectPath, 'calculator.py');

		if (!fs.existsSync(sourceFile) || !fs.existsSync(interpreterPath)) {
			console.log('Skipping test: required fixture or python interpreter not found.');
			return;
		}

		getConfigInstance().updateConfig({ workspace: projectPath });
        const workspaceFolders = setWorkspaceFolders(projectPath);
        try {
            await updateWorkspaceFolders(workspaceFolders);
            console.log('Workspace folders updated to:', vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath));
        } catch (error) {
            console.error('Error updating workspace folders:', error);
        }
        assert.ok(vscode.workspace.workspaceFolders, 'Workspace folders should be set');
        assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, projectPath, 'Workspace folder should match project path');
		await setupPythonLSP([projectPath], interpreterPath);
		if (process.env.NODE_DEBUG !== 'true') {
			await activate();
		}

		const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(sourceFile));
		const symbol = await getSymbolFromDocument(doc, 'math_random');
		assert.ok(symbol, 'Should find symbol "math_random" in calculator.py');

		const focalMethodSource = await constructSourceCodeWithRelatedInfo(doc, symbol!);

		const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-reflect-prompt-'));
		const testFile = path.join(projectPath, 'redefined_test_file.py');
		assert.ok(fs.existsSync(testFile), 'Fixture test file redefined_test_file.py should exist');

		const draft = fs.readFileSync(testFile, 'utf8');

		const detection = await detectRedefinedAssertions(testFile, sourceFile, symbol!.name);
        console.log("detection", detection)
		const definitionTreePretty = prettyPrintDefTree(detection.definitionTree);
        console.log("definitionTreePretty", definitionTreePretty)
		const redefinedSymbolsSummary = detection.redefinedSymbols.map(s => s.name).join(', ');

		const workflow = new LLMFixWorkflow(path.join(tmpRoot, 'noop.json'), path.join(tmpRoot, 'wf'), { language: 'python' as any });
		const invoked = await workflow.getInvokedFunctionContext({ source_file: sourceFile, symbol_name: symbol!.name });

		const prompt = buildAssertionReflectionPrompt({
			languageId: 'python',
			sourceFile,
			focalSymbolName: symbol!.name,
			focalMethodSource,
			draftTestCode: draft,
			definitionTreePretty,
			redefinedSymbolsSummary,
			invokedFunctionContext: invoked
		});

		assert.strictEqual(prompt.length, 2);
		assert.strictEqual(prompt[0].role, 'system');
		assert.strictEqual(prompt[1].role, 'user');

		const user = prompt[1].content;
        console.log(user)
		assert.ok(user.includes('### Focal method source (ground truth)'));
		assert.ok(user.includes(focalMethodSource));
		assert.ok(user.includes('### Draft test code'));
		assert.ok(user.includes(draft));
		assert.ok(user.includes('### Definition tree'));
		assert.ok(user.includes(definitionTreePretty));
		assert.ok(user.includes('### Symbols that appear redefined'));
		assert.ok(user.includes('add'), 'Expected redefined symbol summary to include add');
		assert.ok(user.includes('### Invoked function signatures'));
		if (invoked.length > 0) {
			assert.ok(user.includes(invoked[0]));
		}
	});
});


