import { ContextInfo } from "../generate";
import { JavaUnitTestTemplate, GoUnitTestTemplate, PythonUnitTestTemplate } from "./template";
import { ChatMessage, Prompt } from "./ChatMessage";
import { getConfigInstance, PromptType, GenerationType } from "../config";
import { ContextTerm } from "../agents/contextSelector";
import path from "path";
import fs from "fs";
import ini from "ini";
import { getPackageStatement } from "../retrieve";
import * as vscode from 'vscode';


export function experimentalDiagnosticPrompt(unit_test_code: string, diagnostic_report: string): ChatMessage[] {
    // for ContextTerm, we only need term and context(if need_definition is true) 
    const fixTemplatePath = path.join(__dirname, "..", "templates", "fixCode.ini");
    const fixTemplateData = fs.readFileSync(fixTemplatePath, 'utf8');
    const fixTemplate = ini.parse(fixTemplateData);
    const systemPrompt = fixTemplate.prompts.fix_system;
    const userPrompt = fixTemplate.prompts.fix_user
        .replace('{unit_test_code}', unit_test_code)
        .replace('{diagnostic_report}', diagnostic_report)
    
    const promptObj = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
    return promptObj;
}

export function inspectTest(source_code: string, unit_test_code: string): ChatMessage[] {
    // for ContextTerm, we only need term and context(if need_definition is true) 
    const configPath = path.join(__dirname, "..", "templates", "contextSelector.ini");
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = ini.parse(configData) as ContextSelectorConfig;
    const systemPrompt = config.prompts.test_inspection_system;
    const userPrompt = config.prompts.test_inspection_user
        .replace('{source_code}', source_code)
        .replace('{unit_test_code}', unit_test_code)
    
    const promptObj = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
    return promptObj;
}

export function generateTestWithContext(document: vscode.TextDocument, source_code: string, context_info: ContextTerm[], fileName: string): ChatMessage[] {
    // for ContextTerm, we only need term and context(if need_definition is true) 
    const result = [];
    for (const item of context_info) {
        if (item.need_definition) {
            result.push(`\n## Source Code of ${item.name}\n${item.context}`);
        }
        if (item.need_example) {
            result.push(`\n## Example of ${item.name}\n${item.example}`);
        }
    }
    const context_info_str = result.join('\n');
    const packageStatement = getPackageStatement(document, document.languageId);
	// const importStatement = getImportStatement(document, document.languageId, functionSymbol);
    const configPath = path.join(__dirname, "..", "templates", "contextSelector.ini");
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = ini.parse(configData) as ContextSelectorConfig;
    const systemPrompt = config.prompts.test_generation_system;
    const userPrompt = config.prompts.test_generation_user
        .replace('{source_code}', source_code)
        .replace('{context_info}', context_info_str)
        .replace('{unit_test_template}', JavaUnitTestTemplate(fileName, packageStatement ? packageStatement[0] : ""));
    
    const promptObj = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
    return promptObj;
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


  // Function to build different prompts based on type
  function buildPromptByType(
    type: PromptType,
    functionName: string,
    class_name: string,
    functionContext: string,
    code: string,
    FileName: string,
    packageString: string,
    refCodes: string
  ): string {
    switch (type) {
      case PromptType.BASIC:
        return `
  The focal method is \`${functionName}\` in the \`${class_name}\`.
  The source code of the focal method is:
  \`\`\`
  ${code}
  \`\`\`
  Please analyze the following source code and create comprehensive unit tests:
  Consider edge cases and boundary conditions in your tests.
  ${JavaUnitTestTemplate(FileName, packageString)}`;
  
      case PromptType.DETAILED:
        return `
  Detailed Analysis Request:
  Method: \`${functionName}\`
  Class: \`${class_name}\`
  Context Information:
  ${functionContext}
  Reference Code:
  ${refCodes.length > 0 ? `\`\`\`
  ${refCodes}
  \`\`\`` : ''}
  Please analyze the following source code and create comprehensive unit tests:
  \`\`\`
  ${code}
  \`\`\`
  ${JavaUnitTestTemplate(FileName, packageString)}
  Consider edge cases and boundary conditions in your tests.`;
  
      case PromptType.CONCISE:
        return `
  Test \`${functionName}\` in \`${class_name}\`:
  \`\`\`
  ${code}
  \`\`\`
  ${JavaUnitTestTemplate(FileName, packageString)}`;
    }
  }

  
export function LSPAIUserPrompt(code: string, languageId: string, functionContext: string, functionName: string, class_name: string, dependentContext: string, packageString: string, importString: string, FileName: string, refCodes: string): string {

    if (languageId === 'java') {
    //     for java, add ${functionContext} degrades performance.
    // ${refCodes.length > 0 ? `You can refer to the following code snippets to generate the unit test:
    //     \`\`\`
    //     ${refCodes}
    //     \`\`\`` : ''}
        return buildPromptByType(
            getConfigInstance().promptType, // Default type, can be passed as an argument
            functionName,
            class_name,
            functionContext,
            code,
            FileName,
            packageString,
            refCodes
        );
        return `
The focal method is \`${functionName}\` in the \`${class_name}\`,
${functionContext}
The source code of the focal method is:
\`\`\`
${code}
\`\`\`
${JavaUnitTestTemplate(FileName, packageString)}
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
    console.log("method", method);
	if (getConfigInstance().generationType !== GenerationType.NAIVE) {
        console.log("dependentContext", data.dependentContext);
		dependentContext = data.dependentContext;
		mainFunctionDependencies = data.mainFunctionDependencies;
		mainfunctionParent = data.mainfunctionParent;
		prompt = LSPAIUserPrompt(textCode, data.languageId, 
            dependentContext, data.functionSymbol.name, 
            mainfunctionParent, dependentContext, data.packageString, 
            data.importString, data.fileName, data.referenceCodes);
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



export interface ContextSelectorConfig {
    general: {
        max_terms: number;
        relevance_threshold: number;
    };
    prompts: {
        identify_terms_system: string;
        identify_terms_user: string;
        test_generation_user: string;
        test_generation_system: string;
        test_inspection_system: string;
        test_inspection_user: string;
    };
}