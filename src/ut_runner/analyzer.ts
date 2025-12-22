// src/ut_runner/analyzer.ts
import * as fs from 'fs';
import * as path from 'path';
import { AnalysisReport, ExecutionResult, FileAnalysis, TestCaseResult, makeEmptyFileAnalysis } from './types';
import { findFiles } from '../fileUtils';
import { getConfigInstance, getProjectSrcPath, getProjectConfig, ProjectConfigName } from '../config';
import { getLanguageSuffix } from '../language';

// Optional examiner import - requires VSCode extension API
let examineTestCasesBatch: any = null;
let filterTestCasesForExamination: any = null;
let mutAnalyzer: any = null;
try {
  const examinerModule = require('./analysis/examiner');
  const mutAnalyzerModule = require('./analysis/mut_analyzer');
  mutAnalyzer = mutAnalyzerModule.analyzeFocalMethod;
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
      srcPath = getProjectSrcPath(projectName as ProjectConfigName);
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
    console.log(`[ANALYZER] Finding matching test key with method: ${testBasename} ${methodUnderTest}`);
    console.log(`[ANALYZER]   Test file map: ${JSON.stringify(this.testFileMap)}`);
    if (!this.testFileMap || !Object.keys(this.testFileMap).length) {
      return null;
    }
    const cleanedName = this.removeRandomNumbers(testBasename);
    console.log(`[ANALYZER]   Cleaned name: ${cleanedName}`);
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
    console.log(`[ANALYZER] Finding source file for test file: ${testFilePath}`);
    console.log(`[ANALYZER]   Base: ${base}`);
    console.log(`[ANALYZER]   Workspace: ${ws}`);
    if (!this.testFileMap || !Object.keys(this.testFileMap).length) {
      console.log(`[ANALYZER]   Test file map is empty`);
      return null;
    }
    const key = this.findMatchingTestKeyWithMethod(base, methodUnderTest ?? null) || this.findMatchingTestKey(base);
    console.log(`[ANALYZER] Found key: ${key}`);
    if (!key) {
      return null;
    }
    const rel = this.testFileMap[key]?.file_name;
    if (!rel) {
      console.log(`[ANALYZER]   No file_name in test file map entry`);
      return null;
    }
    console.log(`[ANALYZER]   File name from map: ${rel}`);
    
    // Try multiple path resolution strategies:
    // 1. If absolute path, use as-is
    if (path.isAbsolute(rel)) {
      const abs = rel;
      if (fs.existsSync(abs)) {
        console.log(`[ANALYZER]   Found at absolute path: ${abs}`);
        return abs;
      }
    }
    
    // 2. Try relative to workspace root
    let abs = path.join(ws, rel);
    if (fs.existsSync(abs)) {
      console.log(`[ANALYZER]   Found at workspace-relative path: ${abs}`);
      return abs;
    }
    
    // 3. Try relative to workspace + srcPath (for projects like tornado where source is in subdirectory)
    // Get project name from workspace basename and try to get srcPath
    try {
      const projectName = path.basename(ws) as ProjectConfigName;
      const srcPath = getProjectSrcPath(projectName);
      // srcPath already includes workspace, so we need to check if rel is relative to srcPath
      // If srcPath ends with the directory that contains the source, try joining srcPath with rel
      abs = path.join(srcPath, rel);
      if (fs.existsSync(abs)) {
        console.log(`[ANALYZER]   Found at srcPath-relative path: ${abs}`);
        return abs;
      }
      
      // 4. Alternative: try workspace + srcPath config + rel
      const projectConfig = getProjectConfig(projectName);
      if (projectConfig.srcPath && projectConfig.srcPath !== '/') {
        abs = path.join(ws, projectConfig.srcPath, rel);
        if (fs.existsSync(abs)) {
          console.log(`[ANALYZER]   Found at workspace+srcPath-relative path: ${abs}`);
          return abs;
        }
      }
    } catch (e) {
      // If project config lookup fails, continue to return null
      console.log(`[ANALYZER]   Could not resolve project config: ${e}`);
    }
    
    console.log(`[ANALYZER]   File not found at any attempted path`);
    return null;
  }

  extractPassedFromSession(logContent: string): Set<string> {
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

  extractFailedFromSummary(logContent: string): Record<string, string> {
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

  extractErrorFromSummary(logContent: string): Record<string, string> {
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

  private parseGoTestJson(logPath: string): { testName: string; action: string; output?: string }[] {
    const results: { testName: string; action: string; output?: string }[] = [];
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      
      // Skip non-JSON lines (headers, etc.)
      if (line.startsWith('===') || line.startsWith('='.repeat(80))) {
        continue;
      }
      
      try {
        const parsed = JSON.parse(line);
        if (parsed.Test && parsed.Action) {
          results.push({
            testName: parsed.Test,
            action: parsed.Action,
            output: parsed.Output || ''
          });
        }
      } catch (e) {
        // Not JSON, skip
        continue;
      }
    }
    
    return results;
  }

  private parseGoTestFileName(fileName: string): { focalModule: string; focalFunction: string; focalRandom: string } | null {
    // Pattern: {module}_{method}_{randomNumber}_test.go
    // Examples: command_HasNameOrAliasPrefix_4921_test.go
    
    const baseName = fileName.replace('_test.go', '');
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
    
    if (beforeRandom.length < 2) {
      return null; // Need at least module and function
    }
    
    // For Go: first part is module, rest is function name
    const focalModule = beforeRandom[0];
    const focalFunction = beforeRandom.slice(1).join('_');
    
    return {
      focalModule,
      focalFunction,
      focalRandom: randomNumber
    };
  }

  private parseJavaTestFileName(fileName: string): { focalModule: string; focalFunction: string; focalRandom: string } | null {
    // Pattern: {ClassName}_{methodName}_{randomNumber}Test.java
    // Examples: OptionBuilder_withType_5438Test.java
    
    const baseName = fileName.replace('Test.java', '');
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
    
    if (beforeRandom.length < 2) {
      return null; // Need at least class and method
    }
    
    // For Java: first part is class name, rest is method name
    const focalModule = beforeRandom[0];
    const focalFunction = beforeRandom.slice(1).join('_');
    
    return {
      focalModule,
      focalFunction,
      focalRandom: randomNumber
    };
  }

  private extractGoTestResults(logPath: string, testFilePath: string): TestCaseResult[] {
    if (!fs.existsSync(logPath)) {
      return [];
    }
    
    const testResults = this.parseGoTestJson(logPath);
    const testFileName = path.basename(testFilePath);
    
    // Parse test file name for focal method info
    const parsed = this.parseGoTestFileName(testFileName);
    const focalModule = parsed?.focalModule || null;
    const focalFunction = parsed?.focalFunction || null;
    const focalRandom = parsed?.focalRandom || null;
    
    // Get source file mapping
    const matchedSource = this.findSourceFileForTest(testFilePath, focalFunction);
    const sourceFile = matchedSource || null;
    
    // Group test results by test name to get final action
    const testMap = new Map<string, { action: string; outputs: string[] }>();
    
    for (const result of testResults) {
      if (!testMap.has(result.testName)) {
        testMap.set(result.testName, { action: result.action, outputs: [] });
      }
      const entry = testMap.get(result.testName)!;
      
      // Update action (pass/fail overrides run/output)
      if (result.action === 'pass' || result.action === 'fail' || result.action === 'skip') {
        entry.action = result.action;
      }
      
      // Collect outputs
      if (result.output && result.output.trim()) {
        entry.outputs.push(result.output.trim());
      }
    }
    
    const out: TestCaseResult[] = [];
    const passed: string[] = [];
    const failed: Record<string, string> = {};
    const skipped: string[] = [];
    
    for (const [testName, entry] of testMap.entries()) {
      if (entry.action === 'pass') {
        passed.push(testName);
      } else if (entry.action === 'fail') {
        const errorDetail = entry.outputs.join('\n');
        failed[testName] = errorDetail;
      } else if (entry.action === 'skip') {
        skipped.push(testName);
      }
    }
    
    // Log the test results with proper formatting
    console.log(`[ANALYZER] Processing ${testFileName}:`);
    console.log(`[ANALYZER]   Passed: ${passed.length} tests - ${passed.join(', ')}`);
    console.log(`[ANALYZER]   Failed: ${Object.keys(failed).length} tests - ${Object.keys(failed).join(', ')}`);
    console.log(`[ANALYZER]   Skipped: ${skipped.length} tests - ${skipped.join(', ')}`);
    
    // If there are failures, print details
    if (Object.keys(failed).length > 0) {
      console.log(`[ANALYZER] Failure details for ${testFileName}:`);
      for (const [testName, errorDetail] of Object.entries(failed)) {
        console.log(`[ANALYZER]   - ${testName}:`);
        console.log(`[ANALYZER]     ${errorDetail.substring(0, 200)}...`);
      }
    }
    
    // Check if no tests were found - indicates build error or other issue
    if (testMap.size === 0) {
      console.log(`[ANALYZER] No test results found in log, checking for build errors...`);
      const content = fs.readFileSync(logPath, 'utf-8');
      const hasError = content.includes('FAIL') || content.includes('build failed') || content.includes('cannot find');
      
      if (hasError) {
        console.log(`[ANALYZER] Build/compilation error detected`);
        // Return a single error entry for the file
        out.push({
          codeName: `${testFileName}::BuildError`,
          status: 'Errored',
          errorType: 'BuildError',
          detail: 'Test file failed to compile or build',
          testFile: testFilePath,
          logPath,
          focalModule,
          focalFunction,
          focalRandom,
          sourceFile,
          implementationOrigin: null,
          importLine: null,
          modulePath: null
        });
        return out;
      }
    }
    
    // Create TestCaseResult for passed tests
    for (const testName of passed) {
      out.push({
        codeName: testName,
        status: 'Passed',
        errorType: null,
        detail: '',
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      });
    }
    
    // Create TestCaseResult for failed tests
    for (const [testName, errorDetail] of Object.entries(failed)) {
      out.push({
        codeName: testName,
        status: 'Failed',
        errorType: 'TestFailure',
        detail: errorDetail,
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      });
    }
    
    // Create TestCaseResult for skipped tests (optional)
    for (const testName of skipped) {
      out.push({
        codeName: testName,
        status: 'Skipped',
        errorType: null,
        detail: 'Test skipped',
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      });
    }
    
    return out;
  }

  private parseJavaSurefireSummaryFromLog(logContent: string): { testsRun: number; failures: number; errors: number; skipped: number; classFqn: string | null } | null {
    const m = logContent.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)(?:.*?\bin\s+([A-Za-z0-9_.$]+))?/i);
    if (!m) {
      return null;
    }
    return {
      testsRun: Number(m[1]),
      failures: Number(m[2]),
      errors: Number(m[3]),
      skipped: Number(m[4]),
      classFqn: m[5] ?? null,
    };
  }

  private shortJavaClassNameFromFqnOrFile(classFqn: string | null, testFilePath: string): string {
    if (classFqn) {
      const parts = classFqn.split('.');
      return parts[parts.length - 1] || classFqn;
    }
    const base = path.basename(testFilePath);
    if (base.endsWith('.java')) {
      return base.slice(0, -'.java'.length);
    }
    return base;
  }

  private parseJavaSurefireFailureBlocks(logContent: string, preferredClassName: string): Array<{ methodName: string; detail: string; errorType: string }> {
    const lines = logContent.split(/\r?\n/);
    const blocks: Array<{ start: number; end: number; methodName: string | null; errorType: string }> = [];

    const isHeaderStart = (line: string): RegExpMatchArray | null => {
      // Example: [ERROR]   PosixParser_burstToken_6314Test.testStopAtNonOption:46 ... ==> ...
      return line.match(/^\[ERROR\]\s+(?:\d+\)\s+)?([A-Za-z0-9_.$]+)\.([A-Za-z0-9_$]+)(?::\d+)?\b/);
    };

    const isAssertionStart = (line: string): boolean => {
      return line.includes('org.opentest4j.AssertionFailedError') || line.includes('java.lang.AssertionError');
    };

    let currentStart: number | null = null;
    let currentMethod: string | null = null;
    let currentErrorType: string = 'TestFailure';

    const closeCurrent = (endIdxExclusive: number) => {
      if (currentStart === null) {
        return;
      }
      blocks.push({
        start: currentStart,
        end: Math.max(currentStart, endIdxExclusive - 1),
        methodName: currentMethod,
        errorType: currentErrorType,
      });
      currentStart = null;
      currentMethod = null;
      currentErrorType = 'TestFailure';
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const header = isHeaderStart(line);
      if (header) {
        closeCurrent(i);
        const cls = header[1].split('.').pop() || header[1];
        const method = header[2];
        currentStart = i;
        currentMethod = method;
        currentErrorType = line.includes('Assertion') ? 'AssertionError' : 'TestFailure';
        continue;
      }

      if (currentStart === null && isAssertionStart(line)) {
        currentStart = i;
        currentMethod = null;
        currentErrorType = line.includes('AssertionFailedError') ? 'AssertionFailedError' : 'AssertionError';
        continue;
      }

      // Multiple failures sometimes appear as repeated AssertionFailedError blocks (without a header line).
      // Treat each new assertion start as a new block boundary.
      if (currentStart !== null && isAssertionStart(line) && i !== currentStart) {
        closeCurrent(i);
        currentStart = i;
        currentMethod = null;
        currentErrorType = line.includes('AssertionFailedError') ? 'AssertionFailedError' : 'AssertionError';
        continue;
      }

      if (currentStart !== null) {
        // Try to discover method name from stack trace lines:
        // Example: at org.apache.commons.csv.CSVPrinter_printRecord_1126Test.testPrintMultipleRecords(CSVPrinter_printRecord_1126Test.java:54)
        const stackM = line.match(/\bat\s+[A-Za-z0-9_.$]+\.(\w+)\.(\w+)\(/);
        if (stackM) {
          const cls = stackM[1];
          const method = stackM[2];
          if (!currentMethod) {
            if (cls === preferredClassName || cls.endsWith('Test')) {
              currentMethod = method;
            }
          }
        }
      }
    }

    closeCurrent(lines.length);

    // Materialize blocks, ensure methodName exists, and trim noise.
    const out: Array<{ methodName: string; detail: string; errorType: string }> = [];
    let unknownIdx = 1;
    for (const b of blocks) {
      const raw = lines.slice(b.start, b.end + 1).join('\n').trim();
      if (!raw) {
        continue;
      }
      const methodName = (b.methodName && b.methodName.trim()) ? b.methodName.trim() : `UnknownFailure-${unknownIdx++}`;
      out.push({ methodName, detail: raw, errorType: b.errorType });
    }
    return out;
  }

  private extractJavaTestResults(logPath: string, testFilePath: string): TestCaseResult[] {
    const testFileName = path.basename(testFilePath);
    
    // Parse test file name for focal method info
    const parsed = this.parseJavaTestFileName(testFileName);
    const focalModule = parsed?.focalModule || null;
    const focalFunction = parsed?.focalFunction || null;
    const focalRandom = parsed?.focalRandom || null;
    
    // Get source file mapping
    const matchedSource = this.findSourceFileForTest(testFilePath, focalFunction);
    const sourceFile = matchedSource || null;
    
    // Determine JUnit XML path from log path
    // logPath: /path/to/logs/OptionBuilder_withType_5438Test.java.log
    // junitPath: /path/to/junit/OptionBuilder_withType_5438Test.java.xml
    const logsDir = path.dirname(logPath);
    const junitDir = path.join(path.dirname(logsDir), 'junit');
    const junitPath = path.join(junitDir, testFileName + '.xml');
    
    console.log(`[ANALYZER] Processing Java test: ${testFileName}`);
    console.log(`[ANALYZER]   Log path: ${logPath}`);
    console.log(`[ANALYZER]   JUnit XML path: ${junitPath}`);

    if (!fs.existsSync(logPath)) {
      return [];
    }
    const logContent = fs.readFileSync(logPath, 'utf-8');
    if (!logContent) {
      return [];
    }

    const summary = this.parseJavaSurefireSummaryFromLog(logContent);
    const testCasesOfSummary = (summary?.testsRun ?? 0) + (summary?.failures ?? 0) + (summary?.errors ?? 0) + (summary?.skipped ?? 0);
    const isSummaryInvalid = !summary || testCasesOfSummary === 0;
    const className = this.shortJavaClassNameFromFqnOrFile(summary?.classFqn ?? null, testFilePath);
    const hasErrorSign = logContent.includes('COMPILATION ERROR')

    // Second case: No "Tests run:" / "Failures:" summary => treat as one errored testcase.
    if (isSummaryInvalid || hasErrorSign) {
      return [{
        codeName: `${className}-1`,
        status: 'Errored',
        errorType: hasErrorSign ? 'COMPILATION ERROR' : 'TestError',
        detail: logContent.trim(),
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      }];
    }

    const failureBlocks = this.parseJavaSurefireFailureBlocks(logContent, className);

    // Build testcase list:
    // - failed tests: use method names discovered in log
    // - passed/skipped/error tests: synthesize placeholder names (className-1, className-2, ...)
    const out: TestCaseResult[] = [];

    // Failed tests with assertion logs
    const failedByMethod = new Map<string, { detail: string; errorType: string }>();
    for (const b of failureBlocks) {
      // Keep first block per method, append if duplicates
      const prev = failedByMethod.get(b.methodName);
      if (!prev) {
        failedByMethod.set(b.methodName, { detail: b.detail, errorType: b.errorType });
      } else if (prev.detail !== b.detail) {
        failedByMethod.set(b.methodName, { detail: `${prev.detail}\n\n${b.detail}`.trim(), errorType: prev.errorType || b.errorType });
      }
    }

    const failedNames = Array.from(failedByMethod.keys());
    for (const methodName of failedNames) {
      const payload = failedByMethod.get(methodName)!;
      out.push({
        codeName: methodName,
        status: 'Failed',
        errorType: payload.errorType || 'TestFailure',
        detail: payload.detail,
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      });
    }

    // If we couldn't discover all failed methods, synthesize remaining failures.
    const missingFailures = Math.max(0, summary.failures - failedNames.length);
    for (let i = 1; i <= missingFailures; i++) {
      out.push({
        codeName: `UnknownFailure-${i}`,
        status: 'Failed',
        errorType: 'TestFailure',
        detail: '',
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      });
    }

    // Placeholders for passed tests
    const passedCount = Math.max(0, summary.testsRun - summary.failures - summary.errors - summary.skipped);
    for (let i = 1; i <= passedCount; i++) {
      out.push({
        codeName: `${className}-${i}`,
        status: 'Passed',
        errorType: null,
        detail: '',
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      });
    }

    // Placeholders for skipped tests (rare; we don't know method names)
    for (let i = 1; i <= Math.max(0, summary.skipped); i++) {
      out.push({
        codeName: `${className}-skipped-${i}`,
        status: 'Skipped',
        errorType: null,
        detail: 'Test skipped',
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      });
    }

    // Placeholders for errored tests (we don't know method names reliably from logs)
    for (let i = 1; i <= Math.max(0, summary.errors); i++) {
      out.push({
        codeName: `${className}-error-${i}`,
        status: 'Errored',
        errorType: 'TestError',
        detail: '',
        testFile: testFilePath,
        logPath,
        focalModule,
        focalFunction,
        focalRandom,
        sourceFile,
        implementationOrigin: null,
        importLine: null,
        modulePath: null
      });
    }

    return out;
  }
  
  private extractResultsFromLog(logPath: string, testFilePath: string): TestCaseResult[] {
    // Branch based on language
    if (this.language === 'go') {
      return this.extractGoTestResults(logPath, testFilePath);
    }

    if (this.language === 'java') {
      return this.extractJavaTestResults(logPath, testFilePath);
    }

    // Python test parsing (existing logic)
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
        files[fkey].sourceFile = matchedSource;
        files[fkey].note = `Matched source: ${path.relative(workspaceRoot, matchedSource)}`;
        console.log(`[ANALYZER] Matched source: ${path.relative(workspaceRoot, matchedSource)}`);
      } else {
        throw new Error(`No source mapping found for this test file: ${res.testFile.path}`);
      }

      const tcrs = this.extractResultsFromLog(res.logPath, res.testFile.path);
      if (!tcrs.length) {
        files[fkey].note = 'No test results found in log file.';
        continue;
      }

      // if all tcr.status is Passed, then files[fkey].status = 'Passed'
      if (tcrs.every(tcr => tcr.status === 'Passed')) {
        files[fkey].status = 'Passed';
      } else {
        files[fkey].status = 'Failed';
      }
      files[fkey].symbolName = tcrs[0].focalFunction || '';
      console.log(`[ANALYZER] Symbol name: ${files[fkey].symbolName}`);
      console.log(`[ANALYZER] Source file: ${files[fkey].sourceFile}`);
      if (files[fkey].mutAnalysis === null) {
        console.log(`[ANALYZER] Analyzing MUT for ${files[fkey].symbolName} in ${files[fkey].sourceFile}`);
        files[fkey].mutAnalysis = await mutAnalyzer(files[fkey].sourceFile, files[fkey].symbolName);
      }
      console.log(`[ANALYZER] MUT analysis: ${JSON.stringify(files[fkey].mutAnalysis)}`);
      for (const tcr of tcrs) {
        tests[tcr.codeName] = tcr;
        files[fkey].testcases.push(tcr);
        const prev = files[fkey].counts[tcr.status] ?? 0;
        files[fkey].counts[tcr.status] = prev + 1;
      }
    }

    // Examination phase: analyze assertion errors for redefined symbols
    // Only available when running in VSCode extension context
    // if (examineTestCasesBatch && filterTestCasesForExamination) {
    //   console.log('[ANALYZER] Starting examination phase for assertion errors...');
    //   const allTestCases = Object.values(tests);
    //   const testCasesToExamine = filterTestCasesForExamination(allTestCases);

    //   if (testCasesToExamine.length > 0) {
    //     const examinations = await examineTestCasesBatch(
    //       testCasesToExamine,
    //       (tc: TestCaseResult) => this.findSourceFileForTest(tc.testFile, tc.focalFunction || null),
    //       (tc: TestCaseResult) => tc.focalFunction || null,
    //       5 // concurrency
    //     );

    //     // Attach examination results back to test cases
    //     for (const exam of examinations) {
    //       const testCase = tests[exam.testCaseName];
    //       if (testCase) {
    //         testCase.examination = exam;
    //       }
    //     }

    //     const redefinedErrorCases = testCasesToExamine.filter((tc: TestCaseResult) => tc.examination && tc.examination.hasRedefinedSymbols);
    //     console.log(`[ANALYZER] Examination phase complete: ${examinations.length} test cases examined`);
    //     console.log(`[ANALYZER] REDEFINE error cases: ${redefinedErrorCases.length} test cases examined`);
    //     for ( const tc of redefinedErrorCases) {
    //       console.log(`[ANALYZER] REDEFINE error case: ${tc.codeName}`);
    //       console.log(`[ANALYZER]   Test file: ${tc.testFile}`);
    //       console.log(`[ANALYZER]   Source file: ${tc.sourceFile}`);
    //       console.log(`[ANALYZER]   Symbol name: ${tc.focalFunction}`);
    //       console.log(`[ANALYZER]   Error detail: ${tc.detail}`);
    //     }


    //     const unknownErrorCases = testCasesToExamine.filter((tc: TestCaseResult) => tc.examination && !tc.examination.hasRedefinedSymbols);
    //     console.log(`\n=====================================================\n`);
    //     console.log(`[ANALYZER] Still unknown error cases: ${unknownErrorCases.length} test cases examined`);
    //     for ( const tc of unknownErrorCases) {
    //       console.log(`[ANALYZER] Unknown error case: ${tc.codeName}`);
    //       console.log(`[ANALYZER]   Test file: ${tc.testFile}`);
    //       console.log(`[ANALYZER]   Source file: ${tc.sourceFile}`);
    //       console.log(`[ANALYZER]   Symbol name: ${tc.focalFunction}`);
    //       console.log(`[ANALYZER]   Error detail: ${tc.detail}`);
    //     }
    //   } else {
    //     console.log('[ANALYZER] No assertion errors to examine');
    //   }
    // } else {
    //   console.log('[ANALYZER] Examination phase skipped (requires VSCode extension API)');
    // }

    // Save file analysis to JSON for further analysis
    const fileAnalysisPath = path.join(outputDir, 'file_analysis.json');
    try {
      fs.writeFileSync(fileAnalysisPath, JSON.stringify(files, null, 2), 'utf-8');
      console.log(`[ANALYZER] File analysis saved to: ${fileAnalysisPath}`);
    } catch (e) {
      console.warn(`[ANALYZER] Failed to save file analysis to JSON: ${e}`);
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

