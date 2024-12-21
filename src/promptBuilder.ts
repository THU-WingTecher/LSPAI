export interface ChatMessage {
    role: string;
    content: string;
}

export interface Prompt {
    messages: ChatMessage[];
}

export function constructDiagnosticPrompt(unit_test: string, diagnosticMessages: string, method_sig: string, class_name: string, testcode: string): string {
    return `
I need you to fix an error in a unit test, an error occurred while compiling and executing

The unit test is:
\`\`\`
${unit_test}
\`\`\`

The error messages are:
\`\`\`
${diagnosticMessages}
\`\`\`

The unit test is testing the method \`${method_sig}\` in the class \`${class_name}\`,
the source code of the method under test and its class is:
\`\`\`
${testcode}
\`\`\`

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
I need you to create a whole unit test, ensuring optimal branch and line coverage. Compile without errors. No additional explanations required.
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
    Based on the provided information, you need to generate a unit test using Junit5, and Mock3 following below format:
    \`\`\`
    package ${packageString}
    import org.junit.jupiter.api.BeforeEach;
    import org.junit.jupiter.api.Test;
    import static org.mockito.Mockito.*;
    import static org.junit.jupiter.api.Assertions.*;

    {Replace With Needed Imports}

    public class ${FileName} {
        
        @BeforeEach
        public void setUp() {
            // Write your setup code here
        }

        {Write your test function here}

    }
    \`\`\`
    `;
}

export function ChatUnitTestOurUserPrompt(code: string, functionContext: string, functionName: string, class_name: string, dependentContext: string, packageString: string, FileName: string): string {
    return `
    The focal method is \`${functionName}\` in the \`${class_name}\`,
    ${functionContext}. 
    
    ${JavaUnitTestTemplate(FileName, packageString)}

    The source code of the focal method is:
    \`\`\`
    ${code}
    \`\`\`

    ${dependentContext}
    `;
}

export function ChatUnitTestBaseUserPrompt(code: string, functionContext: string, functionName: string, class_name: string, dependentContext: string, packageString: string, FileName: string): string {
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