export interface ChatMessage {
    role: string;
    content: string;
}

export interface Prompt {
    messages: ChatMessage[];
}

export function constructDiagnosticPrompt(unit_test: string, diagnosticMessages: string, method_sig: string, class_name: string, testcode: string): string {
    return `
I need you to fix an error in a unit test, an error occurred while compiling and executing.

The unit test is:
\`\`\`
${unit_test}
\`\`\`

${diagnosticMessages}

Please fix the error and return the whole fixed unit test. No explanation is needed. Wrap the code in a code block.
`;
}

export function ChatUnitTestSystemPrompt(language: string): string {
    return `
Please help me generate a whole ${language} Unit test for a focal method.
I will provide the following information of the focal method:
1. Required dependencies to import.
2. The focal class signature.
3. Source code of the focal method.
4. Signatures of other methods and fields in the class.
I will provide following brief information if the focal method has dependencies:
1. Signatures of dependent classes.
2. Signatures of dependent methods and fields in the dependent classes.
I need you to create a whole unit test using Junit5, ensuring optimal branch and line coverage. Compile WITHOUT errors, and use reflection to invoke private methods. No additional explanations required.
    `;
}

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
    \`\`\`
    ${packageString}_test

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

export function OurUserPrompt(code: string, functionContext: string, functionName: string, class_name: string, dependentContext: string, packageString: string, FileName: string, refCodes: string): string {
    //     ${functionContext} is deleted.
    return `
    The focal method is \`${functionName}\` in the \`${class_name}\`,

    The source code of the focal method is:
    \`\`\`
    ${code}
    \`\`\`
    ${refCodes.length > 0 ? `You can refer to the following code snippets to generate the unit test:
    \`\`\`
    ${refCodes}
    \`\`\`` : ''}
    `;
}

export function BaseUserPrompt(code: string, functionContext: string, functionName: string, class_name: string, dependentContext: string, packageString: string, FileName: string): string {
    return `
    The focal method is \`${functionName}\`.
    Based on the provided information, you need to generate a unit test following below format:

    The source code of the focal method is:
    \`\`\`
    ${code}
    \`\`\`
    `;
}
export function ChatUnitTestLSPAIUserPrompt(code: string, languageId: string, functionContext: string, functionName: string, class_name: string, dependentContext: string, packageString: string, importString: string, FileName: string, refCodes: string): string {

    if (languageId === 'java') {
    //     for java, add ${functionContext} degrades performance.
        return `
        The focal method is \`${functionName}\` in the \`${class_name}\`,
        The source code of the focal method is:
        \`\`\`
        ${code}
        \`\`\`
        ${JavaUnitTestTemplate(FileName, packageString)}
        ${refCodes.length > 0 ? `You can refer to the following code snippets to generate the unit test:
        \`\`\`
        ${refCodes}
        \`\`\`` : ''}
        `;
    } else if (languageId === 'go') {
        return `
        The focal method is \`${functionName}\` in the \`${class_name}\`,
        The source code of the focal method is:
        ${functionContext}
        \`\`\`
        ${code}
        \`\`\`
        ${GoUnitTestTemplate(FileName, packageString)}
        ${refCodes.length > 0 ? `You can refer to the following code snippets to generate the unit test:
        \`\`\`
        ${refCodes}
        \`\`\`` : ''}
        `;
    } else if (languageId === 'python') {
        return `
        The focal method is \`${functionName}\` in the \`${class_name}\`,
        The source code of the focal method is:
        ${functionContext}
        \`\`\`
        ${code}
        \`\`\`
        ${PythonUnitTestTemplate(FileName, packageString, importString)}
        ${refCodes.length > 0 ? `You can refer to the following code snippets to generate the unit test:
        \`\`\`
        ${refCodes}
        \`\`\`` : ''}
        `;
    } else {
        return `
        The focal method is \`${functionName}\`.
        Based on the provided information, you need to generate a unit test following below format:

        The source code of the focal method is:
        \`\`\`
        ${code}
        \`\`\`
        `;
    }
}

export function ChatUnitTestBaseUserPrompt(code: string, languageId: string, functionContext: string, functionName: string, class_name: string, dependentContext: string, packageString: string, importString: string, FileName: string): string {
    if (languageId === 'java') {
        return `
        The focal method is \`${functionName}\`.
        Based on the provided information, you need to generate a unit test following below format:
        \`\`\`
        ${JavaUnitTestTemplate(FileName, packageString)}
        \`\`\`
        The source code of the focal method is:
        \`\`\`
        ${code}
        \`\`\`
        `;
    } else if (languageId === 'go') {
        return `
        The focal method is \`${functionName}\`.
        Based on the provided information, you need to generate a unit test following below format:
        \`\`\`
        ${GoUnitTestTemplate(FileName, packageString)}
        \`\`\`
        The source code of the focal method is:
        \`\`\`
        ${code}
        \`\`\`
        `;
    } else if (languageId === 'python') {
        return `
        The focal method is \`${functionName}\`.
        Based on the provided information, you need to generate a unit test following below format:
        \`\`\`
        ${PythonUnitTestTemplate(FileName, packageString, importString)}
        \`\`\`
        The source code of the focal method is:
        \`\`\`
        ${code}
        \`\`\`
        `;
    } else {
        return `
        The focal method is \`${functionName}\`.
        Based on the provided information, you need to generate a unit test following below format:

        The source code of the focal method is:
        \`\`\`
        ${code}
        \`\`\`
        `;
    }
}

function createPromptTemplate(language: string, code: string, functionName: string, fileName: string): string {
    return `
        You are professional ${language} developer who developed the following code:
        ${code}
        
        Generate a unit test for the function "${functionName}" in ${language}. 

        1. For java, className should be same with filename : ${fileName}.
        2. ONLY generate test code, DO NOT wrap the code in a markdown code block.
    `;
}