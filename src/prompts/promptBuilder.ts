import { ContextInfo } from "../generate";
import { ChatMessage, Prompt } from "./ChatMessage";
import { getConfigInstance, PromptType, GenerationType } from "../config";
import { ContextTerm } from "../agents/contextSelector";
import path from "path";
import fs from "fs";
import ini from "ini";
import { getPackageStatement } from "../retrieve";
import * as vscode from 'vscode';
import { LanguageTemplateManager } from "./languageTemplateManager";

// Define the template directory name
const templateDirName = "templates";

/**
 * Interface for context selector configuration
 */
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

/**
 * Finds template file in possible locations
 */
export function findTemplateFile(fileName: string): string {
    const possiblePaths = [
        path.join(__dirname, "..", templateDirName, fileName),
        path.join(__dirname, "../..", templateDirName, fileName),
    ];

    for (const configPath of possiblePaths) {
        if (fs.existsSync(configPath)) {
            return configPath;
        }
    }

    throw new Error(`${fileName} not found in any of the expected locations.`);
}

/**
 * Creates a diagnostic prompt to fix unit test errors
 */
export function experimentalDiagnosticPrompt(unit_test_code: string, diagnostic_report: string): ChatMessage[] {
    const fixTemplatePath = findTemplateFile("fixCode.ini");
    const fixTemplateData = fs.readFileSync(fixTemplatePath, 'utf8');
    const fixTemplate = ini.parse(fixTemplateData);
    const systemPrompt = fixTemplate.prompts.fix_system;
    const userPrompt = fixTemplate.prompts.fix_user
        .replace('{unit_test_code}', unit_test_code)
        .replace('{diagnostic_report}', diagnostic_report);
    
    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
}

/**
 * Creates a prompt to inspect a test
 */ 
export function inspectTest(source_code: string, unit_test_code: string): ChatMessage[] {
    const configPath = findTemplateFile("contextSelector.ini");
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = ini.parse(configData) as ContextSelectorConfig;
    const systemPrompt = config.prompts.test_inspection_system;
    const userPrompt = config.prompts.test_inspection_user
        .replace('{source_code}', source_code)
        .replace('{unit_test_code}', unit_test_code);
    
    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
}

// Refactored generation function
export function generatePathBasedTests(
    document: vscode.TextDocument, 
    source_code: string, 
    paths: { code: string, path: string }[], 
    fileName: string,
    template?: { system_prompt: string, user_prompt: string }
): ChatMessage[][] {
    // Use provided template or load default
    const prompts = template || loadPathTestTemplate();
    
    // Generate separate prompts for each path
    return paths.map((path, index) => {
        // Format single path data
        const pathData = `Path ${index + 1}:\n- Condition: ${path.path}\n- Code executed: ${path.code}\n\n`;
        
        const packageStatement = getPackageStatement(document, document.languageId);
        
        const userPrompt = prompts.user_prompt
            .replace('{source_code}', source_code)
            .replace('{path_count}', '1') // Each prompt handles one path
            .replace('{path_data}', pathData)
            .replace('{unit_test_template}', 
                LanguageTemplateManager.getUnitTestTemplate(
                    document.languageId, 
                    fileName, 
                    packageStatement ? packageStatement[0] : ""
                )
            );
        
        return [
            { role: "system", content: prompts.system_prompt },
            { role: "user", content: userPrompt }
        ];
    });
}

/**
 * Generates test with context information
 */
export function generateTestWithContextWithCFG(
    document: vscode.TextDocument, 
    source_code: string, 
    context_info: ContextTerm[], 
    path: { code: string, path: string },
    fileName: string,
    template?: { system_prompt: string, user_prompt: string }
): ChatMessage[] {
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
    const prompts = template || loadPathTestTemplate();
    
    const systemPrompt = prompts.system_prompt
        .replace('{source_code}', source_code);

    const userPrompt = prompts.user_prompt
        .replace('{path_condition}', path.path)
        .replace('{path_data}', path.code)
        .replace('{context_info}', context_info_str)
        .replace(
            '{unit_test_template}', 
            LanguageTemplateManager.getUnitTestTemplate(
                document.languageId, 
                fileName, 
                packageStatement ? packageStatement[0] : ""
            )
        );
    
    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
}
/**
 * Generates test with context information
 */
