import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Analyzer } from '../../../ut_runner/analyzer';

suite('Analyzer - Java log parsing (new executor format)', () => {
  function stageFixturePair(fixtureBaseName: string) {
    // Note: tests run from `out/`, but fixtures live in `src/`, so resolve from repo root.
    const fixturesDir = path.resolve(process.cwd(), 'src/test/fixtures/java/logparse');
    const logTxt = fs.readFileSync(path.join(fixturesDir, `${fixtureBaseName}.java.log.txt`), 'utf-8');
    const srcTxt = fs.readFileSync(path.join(fixturesDir, `${fixtureBaseName}.java.txt`), 'utf-8');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-java-logparse-'));
    const logPath = path.join(tmpDir, `${fixtureBaseName}.java.log`);
    const testFilePath = path.join(tmpDir, `${fixtureBaseName}.java`);
    fs.writeFileSync(logPath, logTxt, 'utf-8');
    fs.writeFileSync(testFilePath, srcTxt, 'utf-8');
    return { logPath, testFilePath };
  }

  function stageLogOnly(fixtureBaseName: string) {
    const fixturesDir = path.resolve(process.cwd(), 'src/test/fixtures/java/logparse');
    const logTxt = fs.readFileSync(path.join(fixturesDir, `${fixtureBaseName}.java.log.txt`), 'utf-8');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-java-logparse-'));
    const logPath = path.join(tmpDir, `${fixtureBaseName}.java.log`);
    const testFilePath = path.join(tmpDir, `${fixtureBaseName}.java`);
    fs.writeFileSync(logPath, logTxt, 'utf-8');
    // Minimal placeholder test file (not needed for this case)
    fs.writeFileSync(testFilePath, `public class ${fixtureBaseName} {}`, 'utf-8');
    return { logPath, testFilePath };
  }

  test('parses successful JUnit console logs into per-test Passed results', () => {
    const analyzer = new Analyzer('java');
    const { logPath, testFilePath } = stageLogOnly('CSVFormat_isQuoteCharacterSet_3476Test');

    const out = (analyzer as any).extractJavaTestResults(logPath, testFilePath);
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(
      out.map((r: any) => r.codeName).sort(),
      ['CSVFormat_isQuoteCharacterSet_3476Test_0', 'CSVFormat_isQuoteCharacterSet_unset_and_immutability'].sort()
    );
    assert.ok(out.every((r: any) => r.status === 'Passed'));
  });

  test('parses failed JUnit console logs into Passed/Failed and keeps failure details', () => {
    const analyzer = new Analyzer('java');
    const { logPath, testFilePath } = stageLogOnly('CSVFormat_setAllowMissingColumnNames_4103Test');

    const out = (analyzer as any).extractJavaTestResults(logPath, testFilePath) as any[];

    assert.strictEqual(out.length, 5);
    assert.strictEqual(out.filter(r => r.status === 'Passed').length, 2);
    assert.strictEqual(out.filter(r => r.status === 'Failed').length, 3);

    const byName = new Map(out.map(r => [r.codeName, r]));
    const fail1 = byName.get('testParser_DisallowsMissingNullHeaderNames_WhenDisallowed');
    assert.ok(fail1);
    assert.strictEqual(fail1.status, 'Failed');
    console.log("fail1", fail1.detail)
    assert.ok(String(fail1.detail).includes('Failures (3):'));
    assert.ok(String(fail1.detail).includes('testParser_DisallowsMissingNullHeaderNames_WhenDisallowed'));
    assert.ok(String(fail1.detail).includes('Unresolved compilation problem'));

    const fail2 = byName.get('testDisallowMissingColumnNames_EmptyHeader_Throws');
    assert.ok(fail2);
    assert.strictEqual(fail2.status, 'Failed');
    assert.ok(String(fail2.detail).includes('java.lang.AssertionError'));
    // Ensure the assertion message text is preserved (not just the exception type)
    assert.ok(String(fail2.detail).includes('Expected exception when missing header names are disallowed'));
  });

  test('handles compilation-failed logs by returning errored testcases with compilation detail', () => {
    const analyzer = new Analyzer('java');
    const { logPath, testFilePath } = stageFixturePair('CSVFormat_getMaxRows_7015Test');

    const out = (analyzer as any).extractJavaTestResults(logPath, testFilePath) as any[];

    assert.ok(out.length >= 1);
    assert.ok(out.every(r => r.status === 'Errored'));
    assert.ok(out.every(r => r.errorType === 'COMPILATION ERROR'));
    assert.ok(out.some(r => String(r.detail).includes('Compilation failed')));
  });

  test('handles JUnit console logs that report 0 tests found by returning errored testcases from source methods', () => {
    const analyzer = new Analyzer('java');
    const { logPath, testFilePath } = stageFixturePair('CSVFormat_builder_3728Test');

    const out = (analyzer as any).extractJavaTestResults(logPath, testFilePath) as any[];

    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(
      out.map(r => r.codeName).sort(),
      ['CSVFormat_builder_3728Test_0', 'testBuilderProducesFormatUsableForParsingHeaderNullHandling'].sort()
    );
    assert.ok(out.every(r => r.status === 'Errored'));
    assert.ok(out.every(r => r.errorType === 'No test cases found'));
    assert.ok(out.every(r => String(r.detail).includes('0 tests found')));
  });

  test('classifies logs with 0 tests found (no per-test lines) as errored - No test cases found', () => {
    const analyzer = new Analyzer('java');
    const { logPath, testFilePath } = stageFixturePair('CSVFormat_getRecordSeparator_9118Test');

    const out = (analyzer as any).extractJavaTestResults(logPath, testFilePath) as any[];

    // This test file has a main() that calls 5 methods; JUnit finds 0 tests.
    assert.strictEqual(out.length, 5);
    assert.ok(out.every(r => r.status === 'Errored'));
    assert.ok(out.every(r => r.errorType === 'No test cases found'));
    assert.ok(out.every(r => String(r.detail).includes('0 tests found')));
  });
});


