
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAI } from "openai";
import * as vscode from 'vscode';

import {ChatUnitTestSystemPrompt, ChatUnitTestOurUserPrompt, ChatUnitTestBaseUserPrompt} from "./promptBuilder";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { DecodedToken, createSystemPromptWithDefUseMap } from "./token";
import {getpackageStatement, getDependentContext, DpendenceAnalysisResult} from "./retrieve";
import {ChatMessage, Prompt} from "./promptBuilder";

interface collectInfo {
	dependentContext: string;
	mainFunctionDependencies: string;
	mainfunctionParent: string;
	SourceCode: string;
	languageId: string;
	functionSymbol: vscode.DocumentSymbol;
	fileName: string;
	packageString: string;
}
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



export async function collectInfo(editor: vscode.TextEditor, functionSymbol: vscode.DocumentSymbol, DefUseMap: DecodedToken[], languageId: string, fileName: string, method: string): Promise<collectInfo> {
	let mainFunctionDependencies = "";
	let dependentContext = "";
	let mainfunctionParent = "";
	const textCode = editor.document.getText(functionSymbol.range);
	const packageStatement = getpackageStatement(editor.document);

	if (!isBaseline(method)) {
		const DependenciesInformation: DpendenceAnalysisResult = await getDependentContext(editor, DefUseMap, functionSymbol);
		dependentContext = DependenciesInformation.dependencies;
		mainFunctionDependencies = DependenciesInformation.mainFunctionDependencies;
		mainfunctionParent = DependenciesInformation.mainfunctionParent;
	}
	return {
		dependentContext: dependentContext,
		mainFunctionDependencies: mainFunctionDependencies,
		mainfunctionParent: mainfunctionParent,
		SourceCode: textCode,
		languageId: languageId,
		functionSymbol: functionSymbol,
		fileName: fileName,
		packageString: packageStatement ? packageStatement[0] : ''
	}
}


export async function genPrompt(data: collectInfo, method: string): Promise<any> {
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
		prompt = ChatUnitTestOurUserPrompt( textCode, mainFunctionDependencies, data.functionSymbol.name, mainfunctionParent, dependentContext, data.packageString, data.fileName);

	} else {
		prompt = ChatUnitTestBaseUserPrompt(textCode, mainFunctionDependencies, data.functionSymbol.name, mainfunctionParent, dependentContext, data.packageString, data.fileName);
	}
	
	console.log("System Prompt:", systemPromptText);
	console.log("User Prompt:", prompt);
	const chatMessages: ChatMessage[] = [
		{ role: "system", content: systemPromptText },
		{ role: "user", content: prompt }
	];

	const promptObj: Prompt = { messages: chatMessages };

	return Promise.resolve(promptObj.messages);
}

export async function invokeLLM(method: string, promptObj: any, logObj: any): Promise<string> {
	// LLM生成单元测试代码
	if (isOpenAi(method)) {
		return callOpenAi(method, promptObj, logObj);
	} else if(isLlama(method)) {
		return callLocalLLM(method, promptObj, logObj);
	} else {
		vscode.window.showErrorMessage('wrong model name!')
		return "";
	}
}

async function callOpenAi(method: string, promptObj: any, logObj: any): Promise<string> {
	const proxy = "http://166.111.83.92:12333";
	const modelName = getModelName(method);
	process.env.http_proxy = proxy;
	process.env.https_proxy = proxy;
	process.env.HTTP_PROXY = proxy;
	process.env.HTTPS_PROXY = proxy;
	process.env.OPENAI_PROXY_URL = proxy;

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
		const tokenUsage = response.usage!.total_tokens;
		logObj.tokenUsage = tokenUsage;
		logObj.result = result;
		logObj.prompt = promptObj[1].content;
		console.log('Generated test code:', result);
		console.log('Token usage:', tokenUsage);
		return result;
	} catch (e) {
		console.error('Error generating test code:', e);
		throw e;
	}
}

async function callLocalLLM(method: string, promptObj: any, logObj: any): Promise<string> {
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
    // Assuming the response contains 'usage' data with token usage
    const tokenUsage = (result as any).usage.total_tokens || 0;
    logObj.tokenUsage = tokenUsage;
    logObj.result = result;
    logObj.prompt = promptObj[1]?.content; // Adjusted to ensure promptObj[1] exists
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