export function generateTestWithContext(document: vscode.TextDocument, source_code: string, context_info: ContextTerm[], fileName: string): ChatMessage[] {
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
    const configPath = findTemplateFile("contextSelector.ini");
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = ini.parse(configData) as ContextSelectorConfig;
    
    const systemPrompt = config.prompts.test_generation_system;
    const userPrompt = config.prompts.test_generation_user
        .replace('{source_code}', source_code)
        .replace('{context_info}', context_info_str)
        .replace(
            '{unit_test_template}', 
            LanguageTemplateManager.getUnitTestTemplate(
                document.languageId, 
                fileName, 
                packageStatement ? packageStatement[0] : ""
            )
        );
    
    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
    ];
}

/**
 * Constructs a diagnostic prompt for fixing errors
 */
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

/**
 * Base system prompt for unit test generation
 */
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

/**
 * System prompt for fixing code
 */
export function FixSystemPrompt(language: string): string {
    return ``;
}

/**
 * Generates a prompt based on the specified prompt type
 */
function buildPromptByType(
    type: PromptType,
    languageId: string,
    functionName: string,
    class_name: string,
    functionContext: string,
    code: string,
    fileName: string,
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
${LanguageTemplateManager.getUnitTestTemplate(languageId, fileName, packageString)}`;
        
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
${LanguageTemplateManager.getUnitTestTemplate(languageId, fileName, packageString)}
Consider edge cases and boundary conditions in your tests.`;
        
        case PromptType.CONCISE:
            return `
Test \`${functionName}\` in \`${class_name}\`:
\`\`\`
${code}
\`\`\`
${LanguageTemplateManager.getUnitTestTemplate(languageId, fileName, packageString)}`;
        default:
            throw new Error(`Invalid prompt type: ${type}`);
    }
}

/**
 * Creates a user prompt for LSPAI
 */
export function LSPAIUserPrompt(
    code: string, 
    languageId: string, 
    functionContext: string, 
    functionName: string, 
    class_name: string, 
    dependentContext: string, 
    packageString: string, 
    importString: string, 
    fileName: string, 
    refCodes: string
): string {
        return buildPromptByType(
            getConfigInstance().promptType,
            languageId,
            functionName,
            class_name,
            functionContext,
            code,
            fileName,
            packageString,
            refCodes
        );
    }
    
//     // Common prompt structure with language-specific template
//     const templateFunction = LanguageTemplateManager.getUnitTestTemplate;
//     const referenceCodeBlock = refCodes.length > 0 ? 
//         `\nYou can refer to the following code snippets to generate the unit test:
// \`\`\`
// ${refCodes}
// \`\`\`` : '';

//     return `
// The focal method is \`${functionName}\` in the \`${class_name}\`,
// ${functionContext}
// The source code of the focal method is:
// \`\`\`
// ${code}
// \`\`\`
// ${templateFunction(languageId, fileName, packageString, importString)}
// ${referenceCodeBlock}
// `;
// }

/**
 * Creates a basic user prompt for chat unit test
 */
export function ChatUnitTestBaseUserPrompt(
    code: string, 
    languageId: string, 
    functionContext: string, 
    functionName: string, 
    class_name: string, 
    dependentContext: string, 
    packageString: string, 
    importString: string, 
    fileName: string
): string {
    const templateFunction = LanguageTemplateManager.getUnitTestTemplate;
    
    return `
The focal method is \`${functionName}\`.
Based on the provided information, you need to generate a unit test following below format:
\`\`\`
${templateFunction(languageId, fileName, packageString, importString)}
\`\`\`
The source code of the focal method is:
\`\`\`
${code}
\`\`\`
`;
}

/**
 * Generates a prompt based on context information
 */
