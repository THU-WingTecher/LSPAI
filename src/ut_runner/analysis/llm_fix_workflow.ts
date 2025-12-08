import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { invokeLLM } from '../../invokeLLM';
import { parseCode } from '../../lsp/utils';
import { makeExecutor } from '../executor';
import { Analyzer } from '../analyzer';
import { buildEnv } from '../runner';
import { TestCaseResult, ExaminationResult } from '../types';
import { LLMLogs } from '../../log';
import { getSymbolFromDocument } from '../../lsp/symbol';
import { 
  categorizeAssertionError, 
  loadCategoryStructure, 
  saveCategoryStructure, 
  updateCategoryStructure,
  CategoryStructure,
  CategorizationRequest
} from './categorizer';
import { 
  logCategorizationDiff
} from './category_diff_logger';
import { logFixDiff, exportFixDiffSummary, exportDetailedFixReport, generateSimpleDiffReport } from './fix_diff_reporter';
import { getPythonExtraPaths } from '../../lsp/helper';
import { assert } from 'console';

interface ExaminationResults {
  summary: {
    total_examined: number;
    with_redefined_symbols: number;
    examination_errors: number;
  };
  tests: Array<{
    test_case: string;
    test_file: string;
    status: string;
    examination?: ExaminationResult | null;
    symbolName?: string;
    sourceCode?: string;
  }>;
}

export interface LLMFixOptions {
  language?: string;
  pythonExe?: string;
  jobs?: number;
  timeoutSec?: number;
  pythonpath?: string[];
  env?: NodeJS.ProcessEnv;
}

interface FixAttempt {
  round: number;
  prompt: string;
  response: string;
  fixedCode: string;
  testResult: 'pass' | 'fail' | 'error';
  errorMessage?: string;
}

/**
 * LLM-based workflow to fix assertion errors in test cases
 * 
 * This workflow:
 * 1. Loads examination results from JSON
 * 2. For each test case with assertion errors (not yet examined with redefined symbols):
 *    - Collects source code and test code
 *    - Generates assertion errors
 *    - Invokes LLM to analyze and suggest fixes
 *    - Replaces test code with fixed version
 *    - Reruns test to verify fix
 *    - Retries up to 3 times if fix fails
 * 3. Saves fix history to output directory
 */
export class LLMFixWorkflow {
  private readonly inputJsonPath: string;
  private readonly outputDir: string;
  private readonly options: Required<LLMFixOptions>;
  private fixHistory: Map<string, FixAttempt[]> = new Map();
  private analyzer: Analyzer;
  private categoryStructure: CategoryStructure;
  private readonly categoryStructurePath: string;
  private readonly diffLogPath: string;
  private readonly fixDiffReportPath: string;
  private readonly surgenDir: string;
  constructor(
    inputJsonPath: string,
    outputDir: string,
    options: LLMFixOptions = {}
  ) {
    this.inputJsonPath = inputJsonPath;
    this.outputDir = outputDir;
    this.surgenDir = path.join(outputDir, 'surgen');
    // Set defaults similar to runPipeline
    this.options = {
      language: options.language || 'python',
      pythonExe: options.pythonExe || process.execPath,
      jobs: options.jobs ?? 16,
      timeoutSec: options.timeoutSec ?? 30,
      pythonpath: options.pythonpath || [],
      env: buildEnv(options.pythonpath || [])
    };
    // console.log("options: ", this.options);
    // Create analyzer instance to reuse its methods
    this.analyzer = new Analyzer(this.options.language);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Initialize category structure paths
    this.categoryStructurePath = path.join(outputDir, 'category_structure.json');
    this.diffLogPath = path.join(outputDir, 'category_diff_log.json');
    this.fixDiffReportPath = path.join(outputDir, 'fix_diff_report.json');
    
    // Load existing category structure or initialize with defaults
    this.categoryStructure = loadCategoryStructure(this.categoryStructurePath);
  }

  private copyTestFileToSurgenDir(testFile: string): string {
    const testFileName = path.basename(testFile);
    const surgenPath = path.join(this.surgenDir, testFileName);
    fs.mkdirSync(this.surgenDir, { recursive: true });
    fs.copyFileSync(testFile, surgenPath);
    return surgenPath;
  }

