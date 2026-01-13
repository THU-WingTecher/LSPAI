import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import assert from 'assert';
import { invokeLLM } from '../../invokeLLM';
import { getHover, extractHoverText } from '../../lsp/hover';
import { parseCode } from '../../lsp/utils';
import { makeExecutor } from '../executor';
import { Analyzer } from '../analyzer';
import { buildEnv } from '../runner';
import { TestCaseResult, ExaminationResult } from '../types';
import { LLMLogs } from '../../log';
import { getSymbolFromDocument, getSymbolByLocation, getSymbolDetail, isFunctionSymbol } from '../../lsp/symbol';
import { 
  categorizeAssertionError, 
  loadCategoryStructure, 
  saveCategoryStructure, 
  updateCategoryStructure,
  generateCategoryStructureSummary,
  CategoryStructure,
  CategorizationRequest,
  CategorizationResult
} from './categorizer';
import { 
  logCategorizationDiff
} from './category_diff_logger';
import { logFixDiff, exportFixDiffSummary, exportDetailedFixReport, generateSimpleDiffReport } from './fix_diff_reporter';
import { getDecodedTokensFromSymbol } from '../../lsp/token';
import { isBetweenFocalMethod, retrieveDefs } from '../../lsp/definition';

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

type SubagentResult = { generalSuccess: boolean; new_category: string };

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
  private fixSummaryDocs: Map<string, string> = new Map(); // testCaseName -> document path
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
    assert(this.options.language === 'python', 'Unsupported language: ' + this.options.language);
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

  private async getJavaTestFunctionCode(testFile: string, testCaseName: string): Promise<string> {
    return '';
  }

  /**
   * Get test code from test file
   */
  private async getPythonTestFuncgionCode(testFile: string, testCaseName: string): Promise<string> {
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
   * Collect signatures of functions invoked by the focal symbol.
   */
  async getInvokedFunctionSignatures(testEntry: any): Promise<string[]> {
    try {
      const symbolName = testEntry.symbol_name || testEntry.symbolName;
      if (!symbolName || !testEntry.source_file) {
        return [];
      }

      const document = await vscode.workspace.openTextDocument(testEntry.source_file);
      const focalSymbol = await getSymbolFromDocument(document, symbolName);
      if (!focalSymbol) {
        return [];
      }

      const tokens = await getDecodedTokensFromSymbol(document, focalSymbol);
      if (!tokens.length) {
        return [];
      }

      const tokensWithDefs = await retrieveDefs(document, tokens);
      const unique = new Map<string, string>();

      for (const token of tokensWithDefs) {
        if (!token.definition?.length) {
          continue;
        }
        if (token.type !== 'function' && token.type !== 'method') {
          continue;
        }

        const def = token.definition[0];
        if (isBetweenFocalMethod(def.range, focalSymbol)) {
          continue;
        }

        const defDoc = await vscode.workspace.openTextDocument(def.uri);
        const defSymbol = await getSymbolByLocation(defDoc, def.range.start);
        if (!defSymbol || !isFunctionSymbol(defSymbol)) {
          continue;
        }

        // const signature = getSymbolDetail(defDoc, defSymbol);
        // const signature = getHoverawait getHover(defDoc, defSymbol);
        const hoverResults = await getHover(defDoc, defSymbol);
        const hoverText = extractHoverText(hoverResults);
        if (hoverText) {
          const key = `${def.uri.toString()}:${defSymbol.selectionRange.start.line}:${defSymbol.selectionRange.start.character}`;
          unique.set(key, hoverText.trim());
        }
      }

      return Array.from(unique.values());
    } catch (error) {
      console.warn(`[LLM_FIX] Failed to extract invoked function signatures:`, error);
      return [];
    }
  }

  private async extractContextForDefaultValueMismatch(testEntry: any): Promise<string[]> {
    return this.getInvokedFunctionSignatures(testEntry);
  }

  async extractContextForSentinelRedefinitionMismatch(testEntry: any): Promise<string[]> {
    const exam = testEntry.examination as ExaminationResult | undefined;
    if (!exam?.redefinedSymbols?.length) {
      return [];
    }

    // Deduplicate by symbol name - keep only the first occurrence
    const seenNames = new Set<string>();
    const uniqueSymbols = exam.redefinedSymbols.filter(sym => {
      if (seenNames.has(sym.name)) {
        return false;
      }
      seenNames.add(sym.name);
      return true;
    });

    return uniqueSymbols.map(sym => {
      const parts: string[] = [];
      parts.push(`Symbol: ${sym.name}`);
      if (sym.symbolType || sym.symbolKind) {
        parts.push(`Type: ${sym.symbolType ?? sym.symbolKind}`);
      }
      // Source (original) side
      parts.push('Source:');
      if (sym.sourceFile) {
        parts.push(`  File: ${sym.sourceFile}`);
      }
      if (sym.sourceLoc) {
        parts.push(`  Location: ${sym.sourceLoc}`);
      }
      if (sym.sourceHoverText) {
        parts.push(`  Hover: ${sym.sourceHoverText}`);
      }
      if (sym.sourceTrailingContext) {
        parts.push(`  Context:\n${sym.sourceTrailingContext}`);
      } else if (sym.sourceImplementation) {
        parts.push(`  Implementation:\n${sym.sourceImplementation}`);
      }

      return parts.join('\n');
    });
  }

  /**
   * Create LLM prompt for fixing test code
   */
  private createRedeclaredErrorFixPrompt(
    sourceCode: string,
    wholeTestCode: string,
    testFunctionCode: string,
    assertionErrors: string,
    symbolName: string,
    examinationResult: ExaminationResult,
    previousAttempts: FixAttempt[] = []
  ): any[] {
    if (!sourceCode || !wholeTestCode) {
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
  
  ` : ''}
  Whole Test Code:
  \`\`\`
  ${wholeTestCode}
  \`\`\`

  Problematic Test Function:
  \`\`\`
  ${testFunctionCode}
  \`\`\`

  ${fixHistorySection}
  Please fix ONLY import errors and return the complete fixed test code.`;
  
      return [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userPrompt }
      ];
  }

  /**
   * Load default value mismatch template
   */
  private loadDefaultValueMismatchTemplate(): string {
    const possiblePaths = [
      path.join(__dirname, '../../../templates/cate_default_value_mismatching.md'),
      path.join(__dirname, '../../templates/cate_default_value_mismatching.md'),
      path.join(process.cwd(), 'templates/cate_default_value_mismatching.md')
    ];

    for (const templatePath of possiblePaths) {
      if (fs.existsSync(templatePath)) {
        return fs.readFileSync(templatePath, 'utf-8');
      }
    }

    throw new Error('cate_default_value_mismatching.md not found in any of the expected locations.');
  }

  /**
   * Load sentinel redefinition mismatch template
   */
  private loadSentinelRedefinitionMismatchTemplate(): string {
    const possiblePaths = [
      path.join(__dirname, '../../../templates/sentinel_redefinition_mismatch.md'),
      path.join(__dirname, '../../templates/sentinel_redefinition_mismatch.md'),
      path.join(process.cwd(), 'templates/sentinel_redefinition_mismatch.md')
    ];

    for (const templatePath of possiblePaths) {
      if (fs.existsSync(templatePath)) {
        return fs.readFileSync(templatePath, 'utf-8');
      }
    }

    throw new Error('sentinel_redefinition_mismatch.md not found in any of the expected locations.');
  }

  /**
   * Create LLM prompt for fixing sentinel redefinition mismatch errors
   */
  private createSentinelRedefinitionMismatchFixPrompt(
    sourceCode: string,
    wholeTestCode: string,
    testFunctionCode: string,
    assertionErrors: string,
    symbolName: string,
    previousAttempts: FixAttempt[] = []
  ): any[] {
    const template = this.loadSentinelRedefinitionMismatchTemplate();
    
    const systemPrompt = `You are an expert software testing assistant specializing in fixing Constant / Sentinel Redefinition Mismatch errors.

${template}

Your task is to:
1. Identify if this is a Sentinel Redefinition Mismatch (test redefines CONST_test, implementation uses CONST_impl)
2. Find the locally redefined constant/sentinel in the test code
3. Fix the test by importing the constant from the implementation module instead of redefining it

Focus on:
- Locally redefined constants/sentinels in the test file
- Missing imports of constants from the implementation module
- Tuple/list/object mismatches where only sentinel values differ
- Identity comparison (is) failures for sentinel objects

Be concise and focused on fixing the specific sentinel redefinition mismatch.
You first explain the root cause (what constant is redefined).
After that, you suggest the fixed test code.
Test code should be wrapped in \`\`\` code blocks.`;

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

    const userPrompt = `Given the following source code and test code with assertion errors, analyze if this is a Sentinel Redefinition Mismatch error and suggest a fix.

Focal Symbol: ${symbolName}

Source Code:
\`\`\`python
${sourceCode}
\`\`\`

Whole Test Code:
\`\`\`python
${wholeTestCode}
\`\`\`

Problematic Test Function:
\`\`\`python
${testFunctionCode}
\`\`\`

Assertion Errors:
\`\`\`
${assertionErrors}
\`\`\`
${fixHistorySection}
Please:
1. Analyze if this is a Sentinel Redefinition Mismatch (test redefines CONST_test ≠ implementation's CONST_impl)
2. Identify the specific constant/sentinel that is redefined locally
3. Provide the fixed test code that imports the constant from the implementation module

You should only return the test function which starts with "def" and code should be wrapped in \`\`\` code blocks.
For example, 
\`\`\`
def test_fixed(arg1, ...):
    assert True
\`\`\`
`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Check if error is a default value mismatch (sequential check #1)
   * Returns both the result and the prompt/response for documentation
   */
  private async isDefaultValueMismatch(
    testEntry: any,
    sourceCode: string,
    testCode: string,
    testFunctionCode: string,
    assertionErrors: string,
    symbolName: string
  ): Promise<{ isMatch: boolean; userPrompt: string; response: string }> {
    const contextForDefaultValueMismatch = await this.extractContextForDefaultValueMismatch(testEntry);
    console.log(`[CATEGORIZATION] Context for Default Value Mismatch: ${contextForDefaultValueMismatch}`);

    const template = this.loadDefaultValueMismatchTemplate();
    
    const systemPrompt = `You are an expert software testing assistant specializing in categorizing assertion errors BEFORE fixing them.

${template}

Your task is to analyze the source code, test code, and assertion errors to determine if this is a Default Value Mismatch error.

A Default Value Mismatch occurs when:
- The test implicitly assumes a default value (P_expected)
- The implementation omits a parameter and uses a library/API/runtime default (P_default)
- P_expected ≠ P_default, causing systematic assertion differences

Look for these signals:
- Systematic differences in formatting width/indentation, numeric precision, encoding, timezone, ordering
- Helper/library calls without explicit arguments in the source code
- Assertion errors showing consistent differences (e.g., spacing, precision, format)

Respond with ONLY a JSON object:
{
  "isDefaultValueMismatch": true/false,
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation"
}`;

    const userPrompt = `Analyze if this error is a Default Value Mismatch:

Focal Symbol: ${symbolName}

Source Code:
\`\`\`python
${sourceCode}
\`\`\`

Whole Test Code:
\`\`\`python
${testCode}
\`\`\`

Problematic Test Function:
\`\`\`python
${testFunctionCode}
\`\`\`

Assertion Errors:
\`\`\`
${assertionErrors}
\`\`\`

Related Context:
\`\`\`
${contextForDefaultValueMismatch.join('\n')}
\`\`\`

Is this a Default Value Mismatch error? Respond with JSON only.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    const logObj: LLMLogs = { tokenUsage: '', result: '', prompt: userPrompt, model: '' };

    try {
      const response = await invokeLLM(messages, logObj);
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.isDefaultValueMismatch === true && 
            (parsed.confidence === 'high' || parsed.confidence === 'medium')) {
          console.log(`[CATEGORIZATION] Detected Default Value Mismatch (confidence: ${parsed.confidence})`);
          console.log(`[CATEGORIZATION] Reasoning: ${parsed.reasoning}`);
          return { isMatch: true, userPrompt, response };
        }
      }
      return { isMatch: false, userPrompt, response };
    } catch (error) {
      console.warn(`[CATEGORIZATION] Failed to check default value mismatch:`, error);
      return { isMatch: false, userPrompt, response: `Error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Check if error is a sentinel redefinition mismatch (sequential check #2)
   * Returns both the result and the prompt/response for documentation
   */
  private async isSentinelRedefinitionMismatch(
    testEntry: any,
    sourceCode: string,
    testCode: string,
    testFunctionCode: string,
    assertionErrors: string,
    symbolName: string
  ): Promise<{ isMatch: boolean; userPrompt: string; response: string }> {
    const contextForSentinelRedefinitionMismatch = await this.extractContextForSentinelRedefinitionMismatch(testEntry);
    console.log(`[CATEGORIZATION] Context for Sentinel Redefinition Mismatch: ${contextForSentinelRedefinitionMismatch}`);

    const template = this.loadSentinelRedefinitionMismatchTemplate();
    
    const systemPrompt = `You are an expert software testing assistant specializing in categorizing assertion errors BEFORE fixing them.
    Your task is to analyze the source code, test code, and assertion errors to determine if this is a Sentinel Redefinition Mismatch error.

${template}

Respond with ONLY a JSON object:
{
  "isSentinelRedefinitionMismatch": true/false,
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation"
}`;

    const userPrompt = `Analyze if this error is a Sentinel Redefinition Mismatch:

Focal Symbol: ${symbolName}

Source Code:
\`\`\`python
${sourceCode}
\`\`\`


Whole Test Code:
\`\`\`python
${testCode}
\`\`\`

Problematic Test Function:
\`\`\`python
${testFunctionCode}
\`\`\`

Assertion Errors:
\`\`\`
${assertionErrors}
\`\`\`

Related Context:
\`\`\`
${contextForSentinelRedefinitionMismatch.join('\n')}
\`\`\`

Is this a Sentinel Redefinition Mismatch error? Respond with JSON only.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt }
    ];

    const logObj: LLMLogs = { tokenUsage: '', result: '', prompt: userPrompt, model: '' };

    try {
      const response = await invokeLLM(messages, logObj);
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.isSentinelRedefinitionMismatch === true && 
            (parsed.confidence === 'high' || parsed.confidence === 'medium')) {
          console.log(`[CATEGORIZATION] Detected Sentinel Redefinition Mismatch (confidence: ${parsed.confidence})`);
          console.log(`[CATEGORIZATION] Reasoning: ${parsed.reasoning}`);
          return { isMatch: true, userPrompt, response };
        }
      }
      return { isMatch: false, userPrompt, response };
    } catch (error) {
      console.warn(`[CATEGORIZATION] Failed to check sentinel redefinition mismatch:`, error);
      return { isMatch: false, userPrompt, response: `Error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Pre-fix categorization: Sequential check of error categories
   * This runs BEFORE fixing to route to the appropriate subagent
   * Checks categories one by one: default_value_mismatch -> sentinel_redefinition_mismatch -> general
   */
  private async detectErrorCategory(
    testEntry: any,
    sourceCode: string,
    testCode: string,
    testFunctionCode: string,
    assertionErrors: string,
    symbolName: string,
    testCaseName: string
  ): Promise<"default_value_mismatch" | "sentinel_redefinition_mismatch" | "general" | "redefined"> {
    // Step 1: Check if it's a default value mismatch
    console.log(`[CATEGORIZATION] Checking if error is Default Value Mismatch...`);
    const defaultValueResult = await this.isDefaultValueMismatch(testEntry, sourceCode, testCode, testFunctionCode, assertionErrors, symbolName);
    
    // Record categorization attempt
    this.appendCategorizationAttemptToDocument(
      testCaseName,
      "default_value_mismatch",
      defaultValueResult.userPrompt,
      defaultValueResult.response
    );
    
    if (defaultValueResult.isMatch) {
      console.log(`[CATEGORIZATION] ## Categorized as : Detected Default Value Mismatch`);
      return "default_value_mismatch";
    }
    
    // Step 2: Check if it's a sentinel redefinition mismatch
    // console.log(`[CATEGORIZATION] Checking if error is Sentinel Redefinition Mismatch...`);
    // const sentinelResult = await this.isSentinelRedefinitionMismatch(testEntry, sourceCode, testCode, assertionErrors, symbolName);
    // this.appendCategorizationAttemptToDocument(
    //   testCaseName,
    //   "sentinel_redefinition_mismatch",
    //   sentinelResult.userPrompt,
    //   sentinelResult.response
    // );
    // if (sentinelResult.isMatch) {
    //   return "sentinel_redefinition_mismatch";
    // }
    
    // Step 3: Default to general if no specific category matched
    console.log(`[CATEGORIZATION] No specific category matched, defaulting to general`);
    return "general";
  }

  /**
   * Create LLM prompt for fixing default value mismatch errors
   */
  private createDefaultValueMismatchFixPrompt(
    sourceCode: string,
    wholeTestCode: string,
    testFunctionCode: string,
    assertionErrors: string,
    symbolName: string,
    previousAttempts: FixAttempt[] = []
  ): any[] {
    const template = this.loadDefaultValueMismatchTemplate();
    
    const systemPrompt = `You are an expert software testing assistant specializing in fixing Default Value Mismatch errors.

${template}

Your task is to:
1. Identify if this is a Default Value Mismatch error (test assumes P_expected, implementation uses P_default)
2. Find the omitted parameter in the focal method that should be explicitly passed
3. If It is not the Default Value Mismatch error, r
3. Fix the test by either:
   - Updating the test expectation to match the actual default (P_default), OR
   - Identifying and documenting what parameter needs to be explicitly passed in the source code

Focus on:
- Systematic differences in formatting, precision, encoding, timezone, ordering
- Helper/library calls without explicit arguments
- Parameters that have non-trivial defaults

Be concise and focused on fixing the specific default value mismatch.
You first explain the root cause (what default value is mismatched).
After that, you suggest the fixed test code.
Test code should be wrapped in \`\`\` code blocks.`;

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

    const userPrompt = `Given the following source code and test code with assertion errors, analyze if this is a Default Value Mismatch error and suggest a fix.

Focal Symbol: ${symbolName}

Source Code:
\`\`\`python
${sourceCode}
\`\`\`

Whole Test Code:
\`\`\`python
${wholeTestCode}
\`\`\`

Problematic Test Function:
\`\`\`python
${testFunctionCode}
\`\`\`

Assertion Errors:
\`\`\`
${assertionErrors}
\`\`\`
${fixHistorySection}
Please:
1. Analyze if this is a Default Value Mismatch (test assumes P_expected ≠ implementation's P_default)
2. Identify the specific parameter with mismatched default value
3. Provide the fixed test code that accounts for the actual default value

You should only return the test function which starts with "def" and code should be wrapped in \`\`\` code blocks.
For example, 
\`\`\`
def test_fixed(arg1, ...):
    assert True
\`\`\`
`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Create LLM prompt for fixing test code
   */
  private createAssertionErrorFixPrompt(
    sourceCode: string,
    wholeTestCode: string,
    testFunctionCode: string,
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

Whole Test Code:
\`\`\`python
${wholeTestCode}
\`\`\`

Problematic Test Function:
\`\`\`python
${testFunctionCode}
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
   * Returns both the fixed code and the prompt/response for documentation
   */
  private async fixTestWithLLM(
    sourceCode: string,
    wholeTestCode: string,
    testFunctionCode: string,
    assertionErrors: string,
    symbolName: string,
    attempt: number,
    examinationResult: ExaminationResult,
    testCaseName: string,
    cate: string = "general"
  ): Promise<{ fixedCode: string; userPrompt: string; response: string } | null> {
    console.log(`[LLM_FIX] Round ${attempt}: Invoking LLM for ${symbolName}`);

    // Get previous attempts from fix history
    const allAttempts = this.fixHistory.get(testCaseName) || [];
    const previousAttempts = allAttempts.filter(a => 
      a.prompt.includes(`"category":"${cate}"`)
    );

    let prompt: any[] = [];
    if (cate === "general") {
      prompt = this.createAssertionErrorFixPrompt(sourceCode, wholeTestCode, testFunctionCode, assertionErrors, symbolName, previousAttempts);
    } else if (cate === "redefined") {
      prompt = this.createRedeclaredErrorFixPrompt(sourceCode, wholeTestCode, testFunctionCode, assertionErrors, symbolName, examinationResult, previousAttempts);
    } else if (cate === "default_value_mismatch") {
      prompt = this.createDefaultValueMismatchFixPrompt(sourceCode, wholeTestCode, testFunctionCode, assertionErrors, symbolName, previousAttempts);
    } else if (cate === "sentinel_redefinition_mismatch") {
      prompt = this.createSentinelRedefinitionMismatchFixPrompt(sourceCode, wholeTestCode, testFunctionCode, assertionErrors, symbolName, previousAttempts);
    } else {
      throw new Error(`Invalid category: ${cate}`);
    }
    const logObj: LLMLogs = { tokenUsage: '', result: '', prompt: prompt[1].content, model: '' };

    try {
      const response = await invokeLLM(prompt, logObj);
      const fixedCode = parseCode(response);
      
      console.log(`[LLM_FIX] LLM response received, fixed code length: ${fixedCode.length}`);
      
      return {
        fixedCode,
        userPrompt: prompt[1].content,
        response
      };
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
    if (this.options.language === 'python') {
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
    } else {
      throw new Error(`Unsupported language: ${this.options.language}`);
    }
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
   * Initialize fix summary document for a test case
   */
  private initializeFixSummaryDocument(
    testCaseName: string,
    sourceCode: string,
    originalTestCode: string,
    testFile: string,
    assertionErrors: string
  ): string {
    const docFileName = `${testCaseName}_test_fix_summary.md`;
    const docPath = path.join(this.outputDir, docFileName);
    
    // Ensure test file path is absolute
    const absoluteTestFilePath = path.isAbsolute(testFile) ? testFile : path.resolve(testFile);
    
    const content = `# ${testCaseName} - Fix Summary

## Summary

Final Result : Not Fixed
Final Category : ""

## Detailed Summary

Focal method code:
\`\`\`python
${sourceCode}
\`\`\`

Original Test Code :

${absoluteTestFilePath}
Test function code:
\`\`\`python
${originalTestCode}
\`\`\`

Very first Assertion Errors:

\`\`\`bash
${assertionErrors}
\`\`\`

## Categorization History

## Fix History

`;
    
    fs.writeFileSync(docPath, content, 'utf-8');
    this.fixSummaryDocs.set(testCaseName, docPath);
    console.log(`[LLM_FIX] Initialized fix summary document: ${docPath}`);
    
    return docPath;
  }

  /**
   * Add a categorization attempt to the summary document
   */
  private appendCategorizationAttemptToDocument(
    testCaseName: string,
    agentName: string,
    userPrompt: string,
    response: string
  ): void {
    const docPath = this.fixSummaryDocs.get(testCaseName);
    if (!docPath) {
      console.warn(`[LLM_FIX] No fix summary document found for ${testCaseName}`);
      return;
    }

    let content = fs.readFileSync(docPath, 'utf-8');
    
    // Find the position before "## Fix History" section
    const fixHistoryIndex = content.indexOf('## Fix History');
    if (fixHistoryIndex === -1) {
      // If Fix History section doesn't exist, append at the end
      const attemptSection = `
### Categorizing (${agentName})

#### User Prompt (do not include system prompt)
\`\`\`
${userPrompt}
\`\`\`

#### Model Response
\`\`\`
${response}
\`\`\`

`;
      fs.appendFileSync(docPath, attemptSection, 'utf-8');
    } else {
      // Insert before Fix History section
      const attemptSection = `
### Categorizing (${agentName})

#### User Prompt (do not include system prompt)
\`\`\`
${userPrompt}
\`\`\`

#### Model Response
\`\`\`
${response}
\`\`\`

`;
      content = content.slice(0, fixHistoryIndex) + attemptSection + content.slice(fixHistoryIndex);
      fs.writeFileSync(docPath, content, 'utf-8');
    }
  }

  /**
   * Add a fix attempt to the summary document
   */
  private appendFixAttemptToDocument(
    testCaseName: string,
    attemptNumber: number,
    category: string,
    userPrompt: string,
    response: string,
    testResult?: 'pass' | 'fail' | 'error',
    errorMessage?: string,
    fixedCode?: string,
    previousCode?: string
  ): void {
    const docPath = this.fixSummaryDocs.get(testCaseName);
    if (!docPath) {
      console.warn(`[LLM_FIX] No fix summary document found for ${testCaseName}`);
      return;
    }

    const content = fs.readFileSync(docPath, 'utf-8');
    
    // Build the attempt section with test result and error message
    let attemptSection = `
### Fix History - ${attemptNumber} (with ${category} agent)

#### Test Result: ${testResult || 'unknown'}
`;
    
    if (errorMessage) {
      attemptSection += `#### Error Message:
\`\`\`
${errorMessage}
\`\`\`

`;
    }
    
    if (previousCode && fixedCode) {
      const diff = generateSimpleDiffReport(previousCode, fixedCode);
      attemptSection += `#### Code Changes:
\`\`\`
${diff}
\`\`\`

`;
    }
    
    attemptSection += `#### User Prompt (do not include system prompt)
\`\`\`
${userPrompt}
\`\`\`

#### Model Response
\`\`\`
${response}
\`\`\`

`;
    
    fs.appendFileSync(docPath, attemptSection, 'utf-8');
  }

  /**
   * Write all failed attempts from fixHistory to the summary document
   * This ensures all failed attempts from different subagents are included
   */
  private writeAllFailedAttemptsToSummary(testCaseName: string): void {
    const docPath = this.fixSummaryDocs.get(testCaseName);
    if (!docPath) {
      console.warn(`[LLM_FIX] No fix summary document found for ${testCaseName}`);
      return;
    }

    const fixHistory = this.fixHistory.get(testCaseName) || [];
    if (fixHistory.length === 0) {
      return;
    }

    // Check what's already in the document
    const content = fs.readFileSync(docPath, 'utf-8');
    
    // For each attempt in history, check if it's already in the document
    for (const attempt of fixHistory) {
      try {
        const promptData = JSON.parse(attempt.prompt);
        const category = promptData.category || 'unknown';
        
        // Check if this attempt is already in the document
        // Escape special regex characters in category
        const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const attemptPattern = new RegExp(
          `### Fix History - ${attempt.round} \\(with ${escapedCategory} agent\\)`
        );
        
        if (!attemptPattern.test(content)) {
          // This attempt is not in the document yet, add it
          const userPrompt = promptData.userPrompt || `Fix attempt ${attempt.round} for category ${category}`;
          const response = attempt.response || attempt.fixedCode;
          
          // Get previous code if available (from previous attempt in same category)
          let previousCode: string | undefined = undefined;
          const sameCategoryAttempts = fixHistory.filter(a => {
            try {
              const aData = JSON.parse(a.prompt);
              return aData.category === category && a.round < attempt.round;
            } catch {
              return false;
            }
          });
          if (sameCategoryAttempts.length > 0) {
            // Get the most recent previous attempt's fixed code
            const previousAttempt = sameCategoryAttempts.sort((a, b) => b.round - a.round)[0];
            previousCode = previousAttempt.fixedCode;
          }
          
          this.appendFixAttemptToDocument(
            testCaseName,
            attempt.round,
            category,
            userPrompt,
            response,
            attempt.testResult,
            attempt.errorMessage,
            attempt.fixedCode,
            previousCode
          );
        }
      } catch (error) {
        console.warn(`[LLM_FIX] Failed to write failed attempt to summary:`, error);
      }
    }
  }

  /**
   * Finalize fix summary document with final result
   */
  private finalizeFixSummaryDocument(
    testCaseName: string,
    finalResult: "Fixed" | "Not Fixed",
    finalCategory: string
  ): void {
    const docPath = this.fixSummaryDocs.get(testCaseName);
    if (!docPath) {
      console.warn(`[LLM_FIX] No fix summary document found for ${testCaseName}`);
      return;
    }

    let content = fs.readFileSync(docPath, 'utf-8');
    
    // Update summary section
    content = content.replace(
      /Final Result : .*/,
      `Final Result : ${finalResult}`
    );
    content = content.replace(
      /Final Category : .*/,
      `Final Category : "${finalCategory}"`
    );
    
    fs.writeFileSync(docPath, content, 'utf-8');
    console.log(`[LLM_FIX] Finalized fix summary document: ${docPath}`);
  }

  async getTestCode(testFile: string): Promise<string> {
    if (fs.existsSync(testFile)) {
      return fs.readFileSync(testFile, 'utf-8');
    } else {
      throw new Error(`Test file not found: ${testFile}`);
    }
  }

  async getTestFunctionCode(testFile: string, testCaseName: string): Promise<string> {
    if (this.options.language === 'python') {
      return await this.getPythonTestFuncgionCode(testFile, testCaseName);
    } else {
      return await this.getJavaTestFunctionCode(testFile, testCaseName);
    }
  }
  /**
   * Process a single test case
   * 
   * Workflow:
   * 1. Categorize the error (pre-fix categorization)
   * 2. Route to appropriate specialized subagent based on category
   * 3. Fall back to general subagent if specialized subagent fails
   */
  private async processTestCase(testEntry: any): Promise<boolean> {
    const testCaseName = testEntry.test_case.split('::').at(-1);
    const testFile = testEntry.test_file;
    
    console.log(`\n[LLM_FIX] Processing: ${testCaseName}`);
    console.log("testEntry: ", testEntry);
    
    // Get required data
    const sourceDocument = await vscode.workspace.openTextDocument(testEntry.source_file);

    const sourceCode = await this.extractSourceCode(testEntry, sourceDocument);
    const testFunctionCode = await this.getTestFunctionCode(testFile, testCaseName);
    const testCode = await this.getTestCode(testFile);
    const symbolName = testEntry.symbolName || testEntry.symbol_name || 'unknown';
    const assertionErrors = this.getAssertionErrors(testEntry);
    
    if (!sourceCode || !testFunctionCode) {
      console.log(`[LLM_FIX] Missing source or test code`);
      return false;
    }
    
    // Initialize fix summary document
    this.initializeFixSummaryDocument(
      testCaseName!,
      sourceCode,
      testFunctionCode,
      testFile,
      assertionErrors
    );
    
    // Step 1: Categorize the error BEFORE fixing
    console.log(`[LLM_FIX] Categorizing error for ${testCaseName}...`);
    let detectedCategory: "redefined" | "general" | "default_value_mismatch" | "sentinel_redefinition_mismatch" = "general";
    
    // Check for redefined symbols first (from examination data)
    const hasRedefinedSymbols = testEntry.examination?.hasRedefinedSymbols === true;
    if (hasRedefinedSymbols) {
      console.log(`[LLM_FIX] Detected redefined symbols from examination data`);
      // Sentinel redefinition mismatch can only happen if there are redefined symbols
      // Check if it's specifically a sentinel redefinition mismatch
      try {
        const sentinelResult = await this.isSentinelRedefinitionMismatch(testEntry, sourceCode, testCode, testFunctionCode, assertionErrors, symbolName);
        
        // Record categorization attempt
        this.appendCategorizationAttemptToDocument(
          testCaseName!,
          "sentinel_redefinition_mismatch",
          sentinelResult.userPrompt,
          sentinelResult.response
        );
        
        if (sentinelResult.isMatch) {
          detectedCategory = "sentinel_redefinition_mismatch";
          console.log(`[LLM_FIX] ## Categorized as: sentinel_redefinition_mismatch`);
          
          // Categorize the detected test case (we assume it's fixed for categorization purposes)
          try {
            await this.categorizeFixedTestCaseByCategory(
              testCaseName!,
              "sentinel_redefinition_mismatch",
              testCode,
              testFunctionCode,
              testFunctionCode
            );
          } catch (error) {
            console.error(`[LLM_FIX] Failed to categorize detected sentinel redefinition mismatch ${testCaseName}:`, error);
          }
        } else {
          detectedCategory = "general";
          console.log(`[LLM_FIX] Categorized as: general (general redefinition)`);
        }
      } catch (error) {
        console.warn(`[LLM_FIX] Failed to check sentinel redefinition, defaulting to general:`, error);
        detectedCategory = "general";
      }
    } 
    if (detectedCategory === "general") {
      // No redefined symbols, check for other categories
      try {
        detectedCategory = await this.detectErrorCategory(
          testEntry,
          sourceCode,
          testCode,
          testFunctionCode,
          assertionErrors,
          symbolName,
          testCaseName!
        );
        console.log(`[LLM_FIX] Categorized as: ${detectedCategory}`);
      } catch (error) {
        console.warn(`[LLM_FIX] Failed to categorize error, defaulting to general:`, error);
        detectedCategory = "general";
      }
    }
    
    // Step 2: Try the detected category's specialized subagent
    if (detectedCategory !== "general") {
      console.log(`[LLM_FIX] Trying ${detectedCategory} subagent first`);
      const { generalSuccess: specializedSuccess, new_category: specializedCategory } = await this.tryFixWithSubagent(
        testEntry,
        testCaseName,
        testFile,
        sourceCode,
        testCode,
        testFunctionCode,
        symbolName,
        detectedCategory
      );
      
      if (specializedSuccess) {
        console.log(`[LLM_FIX] Successfully fixed with ${detectedCategory} subagent`);
        this.finalizeFixSummaryDocument(testCaseName!, "Fixed", specializedCategory);
        return true;
      }
      
      console.log(`[LLM_FIX] ${detectedCategory} subagent failed, falling back to general subagent`);
    }
    
    // Step 3: Fall back to general subagent
    console.log(`[LLM_FIX] Invoking general subagent`);
    const { generalSuccess, new_category } = await this.tryFixWithSubagent(
      testEntry,
      testCaseName,
      testFile,
      sourceCode,
      testFunctionCode,
      testCode,
      symbolName,
      detectedCategory
    );
    
    if (generalSuccess) {
      console.log(`[LLM_FIX] Successfully fixed with general subagent`);
      this.finalizeFixSummaryDocument(testCaseName!, "Fixed", new_category);
      return true;
    }
    
    console.log(`[LLM_FIX] All subagents failed for ${testCaseName}`);
    
    // Write all failed attempts from fixHistory to the summary document
    // This ensures all failed attempts from different subagents are included
    this.writeAllFailedAttemptsToSummary(testCaseName!);
    
    this.finalizeFixSummaryDocument(testCaseName!, "Not Fixed", new_category);
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
    testCode: string,
    testFunctionCode: string,
    symbolName: string,
    category: "redefined" | "general" | "default_value_mismatch" | "sentinel_redefinition_mismatch"
  ): Promise<SubagentResult> {
    let new_category : string = category;
    // Specific tasks (redefined) get 1 chance, general and specialized tasks get multiple chances
    const maxAttempts = new_category === "redefined" ? 1 : 3;
    console.log(`[LLM_FIX] Starting ${new_category} subagent (max attempts: ${maxAttempts})`);
    
    let wholeTestCode = testFunctionCode;
    let assertionErrors = this.getAssertionErrors(testEntry);
    
    // Check if we've already tried this category
    const fixHistory = this.fixHistory.get(testCaseName) || [];
    const categoryHistory = fixHistory.filter(attempt => 
      attempt.prompt.includes(`"category":"${new_category}"`)
    );
    
    if (categoryHistory.length >= maxAttempts) {
      console.log(`[LLM_FIX] Already exhausted attempts for category: ${category}`);
      return { generalSuccess: false, new_category: new_category };
    }
    
    let attempt = categoryHistory.length + 1;
    
    while (attempt <= maxAttempts) {
      console.log(`[LLM_FIX] general subagent - Attempt ${attempt}/${maxAttempts}`);
      
      // Get fixed code from LLM
      const fixResult = await this.fixTestWithLLM(
        sourceCode, 
        wholeTestCode, 
        testFunctionCode,
        assertionErrors, 
        symbolName, 
        attempt, 
        testEntry.examination,
        testCaseName, 
        new_category
      );
      
      if (!fixResult) {
        console.log(`[LLM_FIX] Failed to get fixed code from LLM`);
        attempt++;
        continue;
      }
      
      const { fixedCode, userPrompt, response } = fixResult;
      
      // Add test function (saves to outputDir)
      let outputTestFile: string;
      if (new_category === "redefined") {
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
          new_category, 
          sourceCode, 
          testCode, 
          assertionErrors, 
          symbolName,
          userPrompt,
          response
        }),
        response: response, // Store the actual LLM response
        fixedCode,
        testResult: result.passed ? 'pass' : 'fail',
        errorMessage: result.error
      };
      
      if (!this.fixHistory.has(testCaseName)) {
        this.fixHistory.set(testCaseName, []);
      }
      this.fixHistory.get(testCaseName)!.push(attemptRecord);
      
      // Record fix attempt in summary document (after test result is known)
      this.appendFixAttemptToDocument(
        testCaseName,
        attempt,
        new_category,
        userPrompt,
        response,
        attemptRecord.testResult,
        attemptRecord.errorMessage,
        fixedCode,
        testCode
      );
      
      // Log fix diff for reporting
      logFixDiff(
        testCaseName,
        wholeTestCode,
        fixedCode,
        new_category,
        attempt,
        maxAttempts,
        result.passed,
        result.error,
        this.fixDiffReportPath
      );
      
      if (result.passed) {
        console.log(`[LLM_FIX] Successfully fixed with ${category} subagent after ${attempt} attempt(s)!`);
        
        // Categorize the assertion error based on the category
        try {
          new_category = await this.categorizeFixedTestCaseByCategory(
            testCaseName,
            category,
            wholeTestCode,
            testFunctionCode,
            fixedCode
          );
        } catch (error) {
          console.error(`[LLM_FIX] Failed to categorize ${testCaseName} for category ${category}:`, error);
        }
        
        return { generalSuccess: true, new_category: new_category };
      }
      
      // Update for next attempt
      testCode = fixedCode;
      assertionErrors = result.error || 'Unknown error';
      attempt++;
    }
    try {
      new_category = await this.categorizeFixedTestCaseByCategory(
        testCaseName,
        category,
        wholeTestCode,
        testFunctionCode,
        ""
      );
    } catch (error) {
      console.error(`[LLM_FIX] Failed to categorize ${testCaseName} for category ${category}:`, error);
    }
    return { generalSuccess: false, new_category: new_category };
  }

  /**
   * Category metadata for specialized categories
   */
  private getCategoryMetadata(category: string): { bigCategory: string; rootCauseSummary: string; reasoning: string } | null {
    const categoryMap: Record<string, { bigCategory: string; rootCauseSummary: string; reasoning: string }> = {
      "sentinel_redefinition_mismatch": {
        bigCategory: "Sentinel Redefinition Mismatch",
        rootCauseSummary: "Sentinel/constant redefinition mismatch - test redefines a constant that differs from implementation",
        reasoning: "Test case was successfully fixed by the sentinel_redefinition_mismatch subagent, indicating a sentinel/constant redefinition issue"
      },
      "default_value_mismatch": {
        bigCategory: "Default Value Mismatch",
        rootCauseSummary: "Default value mismatch - test assumes a default value that differs from the implementation's actual default",
        reasoning: "Test case was successfully fixed by the default_value_mismatch subagent, indicating a default parameter value mismatch"
      },
      "redefined": {
        bigCategory: "Symbol Redefinition",
        rootCauseSummary: "Symbol redefinition error - test redefines symbols that conflict with implementation",
        reasoning: "Test case was successfully fixed by the redefined subagent, indicating a symbol redefinition issue"
      }
    };
    
    return categoryMap[category] || null;
  }

  /**
   * Categorize a successfully fixed test case based on category
   * For specialized categories, directly adds to category structure
   * For general category, uses LLM to determine the category
   */
  private async categorizeFixedTestCaseByCategory(
    testCaseName: string,
    category: "redefined" | "general" | "default_value_mismatch" | "sentinel_redefinition_mismatch",
    wholeTestCode: string,
    testFunctionCode: string,
    fixedTestCode: string
  ): Promise<string> {
    const previousCategories = { ...this.categoryStructure };
    let categorizationResult: CategorizationResult;

    if (category === "general") {
      // Use LLM categorization for general category
      console.log(`[CATEGORIZATION] Categorizing ${testCaseName} using LLM`);
      
      const request: CategorizationRequest = {
        testCaseName,
        wholeTestCode,
        wrongTestCode: testFunctionCode,
        fixedTestCode,
        existingCategories: this.categoryStructure
      };

      const logObj: LLMLogs = { 
        tokenUsage: '', 
        result: '', 
        prompt: '', 
        model: '' 
      };
      
      categorizationResult = await categorizeAssertionError(request, logObj);
    } else {
      // Directly add specialized categories to structure
      const metadata = this.getCategoryMetadata(category);
      if (!metadata) {
        console.warn(`[CATEGORIZATION] No metadata found for category: ${category}`);
        return category;
      }

      console.log(`[CATEGORIZATION] Adding ${testCaseName} to category: ${metadata.bigCategory}`);
      
      categorizationResult = {
        testCaseName,
        rootCauseSummary: metadata.rootCauseSummary,
        categorizationDecision: '1',
        bigCategory: metadata.bigCategory,
        reasoning: metadata.reasoning,
        timestamp: new Date().toISOString()
      };
    }

    // Update category structure (creates category if it doesn't exist)
    this.categoryStructure = updateCategoryStructure(this.categoryStructure, categorizationResult);
    saveCategoryStructure(this.categoryStructurePath, this.categoryStructure);
    
    // Log categorization diff
    logCategorizationDiff(categorizationResult, previousCategories, this.categoryStructure, this.diffLogPath);
    
    console.log(`[CATEGORIZATION] Categorized ${testCaseName} as ${categorizationResult.bigCategory}`);
    return categorizationResult.bigCategory;
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
      
      // Generate category structure summary
      const categorySummaryPath = path.join(this.outputDir, 'category_structure_summary.txt');
      const categorySummary = generateCategoryStructureSummary(this.categoryStructure);
      fs.writeFileSync(categorySummaryPath, categorySummary, { encoding: 'utf-8' });
      console.log(`[LLM_FIX] Category structure summary saved to: ${categorySummaryPath}`);
      
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
