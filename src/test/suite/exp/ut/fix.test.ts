import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { FixType, GenerationType, getConfigInstance } from '../../../../config';
import { ExpLogger } from '../../../../log';
import { LSPRAGTestGenerator } from '../../../../strategy/generators/lsprag';
import { LSPRAGReflectTestGenerator } from '../../../../strategy/generators/lsprag_reflect';

type ModulePatches = {
  makeExecutor: any;
  invokeLLM: any;
  saveToIntermediate: any;
  superFixTest: any;
};

suite('EXP - UT - fix (execution-trace reflection)', () => {
  const executorModule = require('../../../../ut_runner/executor') as any;
  const invokeLLMModule = require('../../../../invokeLLM') as any;
  const fileHandlerModule = require('../../../../fileHandler') as any;

  let tmpDir: string;
  let originals: ModulePatches;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-exp-ut-fix-'));
    originals = {
      makeExecutor: executorModule.makeExecutor,
      invokeLLM: invokeLLMModule.invokeLLM,
      saveToIntermediate: fileHandlerModule.saveToIntermediate,
      superFixTest: (LSPRAGTestGenerator.prototype as any).fixTest
    };
  });

  teardown(() => {
    executorModule.makeExecutor = originals.makeExecutor;
    invokeLLMModule.invokeLLM = originals.invokeLLM;
    fileHandlerModule.saveToIntermediate = originals.saveToIntermediate;
    (LSPRAGTestGenerator.prototype as any).fixTest = originals.superFixTest;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeGenerator(languageId: string = 'python'): LSPRAGReflectTestGenerator {
    const symbolRange = new vscode.Range(0, 0, 0, 10);
    const selectionRange = new vscode.Range(0, 4, 0, 7);
    const sourceText = 'def foo(x):\n    return x + 1\n';

    const document = {
      uri: vscode.Uri.file(path.join(tmpDir, 'focal.py')),
      getText: (_range?: vscode.Range) => sourceText
    } as unknown as vscode.TextDocument;

    const functionSymbol = {
      name: 'foo',
      detail: '',
      kind: vscode.SymbolKind.Function,
      range: symbolRange,
      selectionRange,
      children: []
    } as unknown as vscode.DocumentSymbol;

    const logger = new ExpLogger([], 'gpt-4o-mini', 'foo_test.py', 'foo_test.py', 'foo');
    const progress = { report: () => { /* no-op */ } } as vscode.Progress<{ message?: string; increment?: number; }>;
    const token = { isCancellationRequested: false } as vscode.CancellationToken;

    getConfigInstance().updateConfig({
      workspace: tmpDir,
      generationType: GenerationType.EXPERIMENTAL,
      fixType: FixType.ORIGINAL,
      maxRound: 2,
      model: 'gpt-4o-mini',
      savePath: 'results'
    });

    const generator = new LSPRAGReflectTestGenerator(
      document,
      functionSymbol,
      languageId,
      'foo_test.py',
      logger,
      progress,
      token,
      tmpDir
    );
    (generator as any).reportProgress = async () => true;
    return generator;
  }

  test('fixTest executes test file, sends execution trace to LLM, and returns fixed code', async () => {
    const failLog = path.join(tmpDir, 'round0.log');
    const passLog = path.join(tmpDir, 'round1.log');
    fs.writeFileSync(
      failLog,
      [
        '=== TEST EXECUTION LOG ===',
        'FAILED tests/test_foo.py::test_foo - AssertionError: expected 3 but got 2',
        'Traceback (most recent call last):',
        '  AssertionError: expected 3 but got 2'
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(passLog, '=== TEST EXECUTION LOG ===\nPASSED tests/test_foo.py::test_foo\n', 'utf8');

    const savedPaths = [
      path.join(tmpDir, 'history', 'round0.py'),
      path.join(tmpDir, 'history', 'round1.py')
    ];
    let saveCall = 0;
    fileHandlerModule.saveToIntermediate = async () => savedPaths[saveCall++] || savedPaths[savedPaths.length - 1];

    let runCount = 0;
    const executedFiles: string[] = [];
    executorModule.makeExecutor = () => ({
      executeMany: async (testFiles: Array<{ path: string; language: string }>) => {
        executedFiles.push(testFiles[0].path);
        if (runCount++ === 0) {
          return [{
            testFile: testFiles[0],
            exitCode: 1,
            logPath: failLog,
            junitPath: null,
            startedAt: '2026-01-01 00:00:00',
            endedAt: '2026-01-01 00:00:01',
            timeout: false
          }];
        }
        return [{
          testFile: testFiles[0],
          exitCode: 0,
          logPath: passLog,
          junitPath: null,
          startedAt: '2026-01-01 00:00:02',
          endedAt: '2026-01-01 00:00:03',
          timeout: false
        }];
      }
    });

    const llmPrompts: string[] = [];
    invokeLLMModule.invokeLLM = async (prompt: Array<{ role: string; content: string }>) => {
      llmPrompts.push(prompt[1]?.content || '');
      return [
        '```python',
        'def test_foo():',
        '    assert 2 + 1 == 3',
        '```'
      ].join('\n');
    };

    const generator = makeGenerator('python');
    const result = await generator.fixTest('def test_foo():\n    assert 2 + 1 == 4\n');

    assert.strictEqual(runCount, 2, 'expected one failing run and one passing run');
    assert.strictEqual(executedFiles.length, 2, 'executor should run twice');
    assert.ok(executedFiles[0].includes('round0.py'), 'round 0 should execute the first saved file');
    assert.ok(executedFiles[1].includes('round1.py'), 'round 1 should execute the fixed file');

    assert.strictEqual(llmPrompts.length, 1, 'LLM should be invoked once after first failing execution');
    assert.ok(llmPrompts[0].includes('### Latest execution trace'), 'prompt should include execution trace section');
    assert.ok(llmPrompts[0].includes('AssertionError: expected 3 but got 2'), 'prompt should include failing trace details');
    assert.ok(llmPrompts[0].includes('### Latest execution summary'), 'prompt should include execution summary section');

    assert.strictEqual(result.finalCode, 'def test_foo():\n    assert 2 + 1 == 3');
    assert.ok(result.diagnosticReport, 'diagnostic report should be returned');
    assert.strictEqual(result.diagnosticReport!.fixSuccess, true);
    assert.strictEqual(result.diagnosticReport!.initialDiagnostics, 1);
    assert.strictEqual(result.diagnosticReport!.finalDiagnostics, 0);
  });

  test('fixTest falls back to base fix flow when executor bootstrap fails', async () => {
    fileHandlerModule.saveToIntermediate = async () => path.join(tmpDir, 'history', 'round0.py');
    executorModule.makeExecutor = () => {
      throw new Error('executor unavailable');
    };

    let superFixCalled = 0;
    (LSPRAGTestGenerator.prototype as any).fixTest = async () => {
      superFixCalled += 1;
      return {
        finalCode: 'fallback-code',
        diagnosticReport: null
      };
    };

    const generator = makeGenerator('python');
    const result = await generator.fixTest('def test_foo():\n    assert False\n');

    assert.strictEqual(superFixCalled, 1, 'should fallback to base fix flow once');
    assert.strictEqual(result.finalCode, 'fallback-code');
    assert.strictEqual(result.diagnosticReport, null);
  });
});
