// src/ut_runner/analyzer.ts
import * as fs from 'fs';
import { AnalysisReport, ExecutionResult, FileAnalysis, TestCaseResult, makeEmptyFileAnalysis } from './types';

function readFileSafe(p: string): string {
  try {
    return fs.readFileSync(p, { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

export class Analyzer {
  private language: string;

  constructor(language: string = 'python') {
    this.language = language;
  }

  private extractPassedFromSession(logContent: string): Set<string> {
    const passed = new Set<string>();
    const lines = logContent.split('\n');
    const re = /(\S+\.py)::([\w_]+)::(test_[\w_]+)\s+PASSED\s+\[/;
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        const [, fileName, className, functionName] = m;
        passed.add(`${fileName}::${className}::${functionName}`);
      }
    }
    return passed;
  }

  private extractFailedFromSummary(logContent: string): Record<string, string> {
    const failed: Record<string, string> = {};
    const lines = logContent.split('\n');
    let inSummary = false;
    for (const line of lines) {
      if (line.includes('short test summary info')) {
        inSummary = true;
        continue;
      }
      if (inSummary) {
        if (line.startsWith('=') && (line.includes('failed') || line.includes('passed'))) break;
        const m = line.match(/FAILED\s+(\S+\.py)::([\w_]+)::(test_[\w_]+)\s+-\s+(.*)/);
        if (m) {
          const [, fileName, className, functionName, errorDetail] = m;
          failed[`${fileName}::${className}::${functionName}`] = (errorDetail || '').trim();
        }
      }
    }
    return failed;
  }

  private extractErrorFromSummary(logContent: string): Record<string, string> {
    const errors: Record<string, string> = {};
    const lines = logContent.split('\n');
    let inSummary = false;
    for (const line of lines) {
      if (line.includes('short test summary info')) {
        inSummary = true;
        continue;
      }
      if (inSummary) {
        if (line.startsWith('=') && (line.includes('failed') || line.includes('passed') || line.includes('error')))
          break;
        const m = line.match(/ERROR\s+(\S+\.py)(?:\s+-\s+(.*))?/);
        if (m) {
          const fileName = m[1];
          const detail = (m[2] || 'Collection error').trim();
          errors[`${fileName}::CollectionError`] = detail;
        }
      }
    }
    return errors;
  }

  private classifyAssertionError(_detail: string): string {
    return 'AssertionError';
  }

  private classifyRuntimeError(errorType: string, _detail: string): string {
    if (['ImportError', 'ModuleNotFoundError'].includes(errorType)) return 'Import Errors';
    if (['TypeError'].includes(errorType)) return 'Type Errors';
    if (['AttributeError'].includes(errorType)) return 'Attribute Errors';
    if (['ValueError'].includes(errorType)) return 'Value Errors';
    if (['NameError'].includes(errorType)) return 'Name Errors';
    if (['SyntaxError', 'IndentationError'].includes(errorType)) return 'Syntax Errors';
    return 'Runtime Errors';
  }

  private classifyCollectionError(errorDetail: string): string {
    const m = errorDetail.match(/^([A-Z]\w*Error)(?::\s*(.*))?/);
    if (m) {
      const errorType = m[1];
      return this.classifyRuntimeError(errorType, errorDetail);
    }
    return 'Unknown Errors';
  }

  private classifyFailedTest(errorDetail: string): [string, string, string] {
    if (errorDetail.includes('AssertionError')) {
      return ['Assertion Errors', this.classifyAssertionError(errorDetail), errorDetail];
    }
    const m = errorDetail.match(/^([A-Z]\w*Error)(?::\s*(.*))?/);
    if (m) {
      const errorType = m[1];
      const category = this.classifyRuntimeError(errorType, errorDetail);
      return [category, errorType, errorDetail];
    }
    return ['Unknown Errors', 'UnknownError', errorDetail];
  }

  private extractResultsFromLog(logPath: string, testFilePath: string): TestCaseResult[] {
    if (!fs.existsSync(logPath)) return [];
    const content = readFileSafe(logPath);
    if (!content) return [];

    const passed = this.extractPassedFromSession(content);
    const failed = this.extractFailedFromSummary(content);
    const errors = this.extractErrorFromSummary(content);

    const out: TestCaseResult[] = [];

    for (const codeName of passed) {
      out.push({
        codeName,
        status: 'Passed',
        errorType: null,
        detail: '',
        testFile: testFilePath,
        logPath,
      });
    }

    for (const [codeName, errorDetail] of Object.entries(failed)) {
      const [status, errorType, detail] = this.classifyFailedTest(errorDetail);
      out.push({
        codeName,
        status,
        errorType,
        detail,
        testFile: testFilePath,
        logPath,
      });
    }

    for (const [codeName, errorDetail] of Object.entries(errors)) {
      const errorCategory = this.classifyCollectionError(errorDetail);
      const m = errorDetail.match(/^([A-Z]\w*Error)(?::\s*(.*))?/);
      const specific = m ? m[1] : 'ImportError';
      out.push({
        codeName,
        status: errorCategory,
        errorType: specific,
        detail: errorDetail,
        testFile: testFilePath,
        logPath,
      });
    }

    return out;
  }

  analyze(execResults: ExecutionResult[], testsDir: string, outputDir: string): AnalysisReport {
    const tests: Record<string, TestCaseResult> = {};
    const files: Record<string, FileAnalysis> = {};

    for (const res of execResults) {
      const fkey = res.testFile.path;
      files[fkey] = makeEmptyFileAnalysis();

      if (!res.logPath || !fs.existsSync(res.logPath)) {
        files[fkey].note = 'No log file found (timeout, execution error, or missing file).';
        continue;
      }

      const tcrs = this.extractResultsFromLog(res.logPath, res.testFile.path);
      if (!tcrs.length) {
        files[fkey].note = 'No test results found in log file.';
        continue;
      }

      for (const tcr of tcrs) {
        tests[tcr.codeName] = tcr;
        files[fkey].testcases.push(tcr);
        const prev = files[fkey].counts[tcr.status] ?? 0;
        files[fkey].counts[tcr.status] = prev + 1;
      }
    }

    return {
      tests,
      files,
      meta: {
        language: this.language,
        tests_dir: testsDir,
        output_dir: outputDir,
      },
    };
  }
}