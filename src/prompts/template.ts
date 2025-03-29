import * as vscode from 'vscode';
import { getImportStatement, getPackageStatement } from '../retrieve';

export function getUnitTestTemplate(document: vscode.TextDocument, symbol:vscode.DocumentSymbol, FileName: string): string {
    const languageId = document.languageId;
    const packageString = getPackageStatement(document, languageId) ? getPackageStatement(document, languageId)![0] : '';
    const packageStatement = packageString ? packageString.replace(";", "").split(' ')[1].replace(/\./g, '/') : '';
    if (languageId === 'java') {
        return JavaUnitTestTemplate(FileName, packageStatement);
    } else if (languageId === 'go') {
        return GoUnitTestTemplate(FileName, packageStatement);
    } else if (languageId === 'python') {
        const importString = getImportStatement(document, languageId, symbol);
        const importStatement = importString ? importString : '';
        return PythonUnitTestTemplate(FileName, packageStatement, importStatement);
    } else {
        return '';
    }
}

export function JavaUnitTestTemplate(FileName: string, packageString: string): string {
    return `
Based on the provided information, you need to generate a unit test using Junit5, and Mockito.
\`\`\`
${packageString}
{Replace With Needed Imports}

public class ${FileName} {
    {Replace with needed fields}
    {Write your test function here}
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
from {Replace with needed imports} import {FileName}

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
