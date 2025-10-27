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
  private sourceDocument: vscode.TextDocument | null = null;
  private analyzer: Analyzer;
  
  constructor(
    inputJsonPath: string,
    outputDir: string,
    options: LLMFixOptions = {}
  ) {
    this.inputJsonPath = inputJsonPath;
    this.outputDir = outputDir;
    
    // Set defaults similar to runPipeline
    this.options = {
      language: options.language || 'python',
      pythonExe: options.pythonExe || process.execPath,
      jobs: options.jobs ?? 16,
      timeoutSec: options.timeoutSec ?? 30,
      pythonpath: options.pythonpath || [],
      env: buildEnv(options.pythonpath || [])
    };

    // Create analyzer instance to reuse its methods
    this.analyzer = new Analyzer(this.options.language);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });
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
  private async extractSourceCode(testEntry: any): Promise<string> {
    if (!this.sourceDocument) {
      throw new Error('Source document not found');
    }
    const symbol = await getSymbolFromDocument(this.sourceDocument, testEntry.symbol_name);
    if (!symbol) {
      throw new Error(`Symbol ${testEntry.symbol_name} not found in ${testEntry.sourceCode}`);
    }
    return this.sourceDocument.getText(symbol.range);
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
  private createAssertionErrorFixPrompt(
    sourceCode: string,
    testCode: string,
    assertionErrors: string,
    symbolName: string
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
    attempt: number
  ): Promise<string | null> {
    console.log(`[LLM_FIX] Round ${attempt}: Invoking LLM for ${symbolName}`);

    const prompt = this.createAssertionErrorFixPrompt(sourceCode, testCode, assertionErrors, symbolName);
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
   * Insert test function into test file
   * Handles both standalone test functions and class-based unittest structures
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
    const backupPath = testFile + '.backup';
    
    // Create backup
    fs.writeFileSync(backupPath, testContent);
    
    // Write with inserted code
    fs.writeFileSync(testFile, newContent);
    
    console.log(`[LLM_FIX] Added test function to ${testFile}`);
    console.log(`[LLM_FIX] Inserted at line ${insertIdx + 1}`);
    console.log(`[LLM_FIX] Backup created at ${backupPath}`);
    
    return testFile;
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

  private async openSourceDocument(sourceFile: string): Promise<vscode.TextDocument> {
    if (!this.sourceDocument) {
      this.sourceDocument = await vscode.workspace.openTextDocument(sourceFile);
    }
    return this.sourceDocument;
  }
  /**
   * Process a single test case
   */
  private async processTestCase(testEntry: any): Promise<boolean> {
    const testCaseName = testEntry.test_case.split('::').at(-1);
    console.log("testCaseName: ", testEntry.test_case);
    console.log("testEntry: ", testEntry);
    const testFile = testEntry.test_file;
    await this.openSourceDocument(testEntry.source_file);
    console.log(`\n[LLM_FIX] Processing: ${testCaseName}`);
    
    // Skip if already examined with redefined symbols
    if (testEntry.examination?.hasRedefinedSymbols === true) {
      console.log(`[LLM_FIX] Skipping (already examined with redefined symbols)`);
      return false;
    }
    
    // Get required data
    const sourceCode = await this.extractSourceCode(testEntry);
    let testCode = await this.getPythonTestCode(testFile, testCaseName);
    let assertionErrors = this.getAssertionErrors(testEntry);
    const symbolName = testEntry.symbolName || testEntry.symbol_name || 'unknown';
    
    if (!sourceCode || !testCode) {
      console.log(`[LLM_FIX] Missing source or test code`);
      return false;
    }
    
    let attempt = 1;
    const maxAttempts = 3;
    let fixedCode: string | null = null;
    
    while (attempt <= maxAttempts) {
      console.log(`\n[LLM_FIX] Attempt ${attempt}/${maxAttempts}`);
      
      // Get fixed code from LLM
      fixedCode = await this.fixTestWithLLM(sourceCode, testCode, assertionErrors, symbolName, attempt);
      
      if (!fixedCode) {
        console.log(`[LLM_FIX] Failed to get fixed code from LLM`);
        attempt++;
        continue;
      }
      
      // Add test function
      try {
        await this.addTestFunction(testFile, fixedCode);
      } catch (error) {
        console.error(`[LLM_FIX] Failed to add test function:`, error);
        attempt++;
        continue;
      }
      
      // Run test and check
      const result = await this.runTestAndCheck(testFile, testCaseName);
      
      // Record attempt
      const attemptRecord: FixAttempt = {
        round: attempt,
        prompt: JSON.stringify({ sourceCode, testCode, assertionErrors, symbolName }),
        response: fixedCode,
        fixedCode,
        testResult: result.passed ? 'pass' : 'fail',
        errorMessage: result.error
      };
      
      if (!this.fixHistory.has(testCaseName)) {
        this.fixHistory.set(testCaseName, []);
      }
      this.fixHistory.get(testCaseName)!.push(attemptRecord);
      
      if (result.passed) {
        console.log(`[LLM_FIX] Successfully fixed after ${attempt} attempt(s)!`);
        return true;
      }
      
      console.log(`[LLM_FIX] Fix attempt ${attempt} failed: ${result.error}`);
      
      // Update testCode for next attempt
      testCode = fixedCode;
      assertionErrors = result.error || 'Unknown error';
      
      attempt++;
    }
    
    console.log(`[LLM_FIX] Failed to fix after ${maxAttempts} attempts`);
    return false;
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
    
    const data = this.loadExaminationResults();
    console.log(`[LLM_FIX] Loaded ${data.tests.length} test cases`);
    
    let fixed = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const testEntry of data.tests) {
      if (testEntry.examination?.hasRedefinedSymbols === true) {
        skipped++;
        continue;
      }
      
      const result = await this.processTestCase(testEntry);
      
      if (result) {
        fixed++;
      } else {
        failed++;
      }
    }
    
    // Save fix history
    const historyFile = path.join(this.outputDir, 'fix_history.json');
    const historyData = Object.fromEntries(this.fixHistory);
    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
    
    console.log(`\n[LLM_FIX] Workflow complete:`);
    console.log(`[LLM_FIX]   Fixed: ${fixed}`);
    console.log(`[LLM_FIX]   Failed: ${failed}`);
    console.log(`[LLM_FIX]   Skipped: ${skipped}`);
    console.log(`[LLM_FIX]   History saved to: ${historyFile}`);
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
