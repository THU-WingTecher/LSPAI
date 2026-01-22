import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';

function mkTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

suite('LLMFixWorkflow - addTestFunction (java)', () => {
  test('inserts only class members when fixedCode is a full Java file (no nested package/import/class)', async () => {
    const tmpRoot = mkTmpDir('lsprag-addTestFunction-java-');
    const outputDir = path.join(tmpRoot, 'fix-output');
    const inputJsonPath = path.join(tmpRoot, 'examination_results.json');
    writeFile(inputJsonPath, '{}\n');

    const testFile = path.join(tmpRoot, 'repo', 'src', 'test', 'java', 'org', 'example', 'FooTest.java');
    const original = [
      'package org.example;',
      '',
      'import org.junit.jupiter.api.Test;',
      '',
      'public class FooTest {',
      '    @Test',
      '    public void existing() {',
      '    }',
      '}',
      '',
    ].join('\n');
    writeFile(testFile, original);

    const fixedCodeFullFile = [
      'package org.example;',
      '',
      'import org.junit.jupiter.api.Test;',
      '',
      'public class FooTest {',
      '    @Test',
      '    public void inserted() {',
      '    }',
      '}',
      '',
    ].join('\n');

    const wf = new LLMFixWorkflow(inputJsonPath, outputDir, { language: 'java' });
    const outPath = await wf.addTestFunction(testFile, fixedCodeFullFile);
    const out = fs.readFileSync(outPath, 'utf-8');
    console.log(out);
    // File header stays single-instance
    assert.ok(out.startsWith('package org.example;'), 'output should start with the original package declaration');
    assert.strictEqual((out.match(/^\s*package\s+/gm) || []).length, 1, 'output should contain exactly one package declaration');
    assert.strictEqual((out.match(/^\s*import\s+/gm) || []).length, 1, 'output should contain exactly one import line');

    // The inserted method must exist, but we must not have nested file-level directives inside the class body.
    assert.ok(out.includes('public void inserted()'), 'inserted method should be present');
    assert.ok(!out.includes('\n    package '), 'must not insert a package line inside the class');
    assert.ok(!out.includes('\n    import '), 'must not insert an import line inside the class');
    assert.ok(!out.includes('\n    public class '), 'must not insert a nested class declaration via full-file paste');

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('inserts method snippet as-is when fixedCode is only class members', async () => {
    const tmpRoot = mkTmpDir('lsprag-addTestFunction-java-snippet-');
    const outputDir = path.join(tmpRoot, 'fix-output');
    const inputJsonPath = path.join(tmpRoot, 'examination_results.json');
    writeFile(inputJsonPath, '{}\n');

    const testFile = path.join(tmpRoot, 'repo', 'src', 'test', 'java', 'org', 'example', 'BarTest.java');
    const original = [
      'package org.example;',
      '',
      'import org.junit.jupiter.api.Test;',
      '',
      'public class BarTest {',
      '}',
      '',
    ].join('\n');
    writeFile(testFile, original);

    const fixedCodeSnippet = [
      '@Test',
      'public void added() {',
      '}',
    ].join('\n');

    const wf = new LLMFixWorkflow(inputJsonPath, outputDir, { language: 'java' });
    const outPath = await wf.addTestFunction(testFile, fixedCodeSnippet);
    const out = fs.readFileSync(outPath, 'utf-8');

    assert.ok(out.includes('public void added()'), 'added method should be present');
    assert.strictEqual((out.match(/^\s*package\s+/gm) || []).length, 1, 'package should remain single-instance');

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});


