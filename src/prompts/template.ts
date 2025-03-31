import * as vscode from 'vscode';
import { getImportStatement, getPackageStatement } from '../retrieve';
import { getLanguageSuffix } from '../language';

export function getUnitTestTemplateOnly(document: vscode.TextDocument, symbol:vscode.DocumentSymbol, FileName: string): string {
    const languageId = document.languageId;
    if (FileName.includes("/")){
        FileName = FileName.split("/").pop()!;
        const suffix = getLanguageSuffix(languageId);
        FileName = FileName.replace("." + suffix, '');
    }
    const packageString = getPackageStatement(document, languageId) ? getPackageStatement(document, languageId)![0] : '';
    const packageStatement = packageString ? packageString.replace(";", "").split(' ')[1].replace(/\./g, '/') : '';
    if (languageId === 'java') {
        return JavaUnitTestTemplateOnly(FileName, packageStatement);
    } else if (languageId === 'go') {
        return GoUnitTestTemplateOnly(FileName, packageStatement);
    } else if (languageId === 'python') {
        const importString = getImportStatement(document, languageId, symbol);
        return PythonUnitTestTemplateOnly(FileName, packageStatement, importString);
    } else {
        return '';
    }
}

export function JavaUnitTestTemplateOnly(FileName: string, packageString: string): string {
    return `
${packageString}
{Replace With Needed Imports}

public class ${FileName} {
    {Replace with needed setup}
    {Write your test test function here}
}`;
}
export function GoUnitTestTemplateOnly(FileName: string, packageString: string): string {
    return `
${packageString}

import (
    "testing"

func Test${FileName}(t *testing.T) {
    {Replace with needed setup}
    {Write your test function here}
}
`;
}

export function PythonUnitTestTemplateOnly(FileName: string, packageString: string, importString: string): string {
    return `
import unittest
${importString}

class Test${FileName}(unittest.TestCase):
    

if __name__ == '__main__':
    unittest.main()
`;
}

export function JavaUnitTestTemplate(FileName: string, packageString: string): string {
    return `
Based on the provided information, you need to generate a unit test using Junit5, and Mockito.
\`\`\`
${packageString}
{Replace With Needed Imports}

public class ${FileName} {
    {Replace with needed setup}
    {Write your test test function here}
}
\`\`\`
`;
}
export function GoUnitTestTemplate(FileName: string, packageString: string): string {
    return `
Based on the provided information, you need to generate a unit test using Go's testing package.
The generated test code will be located at the same directory with target code. Therefore, you don't have to import target project.
\`\`\`
${packageString}

import (
    "testing"
    {Replace with needed imports}
)

func Test${FileName}(t *testing.T) {
    {Replace with needed setup}
    {Write your test function here}
}
\`\`\`
`;
}

export function PythonUnitTestTemplate(FileName: string, packageString: string, importString: string): string {
    return `
Based on the provided information, you need to generate a unit test using Python's unittest framework.
\`\`\`
import unittest
${importString}
from {Replace with needed imports}

class Test${FileName}(unittest.TestCase):
    
    def setUp(self):
        {Replace with needed setup}

    def test_{FileName}(self):
        {Write your test function here}

if __name__ == '__main__':
    unittest.main()
\`\`\`
`;
}
