import * as fs from 'fs';
import * as path from 'path';
import { invokeLLM } from '../../invokeLLM';

export interface CategoryStructure {
  // big category -> array of test case names
  [bigCategory: string]: string[];
}

// Legacy format used small categories; kept for backward compatibility when loading old files
interface LegacyCategoryWithTestCases {
  [smallCategory: string]: string[];
}

export interface CategorizationResult {
  testCaseName: string;
  rootCauseSummary: string;
  categorizationDecision: '1' | '3';
  bigCategory: string;
  reasoning: string;
  timestamp: string;
}

export interface CategorizationRequest {
  testCaseName: string;
  wholeTestCode: string;
  wrongTestCode: string;
  fixedTestCode: string;
  existingCategories?: CategoryStructure;
}

/**
 * Loads default category structure from JSON file
 * Falls back to hardcoded defaults if file not found
 */
export function getDefaultCategories(): CategoryStructure {
  // Try multiple possible paths (for both source and compiled output)
  const possiblePaths = [
    path.join(__dirname, '../../../templates/default_categories.json'),
    path.join(__dirname, '../../templates/default_categories.json'),
    path.join(process.cwd(), 'templates/default_categories.json')
  ];

  for (const defaultPath of possiblePaths) {
    if (fs.existsSync(defaultPath)) {
      try {
        const content = fs.readFileSync(defaultPath, 'utf-8');
        const loaded = JSON.parse(content);
        // Validate structure
        if (typeof loaded === 'object' && loaded !== null) {
          return loaded as CategoryStructure;
        }
      } catch (error) {
        console.warn(`Failed to parse default categories from ${defaultPath}:`, error);
        // Continue to try next path or fallback
      }
    }
  }

  // Fallback to hardcoded defaults if file not found or invalid
  console.warn('Default categories file not found, using hardcoded defaults');
  return {
    'Wrong Environment': [],
    'Mock error': [],
    'Symbol Misusing': [],
    'Object Property Error': [],
    'Logic Error': []
  };
}

/**
 * Converts legacy category values to a flat list of test cases.
 * Legacy formats:
 *  - string[]: list of small categories (no test cases) -> returns []
 *  - LegacyCategoryWithTestCases: map of small categories to test case arrays
 */
function toTestCaseList(value: string[] | LegacyCategoryWithTestCases | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [];
  }

  const tests = new Set<string>();
  for (const testCases of Object.values(value)) {
    for (const testCase of testCases) {
      tests.add(testCase);
    }
  }
  return Array.from(tests);
}

/**
 * Loads existing category structure from JSON file
 * If file doesn't exist, returns default categories
 * Supports legacy formats that stored small categories by flattening to big-category test lists
 */
export function loadCategoryStructure(filePath: string): CategoryStructure {
  if (!fs.existsSync(filePath)) {
    return getDefaultCategories();
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const loaded = JSON.parse(content);
  
  // Merge with defaults to ensure all default categories exist
  const defaults = getDefaultCategories();
  const merged: CategoryStructure = { ...defaults };

  // Add any categories from loaded file (supporting legacy formats)
  for (const [bigCategory, value] of Object.entries(loaded)) {
    const existingTests = new Set<string>(merged[bigCategory] || []);
    const loadedTests = toTestCaseList(value as string[] | LegacyCategoryWithTestCases);

    for (const test of loadedTests) {
      existingTests.add(test);
    }

    merged[bigCategory] = Array.from(existingTests);
  }

  return merged;
}

/**
 * Saves category structure to JSON file
 */
export function saveCategoryStructure(filePath: string, categories: CategoryStructure): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(categories, null, 2), { encoding: 'utf-8' });
}

/**
 * Generates a readable summary of the category structure with test case counts
 */