export async function genPrompt(data: ContextInfo, method: string, language: string): Promise<any> {
    let mainFunctionDependencies = "";
    let dependentContext = "";
    let mainfunctionParent = "";
    let prompt = "";
    const systemPromptText = ChatUnitTestSystemPrompt(data.languageId);
    const textCode = data.SourceCode;
    
    if (getConfigInstance().generationType !== GenerationType.NAIVE) {
        dependentContext = data.dependentContext;
        mainFunctionDependencies = data.mainFunctionDependencies;
        mainfunctionParent = data.mainfunctionParent;
        prompt = LSPAIUserPrompt(
            textCode, 
            data.languageId, 
            dependentContext, 
            data.functionSymbol.name, 
            mainfunctionParent, 
            dependentContext, 
            data.packageString, 
            data.importString, 
            data.fileName, 
            data.referenceCodes
        );
    } else {
        prompt = ChatUnitTestBaseUserPrompt(
            textCode, 
            data.languageId, 
            mainFunctionDependencies, 
            data.functionSymbol.name, 
            mainfunctionParent, 
            dependentContext, 
            data.packageString, 
            data.importString, 
            data.fileName
        );
    }
    
    const chatMessages: ChatMessage[] = [
        { role: "system", content: systemPromptText },
        { role: "user", content: prompt }
    ];

    const promptObj: Prompt = { messages: chatMessages };
    return Promise.resolve(promptObj.messages);
}


/**
 * Generates test cases for each unique execution path
 */
export function loadPathTestTemplate(): { 
    system_prompt: string, 
    user_prompt: string 
} {
    const configPath = findTemplateFile("pathBasedGen.ini");
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = ini.parse(configData);
    
    return {
        system_prompt: config.prompts.system_prompt,
        user_prompt: config.prompts.user_prompt
    };
}


// Refactored generation function
// export function generatePathBasedTests(
//     document: vscode.TextDocument, 
//     source_code: string, 
//     paths: { code: string, path: string }[], 
//     fileName: string,
//     template?: { system_prompt: string, user_prompt: string }
// ): ChatMessage[] {
//     // Use provided template or load default
//     const prompts = template || loadPathTestTemplate();
    
//     // Format paths data
//     const pathCount = paths.length;
//     let pathData = '';
//     paths.forEach((path, index) => {
//         pathData += `Path ${index + 1}:\n- Condition: ${path.path}\n- Code executed: ${path.code}\n\n`;
//     });
    
//     const packageStatement = getPackageStatement(document, document.languageId);
    
//     const userPrompt = prompts.user_prompt
//         .replace('{source_code}', source_code)
//         .replace('{path_count}', pathCount.toString())
//         .replace('{path_data}', pathData)
//         .replace('{unit_test_template}', 
//             LanguageTemplateManager.getUnitTestTemplate(
//                 document.languageId, 
//                 fileName, 
//                 packageStatement ? packageStatement[0] : ""
//             )
//         );
    
//     return [
//         { role: "system", content: prompts.system_prompt },
//         { role: "user", content: userPrompt }
//     ];
// }

/**
 * Inspects and improves path-based tests
 */
// export function inspectPathBasedTests(
//     source_code: string, 
//     unit_test_code: string, 
//     paths: { code: string, path: string }[]
// ): ChatMessage[] {
//     const configPath = findTemplateFile("pathTestGenerator.ini");
//     const configData = fs.readFileSync(configPath, 'utf8');
//     const config = ini.parse(configData);
    
//     // Format paths data for the prompt
//     let pathData = '';
//     paths.forEach((path, index) => {
//         pathData += `Path ${index + 1}:\n- Condition: ${path.path}\n- Code executed: ${path.code}\n\n`;
//     });
    
//     const systemPrompt = config.prompts.path_test_inspection_system;
//     const userPrompt = config.prompts.path_test_inspection_user
//         .replace('{source_code}', source_code)
//         .replace('{unit_test_code}', unit_test_code)
//         .replace('{path_data}', pathData);
    
//     return [
//         { role: "system", content: systemPrompt },
//         { role: "user", content: userPrompt }
//     ];
// }