  private removeTestFileFromSurgenDir(testFile: string): string {
    const surgenFileName = path.basename(testFile);
    const originalPath = path.join(this.outputDir, surgenFileName);
    fs.rmSync(testFile, { recursive: true });
    return originalPath;
  }
  /**
   * Load examination results from JSON file
   */
  private loadExaminationResults(): ExaminationResults {
    const content = fs.readFileSync(this.inputJsonPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Extract source code from examination data
   */
  private async extractSourceCode(testEntry: any, sourceDocument: vscode.TextDocument): Promise<string> {

    const symbol = await getSymbolFromDocument(sourceDocument, testEntry.symbol_name);
    if (!symbol) {
      throw new Error(`Symbol ${testEntry.symbol_name} not found in ${testEntry.source_file}`);
    }
    return sourceDocument.getText(symbol.range);
  }

  /**
   * Get test code from test file
   */
  private async getPythonTestCode(testFile: string, testCaseName: string): Promise<string> {
    if (!fs.existsSync(testFile)) {
      throw new Error(`Test file not found: ${testFile}`);
    }

    const testContent = fs.readFileSync(testFile, 'utf-8');
    
    // Try to extract the specific test function
    const lines = testContent.split('\n');
    const testCasePattern = new RegExp(`def\\s+${testCaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    
    for (let i = 0; i < lines.length; i++) {
      if (testCasePattern.test(lines[i])) {
        let functionCode = lines[i];
        let indent = lines[i].match(/^(\s*)/)?.[0].length || 0;
        
        for (let j = i + 1; j < lines.length; j++) {
          const lineIndent = lines[j].match(/^(\s*)/)?.[0].length ?? 0;
          if (lines[j].trim() !== '' && lineIndent <= indent) {
            break;
          }
          functionCode += '\n' + lines[j];
        }
        
        return functionCode;
      }
    }
    
    // If test function not found, return full file
    return testContent;
  }

  private getAssertionErrors(testEntry: any): string {
    return testEntry.detailError;
  }

  /**
   * Create LLM prompt for fixing test code
   */
  private createRedeclaredErrorFixPrompt(
    sourceCode: string,
    testCode: string,
    assertionErrors: string,
    symbolName: string,
    examinationResult: ExaminationResult,
    previousAttempts: FixAttempt[] = []
  ): any[] {
    if (!sourceCode || !testCode) {
      throw new Error('Source code and test code are required');
    }

      const systemPrompt = `
  You are an expert in finding problematic code implementation in unit test. 
  Currently, we have an assertion error in the test code that we know is wrong assertion error.
  Your task is to fix ONLY import errors in the test code.
  Focus on:
  - Unnecessary redeclared constant / functions / class 
  - All refered variables that is related to redeclared constant / functions / class
  
  Do NOT change:
  - Test logic or assertions
  - Non-import related code
  - Test structure
  
  Return the complete fixed test code wrapped in \`\`\` code blocks.`;
  
      // Build fix history section
      let fixHistorySection = '';
      if (previousAttempts.length > 0) {
        fixHistorySection = '\n\nPrevious Fix Attempts:\n';
        for (let i = 0; i < previousAttempts.length; i++) {
          const prevAttempt = previousAttempts[i];
          const prevTestCode = i === 0 ? JSON.parse(prevAttempt.prompt).testCode : previousAttempts[i - 1].fixedCode;
          const diff = generateSimpleDiffReport(prevTestCode, prevAttempt.fixedCode);
          
          fixHistorySection += `\nAttempt ${prevAttempt.round}:\n`;
          fixHistorySection += `Result: ${prevAttempt.testResult}\n`;
          if (prevAttempt.errorMessage) {
            fixHistorySection += `Error: ${prevAttempt.errorMessage.substring(0, 200)}${prevAttempt.errorMessage.length > 200 ? '...' : ''}\n`;
          }
          fixHistorySection += `\nCode Changes:\n\`\`\`\n${diff}\n\`\`\`\n`;
        }
        fixHistorySection += '\nPlease learn from these previous attempts and provide a better fix.\n';
      }
  
      const userPrompt = `Fix and Find problematic code implementation in the following test code.
  
  Test Case: ${examinationResult.testCaseName}
  
  ${sourceCode ? `Source Code:
  \`\`\`
  ${sourceCode}
  \`\`\`
  
  ` : ''}Test Code (fix import errors only):
  \`\`\`
  ${testCode}
  \`\`\`
  ${fixHistorySection}
  Please fix ONLY import errors and return the complete fixed test code.`;
  
      return [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userPrompt }
      ];
  }

  /**
   * Create LLM prompt for fixing test code
   */
  private createAssertionErrorFixPrompt(
    sourceCode: string,
    testCode: string,
    assertionErrors: string,
    symbolName: string,
    previousAttempts: FixAttempt[] = []
  ): any[] {
    const systemPrompt = `You are an expert software testing assistant. Your task is to analyze assertion errors in unit tests and suggest fixes.

When analyzing test failures:
1. Compare the test code with the source code to understand what is being tested
2. Identify the root cause of assertion errors
3. Suggest fixed test code that:
   - Correctly tests the intended functionality
   - Matches the actual behavior of the source code
   - Uses appropriate assertions for the expected behavior

Be concise and focused on fixing the specific assertion error.
You first explain the root cause of assertion errors.
After that, you suggest the fixed test code.
Test code should be wrapped in \`\`\` code blocks.
`
    // Build fix history section
    let fixHistorySection = '';
    if (previousAttempts.length > 0) {
      fixHistorySection = '\n\nPrevious Fix Attempts:\n';
      for (let i = 0; i < previousAttempts.length; i++) {
        const prevAttempt = previousAttempts[i];
        const prevTestCode = i === 0 ? JSON.parse(prevAttempt.prompt).testCode : previousAttempts[i - 1].fixedCode;
        const diff = generateSimpleDiffReport(prevTestCode, prevAttempt.fixedCode);
        
        fixHistorySection += `\nAttempt ${prevAttempt.round}:\n`;
        fixHistorySection += `Result: ${prevAttempt.testResult}\n`;
        if (prevAttempt.errorMessage) {
          fixHistorySection += `Error: ${prevAttempt.errorMessage.substring(0, 200)}${prevAttempt.errorMessage.length > 200 ? '...' : ''}\n`;
        }
        fixHistorySection += `\nCode Changes:\n\`\`\`\n${diff}\n\`\`\`\n`;
      }
      fixHistorySection += '\nPlease learn from these previous attempts and provide a better fix.\n';
    }

    const userPrompt = `Given the following source code and test code with assertion errors, suggest a fixed version of the test.

Focal Symbol: ${symbolName}

Source Code:
\`\`\`python
${sourceCode}
\`\`\`

Test Code (with errors):
\`\`\`python
${testCode}
\`\`\`

Assertion Errors:
\`\`\`
${assertionErrors}
\`\`\`
${fixHistorySection}
Please analyze why the assertion error occurred and provide the fixed test code.
you should only return the test function which startswith "def" and code should be wrapped in \`\`\` code blocks.
For example, 
\`\`\`
def test_fixed(arg1, ...):
    assert True
\`\`\`
`;
console.log("userPrompt: ", userPrompt);
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Fix test code using LLM
   */
  private async fixTestWithLLM(
    sourceCode: string,
    testCode: string,
    assertionErrors: string,
    symbolName: string,
    attempt: number,
    examinationResult: ExaminationResult,
    testCaseName: string,
    cate: string = "general"
  ): Promise<string | null> {
    console.log(`[LLM_FIX] Round ${attempt}: Invoking LLM for ${symbolName}`);

    // Get previous attempts from fix history
    const allAttempts = this.fixHistory.get(testCaseName) || [];
    const previousAttempts = allAttempts.filter(a => 
      a.prompt.includes(`"category":"${cate}"`)
    );

    let prompt: any[] = [];
    if (cate === "general") {
      prompt = this.createAssertionErrorFixPrompt(sourceCode, testCode, assertionErrors, symbolName, previousAttempts);
    } else if (cate === "redefined") {
      prompt = this.createRedeclaredErrorFixPrompt(sourceCode, testCode, assertionErrors, symbolName, examinationResult, previousAttempts);
    } else {
      throw new Error(`Invalid category: ${cate}`);
    }
    const logObj: LLMLogs = { tokenUsage: '', result: '', prompt: prompt[1].content, model: '' };

    try {
      const response = await invokeLLM(prompt, logObj);
      const fixedCode = parseCode(response);
      
      console.log(`[LLM_FIX] LLM response received, fixed code length: ${fixedCode.length}`);
      
      return fixedCode;
    } catch (error) {
      console.error(`[LLM_FIX] LLM invocation failed:`, error);
      return null;
    }
  }

  /**
   * Save fixed code to output directory preserving the original filename
   * This preserves the original test file and saves the fixed version to outputDir
   */
  private saveFixedCodeToOutputDir(testFile: string, fixedCode: string): string {
    const testFileName = path.basename(testFile);
    const outputPath = path.join(this.outputDir, testFileName);
    
    // Ensure output directory exists
    fs.mkdirSync(this.outputDir, { recursive: true });
    
    // Write fixed code to output directory
    fs.writeFileSync(outputPath, fixedCode, 'utf-8');
    
    console.log(`[LLM_FIX] Saved fixed code to ${outputPath}`);
    return outputPath;
  }

  /**
   * Insert test function into test file
   * Handles both standalone test functions and class-based unittest structures
   * Now saves to outputDir instead of modifying original file
   */
  async addTestFunction(
    testFile: string,
    fixedCode: string
  ): Promise<string> {
    const testContent = fs.readFileSync(testFile, 'utf-8');
    const lines = testContent.split('\n');
    
    // Detect if this is a class-based test
    let insertIdx = -1;
    let classIndent = '    ';
    
    // Find test classes (class Test* or class *_test)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check for test class definition (Test..., unittest.TestCase inheritance, or _..._test naming)
      const classMatch = line.match(/^(\s*)class\s+(\w+)\s*\(/);
      if (classMatch) {
        classIndent = classMatch[1];
        
        // Find the last method/statement inside the class
        // Look for the last line that has more indentation than the class
        let lastMethodLine = i + 1;
        
        for (let j = i + 1; j < lines.length; j++) {
          const currentLine = lines[j];
          
          if (currentLine.trim() === '') {
            continue; // Skip empty lines
          }
          
          const lineIndent = currentLine.match(/^(\s*)/)?.[0] || '';
          
          // Check if we've left the class (module-level or another class)
          const isModuleLevel = lineIndent.length === classIndent.length && lineIndent === classIndent;
          const isNextClass = isModuleLevel && currentLine.match(/^(\s*)class\s/) !== null;
          const isMainBlock = currentLine.trim().startsWith('if __name__') || 
                              currentLine.trim().startsWith('if __main__');
          
          if (isNextClass || isMainBlock) {
            // Insert before this line (j - 1 to insert before it)
            insertIdx = j;
            break;
          }
          
          // If line is more indented than class, it's inside the class
          if (lineIndent.length > classIndent.length) {
            lastMethodLine = j + 1; // Use j + 1 to insert after this line
          } else if (lineIndent.length <= classIndent.length && lineIndent !== classIndent) {
            // We hit something at less indent or same indent with different whitespace
            insertIdx = lastMethodLine;
            break;
          }
        }
        
        if (insertIdx === -1) {
          insertIdx = lastMethodLine;
        }
        break;
      }
    }
    
    // If no test class found, check for standalone test functions
    if (insertIdx === -1) {
      // Look for the last test function or end of file
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith('def test_') || 
            lines[i].trim().startsWith('if __name__') ||
            lines[i].trim() === '') {
          insertIdx = i + 1;
          break;
        }
      }
      
      if (insertIdx === -1) {
        insertIdx = lines.length;
      }
    }
    
    // Ensure the fixed code has proper indentation
    const fixedLines = fixedCode.split('\n');
    
    // Add indentation if inside a class
    let indentedFixedCode: string;
    const methodIndent = classIndent + '    ';
    indentedFixedCode = fixedLines.map(line => {
      // Don't add extra indent to empty lines
      if (line.trim() === '') {
        return classIndent; // Use class indent for empty lines
      }
      return methodIndent + line;
    }).join('\n');
    
    // Insert the code
    const newLines = [
      ...lines.slice(0, insertIdx),
      indentedFixedCode,
      ...lines.slice(insertIdx)
    ];
    
    const newContent = newLines.join('\n');
    
    // Save to outputDir instead of modifying original file
    const outputPath = this.saveFixedCodeToOutputDir(testFile, newContent);
    
    console.log(`[LLM_FIX] Added test function to ${outputPath}`);
    console.log(`[LLM_FIX] Inserted at line ${insertIdx + 1}`);
    console.log(`[LLM_FIX] Original file preserved: ${testFile}`);
    
    return outputPath;
  }
  