export function generateCategoryStructureSummary(categories: CategoryStructure): string {
  const lines: string[] = [];
  lines.push('=== Category Structure Summary ===\n');
  
  let totalBigCategories = 0;
  let totalTestCases = 0;
  
  for (const [bigCategory, testCases] of Object.entries(categories)) {
    totalBigCategories++;
    const cases = testCases || [];
    totalTestCases += cases.length;
    
    lines.push(`## ${bigCategory}`);
    
    if (cases.length === 0) {
      lines.push('  (No test cases yet)');
    } else {
      lines.push(`  Test cases (${cases.length}):`);
      for (const testCase of cases) {
        lines.push(`    * ${testCase}`);
      }
    }
    lines.push('');
  }
  
  lines.unshift(`Total Big Categories: ${totalBigCategories}`);
  lines.unshift(`Total Test Cases: ${totalTestCases}`);
  lines.unshift('');
  
  return lines.join('\n');
}

/**
 * Loads prompt template from file
 */
function loadPromptTemplate(): string {
  // Try multiple possible paths (for both source and compiled output)
  const possiblePaths = [
    path.join(__dirname, '../../../templates/assertion_categorization_prompt.txt'),
    path.join(__dirname, '../../templates/assertion_categorization_prompt.txt'),
    path.join(process.cwd(), 'templates/assertion_categorization_prompt.txt')
  ];

  for (const templatePath of possiblePaths) {
    if (fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath, 'utf-8');
    }
  }

  throw new Error('assertion_categorization_prompt.txt not found in any of the expected locations.');
}

/**
 * Loads category template files and combines their contents
 */
function loadCategoryTemplates(): string {
  const templateFiles = [
    'cate_test_env_mismatching.md',
    'cate_test_prefix_precond_mismatching.md',
    'cate_wrong_mock_instance.md'
  ];

  // Try multiple possible paths (for both source and compiled output)
  const basePaths = [
    path.join(__dirname, '../../../templates'),
    path.join(__dirname, '../../templates'),
    path.join(process.cwd(), 'templates')
  ];

  const contents: string[] = [];

  for (const templateFile of templateFiles) {
    let loaded = false;
    for (const basePath of basePaths) {
      const templatePath = path.join(basePath, templateFile);
      if (fs.existsSync(templatePath)) {
        contents.push(fs.readFileSync(templatePath, 'utf-8'));
        loaded = true;
        break;
      }
    }
    if (!loaded) {
      console.warn(`[CATEGORIZATION] Template file not found: ${templateFile}`);
    }
  }

  return contents.join('\n\n---\n\n');
}

/**
 * Builds the prompt for LLM categorization
 */
function buildCategorizationPrompt(
  wholeTestCode: string,
  wrongTestCode: string,
  fixedTestCode: string,
  existingCategories?: CategoryStructure
): string {
  const template = loadPromptTemplate();
  
  let existingCategoriesJson = '{}';
  if (existingCategories && Object.keys(existingCategories).length > 0) {
    existingCategoriesJson = JSON.stringify(existingCategories, null, 2);
  }

  return `${template}

## Wrong Assertion Test Code
\`\`\`
${wholeTestCode}
\`\`\`

## Problematic Test Function
\`\`\`python
${wrongTestCode}
\`\`\`

## Fixed Version
\`\`\`
${fixedTestCode}
\`\`\`

## Existing Categories
\`\`\`json
${existingCategoriesJson}
\`\`\`

Please analyze the difference between the wrong and fixed versions, infer the root cause, and categorize it according to the instructions above.
Categorization should be done based on the difference between the wrong and fixed versions, not the whole test code.
You should output JSON format like this:
{
  "rootCauseSummary": "string",
  "categorizationDecision": "1" | "3",
  "bigCategory": "string",
  "reasoning": "string"
}
`;
}

/**
 * Parses LLM response to extract categorization result
 * Handles both snake_case (from LLM) and camelCase formats
 */
function parseCategorizationResponse(response: string): CategorizationResult | null {
  let parsed: any = null;
  
  // Try to extract JSON from code block
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[1]);
    } catch (e) {
      // Fall through to try parsing entire response
    }
  }

  // Try parsing entire response as JSON if not found in code block
  if (!parsed) {
    try {
      parsed = JSON.parse(response.trim());
    } catch (e) {
      return null;
    }
  }

  // Transform snake_case to camelCase if needed
  if (parsed) {
    const result: any = {
      rootCauseSummary: parsed.root_cause_summary || parsed.rootCauseSummary,
      categorizationDecision: parsed.categorization_decision || parsed.categorizationDecision,
      bigCategory: parsed.big_category || parsed.bigCategory,
      reasoning: parsed.reasoning
    };

    // Only return if we have the required fields
    if (result.rootCauseSummary && result.bigCategory) {
      return result as CategorizationResult;
    }
  }

  return null;
}

