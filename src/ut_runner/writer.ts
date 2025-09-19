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
  }
}