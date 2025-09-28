// src/ut_runner/analyzer.ts
import * as fs from 'fs';
import * as path from 'path';
import { AnalysisReport, ExecutionResult, FileAnalysis, TestCaseResult, makeEmptyFileAnalysis } from './types';
import { findFiles } from '../fileHandler';
import { SRC_PATHS, ProjectName, getConfigInstance } from '../config';
import { getLanguageSuffix } from '../language';


export class Analyzer {
  private language: string;
  private sourceFiles: string[] = [];
  private sourceFileNames: string[] = [];
  private testFileMap: Record<string, { project_name?: string; file_name: string; symbol_name?: string }> = {};

  constructor(language: string = 'python') {
    this.language = language;
  }

  private loadSourceFiles(workspaceRoot: string): void {
    try {
      const projectName = path.basename(workspaceRoot);
      let srcPath: string;
      if (Object.prototype.hasOwnProperty.call(SRC_PATHS, projectName)) {
        srcPath = path.join(workspaceRoot, SRC_PATHS[projectName as ProjectName]);
      } else {
        srcPath = path.join(workspaceRoot, SRC_PATHS.DEFAULT);
      }
      const suffix = getLanguageSuffix(this.language);
      const files: string[] = [];
      findFiles(srcPath, files, this.language, suffix);
      this.sourceFiles = files;
      this.sourceFileNames = files.map((f) => path.basename(f));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ANALYZER] Failed to load source files:', e);
      this.sourceFiles = [];
      this.sourceFileNames = [];
    }
  }

  // ===== Test-file map loading and matching =====
  private removeRandomNumbers(filename: string): string {
    const ext = path.extname(filename);
    const stem = filename.slice(0, filename.length - ext.length);
    const cleanedStem = stem.replace(/_\d+/g, '');
    return cleanedStem + ext;
  }

  private findMatchingTestKey(testBasename: string): string | null {
    if (!this.testFileMap || !Object.keys(this.testFileMap).length) return null;
    const cleanedName = this.removeRandomNumbers(testBasename);
    const matches: string[] = [];
    for (const key of Object.keys(this.testFileMap)) {
      const cleanedKey = this.removeRandomNumbers(key);
      if (cleanedKey === cleanedName) {
        matches.push(key);
      }
    }
    return matches.length ? matches[0] : null;
  }

  private findMatchingTestKeyWithMethod(testBasename: string, methodUnderTest?: string | null): string | null {
    if (!this.testFileMap || !Object.keys(this.testFileMap).length) return null;
    const cleanedName = this.removeRandomNumbers(testBasename);
    const matches: string[] = [];
    for (const key of Object.keys(this.testFileMap)) {
      const cleanedKey = this.removeRandomNumbers(key);
      if (cleanedKey === cleanedName) {
        matches.push(key);
      }
    }
    if (!matches.length) return null;
    if (methodUnderTest) {
      const exact = matches.find((k) => {
        const sym = this.testFileMap[k]?.symbol_name;
        return sym && sym === methodUnderTest;
      });
      if (exact) return exact;
    }
    return matches[0];
  }

  private loadTestFileMap(mapPath: string): void {
    try {
      const abs = path.resolve(mapPath);
      if (!fs.existsSync(abs)) {
        // eslint-disable-next-line no-console
        console.warn(`[ANALYZER] Test-file map does not exist: ${abs}`);
        this.testFileMap = {};
        return;
      }
      const raw = fs.readFileSync(abs, { encoding: 'utf-8' });
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        this.testFileMap = data as Record<string, { project_name?: string; file_name: string; symbol_name?: string }>;
      } else {
        this.testFileMap = {};
      }
      // eslint-disable-next-line no-console
      console.log(`[ANALYZER] Loaded test-file map entries: ${Object.keys(this.testFileMap).length}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ANALYZER] Failed to load test-file map:', e);
      this.testFileMap = {};
    }
  }

  public findSourceFileForTest(testFilePath: string, methodUnderTest?: string | null): string | null {
    const ws = getConfigInstance().workspace;
    const base = path.basename(testFilePath);
    if (!this.testFileMap || !Object.keys(this.testFileMap).length) {
      return null;
    }
    const key = this.findMatchingTestKeyWithMethod(base, methodUnderTest ?? null) || this.findMatchingTestKey(base);
    if (!key) return null;
    const rel = this.testFileMap[key]?.file_name;
    if (!rel) return null;
    const abs = path.isAbsolute(rel) ? rel : path.join(ws, rel);
    return fs.existsSync(abs) ? abs : null;
  }

  // Minimal analysis for unit-test to source mapping bootstrap
  analyze(execResults: ExecutionResult[], testsDir: string, outputDir: string, testFileMapPath: string): AnalysisReport {
    const tests: Record<string, TestCaseResult> = {};
    const files: Record<string, FileAnalysis> = {};

    const workspaceRoot = getConfigInstance().workspace;
    this.loadSourceFiles(workspaceRoot);
    this.loadTestFileMap(testFileMapPath);

    for (const res of execResults) {
      const fileKey = String(res.testFile.path);
      const fileAnalysis: FileAnalysis = makeEmptyFileAnalysis();

      const matchedSource = this.findSourceFileForTest(res.testFile.path, null);
      if (matchedSource) {
        fileAnalysis.note = `Matched source: ${path.relative(workspaceRoot, matchedSource)}`;
      } else {
        fileAnalysis.note = 'No source mapping found for this test file';
      }

      files[fileKey] = fileAnalysis;
    }

    return {
      tests,
      files,
      meta: {
        language: this.language,
        tests_dir: String(path.resolve(testsDir)),
        output_dir: String(path.resolve(outputDir)),
      },
    };
  }
}

