import * as vscode from 'vscode';
import { getImportStatement, getPackageStatement } from '../retrieve';
import { getLanguageSuffix } from '../language';

/**
 * Class to manage templates for different programming languages
 */
export class LanguageTemplateManager {
    /**
     * Get unit test template based on language
     */
    static getUnitTestTemplate(
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
        switch(languageId) {
            case 'java':
                return LanguageTemplateManager.getJavaTemplate(fileName, packageString, paths, signature);
            case 'go':
                return LanguageTemplateManager.getGoTemplate(fileName, packageString, paths, signature);
            case 'python':
                return LanguageTemplateManager.getPythonTemplate(fileName, packageString, importString, paths, signature);
            default:
                return LanguageTemplateManager.getDefaultTemplate();
        }
    }
    
    /**
     * Get Java unit test template
     */
    private static getJavaTemplate(fileName: string, packageString: string, paths: string[], signature: string): string {
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
    
    /**
     * Get Go unit test template
     */
    private static getGoTemplate(fileName: string, packageString: string, paths: string[], signature: string): string {
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
    
    /**
     * Get Python unit test template
     */
    private static getPythonTemplate(fileName: string, packageString: string, importString: string, path: string[], signature: string): string {
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
import unittest
${importString}
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
    
    /**
     * Get default template for unsupported languages
     */
    private static getDefaultTemplate(): string {
        return `
Based on the provided information, you need to generate a unit test following best practices for the language.
\`\`\`
{Write your test code here}
\`\`\`
`;
    }
    
    /**
     * Get template for a complete unit test file
     */
    static getUnitTestTemplateOnly(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, fileName: string): string {
        const languageId = document.languageId;
        if (fileName.includes("/")){
            fileName = fileName.split("/").pop()!;
            const suffix = getLanguageSuffix(languageId);
            fileName = fileName.replace("." + suffix, '');
        }
        
        const packageString = getPackageStatement(document, languageId) ? getPackageStatement(document, languageId)![0] : '';
        let packageStatement = packageString ? packageString.replace(";", "").split(' ')[1].replace(/\./g, '/') : '';
        
        switch(languageId) {
            case 'java':
                packageStatement = packageStatement.replace(/\//g, '.') + ";";
                return LanguageTemplateManager.getJavaTemplateOnly(fileName, packageStatement);
            case 'go':
                return LanguageTemplateManager.getGoTemplateOnly(fileName, packageStatement);
            case 'python':
                const importString = getImportStatement(document, languageId, symbol);
                return LanguageTemplateManager.getPythonTemplateOnly(fileName, packageStatement, importString);
            default:
                return '';
        }
    }
    
    /**
     * Get complete Java unit test template
     */
    private static getJavaTemplateOnly(fileName: string, packageString: string): string {
        return `
package ${packageString}
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import org.mockito.Mock;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Collections;
import java.util.Arrays; // Added import for Arrays
import java.util.Comparator; // Added import for Comparator
import org.junit.jupiter.api.Test;
import java.lang.reflect.Method;

public class ${fileName} {



}`;
    }
    
    /**
     * Get complete Go unit test template
     */
    private static getGoTemplateOnly(fileName: string, packageString: string): string {
        // if FileName starts with lowercase, capitalize it
        if (fileName.charAt(0) === fileName.charAt(0).toLowerCase()) {
            fileName = fileName.charAt(0).toUpperCase() + fileName.slice(1);
        }
        return `
package ${packageString}

import (
    "testing"
)

func Test${fileName}(t *testing.T) {



}
`;
    }
    
    /**
     * Get complete Python unit test template
     */
    private static getPythonTemplateOnly(fileName: string, packageString: string, importString: string): string {
        return `
import unittest
${importString}

class Test${fileName}(unittest.TestCase):
    

if __name__ == '__main__':
    unittest.main()
`;
    }
}