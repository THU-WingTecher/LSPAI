import * as fs from 'fs';
import * as path from 'path';
import { invokeLLM } from '../../invokeLLM';

export interface CategoryStructure {
  [bigCategory: string]: string[] | CategoryWithTestCases; // big category -> array of small categories OR enhanced structure with test cases
}

export interface CategoryWithTestCases {
  [smallCategory: string]: string[]; // small category -> array of test case names
}

export interface CategorizationResult {
  testCaseName: string;
  rootCauseSummary: string;
  categorizationDecision: '1' | '2' | '3';
  bigCategory: string;
  smallCategory: string;
  reasoning: string;
  timestamp: string;
}

export interface CategorizationRequest {
  testCaseName: string;
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
  // Return in new format with test cases
  return {
    'Wrong Environment': {
      'workspace error': [],
      'platform/file generation error': []
    },
    'Mock error': {},
    'Symbol Misusing': {
      're-declare already declared symbol': []
    },
    'Object Property Error': {},
    'Logic Error': {}
  };
}

/**
 * Converts old format (string[]) to new format (CategoryWithTestCases)
 */
function normalizeCategoryValue(value: string[] | CategoryWithTestCases): CategoryWithTestCases {
  if (Array.isArray(value)) {
    // Old format: convert to new format
    const normalized: CategoryWithTestCases = {};
    for (const smallCategory of value) {
      normalized[smallCategory] = [];
    }
    return normalized;
  }
  // Already in new format
  return value;
}

/**
 * Loads existing category structure from JSON file
 * If file doesn't exist, returns default categories
 * Supports both old format (string[]) and new format (CategoryWithTestCases)
 */
export function loadCategoryStructure(filePath: string): CategoryStructure {
  if (!fs.existsSync(filePath)) {
    return getDefaultCategories();
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const loaded = JSON.parse(content);
  
  // Merge with defaults to ensure all default categories exist
  const defaults = getDefaultCategories();
  const merged: CategoryStructure = {};
  
  // Convert defaults to new format
  for (const [bigCategory, value] of Object.entries(defaults)) {
    merged[bigCategory] = normalizeCategoryValue(value as string[] | CategoryWithTestCases);
  }
  
  // Add any categories from loaded file
  for (const [bigCategory, value] of Object.entries(loaded)) {
    if (merged[bigCategory]) {
      // Merge with existing
      const existing = merged[bigCategory] as CategoryWithTestCases;
      const loadedValue = normalizeCategoryValue(value as string[] | CategoryWithTestCases);
      
      // Merge small categories and their test cases
      for (const [smallCategory, testCases] of Object.entries(loadedValue)) {
        if (!existing[smallCategory]) {
          existing[smallCategory] = [];
        }
        // Merge test cases, avoiding duplicates
        const existingTestCases = new Set(existing[smallCategory]);
        for (const testCase of testCases) {
          if (!existingTestCases.has(testCase)) {
            existing[smallCategory].push(testCase);
          }
        }
      }
    } else {
      // New big category not in defaults - normalize to new format
      merged[bigCategory] = normalizeCategoryValue(value as string[] | CategoryWithTestCases);
    }
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
  let totalSmallCategories = 0;
  let totalTestCases = 0;
  
  for (const [bigCategory, value] of Object.entries(categories)) {
    totalBigCategories++;
    const normalized = normalizeCategoryValue(value as string[] | CategoryWithTestCases);
    
    lines.push(`## ${bigCategory}`);
    const smallCategories = Object.keys(normalized);
    
    if (smallCategories.length === 0) {
      lines.push('  (No small categories yet)');
    } else {
      for (const smallCategory of smallCategories) {
        totalSmallCategories++;
        const testCases = normalized[smallCategory] || [];
        totalTestCases += testCases.length;
        
        lines.push(`  - ${smallCategory} (${testCases.length} test case${testCases.length !== 1 ? 's' : ''})`);
        
        if (testCases.length > 0) {
          for (const testCase of testCases) {
            lines.push(`    * ${testCase}`);
          }
        }
      }
    }
    lines.push('');
  }
  
  lines.unshift(`Total Big Categories: ${totalBigCategories}`);
  lines.unshift(`Total Small Categories: ${totalSmallCategories}`);
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
 * Builds the prompt for LLM categorization
 */
function buildCategorizationPrompt(
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
  "categorizationDecision": "1" | "2" | "3",
  "bigCategory": "string",
  "smallCategory": "string",
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
      smallCategory: parsed.small_category || parsed.smallCategory,
      reasoning: parsed.reasoning
    };

    // Only return if we have the required fields
    if (result.rootCauseSummary && result.bigCategory && result.smallCategory) {
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

  // Convert all existing categories to new format
  for (const [bigCategory, value] of Object.entries(categories)) {
    updated[bigCategory] = normalizeCategoryValue(value as string[] | CategoryWithTestCases);
  }

  // Ensure big category exists
  if (!updated[result.bigCategory]) {
    updated[result.bigCategory] = {};
  }

  // Normalize the big category value
  const bigCategoryValue = normalizeCategoryValue(updated[result.bigCategory] as string[] | CategoryWithTestCases);
  updated[result.bigCategory] = bigCategoryValue;

  // Ensure small category exists
  if (!bigCategoryValue[result.smallCategory]) {
    bigCategoryValue[result.smallCategory] = [];
  }

  // Add test case if not already present
  if (!bigCategoryValue[result.smallCategory].includes(result.testCaseName)) {
    bigCategoryValue[result.smallCategory].push(result.testCaseName);
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
  const prompt = buildCategorizationPrompt(
    request.wrongTestCode,
    request.fixedTestCode,
    request.existingCategories
  );

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
  if (!result.smallCategory) missingFields.push('smallCategory');
  
  if (missingFields.length > 0) {
    console.error(`[CATEGORIZATION] Missing fields in result for ${request.testCaseName}:`, missingFields);
    console.error(`[CATEGORIZATION] Parsed result:`, JSON.stringify(result, null, 2));
    console.error(`[CATEGORIZATION] Original response:`, response.substring(0, 500));
    throw new Error(`Invalid categorization result for test case: ${request.testCaseName}. Missing fields: ${missingFields.join(', ')}`);
  }

  // Ensure categorization decision is valid
  if (!['1', '2', '3'].includes(result.categorizationDecision)) {
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

