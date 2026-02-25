/**
 * VSCode-independent unit test template generation.
 *
 * This is used by both the VSCode extension (via LanguageTemplateManager) and
 * standalone experiment runners (OpenCode / Claude Code) where `vscode` isn't available.
 */

/**
 * Get unit test template based on language.
 */
export function getUnitTestTemplate(
    languageId: string,
    fileName: string,
    packageString: string,
    importString: string = '',
    paths: string[] = [],
    functionInfo: Map<string, string> = new Map()
): string {
    // if filename has suffix like .py, .go, .java, remove it
    if (fileName.includes(".")) {
        fileName = fileName.split(".")[0];
    }
    if (fileName.includes("/")) {
        fileName = fileName.split("/").pop() || fileName;
    }
    let signature = "";
    if (functionInfo.size > 0 && functionInfo.has('signature')) {
        signature += functionInfo.get('name') || "";
        signature += functionInfo.get('signature') || "";
    }
    switch (languageId) {
        case 'java':
            return getJavaTemplate(fileName, packageString, paths, signature);
        case 'go':
            return getGoTemplate(fileName, packageString, paths, signature);
        case 'python':
            return getPythonTemplate(fileName, packageString, importString, paths, signature);
        default:
            return getDefaultTemplate();
    }
}

function getJavaTemplate(fileName: string, packageString: string, paths: string[], signature: string): string {
    const testFunctions = paths.map((p, idx) => `
    @Test
    public void ${fileName}_${idx}() {
    /*
    ${signature}
        ${p}
    */
    }
    `).join('\n');
    return `
Based on the provided information, you need to generate a unit test using Junit5, and Mockito.
\`\`\`
${packageString}
{Replace With Needed Imports}

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

function getGoTemplate(fileName: string, packageString: string, paths: string[], signature: string): string {
    // the first letter of the function name should be capitalized
    let testFileName = fileName;
    if (testFileName.charAt(0) === testFileName.charAt(0).toLowerCase()) {
        testFileName = testFileName.charAt(0).toUpperCase() + testFileName.slice(1);
    }
    const testFunctions = paths.map((p, idx) => `
    func Test${testFileName}_${idx}(t *testing.T) {
    /*
    ${signature}
        ${p}
    */
    }
    `).join('\n');
    return `
Based on the provided information, you need to generate a unit test using Go's testing package.
The generated test code will be located at the same directory with target code. Therefore, you don't have to import target project.
\`\`\`
${packageString}

import (
    "testing"
    {Replace with needed imports}
)
${testFunctions}

func Test${testFileName}(t *testing.T) {
    {Replace with needed setup}
    {Write your test function here}
}
\`\`\`
`;
}

function getPythonTemplate(
    fileName: string,
    packageString: string,
    importString: string,
    path: string[],
    signature: string
): string {
    const testFunctions = path.map((p, idx) => `
    def test_${fileName}_${idx}(self):
        """
        ${signature}
        ${p}
        """
        {Write your test code here}
        `).join('\n');
    return `
Based on the provided information, you need to generate a unit test using Python's unittest framework.
\`\`\`
${importString}
import unittest
from {Replace with needed imports}

class Test${fileName}(unittest.TestCase):
    
${testFunctions}
    def {write your other test function here}
        {write your other test code here}
if __name__ == '__main__':
    unittest.main()
\`\`\`
`;
}

function getDefaultTemplate(): string {
    return `
Based on the provided information, you need to generate a unit test following best practices for the language.
\`\`\`
{Write your test code here}
\`\`\`
`;
}