  /**
   * Check if a specific test function passed by parsing the log
   * Reuses Analyzer methods instead of reimplementing logic
   */
  private checkTestFunctionPassed(logPath: string, testCaseName: string, testFilePath: string): boolean {
    if (!fs.existsSync(logPath)) {
      return false;
    }
    
    const content = fs.readFileSync(logPath, 'utf-8');
    
    // Use analyzer methods to extract test results
    const passed = this.analyzer.extractPassedFromSession(content);
    const failed = this.analyzer.extractFailedFromSummary(content);
    const errors = this.analyzer.extractErrorFromSummary(content);
    
    // Check if test function passed (can be matched in different formats)
    const testFileName = path.basename(testFilePath);
    const searchPatterns = [
      `${testFileName}::.*::${testCaseName}`,
      testCaseName
    ];
    
    for (const pattern of searchPatterns) {
      const regex = new RegExp(pattern, 'i');
      
      // Check in passed set
      for (const passedTest of passed) {
        if (regex.test(passedTest)) {
          return true;
        }
      }
      
      // Check in failed
      for (const failedTest of Object.keys(failed)) {
        if (regex.test(failedTest)) {
          return false;
        }
      }
      
      // Check in errors
      for (const errorTest of Object.keys(errors)) {
        if (regex.test(errorTest)) {
          return false;
        }
      }
    }
    
    return false;
  }

