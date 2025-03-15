// function DependentClassesPrompt(defUseMapString: string): string {
// 	// System prompt from ChatUnitTest
//     return `
// 	The brief information of dependent class `` is :
// 		#### Guidelines for Generating Unit Tests
// 		1. When generating Unit test of the code, if there is unseen field, method, or variable, Please find the related source code from the following list and use it to generate the unit test.
// 		${defUseMapString}
//     `;
// }

export function JavaUnitTestTemplate(FileName: string, packageString: string): string {
    return `
Based on the provided information, you need to generate a unit test using Junit5, and Mock3.
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
