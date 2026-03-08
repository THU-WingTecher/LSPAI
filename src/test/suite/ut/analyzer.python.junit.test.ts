import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Analyzer } from '../../../ut_runner/analyzer';

suite('Analyzer - Python JUnit parsing', () => {
  test('uses JUnit XML as primary source when available', () => {
    const analyzer = new Analyzer('python');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-py-junit-'));
    const testFilePath = path.join(tmpDir, 'sample_test.py');
    const logPath = path.join(tmpDir, 'sample_test.py.log');
    const junitPath = path.join(tmpDir, 'sample_test.py.xml');

    fs.writeFileSync(testFilePath, 'def test_dummy():\n    assert True\n', 'utf-8');

    const logContent = [
      '=== TEST EXECUTION LOG ===',
      `=== Command: python -m pytest -vv ${testFilePath} --junitxml=${junitPath} ===`,
      '=== Test Execution Output ===',
      '',
      'pytest output omitted',
      '',
    ].join('\n');
    fs.writeFileSync(logPath, logContent, 'utf-8');

    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<testsuites name="pytest tests">',
      '  <testsuite name="pytest" tests="5" failures="1" errors="2" skipped="1">',
      '    <testcase classname="pkg.TestCls" name="test_ok" time="0.1" />',
      '    <testcase classname="pkg.TestCls" name="test_assert" time="0.1">',
      '      <failure message="AssertionError: expected 1 == 2">Traceback...</failure>',
      '    </testcase>',
      '    <testcase classname="pkg.TestCls" name="test_type" time="0.1">',
      '      <error message="TypeError: bad arg">Traceback...</error>',
      '    </testcase>',
      '    <testcase classname="pkg.TestCls" name="test_skip" time="0.1">',
      '      <skipped message="skip reason" />',
      '    </testcase>',
      '    <testcase classname="pkg.TestCls" name="test_attr" time="0.1">',
      '      <error message="failed on teardown with &quot;AttributeError: oops&quot;">Traceback...</error>',
      '    </testcase>',
      '  </testsuite>',
      '</testsuites>',
      '',
    ].join('\n');
    fs.writeFileSync(junitPath, xml, 'utf-8');

    const out = (analyzer as any).extractResultsFromLog(logPath, testFilePath) as any[];
    assert.strictEqual(out.length, 5);

    const statuses = out.map((r) => r.status);
    assert.strictEqual(statuses.filter((s) => s === 'Passed').length, 1);
    assert.strictEqual(statuses.filter((s) => s === 'Assertion Errors').length, 1);
    assert.strictEqual(statuses.filter((s) => s === 'Type Errors').length, 1);
    assert.strictEqual(statuses.filter((s) => s === 'Attribute Errors').length, 1);
    assert.strictEqual(statuses.filter((s) => s === 'Skipped').length, 1);

    const byName = new Map(out.map((r) => [r.codeName, r]));
    assert.ok(byName.has('sample_test.py::TestCls::test_ok'));
    assert.ok(byName.has('sample_test.py::TestCls::test_assert'));
    assert.ok(byName.has('sample_test.py::TestCls::test_type'));
  });

  test('falls back to legacy log parsing when junit xml is missing', () => {
    const analyzer = new Analyzer('python');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-py-log-'));
    const testFilePath = path.join(tmpDir, 'sample_test.py');
    const logPath = path.join(tmpDir, 'sample_test.py.log');

    fs.writeFileSync(testFilePath, 'def test_dummy():\n    assert True\n', 'utf-8');

    const logContent = [
      '============================= test session starts ==============================',
      'sample_test.py::TestSuite::test_ok PASSED [ 33%]',
      '=================================== FAILURES ===================================',
      '=========================== short test summary info ============================',
      'FAILED sample_test.py::TestSuite::test_fail - AssertionError: boom',
      'ERROR sample_test.py - ImportError: missing module',
      '======================== 1 failed, 1 passed, 1 error in 0.10s =================',
      '',
    ].join('\n');
    fs.writeFileSync(logPath, logContent, 'utf-8');

    const out = (analyzer as any).extractResultsFromLog(logPath, testFilePath, path.join(tmpDir, 'missing.xml')) as any[];
    assert.strictEqual(out.length, 3);

    const statuses = out.map((r) => r.status);
    assert.strictEqual(statuses.filter((s) => s === 'Passed').length, 1);
    assert.strictEqual(statuses.filter((s) => s === 'Assertion Errors').length, 1);
    assert.strictEqual(statuses.filter((s) => s === 'Import Errors').length, 1);
  });

  test('parses testsuite-level junit counts for subtest-heavy outputs', () => {
    const analyzer = new Analyzer('python');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-py-suite-'));
    const junitPath = path.join(tmpDir, 'subtests.xml');

    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<testsuites name="pytest tests">',
      '  <testsuite name="pytest" tests="37" failures="2" errors="0" skipped="0">',
      '    <testcase classname="pkg.TestCls" name="test_a" />',
      '    <testcase classname="pkg.TestCls" name="test_b" />',
      '  </testsuite>',
      '</testsuites>',
      '',
    ].join('\n');
    fs.writeFileSync(junitPath, xml, 'utf-8');

    const counts = (analyzer as any).extractPythonJunitSuiteCounts(junitPath);
    assert.ok(counts);
    assert.strictEqual(counts.total, 37);
    assert.strictEqual(counts.failed, 2);
    assert.strictEqual(counts.errored, 0);
    assert.strictEqual(counts.passed, 35);
  });
});
