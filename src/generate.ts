
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAI } from "openai";
import * as vscode from 'vscode';

import axios from 'axios';
import http from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { DecodedToken, createSystemPromptWithDefUseMap } from "./token";
import { deprecate } from "util";
import {getDependentContext, DpendenceAnalysisResult} from "./retrieve";

const BASELINE = "naive";
export function isBaseline(method: string): boolean {
	return method.includes(BASELINE);
}

const OPENAIMODELNAME = "gpt";
export function isOpenAi(method: string): boolean {
	return method.includes(OPENAIMODELNAME);
}

const LLAMAMODELNAME = "llama";
export function isLlama(method: string): boolean {
	return method.includes(LLAMAMODELNAME);
}

function getModelName(method: string): string {
	return method.split("_").pop()!;
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

function ChatUnitTestSystemPrompt(language: string): string {
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

function createSystemPromptInstruction(defUseMapString: string): string {
    return `
	
		#### Guidelines for Generating Unit Tests
		1. When generating Unit test of the code, if there is unseen field, method, or variable, Please find the related source code from the following list and use it to generate the unit test.
		${defUseMapString}
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
function ChatUnitTestOurUserPrompt(code: string, functionContext: string, functionName: string, class_name: string, dependentContext: string): string {
    return `
	The focal method is \`${functionName}\` in the \`${class_name}\`,
	${functionContext}.

	The source code of the focal method is:
	\`\`\`
	${code}
	\`\`\`

	${dependentContext}
    `;
}

function ChatUnitTestBaseUserPrompt(code: string, functionContext: string, functionName: string, class_name: string, dependentContext: string): string {
    return `
	The focal method is \`${functionName}\`.
	The source code of the focal method is:
	\`\`\`
	${code}
	\`\`\`
    `;
}

export async function genPrompt(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol, DefUseMap: DecodedToken[], languageId: string, fileName: string, method: string): Promise<any> {
	let mainFunctionDependencies = "";
	let dependentContext = "";
	let mainfunctionParent = "";
	let prompt = "";
	const systemPromptText = ChatUnitTestSystemPrompt(languageId);
	const textCode = editor.document.getText(functionSymbol.range);

	if (!isBaseline(method)) {
		const DependenciesInformation: DpendenceAnalysisResult = await getDependentContext(editor, DefUseMap, functionSymbol);
		dependentContext = DependenciesInformation.dependencies;
		mainFunctionDependencies = DependenciesInformation.mainFunctionDependencies;
		mainfunctionParent = DependenciesInformation.mainfunctionParent;
		prompt = ChatUnitTestOurUserPrompt( textCode, mainFunctionDependencies, functionSymbol.name, mainfunctionParent, dependentContext);

	} else {
		prompt = ChatUnitTestBaseUserPrompt(textCode, mainFunctionDependencies, functionSymbol.name, mainfunctionParent, dependentContext);
	}
	
	console.log("System Prompt:", systemPromptText);
	console.log("Prompt:", prompt);
	return Promise.resolve([
		{ "role": "system", "content": systemPromptText},
		{ "role": "user", "content": prompt }
	]);
}

export async function invokeLLM(method: string, promptObj: any): Promise<string> {
	// LLM生成单元测试代码
	if (isOpenAi(method)) {
		return callOpenAi(method, promptObj);
	} else if(isLlama(method)) {
		return callLocalLLM(method, promptObj);
	} else {
		vscode.window.showErrorMessage('wrong model name!')
		return "";
	}
}

async function callOpenAi(method: string, promptObj: any): Promise<string> {
	const proxy = "http://166.111.83.92:12333";
	const modelName = getModelName(method);
	process.env.http_proxy = proxy;
	process.env.https_proxy = proxy;
	process.env.HTTP_PROXY = proxy;
	process.env.HTTPS_PROXY = proxy;
	process.env.OPENAI_PROXY_URL = proxy;
	// const response2 = await axios.get('https://www.google.com');
	// console.log(response2.data);
	const openai = new OpenAI({
		apiKey: "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",
		httpAgent: new HttpsProxyAgent(proxy),
	});

	try {
				const response = await openai.chat.completions.create({
				model: modelName,
				messages: promptObj
			});
		const result = response.choices[0].message.content!;
		console.log('Generated test code:', result);
		return result;
	} catch (e) {
		console.log('ERRRROR:', e);
		console.log(e);
		return "!!";
	}
}

async function callLocalLLM(method: string, promptObj: any): Promise<string> {
	const modelName = getModelName(method);
	const url = "http://192.168.6.7:12512/api/chat";
	const headers = {
	  "Content-Type": "application/json",
	};
  
	const data = {
	  model: modelName,
	  messages: promptObj,
	  stream: false,
	};
  
	try {
	const response = await fetch(url, {
		method: "POST",
		headers: headers,
		body: JSON.stringify(data),
	});
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	const result = await response.json();
	const content = (result as any).message.content;
	console.log("Response content:", content);
	return content;
	} catch (error) {
	  console.error("Error sending chat request:", error);
	  throw error;
	}
  }
  


/**
 * @deprecated
 */
async function generateTestCode(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol, DefUseMap: DecodedToken[], languageId: String): Promise<string> {
	// LLM生成单元测试代码

    const systemPropmt = await createSystemPromptWithDefUseMap(editor, DefUseMap)
	const systemPrompt = systemPropmt.join('\n');
    console.log(systemPropmt)
	// const messageContent = `
	// 		Given the following {language} code:
	// 		{code}
			
	// 		Generate a unit test for the function "{functionName}" in {language}. 
	// 		Make sure to follow best practices for writing unit tests. You should only generate the test code and neccessary code comment without any other word. You should not wrap the code in a markdown code block.
	// 	`;
	const messageContent = ChatPromptTemplate.fromTemplate(
		`
			Given the following {language} code:
			{code}
			
			Generate a unit test for the function "{functionName}" in {language}. 
			Make sure to follow best practices for writing unit tests. You should only generate the test code and neccessary code comment without any other word. You should not wrap the code in a markdown code block.
		`
	);
	const prompt = ChatPromptTemplate.fromMessages(
		[
			["system", systemPrompt],
			messageContent
		]
	);

	const textCode = editor.document.getText(functionSymbol.range);
	const proxy = "http://166.111.83.92:12333";
	process.env.http_proxy = proxy;
	process.env.https_proxy = proxy;
	process.env.HTTP_PROXY = proxy;
	process.env.HTTPS_PROXY = proxy;
	process.env.OPENAI_PROXY_URL = proxy;
	// const response2 = await axios.get('https://www.google.com');
	// console.log(response2.data);

	// console.log('1');
	const llm = new ChatOpenAI(
		{
			model: "gpt-4o-mini",
			apiKey: "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"
		}
	);
	// console.log('2');
	const chain = prompt.pipe(llm);
	// console.log('3');

	const promptContent = await prompt.format({ language: languageId, code: textCode, functionName: functionSymbol.name });
	console.log('Generated prompt:', promptContent);

	return "!!";
	// try {
	// 	const response = await chain.invoke({ language: languageId, code: textCode, functionName: functionSymbol.name }); 
	// 	console.log('4');
	// 	const result = response.content;
	// 	// console.log('Generated test code:', result);
	// 	return result as string;
	// } catch (e) {
	// 	console.log(e);
	// 	return "!!";
	// }

}
