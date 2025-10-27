// src/ut_runner/writer.ts
import * as fs from 'fs';
import * as path from 'path';
import { AnalysisReport, ExecutionResult } from './types';

export class Writer {
  readonly outputDir: string;
  readonly logsDir: string;
  readonly junitDir: string;
  readonly testResultsJson: string;
  readonly fileResultsJson: string;
  readonly passedTxt: string;
  readonly assertionTxt: string;
  readonly errorsTxt: string;
  readonly unifiedLog: string;
  readonly examinationDir: string;
  readonly examinationJson: string;
  readonly examinationSummaryMd: string;

  constructor(outputDir: string) {
    this.outputDir = path.resolve(outputDir);
    this.logsDir = path.join(this.outputDir, 'logs');
    this.junitDir = path.join(this.outputDir, 'junit');
    this.testResultsJson = path.join(this.outputDir, 'test_results.json');
    this.fileResultsJson = path.join(this.outputDir, 'file_results.json');
    this.passedTxt = path.join(this.outputDir, 'passed.txt');
    this.assertionTxt = path.join(this.outputDir, 'assertion_errors.txt');
    this.errorsTxt = path.join(this.outputDir, 'errors.txt');
    this.unifiedLog = path.join(this.outputDir, 'pytest_output.log');
    this.examinationDir = path.join(this.outputDir, 'examination');
    this.examinationJson = path.join(this.outputDir, 'examination_results.json');
    this.examinationSummaryMd = path.join(this.outputDir, 'examination_summary.md');
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  writeUnifiedLog(execResults: ExecutionResult[]): void {
    const ws = fs.createWriteStream(this.unifiedLog, { flags: 'w' });
    for (const res of [...execResults].sort((a, b) => path.basename(a.testFile.path).localeCompare(path.basename(b.testFile.path)))) {
      ws.write(`===== ${path.basename(res.testFile.path)} =====\n`);
      try {
        const content = fs.readFileSync(res.logPath, { encoding: 'utf-8' });
        ws.write(content);
      } catch {
        ws.write('(log file missing)\n');
      }
      ws.write('\n');
    }
    ws.end();
  }

  writeAnalysis(report: AnalysisReport): void {
    const testsPayload: any = {
      tests: Object.fromEntries(
        Object.entries(report.tests).map(([k, v]) => [
          k,
          {
            code_name: v.codeName,
            status: v.status,
            error_type: v.errorType ?? null,
            detail: v.detail,
            test_file: String(v.testFile),
            log_path: String(v.logPath),
            focal_module: v.focalModule ?? null,
            focal_function: v.focalFunction ?? null,
            source_file: v.sourceFile ?? null,
          },
        ])
      ),
      meta: report.meta,
    };
    fs.writeFileSync(this.testResultsJson, JSON.stringify(testsPayload, null, 2), { encoding: 'utf-8' });

    const filesPayload: any = {
      files: Object.fromEntries(
        Object.entries(report.files).map(([k, v]) => [
          k,
          {
            counts: v.counts,
            testcases: v.testcases.map((tc) => ({
              code_name: tc.codeName,
              status: tc.status,
              error_type: tc.errorType ?? null,
            })),
            note: v.note ?? null,
          },
        ])
      ),
      meta: report.meta,
    };
    fs.writeFileSync(this.fileResultsJson, JSON.stringify(filesPayload, null, 2), { encoding: 'utf-8' });

    const writeList = (p: string, items: string[]) => {
      fs.writeFileSync(p, items.sort().join('\n') + (items.length ? '\n' : ''), { encoding: 'utf-8' });
    };

    const passed = Object.entries(report.tests)
      .filter(([, t]) => t.status === 'Passed')
      .map(([k]) => k);

    const asserts = Object.entries(report.tests)
      .filter(([, t]) => t.status === 'Assertion Errors')
      .map(([k]) => k);

    const errors = Object.entries(report.tests)
      .filter(([, t]) => t.status === 'Error')
      .map(([k, t]) => (t.errorType ? `${k} [${t.errorType}]` : k));

    writeList(this.passedTxt, passed);
    writeList(this.assertionTxt, asserts);
    writeList(this.errorsTxt, errors);

    // Write examination results
    this.writeExaminationResults(report);
  }

  writeExaminationResults(report: AnalysisReport): void {
    // Collect all test cases with examination results
    const examinedTests = Object.entries(report.tests)
      .filter(([, tc]) => tc.examination)
      .map(([, tc]) => tc);

    if (examinedTests.length === 0) {
      console.log('[WRITER] No examination results to write');
      return;
    }

    // Create examination directory
    fs.mkdirSync(this.examinationDir, { recursive: true });

    // Write JSON with full examination results
    const examinationData = {
      summary: {
        total_examined: examinedTests.length,
        with_redefined_symbols: examinedTests.filter(tc => tc.examination?.hasRedefinedSymbols).length,
        examination_errors: examinedTests.filter(tc => tc.examination?.examinationError).length,
      },
      tests: examinedTests.map(tc => ({
        test_case: tc.codeName,
        test_file: tc.testFile,
        symbol_name: tc.symbolName ?? null,
        source_file: tc.sourceFile ?? null,
        focal_function: tc.focalFunction ?? null,
        status: tc.status,
        examination: tc.examination,
      })),
    };

    fs.writeFileSync(this.examinationJson, JSON.stringify(examinationData, null, 2), { encoding: 'utf-8' });
    console.log(`[WRITER] Wrote examination results to ${this.examinationJson}`);

    // Write markdown summary
    this.writeExaminationSummary(examinedTests);

    // Write individual examination files
    this.writeIndividualExaminations(examinedTests);
  }

  private writeExaminationSummary(examinedTests: any[]): void {
    const lines: string[] = [];
    lines.push('# Root Cause Analysis - Examination Summary\n');
    lines.push(`Generated: ${new Date().toISOString()}\n`);
    
    const withRedefined = examinedTests.filter(tc => tc.examination?.hasRedefinedSymbols);
    const withErrors = examinedTests.filter(tc => tc.examination?.examinationError);
    
    lines.push('## Overview\n');
    lines.push(`- **Total Examined**: ${examinedTests.length}`);
    lines.push(`- **With Redefined Symbols**: ${withRedefined.length}`);
    lines.push(`- **Examination Errors**: ${withErrors.length}\n`);

    if (withRedefined.length > 0) {
      lines.push('## Tests with Redefined Symbols\n');
      lines.push('These tests redefine symbols from the source code, which may indicate wrong assertions:\n');
      
      for (const tc of withRedefined) {
        lines.push(`### ${tc.codeName}\n`);
        lines.push(`**Test File**: \`${tc.testFile}\`\n`);
        lines.push(`**Redefined Symbols**: ${tc.examination.redefinedSymbols.length}\n`);
        
        for (const sym of tc.examination.redefinedSymbols) {
          lines.push(`- **${sym.name}**`);
          lines.push(`  - Source: \`${sym.sourceLoc}\``);
          lines.push(`  - Test: \`${sym.testLoc}\``);
        }
        lines.push('');
      }
    }

    if (withErrors.length > 0) {
      lines.push('## Examination Errors\n');
      for (const tc of withErrors) {
        lines.push(`- **${tc.codeName}**: ${tc.examination.examinationError}`);
      }
      lines.push('');
    }

    fs.writeFileSync(this.examinationSummaryMd, lines.join('\n'), { encoding: 'utf-8' });
    console.log(`[WRITER] Wrote examination summary to ${this.examinationSummaryMd}`);
  }

  private writeIndividualExaminations(examinedTests: any[]): void {
    for (const tc of examinedTests) {
      if (!tc.examination || !tc.examination.examined) {
        continue;
      }

      const testBasename = path.basename(tc.testFile, '.py');
      const examFile = path.join(this.examinationDir, `${testBasename}_examination.md`);
      
      const lines: string[] = [];
      lines.push(`# Examination Report: ${tc.codeName}\n`);
      lines.push(`**Test File**: ${tc.testFile}`);
      lines.push(`**Status**: ${tc.status}`);
      lines.push(`**Error Detail**: ${tc.detail}\n`);

      if (tc.examination.hasRedefinedSymbols) {
        lines.push('## Redefined Symbols\n');
        lines.push('The following symbols are redefined in the test file:\n');
        
        for (const sym of tc.examination.redefinedSymbols) {
          lines.push(`### ${sym.name}\n`);
          lines.push(`- **Source Location**: \`${sym.sourceLoc}\``);
          lines.push(`- **Test Location**: \`${sym.testLoc}\``);
          lines.push('');
        }
      } else {
        lines.push('## No Redefined Symbols Found\n');
      }

      if (tc.examination.definitionTreeSummary) {
        lines.push('## Definition Tree\n');
        lines.push('```');
        lines.push(tc.examination.definitionTreeSummary);
        lines.push('```\n');
      }

      if (tc.examination.examinationError) {
        lines.push('## Examination Error\n');
        lines.push(`\`\`\`\n${tc.examination.examinationError}\n\`\`\`\n`);
      }

      fs.writeFileSync(examFile, lines.join('\n'), { encoding: 'utf-8' });
    }

    console.log(`[WRITER] Wrote ${examinedTests.length} individual examination reports to ${this.examinationDir}`);
  }
}