/**
 * Updates category structure based on categorization result
 * Now tracks which test cases belong to each category
 */
export function updateCategoryStructure(
  categories: CategoryStructure,
  result: CategorizationResult
): CategoryStructure {
  const updated: CategoryStructure = {};

  // Clone existing categories to avoid mutating the original object
  for (const [bigCategory, testCases] of Object.entries(categories)) {
    updated[bigCategory] = [...testCases];
  }

  // Ensure big category exists
  if (!updated[result.bigCategory]) {
    updated[result.bigCategory] = [];
  }

  // Add test case if not already present
  if (!updated[result.bigCategory].includes(result.testCaseName)) {
    updated[result.bigCategory].push(result.testCaseName);
  }

  return updated;
}

/**
 * Categorizes a wrong assertion test case using LLM
 */
export async function categorizeAssertionError(
  request: CategorizationRequest,
  logObj?: any
): Promise<CategorizationResult> {
  let prompt = buildCategorizationPrompt(
    request.wholeTestCode,
    request.wrongTestCode,
    request.fixedTestCode,
    request.existingCategories
  );
  
  // Load category template files and replace placeholder
  const categoryTemplates = loadCategoryTemplates();
  prompt = prompt.replace("{{{Existing Categories}}}", categoryTemplates);

  const messages = [
    {
      role: 'system' as const,
      content: 'You are an expert software engineer specializing in analyzing test failures and categorizing root causes of assertion errors.'
    },
    {
      role: 'user' as const,
      content: prompt
    }
  ];

  const response = await invokeLLM(messages, logObj);
  console.log('categorizeAssertionError::response', response);
  const result = parseCategorizationResponse(response);
  console.log('categorizeAssertionError::result', result);

  if (!result) {
    console.error(`[CATEGORIZATION] Failed to parse LLM response for ${request.testCaseName}`);
    console.error(`[CATEGORIZATION] Response was: ${response.substring(0, 500)}`);
    throw new Error(`Failed to parse LLM response for test case: ${request.testCaseName}. Response: ${response.substring(0, 200)}`);
  }

  // Validate required fields and provide detailed error
  const missingFields: string[] = [];
  if (!result.rootCauseSummary) missingFields.push('rootCauseSummary');
  if (!result.bigCategory) missingFields.push('bigCategory');
  
  if (missingFields.length > 0) {
    console.error(`[CATEGORIZATION] Missing fields in result for ${request.testCaseName}:`, missingFields);
    console.error(`[CATEGORIZATION] Parsed result:`, JSON.stringify(result, null, 2));
    console.error(`[CATEGORIZATION] Original response:`, response.substring(0, 500));
    throw new Error(`Invalid categorization result for test case: ${request.testCaseName}. Missing fields: ${missingFields.join(', ')}`);
  }

  // Ensure categorization decision is valid
  if (!['1', '3'].includes(result.categorizationDecision)) {
    result.categorizationDecision = '3'; // Default to creating new category
  }

  return {
    ...result,
    testCaseName: request.testCaseName,
    timestamp: new Date().toISOString()
  };
}

/**
 * Batch categorizes multiple test cases
 */
export async function categorizeMultipleAssertionErrors(
  requests: CategorizationRequest[],
  categoryStructurePath: string,
  logObj?: any
): Promise<{
  results: CategorizationResult[];
  updatedCategories: CategoryStructure;
}> {
  let categories = loadCategoryStructure(categoryStructurePath);
  const results: CategorizationResult[] = [];

  for (const request of requests) {
    try {
      const result = await categorizeAssertionError(
        { ...request, existingCategories: categories },
        logObj
      );
      results.push(result);
      categories = updateCategoryStructure(categories, result);
    } catch (error) {
      console.error(`Failed to categorize ${request.testCaseName}:`, error);
      // Continue with next test case
    }
  }

  // Save updated category structure
  saveCategoryStructure(categoryStructurePath, categories);

  return {
    results,
    updatedCategories: categories
  };
}

