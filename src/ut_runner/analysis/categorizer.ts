import * as fs from 'fs';
import * as path from 'path';
import { invokeLLM } from '../../invokeLLM';

export interface CategoryStructure {
  [bigCategory: string]: string[]; // big category -> array of small categories
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
  return {
    'Wrong Environment': [
      'workspace error',
      'platform/file generation error'
    ],
    'Mock error': [],
    'Symbol Misusing': [
      're-declare already declared symbol'
    ],
    'Object Property Error': [],
    'Logic Error': []
  };
}

/**
 * Loads existing category structure from JSON file
 * If file doesn't exist, returns default categories
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
  
  // Add any categories from loaded file
  for (const [bigCategory, smallCategories] of Object.entries(loaded)) {
    if (merged[bigCategory]) {
      // Merge small categories, avoiding duplicates
      const existing = new Set(merged[bigCategory]);
      for (const small of smallCategories as string[]) {
        if (!existing.has(small)) {
          merged[bigCategory].push(small);
        }
      }
    } else {
      // New big category not in defaults
      merged[bigCategory] = [...(smallCategories as string[])];
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
 */
export function updateCategoryStructure(
  categories: CategoryStructure,
  result: CategorizationResult
): CategoryStructure {
  const updated = { ...categories };

  if (!updated[result.bigCategory]) {
    updated[result.bigCategory] = [];
  }

  if (!updated[result.bigCategory].includes(result.smallCategory)) {
    updated[result.bigCategory].push(result.smallCategory);
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

