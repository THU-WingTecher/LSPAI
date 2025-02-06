import { ContextInfo } from "./generate";
import { isBaseline } from "./experiment";

export interface ChatMessage {
    role: string;
    content: string;
}

export interface Prompt {
    messages: ChatMessage[];
}

export function constructDiagnosticPrompt(unit_test: string, diagnosticMessages: string, method_sig: string, class_name: string, testcode: string): string {
    return `
Problem : Fix the error
Errors : ${diagnosticMessages}
Output : Fixed coded wrapped with block. No explanation needed.
Background : While unit test generation, generated code has error.
Instruction 
- The fixed code should be directly compilable without human's modification. Therefore, do not use "your~", and "My~".
The errotic code is:
\`\`\`
${unit_test}
\`\`\`
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

export function FixSystemPrompt(language: string): string {
    return ``;
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
export function LSPAIUserPrompt(code: string, languageId: string, functionContext: string, functionName: string, class_name: string, dependentContext: string, packageString: string, importString: string, FileName: string, refCodes: string): string {

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
${functionContext}
The source code of the focal method is:
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
${functionContext}
The source code of the focal method is:
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
export async function genPrompt(data: ContextInfo, method: string, language: string): Promise<any> {
	let mainFunctionDependencies = "";
	let dependentContext = "";
	let mainfunctionParent = "";
	let prompt = "";
	const systemPromptText = ChatUnitTestSystemPrompt(data.languageId);
	const textCode = data.SourceCode;

	if (!isBaseline(method)) {
		dependentContext = data.dependentContext;
		mainFunctionDependencies = data.mainFunctionDependencies;
		mainfunctionParent = data.mainfunctionParent;
		prompt = LSPAIUserPrompt(textCode, data.languageId, mainFunctionDependencies, data.functionSymbol.name, mainfunctionParent, dependentContext, data.packageString, data.importString, data.fileName, data.referenceCodes);
	} else {
		prompt = ChatUnitTestBaseUserPrompt(textCode, data.languageId, mainFunctionDependencies, data.functionSymbol.name, mainfunctionParent, dependentContext, data.packageString, data.importString, data.fileName);
	}
	// console.log("System Prompt:", systemPromptText);
	// console.log("User Prompt:", prompt);
	const chatMessages: ChatMessage[] = [
		{ role: "system", content: systemPromptText },
		{ role: "user", content: prompt }
	];

	const promptObj: Prompt = { messages: chatMessages };

	return Promise.resolve(promptObj.messages);
}
