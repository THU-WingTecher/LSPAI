/**
 * Prompt templates for test generation
 * Generates prompts matching the Python LanguageTemplateManager
 */

import * as path from 'path';
import { Task } from '../core/types';

/**
 * Generate system prompt for test generation
 */
export function generateSystemPrompt(): string {
    return `<test_generation>
1. Generate DIVERSE test cases so that maximize coverage of the given focal methods.
2. When generating test cases, you should consider the context of the source code.
3. After generating code, generate unit test case follow below unit test format. 
4. You should RETURN the test code only, without any additional explanations. The Final Code should be wrapped by \`\`\`.
5. You can use tool defined for searching relevant context or inspect the potential errors.
</test_generation>`;
}

/**
 * Build unit test generation prompt for a task
 */
export function buildTestPrompt(task: Task, languageId: string): string {
    // Get file name without extension and path
    let fileName = task.relativeDocumentPath;
    if (fileName.includes('.')) {
        fileName = fileName.split('.')[0];
    }
    if (fileName.includes('/')) {
        fileName = fileName.split('/').pop() || fileName;
    }

    const template = getUnitTestTemplate(languageId, fileName, '', task.importString, []);
    
    return generatePrompt(template, task.sourceCode, '');
}

/**
 * Generate full prompt with source code and context
 */
function generatePrompt(template: string, sourceCode: string, context: string): string {
    return `Source Code:
${sourceCode}

Context:
${context}

Template:
${template}`;
}

/**
 * Get unit test template based on language
 */
function getUnitTestTemplate(
    languageId: string,
    fileName: string,
    packageString: string = '',
    importString: string = '',
    paths: string[] = []
): string {
    // Remove file extension if present
    if (fileName.includes('.')) {
        fileName = fileName.split('.')[0];
    }
    
    // Remove path if present
    if (fileName.includes('/')) {
        fileName = fileName.split('/').pop() || fileName;
    }

    switch (languageId) {
        case 'java':
            return getJavaTemplate(fileName, packageString, paths);
        case 'go':
            return getGoTemplate(fileName, packageString, paths);
        case 'python':
            return getPythonTemplate(fileName, packageString, importString, paths);
        default:
            throw new Error(`Unsupported language: ${languageId}`);
    }
}

/**
 * Get Java template
 */
function getJavaTemplate(fileName: string, packageString: string, paths: string[] = []): string {
    let testFunctions = '';
    if (paths && paths.length > 0) {
        testFunctions = paths.map((p, idx) => `    @Test
    public void ${fileName}_${idx}() {
    /*
        ${p}
    */
    }
    `).join('\n');
    }

    return `
Based on the provided information, you need to generate a unit test using Junit5, and Mockito.
\`\`\`
${packageString}

public class ${fileName} {
${testFunctions}
    @Test
    public void {write your test function name here}() {
        {Write your test code here}
    }
}
\`\`\`
`;
}

/**
 * Get Go template
 */
function getGoTemplate(fileName: string, packageString: string, paths: string[] = []): string {
    // Capitalize first letter for Go convention
    let testFileName = fileName;
    if (testFileName.length > 0 && testFileName.charAt(0) === testFileName.charAt(0).toLowerCase()) {
        testFileName = testFileName.charAt(0).toUpperCase() + testFileName.slice(1);
    }

    return `
Based on the provided information, you need to generate a unit test using Go's testing package.
The generated test code will be located at the same directory with target code. Therefore, you don't have to import target project.
\`\`\`
${packageString}

import (
    "testing"
    {Replace with needed imports}
)

func Test${testFileName}(t *testing.T) {
    {Replace with needed setup}
    {Write your test function here}
}
\`\`\`
`;
}

/**
 * Get Python template
 */
function getPythonTemplate(
    fileName: string,
    packageString: string = '',
    importString: string = '',
    paths: string[] = []
): string {
    return `
Based on the provided information, you need to generate a unit test using Python's unittest framework.
\`\`\`
import unittest
${importString}
from {Replace with needed imports}

class Test${fileName}(unittest.TestCase):
    
    def {write your other test function here}
        {write your other test code here}
if __name__ == '__main__':
    unittest.main()
\`\`\`
`;
}

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: { [key: string]: string } = {
        '.py': 'python',
        '.java': 'java',
        '.go': 'go',
        '.cpp': 'cpp',
        '.cc': 'cpp',
        '.cxx': 'cpp',
        '.c++': 'cpp',
        '.ts': 'typescript',
        '.js': 'javascript'
    };
    return langMap[ext] || 'unknown';
}

