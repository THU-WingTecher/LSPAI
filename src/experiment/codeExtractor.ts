/**
 * Extract code from Claude Code Router responses
 * Handles parsing of triple-backtick code blocks
 */

export interface ExtractedCode {
    code: string;
    language: string;
    blockIndex: number;
}

/**
 * Extract all code blocks from response
 */
function extractAllCodeBlocks(response: string): ExtractedCode[] {
    const codeBlocks: ExtractedCode[] = [];
    // Match ```language\n...code...\n```
    const regex = /```(\w+)?\s*\n([\s\S]*?)```/g;
    let match;
    let blockIndex = 0;

    while ((match = regex.exec(response)) !== null) {
        codeBlocks.push({
            code: match[2].trim(),
            language: match[1] || 'unknown',
            blockIndex: blockIndex++
        });
    }

    return codeBlocks;
}

/**
 * Extract primary code block for a specific language
 * Returns the first matching code block or the first block if no language match
 */
function extractCodeForLanguage(response: string, expectedLanguage: string): string | null {
    const codeBlocks = extractAllCodeBlocks(response);

    if (codeBlocks.length === 0) {
        console.warn('No code blocks found in response');
        return null;
    }

    // Try to find a block matching the expected language
    const matchingBlock = codeBlocks.find(block =>
        block.language.toLowerCase() === expectedLanguage.toLowerCase()
    );

    if (matchingBlock) {
        return matchingBlock.code;
    }

    // Fallback: return the largest code block (likely the main test code)
    const largestBlock = codeBlocks.reduce((prev, current) =>
        current.code.length > prev.code.length ? current : prev
    );

    console.warn(
        `No code block found for language "${expectedLanguage}". ` +
        `Using largest block (${largestBlock.language}, ${largestBlock.code.length} chars)`
    );

    return largestBlock.code;
}

/**
 * Extract code and validate basic structure
 */
function extractAndValidateCode(
    response: string,
    expectedLanguage: string,
    expectedSymbolName?: string
): { code: string; isValid: boolean; warnings: string[] } {
    const code = extractCodeForLanguage(response, expectedLanguage);
    const warnings: string[] = [];
    let isValid = true;

    if (!code) {
        return {
            code: '',
            isValid: false,
            warnings: ['No code could be extracted from the response']
        };
    }

    // Basic validation based on language
    const validationResult = validateCodeStructure(code, expectedLanguage, expectedSymbolName);
    warnings.push(...validationResult.warnings);
    isValid = validationResult.isValid;

    return { code, isValid, warnings };
}

/**
 * Validate code structure based on language
 */
function validateCodeStructure(
    code: string,
    languageId: string,
    expectedSymbolName?: string
): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let isValid = true;

    switch (languageId.toLowerCase()) {
        case 'python':
            if (!code.includes('import unittest')) {
                warnings.push('Python test should import unittest');
                isValid = false;
            }
            if (!code.includes('class Test')) {
                warnings.push('Python test should define a TestCase class');
                isValid = false;
            }
            if (!code.includes('def test_')) {
                warnings.push('Python test should define test methods (def test_*)');
                isValid = false;
            }
            break;

        case 'java':
            if (!code.includes('@Test')) {
                warnings.push('Java test should include @Test annotations');
                isValid = false;
            }
            if (!code.includes('import org.junit')) {
                warnings.push('Java test should import JUnit');
                isValid = false;
            }
            break;

        case 'go':
            if (!code.includes('func Test')) {
                warnings.push('Go test should define Test functions');
                isValid = false;
            }
            if (!code.includes('import') || !code.includes('"testing"')) {
                warnings.push('Go test should import testing package');
                isValid = false;
            }
            break;

        case 'cpp':
        case 'c++':
            if (!code.includes('TEST(')) {
                warnings.push('C++ test should include TEST() macros');
                isValid = false;
            }
            break;

        default:
            warnings.push(`No validation rules defined for language: ${languageId}`);
    }

    // Check if code is suspiciously short
    if (code.length < 50) {
        warnings.push('Generated code is very short, may be incomplete');
        isValid = false;
    }

    return { isValid, warnings };
}

/**
 * Clean up extracted code (remove common artifacts)
 */
export function cleanupCode(code: string): string {
    let cleaned = code;

    // Remove common prefixes/suffixes that might leak in
    cleaned = cleaned.replace(/^Here's the test.*?\n/i, '');
    cleaned = cleaned.replace(/^The test code.*?\n/i, '');
    
    // Ensure proper line endings
    cleaned = cleaned.replace(/\r\n/g, '\n');

    // Remove excessive blank lines (more than 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
}

/**
 * Main extraction function with cleanup
 */
export function extractCleanCode(
    response: string,
    expectedLanguage: string,
    expectedSymbolName?: string
): { code: string; isValid: boolean; warnings: string[] } {
    const result = extractAndValidateCode(response, expectedLanguage, expectedSymbolName);
    
    if (result.code) {
        result.code = cleanupCode(result.code);
    }

    return result;
}

