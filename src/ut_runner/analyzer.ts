// src/ut_runner/analyzer.ts
import * as fs from 'fs';
import * as path from 'path';
import { AnalysisReport, ExecutionResult, FileAnalysis, TestCaseResult, makeEmptyFileAnalysis } from './types';
import { findFiles } from '../fileUtils';
import { SRC_PATHS, ProjectName, getConfigInstance } from '../config';
import { getLanguageSuffix } from '../language';

// Optional examiner import - requires VSCode extension API
let examineTestCasesBatch: any = null;
let filterTestCasesForExamination: any = null;
try {
  const examinerModule = require('./analysis/examiner');
  examineTestCasesBatch = examinerModule.examineTestCasesBatch;
  filterTestCasesForExamination = examinerModule.filterTestCasesForExamination;
} catch (e) {
  console.log('[ANALYZER] Running without examiner (VSCode extension API not available)');
}


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
    if (!this.testFileMap || !Object.keys(this.testFileMap).length) {
      return null;
    }
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
    if (!this.testFileMap || !Object.keys(this.testFileMap).length) {
      return null;
    }
    const cleanedName = this.removeRandomNumbers(testBasename);
    const matches: string[] = [];
    for (const key of Object.keys(this.testFileMap)) {
      const cleanedKey = this.removeRandomNumbers(key);
      if (cleanedKey === cleanedName) {
        matches.push(key);
      }
    }
    if (!matches.length) {
      return null;
    }
    if (methodUnderTest) {
      const exact = matches.find((k) => {
        const sym = this.testFileMap[k]?.symbol_name;
        return sym && sym === methodUnderTest;
      });
      if (exact) {
        return exact;
      }
    }
    return matches[0];
  }

  private loadTestFileMap(mapPath: string): void {
    try {
      const abs = path.resolve(mapPath);
      if (!fs.existsSync(abs)) {
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
      console.log(`[ANALYZER] Loaded test-file map entries: ${Object.keys(this.testFileMap).length}`);
    } catch (e) {
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
    if (!key) {
      return null;
    }
    const rel = this.testFileMap[key]?.file_name;
    if (!rel) {
      return null;
    }
    const abs = path.isAbsolute(rel) ? rel : path.join(ws, rel);
    return fs.existsSync(abs) ? abs : null;
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
        if (line.startsWith('=') && (line.includes('failed') || line.includes('passed'))) {
          break;
        }
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
        if (line.startsWith('=') && (line.includes('failed') || line.includes('passed') || line.includes('error'))){
          break;
        }
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
    if (['ImportError', 'ModuleNotFoundError'].includes(errorType)) {
      return 'Import Errors';
    }
    if (['TypeError'].includes(errorType)) {
      return 'Type Errors';
    }
    if (['AttributeError'].includes(errorType)) {
      return 'Attribute Errors';
    }
    if (['ValueError'].includes(errorType)) {
      return 'Value Errors';
    }
    if (['NameError'].includes(errorType)) {
      return 'Name Errors';
    }
    if (['SyntaxError', 'IndentationError'].includes(errorType)) {
      return 'Syntax Errors';
    }
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

  private parseTestFileName(fileName: string): { focalModule: string; focalFunction: string; focalRandom: string } | null {
    // Pattern: {test_file}_{test_function}_{randomNumber}_test.py
    // Examples: pytree_prev_sibling_5806_test.py, pytree_replace_1523_test.py
    
    const baseName = fileName.replace('_test.py', '');
    const parts = baseName.split('_');
    
    if (parts.length < 3) {
      return null; // Invalid pattern
    }
    
    // The last part should be the random number
    const randomNumber = parts[parts.length - 1];
    if (!/^\d+$/.test(randomNumber)) {
      return null; // Last part is not a number
    }
    
    // Remove the random number from consideration
    const beforeRandom = parts.slice(0, -1);
    
    let focalModule = '';
    let focalFunction = '';
    
    // console.log(`Debug: Parsing ${fileName}`);
    // console.log(`Debug: beforeRandom = ${JSON.stringify(beforeRandom)}`);
    // console.log(`Debug: sourceFileNames = ${JSON.stringify(this.sourceFileNames)}`);
    
    if (beforeRandom.length === 2) {
      // Simple case: module_function_random
      focalModule = beforeRandom[0];
      focalFunction = beforeRandom[1];
      // console.log(`Debug: Simple case - module: ${focalModule}, function: ${focalFunction}`);
    } else {
      // Complex case: need to identify module vs function boundary
      // Strategy: Try to match against discovered source files
      
      if (this.sourceFileNames.length > 0) {
        // console.log(`Debug: Using source file matching`);
        // Try to find the longest matching module name
        let bestMatch = '';
        let bestMatchLength = 0;
        
        for (const sourceFileName of this.sourceFileNames) {
          const moduleName = sourceFileName.replace('.py', '');
          const moduleParts = moduleName.split('_');
          
          // console.log(`Debug: Checking against module ${moduleName}, parts: ${JSON.stringify(moduleParts)}`);
          
          // Check if this module name matches the beginning of our parts
          let matchLength = 0;
          for (let i = 0; i < Math.min(moduleParts.length, beforeRandom.length); i++) {
            if (moduleParts[i] === beforeRandom[i]) {
              matchLength++;
            } else {
              break;
            }
          }
          
          // console.log(`Debug: Match length for ${moduleName}: ${matchLength}`);
          
          // If we have a complete match and it's longer than our current best
          if (matchLength === moduleParts.length && matchLength > bestMatchLength) {
            bestMatch = moduleName;
            bestMatchLength = matchLength;
            // console.log(`Debug: New best match: ${bestMatch} with length ${bestMatchLength}`);
          }
        }
        
        if (bestMatch) {
          focalModule = bestMatch;
          // Join the remaining parts, but be careful about underscores
          const remainingParts = beforeRandom.slice(bestMatchLength);
          focalFunction = remainingParts.join('_');
          // console.log(`Debug: Found match - module: ${focalModule}, function: ${focalFunction}`);
        } else {
          // Fallback to heuristics
          focalModule = beforeRandom[0];
          focalFunction = beforeRandom.slice(1).join('_');
          // console.log(`Debug: No match found, using fallback - module: ${focalModule}, function: ${focalFunction}`);
        }
      } else {
        // console.log(`Debug: No source files, using heuristics`);
        // No source files available, use heuristics
        // Look for double underscore patterns
        const doubleUnderscoreIndex = beforeRandom.findIndex(part => part.startsWith('__'));
        
        if (doubleUnderscoreIndex > 0) {
          focalModule = beforeRandom.slice(0, doubleUnderscoreIndex).join('_');
          focalFunction = beforeRandom.slice(doubleUnderscoreIndex).join('_');
          // console.log(`Debug: Double underscore heuristic - module: ${focalModule}, function: ${focalFunction}`);
        } else {
          // Fallback: first part is module, rest is function
          focalModule = beforeRandom[0];
          focalFunction = beforeRandom.slice(1).join('_');
          // console.log(`Debug: Simple heuristic - module: ${focalModule}, function: ${focalFunction}`);
        }
      }
    }
    
    return {
      focalModule,
      focalFunction,
      focalRandom: randomNumber
    };
  }

  // Public method for testing purposes
  public parseTestFileNameForTesting(fileName: string): { focalModule: string; focalFunction: string; focalRandom: string } | null {
    return this.parseTestFileName(fileName);
  }

  // Method to set source files for testing
  public setSourceFilesForTesting(sourceFileNames: string[]): void {
    this.sourceFileNames = sourceFileNames;
  }

  private checkImplementationOrigin(testFilePath: string, focalModule: string, focalFunction: string): {
    implementationOrigin: string;
    importLine?: string;
    modulePath?: string;
  } {
    const testContent = fs.readFileSync(testFilePath, 'utf-8');
    if (!testContent) {
      return { implementationOrigin: 'unknown' };
    }
    
    // Check for imports of the focal function
    const importPatterns = [
      // Direct import: from module import function
      new RegExp(`from\\s+${focalModule}\\s+import\\s+.*\\b${focalFunction}\\b`, 'g'),
      // Import module: import module
      new RegExp(`import\\s+${focalModule}\\b`, 'g'),
      // Import with alias: import module as alias
      new RegExp(`import\\s+${focalModule}\\s+as\\s+\\w+`, 'g'),
    ];
    
    for (const pattern of importPatterns) {
      const match = testContent.match(pattern);
      if (match) {
        return {
          implementationOrigin: 'imported',
          importLine: match[0],
          modulePath: focalModule
        };
      }
    }
    
    // Check if the function is reimplemented in the test file
    // Look for function definitions that match the focal function name
    const functionDefPattern = new RegExp(`def\\s+${focalFunction}\\b`, 'g');
    const functionDefMatch = testContent.match(functionDefPattern);
    
    if (functionDefMatch) {
      return {
        implementationOrigin: 'reimplemented',
        importLine: undefined,
        modulePath: undefined
      };
    }
    
    // Check for class definitions that might contain the function
    const classDefPattern = new RegExp(`class\\s+\\w+.*:`, 'g');
    const classMatches = testContent.match(classDefPattern);
    
    if (classMatches) {
      // Look for method definitions within classes
      const methodDefPattern = new RegExp(`def\\s+${focalFunction}\\b`, 'g');
      const methodDefMatch = testContent.match(methodDefPattern);
      
      if (methodDefMatch) {
        return {
          implementationOrigin: 'reimplemented',
          importLine: undefined,
          modulePath: undefined
        };
      }
    }
    
    return { implementationOrigin: 'unknown' };
  }

  private classifyImplementationOrigin(testFilePath: string): Partial<TestCaseResult> {
    const fileName = testFilePath.split('/').pop() || testFilePath.split('\\').pop() || '';
    const parsed = this.parseTestFileName(fileName);
    
    if (!parsed) {
      return {
        focalModule: null,
        focalFunction: null,
        focalRandom: null,
        implementationOrigin: 'unknown',
        importLine: null,
        modulePath: null
      };
    }
    
    const { focalModule, focalFunction, focalRandom } = parsed;
    const originInfo = this.checkImplementationOrigin(testFilePath, focalModule, focalFunction);
    
    return {
      focalModule,
      focalFunction,
      focalRandom,
      implementationOrigin: originInfo.implementationOrigin,
      importLine: originInfo.importLine || null,
      modulePath: originInfo.modulePath || null
    };
  }

  private extractResultsFromLog(logPath: string, testFilePath: string): TestCaseResult[] {
    if (!fs.existsSync(logPath)) {
      return [];
    }
    const content = fs.readFileSync(logPath, 'utf-8');
    if (!content) {
      return [];
    }
    const passed = this.extractPassedFromSession(content);
    const failed = this.extractFailedFromSummary(content);
    const errors = this.extractErrorFromSummary(content);
    
    // Log the test results with proper formatting
    const testFileName = path.basename(testFilePath);
    console.log(`[ANALYZER] Processing ${testFileName}:`);
    console.log(`[ANALYZER]   Passed: ${passed.size} tests - ${Array.from(passed).join(', ')}`);
    console.log(`[ANALYZER]   Failed: ${Object.keys(failed).length} tests - ${Object.keys(failed).join(', ')}`);
    console.log(`[ANALYZER]   Errors: ${Object.keys(errors).length} tests - ${Object.keys(errors).join(', ')}`);
    
    // If there are failures, print details
    if (Object.keys(failed).length > 0) {
      console.log(`[ANALYZER] Failure details for ${testFileName}:`);
      for (const [testName, errorDetail] of Object.entries(failed)) {
        console.log(`[ANALYZER]   - ${testName}:`);
        console.log(`[ANALYZER]     ${errorDetail}`);
      }
    }
    
    // If there are errors, print details
    if (Object.keys(errors).length > 0) {
      console.log(`[ANALYZER] Error details for ${testFileName}:`);
      for (const [testName, errorDetail] of Object.entries(errors)) {
        console.log(`[ANALYZER]   - ${testName}:`);
        console.log(`[ANALYZER]     ${errorDetail}`);
      }
    }
    
    const out: TestCaseResult[] = [];
    
    // Get implementation origin classification for this test file
    const originClassification = this.classifyImplementationOrigin(testFilePath);

    for (const codeName of passed) {
      out.push({
        codeName,
        status: 'Passed',
        errorType: null,
        detail: '',
        testFile: testFilePath,
        logPath,
        ...originClassification
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
        ...originClassification
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
        ...originClassification
      });
    }

    return out;
  }

//   analyze(execResults: ExecutionResult[], testsDir: string, outputDir: string): AnalysisReport {
//     // Discover source files from the workspace
//     const workspacePath = path.dirname(testsDir);
//     this.discoverSourceFiles(workspacePath).then(() => {
//       console.log('Source file discovery completed');
//     }).catch(error => {
//       console.warn('Source file discovery failed:', error);
//     });

//     const tests: Record<string, TestCaseResult> = {};
//     const files: Record<string, FileAnalysis> = {};

//     for (const res of execResults) {
//       const fkey = res.testFile.path;
//       files[fkey] = makeEmptyFileAnalysis();

//       if (!res.logPath || !fs.existsSync(res.logPath)) {
//         files[fkey].note = 'No log file found (timeout, execution error, or missing file).';
//         continue;
//       }

//       const tcrs = this.extractResultsFromLog(res.logPath, res.testFile.path);
//       if (!tcrs.length) {
//         files[fkey].note = 'No test results found in log file.';
//         continue;
//       }

//       for (const tcr of tcrs) {
//         tests[tcr.codeName] = tcr;
//         files[fkey].testcases.push(tcr);
//         const prev = files[fkey].counts[tcr.status] ?? 0;
//         files[fkey].counts[tcr.status] = prev + 1;
//       }
//     }

//     return {
//       tests,
//       files,
//       meta: {
//         language: this.language,
//         tests_dir: testsDir,
//         output_dir: outputDir,
//       },
//     };
//   }
// }
  // Minimal analysis for unit-test to source mapping bootstrap
  async analyze(execResults: ExecutionResult[], testsDir: string, outputDir: string, testFileMapPath: string): Promise<AnalysisReport> {
    const tests: Record<string, TestCaseResult> = {};
    const files: Record<string, FileAnalysis> = {};

    const workspaceRoot = getConfigInstance().workspace;
    this.loadSourceFiles(workspaceRoot);
    this.loadTestFileMap(testFileMapPath);

    for (const res of execResults) {
      const fkey = String(res.testFile.path);
      files[fkey] = makeEmptyFileAnalysis();

      const matchedSource = this.findSourceFileForTest(res.testFile.path, null);
      if (matchedSource) {
        files[fkey].note = `Matched source: ${path.relative(workspaceRoot, matchedSource)}`;
      } else {
        files[fkey].note = 'No source mapping found for this test file';
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

    // Examination phase: analyze assertion errors for redefined symbols
    // Only available when running in VSCode extension context
    if (examineTestCasesBatch && filterTestCasesForExamination) {
      console.log('[ANALYZER] Starting examination phase for assertion errors...');
      const allTestCases = Object.values(tests);
      const testCasesToExamine = filterTestCasesForExamination(allTestCases);

      if (testCasesToExamine.length > 0) {
        const examinations = await examineTestCasesBatch(
          testCasesToExamine,
          (tc: TestCaseResult) => this.findSourceFileForTest(tc.testFile, tc.focalFunction || null),
          (tc: TestCaseResult) => tc.focalFunction || null,
          5 // concurrency
        );

        // Attach examination results back to test cases
        for (const exam of examinations) {
          const testCase = tests[exam.testCaseName];
          if (testCase) {
            testCase.examination = exam;
          }
        }

        console.log(`[ANALYZER] Examination phase complete: ${examinations.length} test cases examined`);
      } else {
        console.log('[ANALYZER] No assertion errors to examine');
      }
    } else {
      console.log('[ANALYZER] Examination phase skipped (requires VSCode extension API)');
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