  /**
   * Run test and check if a specific test function passes
   */
  private async runTestAndCheck(testFile: string, testCaseName: string): Promise<{ passed: boolean; error?: string }> {
    console.log(`[LLM_FIX] Running test: ${testCaseName} in ${testFile}`);
    
    // Create temporary directory for this run
    const runDir = path.join(this.outputDir, 'fix_runs');
    fs.mkdirSync(runDir, { recursive: true });
    
    const logsDir = path.join(runDir, 'logs');
    const junitDir = path.join(runDir, 'junit');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(junitDir, { recursive: true });
    
    try {
      const executor = this.options.language === 'python'
        ? makeExecutor(this.options.language, { 
            pythonExe: this.options.pythonExe, 
            logsDir, 
            junitDir, 
            timeout: this.options.timeoutSec,
            env: this.options.env,
            pythonpath: this.options.pythonpath
          })
        : makeExecutor(this.options.language, { 
            logsDir, 
            junitDir, 
            timeout: this.options.timeoutSec,
            env: this.options.env
          });

      const testFiles = [{ path: testFile, language: this.options.language }];
      const results = await executor.executeMany(testFiles, this.options.jobs);
      
      if (results.length === 0) {
        return { passed: false, error: 'No test results' };
      }
      
      const result = results[0];
      const logPath = result.logPath;
      if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf-8');
        console.log(`\n[LLM_FIX][TRACE] ---- Begin log for ${testCaseName} (${testFile}) ----`);
        console.log(logContent);
        console.log(`[LLM_FIX][TRACE] ---- End log for ${testCaseName} (${testFile}) ----\n`);
      } else {
        console.log(`[LLM_FIX][TRACE] Log file missing for ${testCaseName}: ${logPath}`);
      }
      
      // Check if the specific test function passed using analyzer methods
      const passed = this.checkTestFunctionPassed(logPath, testCaseName, testFile);
      
      if (passed) {
        console.log(`[LLM_FIX] Test function ${testCaseName} passed!`);
        return { passed: true };
      }
      
      // Read error from log for this specific test
      const error = fs.existsSync(logPath)
        ? this.extractTestErrorFromLog(logPath, testCaseName)
        : 'Test execution failed';
      
      return { passed: false, error };
    } catch (error) {
      return { passed: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  
  /**
   * Extract error for a specific test function from the log
   * Reuses analyzer's extractFailedFromSummary method
   */
  private extractTestErrorFromLog(logPath: string, testCaseName: string): string {
    if (!fs.existsSync(logPath)) {
      return 'Log file not found';
    }
    
    const content = fs.readFileSync(logPath, 'utf-8');
    
    // Use analyzer's method to extract failures
    const failed = this.analyzer.extractFailedFromSummary(content);
    const errors = this.analyzer.extractErrorFromSummary(content);
    
    // Search for the specific test function error
    const searchPatterns = [
      new RegExp(`.*::.*::${testCaseName}`, 'i'),
      new RegExp(testCaseName, 'i')
    ];
    
    for (const pattern of searchPatterns) {
      for (const [testName, errorDetail] of Object.entries(failed)) {
        if (pattern.test(testName)) {
          return errorDetail || 'Test failed';
        }
      }
      
      for (const [testName, errorDetail] of Object.entries(errors)) {
        if (pattern.test(testName)) {
          return errorDetail || 'Test error';
        }
      }
    }
    
    // Fallback: return a truncated portion of the log
    return content.substring(Math.max(0, content.length - 500));
  }

  /**
   * Check if a test case has already been successfully fixed (cache check)
   */
  private checkCache(testCaseName: string): FixAttempt | null {
    const historyFile = path.join(this.outputDir, 'fix_history.json');
    if (!fs.existsSync(historyFile)) {
      return null;
    }

    try {
      const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
      const attempts: FixAttempt[] = historyData[testCaseName];
      
      if (!attempts || !Array.isArray(attempts)) {
        return null;
      }

      // Find the first successful fix attempt
      for (const attempt of attempts) {
        if (attempt.testResult === 'pass') {
          console.log(`[LLM_FIX] Found cached successful fix for ${testCaseName}`);
          return attempt;
        }
      }
    } catch (error) {
      console.warn(`[LLM_FIX] Failed to read cache for ${testCaseName}:`, error);
    }

    return null;
  }

  /**
   * Load fix history from cache
   */
  private loadFixHistoryFromCache(): void {
    const historyFile = path.join(this.outputDir, 'fix_history.json');
    if (!fs.existsSync(historyFile)) {
      return;
    }

    try {
      const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
      for (const [testCaseName, attempts] of Object.entries(historyData)) {
        if (Array.isArray(attempts)) {
          this.fixHistory.set(testCaseName, attempts as FixAttempt[]);
        }
      }
      console.log(`[LLM_FIX] Loaded ${this.fixHistory.size} test cases from cache`);
    } catch (error) {
      console.warn(`[LLM_FIX] Failed to load fix history from cache:`, error);
    }
  }


  /**
   * Process a single test case
   * 
   * Workflow:
   * 1. If testEntry has redefined symbols -> try fixTestWithLLM(cate="redefined")
   * 2. If not fixed -> try fixTestWithLLM(cate="general")
   */
  private async processTestCase(testEntry: any): Promise<boolean> {
    const testCaseName = testEntry.test_case.split('::').at(-1);
    const testFile = testEntry.test_file;
    
    console.log(`\n[LLM_FIX] Processing: ${testCaseName}`);
    console.log("testEntry: ", testEntry);
    
    // Get required data
    const sourceDocument = await vscode.workspace.openTextDocument(testEntry.source_file);
    const sourceCode = await this.extractSourceCode(testEntry, sourceDocument);
    const originalTestCode = await this.getPythonTestCode(testFile, testCaseName);
    const symbolName = testEntry.symbolName || testEntry.symbol_name || 'unknown';
    
    if (!sourceCode || !originalTestCode) {
      console.log(`[LLM_FIX] Missing source or test code`);
      return false;
    }
    
    // const hasRedefinedSymbols = testEntry.examination?.hasRedefinedSymbols === true;
    
    // // Step 1: Try redefined subagent if applicable
    // if (hasRedefinedSymbols) {
    //   console.log(`[LLM_FIX] Detected redefined symbols, invoking redefined subagent`);
    //   const redefinedSuccess = await this.tryFixWithSubagent(
    //     testEntry, 
    //     testCaseName, 
    //     testFile, 
    //     sourceCode, 
    //     originalTestCode, 
    //     symbolName, 
    //     "redefined"
    //   );
      
    //   if (redefinedSuccess) {
    //     console.log(`[LLM_FIX] Successfully fixed with redefined subagent`);
    //     return true;
    //   }
      
    //   console.log(`[LLM_FIX] Redefined subagent failed, falling back to general subagent`);
    // }
    
    // Step 2: Try general subagent
    console.log(`[LLM_FIX] Invoking general subagent`);
    const generalSuccess = await this.tryFixWithSubagent(
      testEntry,
      testCaseName,
      testFile,
      sourceCode,
      originalTestCode,
      symbolName,
      "general"
    );
    
    if (generalSuccess) {
      console.log(`[LLM_FIX] Successfully fixed with general subagent`);
      return true;
    }
    
    console.log(`[LLM_FIX] All subagents failed for ${testCaseName}`);
    return false;
  }

  /**
   * Try fixing with a specific subagent category
   */
  private async tryFixWithSubagent(
    testEntry: any,
    testCaseName: string,
    testFile: string,
    sourceCode: string,
    originalTestCode: string,
    symbolName: string,
    category: "redefined" | "general"
  ): Promise<boolean> {
    // Specific tasks (redefined) get 1 chance, general tasks get multiple chances
    const maxAttempts = category === "redefined" ? 1 : 3;
    console.log(`[LLM_FIX] Starting ${category} subagent (max attempts: ${maxAttempts})`);
    
    let testCode = originalTestCode;
    let assertionErrors = this.getAssertionErrors(testEntry);
    
    // Check if we've already tried this category
    const fixHistory = this.fixHistory.get(testCaseName) || [];
    const categoryHistory = fixHistory.filter(attempt => 
      attempt.prompt.includes(`"category":"${category}"`)
    );
    
    if (categoryHistory.length >= maxAttempts) {
      console.log(`[LLM_FIX] Already exhausted attempts for category: ${category}`);
      return false;
    }
    
    let attempt = categoryHistory.length + 1;
    
    while (attempt <= maxAttempts) {
      console.log(`[LLM_FIX] ${category} subagent - Attempt ${attempt}/${maxAttempts}`);
      
      // Get fixed code from LLM
      const fixedCode = await this.fixTestWithLLM(
        sourceCode, 
        testCode, 
        assertionErrors, 
        symbolName, 
        attempt, 
        testEntry.examination,
        testCaseName, 
        category
      );
      
      if (!fixedCode) {
        console.log(`[LLM_FIX] Failed to get fixed code from LLM`);
        attempt++;
        continue;
      }
      
      // Add test function (saves to outputDir)
      let outputTestFile: string;
      if (category === "redefined") {
        // For "redefined", LLM generates the whole test file code
        // Save directly to output directory
        try {
          const testFileName = path.basename(testFile);
          outputTestFile = path.join(this.outputDir, testFileName);
          fs.writeFileSync(outputTestFile, fixedCode, 'utf-8');
          console.log(`[LLM_FIX] Saved complete test file to ${outputTestFile}`);
        } catch (error) {
          console.error(`[LLM_FIX] Failed to save test file:`, error);
          attempt++;
          continue;
        }
      } else {
        // For "general", fixedCode is just the test function, insert it into the file
        try {
          outputTestFile = await this.addTestFunction(testFile, fixedCode);
        } catch (error) {
          console.error(`[LLM_FIX] Failed to add test function:`, error);
          attempt++;
          continue;
        }
      }
      
      // Run test and check
      const result = await this.runTestAndCheck(outputTestFile, testCaseName);
      
      // Record attempt
      const attemptRecord: FixAttempt = {
        round: attempt,
        prompt: JSON.stringify({ 
          category, 
          sourceCode, 
          testCode, 
          assertionErrors, 
          symbolName 
        }),
        response: fixedCode,
        fixedCode,
        testResult: result.passed ? 'pass' : 'fail',
        errorMessage: result.error
      };
      
      if (!this.fixHistory.has(testCaseName)) {
        this.fixHistory.set(testCaseName, []);
      }
      this.fixHistory.get(testCaseName)!.push(attemptRecord);
      
      // Log fix diff for reporting
      logFixDiff(
        testCaseName,
        originalTestCode,
        fixedCode,
        category,
        attempt,
        maxAttempts,
        result.passed,
        result.error,
        this.fixDiffReportPath
      );
      
      if (result.passed) {
        console.log(`[LLM_FIX] Successfully fixed with ${category} subagent after ${attempt} attempt(s)!`);
        
        // Categorize the assertion error (use original test code)
        try {
          await this.categorizeFixedTestCase(testCaseName, originalTestCode, fixedCode);
        } catch (error) {
          console.error(`[LLM_FIX] Failed to categorize ${testCaseName}:`, error);
        }
        
        return true;
      }
      
      // Update for next attempt
      testCode = fixedCode;
      assertionErrors = result.error || 'Unknown error';
      attempt++;
    }
    
    return false;
  }

  /**
   * Categorize a successfully fixed test case
   */
  private async categorizeFixedTestCase(
    testCaseName: string,
    wrongTestCode: string,
    fixedTestCode: string
  ): Promise<void> {
    console.log(`[CATEGORIZATION] Categorizing ${testCaseName}`);
    
    const request: CategorizationRequest = {
      testCaseName,
      wrongTestCode,
      fixedTestCode,
      existingCategories: this.categoryStructure
    };

    const previousCategories = { ...this.categoryStructure };
    
    // Create log object for LLM invocation
    const logObj: LLMLogs = { 
      tokenUsage: '', 
      result: '', 
      prompt: '', 
      model: '' 
    };
    
    const result = await categorizeAssertionError(request, logObj);
    
    // Update category structure
    this.categoryStructure = updateCategoryStructure(this.categoryStructure, result);
    saveCategoryStructure(this.categoryStructurePath, this.categoryStructure);
    
    // Log categorization diff
    logCategorizationDiff(result, previousCategories, this.categoryStructure, this.diffLogPath);
    
    console.log(`[CATEGORIZATION] Categorized ${testCaseName} as ${result.bigCategory} → ${result.smallCategory}`);
  }

  /**
   * Run the fix workflow
   */
  async run(): Promise<void> {
    console.log(`[LLM_FIX] Starting LLM fix workflow`);
    console.log(`[LLM_FIX] Input: ${this.inputJsonPath}`);
    console.log(`[LLM_FIX] Output: ${this.outputDir}`);
    console.log(`[LLM_FIX] Language: ${this.options.language}`);
    console.log(`[LLM_FIX] Python exe: ${this.options.pythonExe}`);
    console.log(`[LLM_FIX] Timeout: ${this.options.timeoutSec}s`);
    console.log(`[LLM_FIX] Jobs: ${this.options.jobs}`);
    
    // Load existing fix history from cache
    this.loadFixHistoryFromCache();
    
    const data = this.loadExaminationResults();
    console.log(`[LLM_FIX] Loaded ${data.tests.length} test cases`);
  
    let fixed = 0;
    let skipped = 0;
    let failed = 0;
    let cached = 0;
    
    for (const testEntry of data.tests) {
      // if (testEntry.examination?.hasRedefinedSymbols !== true) {
      //   skipped++;
      //   continue;
      // }
      
      const testCaseName = testEntry.test_case.split('::').at(-1);
      
      // Check cache first
      // const cachedAttempt = this.checkCache(testCaseName!);
      // if (cachedAttempt) {
      //   console.log(`[LLM_FIX] Using cached fix for ${testCaseName}`);
      //   cached++;
        
      //   // Ensure it's in fixHistory
      //   if (!this.fixHistory.has(testCaseName!)) {
      //     this.fixHistory.set(testCaseName!, [cachedAttempt]);
      //   }
      //   continue;
      // }
      
      try {
        const result = await this.processTestCase(testEntry);
        
        if (result) {
          fixed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`[LLM_FIX] Failed to process test case:`, error);
        failed++;
      }
    }
    
    // Save fix history
    const historyFile = path.join(this.outputDir, 'fix_history.json');
    const historyData = Object.fromEntries(this.fixHistory);
    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
    
    // Generate fix diff reports
    this.generateFixDiffReports();
    
    console.log(`\n[LLM_FIX] Workflow complete:`);
    console.log(`[LLM_FIX]   Fixed: ${fixed}`);
    console.log(`[LLM_FIX]   Cached: ${cached}`);
    console.log(`[LLM_FIX]   Failed: ${failed}`);
    console.log(`[LLM_FIX]   Skipped: ${skipped}`);
    console.log(`[LLM_FIX]   History saved to: ${historyFile}`);
    console.log(`[LLM_FIX]   Category structure saved to: ${this.categoryStructurePath}`);
    console.log(`[LLM_FIX]   Category diff log saved to: ${this.diffLogPath}`);
    console.log(`[LLM_FIX]   Fix diff report saved to: ${this.fixDiffReportPath}`);
  }

  /**
   * Generate fix diff reports (summary and detailed)
   */
  private generateFixDiffReports(): void {
    try {
      // Generate summary report
      const summaryPath = path.join(this.outputDir, 'fix_diff_summary.txt');
      exportFixDiffSummary(this.fixDiffReportPath, summaryPath);
      console.log(`[LLM_FIX] Fix diff summary saved to: ${summaryPath}`);
      
      // Generate detailed markdown report
      const detailedPath = path.join(this.outputDir, 'fix_diff_detailed.md');
      exportDetailedFixReport(this.fixDiffReportPath, detailedPath);
      console.log(`[LLM_FIX] Detailed fix diff report saved to: ${detailedPath}`);
    } catch (error) {
      console.error(`[LLM_FIX] Failed to generate fix diff reports:`, error);
    }
  }
}

/**
 * Main entry point for the workflow
 * 
 * @param inputJsonPath Path to examination_results.json file
 * @param outputDir Directory to save outputs
 * @param options Configuration options
 * 
 * @example
 * await runLLMFixWorkflow(
 *   '/path/to/examination_results.json',
 *   '/path/to/output',
 *   {
 *     language: 'python',
 *     pythonExe: 'python3',
 *     jobs: 16,
 *     timeoutSec: 30,
 *     pythonpath: ['/path/to/project']
 *   }
 * );
 */
export async function runLLMFixWorkflow(
  inputJsonPath: string,
  outputDir: string,
  options: LLMFixOptions = {}
): Promise<void> {
  const workflow = new LLMFixWorkflow(inputJsonPath, outputDir, options);
  await workflow.run();
}
