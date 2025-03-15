import * as vscode from "vscode";
import { OpenAI } from "openai";
import { HttpsProxyAgent } from "https-proxy-agent/dist";
import { Ollama } from 'ollama';
import { configInstance } from "./config";

export const TOKENTHRESHOLD = 2000; // Define your token threshold here

export const BASELINE = "naive";

export class TokenLimitExceededError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TokenLimitExceededError";
	}
}

// const OPENAIMODELNAME = "gpt";
// const OPENAIMODELNAME2 = "o1";
// const OPENAIMODELNAME3 = "o3";
// export function isOpenAi(method: string): boolean {
// 	return method.includes(OPENAIMODELNAME) || method.includes(OPENAIMODELNAME2) || method.includes(OPENAIMODELNAME3);
// }

// const LLAMAMODELNAME = "llama";
// export function isLlama(method: string): boolean {
// 	return method.includes(LLAMAMODELNAME);
// }

// const DEEPSEEKMODELNAME = "deepseek";
// export function isDeepSeek(method: string): boolean {
// 	return method.includes(DEEPSEEKMODELNAME);
// }

export function getModelName(): string {
	return configInstance.model.split("_").pop()!;
}

export function getModelConfigError(): string | undefined {
	const provider = configInstance.provider;
	switch (provider) {
		case 'openai':
			if (!configInstance.openaiApiKey) {
				return 'OpenAI API key is not configured. Please set lspAi.openaiApiKey in settings.';
			}
			break;
		case 'local':
			if (!configInstance.localLLMUrl) {
				return 'Local LLM URL is not configured. Please set lspAi.localLLMUrl in settings.';
			}
			break;
		case 'deepseek':
			if (!configInstance.deepseekApiKey) {
				return 'Deepseek API key is not configured. Please set lspAi.deepseekApiKey in settings.';
			}
			break;
	}
	return undefined;
}

export async function callLocalLLM(promptObj: any, logObj: any): Promise<string> {
	// const modelName = getModelName(method);
	const modelName = getModelName();
	logObj.prompt = promptObj[1]?.content; // Adjusted to ensure promptObj[1] exists
	const ollama = new Ollama({ host: configInstance.localLLMUrl })
	try {
		const response = await ollama.chat({
			model: modelName,
			messages: promptObj,
			stream: false,
		})
	const result = await response;
	const content = result.message.content;
	const tokenUsage = result.prompt_eval_count;
    logObj.tokenUsage = tokenUsage;
    logObj.result = result;
	// console.log("Response content:", content);
	return content;
	} catch (error) {
	  console.error("Error sending chat request:", error);
	  throw error;
	}
  }

export async function invokeLLM(promptObj: any, logObj: any): Promise<string> {
	const error = getModelConfigError();
	if (error) {
		vscode.window.showErrorMessage(error);
		console.error('invokeLLM::error', error);
		return "";
	}

	// console.log('invokeLLM::promptObj', promptObj);
	const messageTokens = promptObj[1].content.split(/\s+/).length;
	// console.log("Invoking . . .");
	if (messageTokens > TOKENTHRESHOLD) {
		throw new TokenLimitExceededError(`Prompt exceeds token limit of ${TOKENTHRESHOLD} tokens.`);
	}

	const provider = configInstance.provider;
	switch (provider) {
		case 'openai':
			return callOpenAi(promptObj, logObj);
		case 'local':
			return callLocalLLM(promptObj, logObj);
		case 'deepseek':
			return callDeepSeek(promptObj, logObj);
		default:
			vscode.window.showErrorMessage('Unsupported provider!');
			return "";
	}
}

export async function callDeepSeek(promptObj: any, logObj: any): Promise<string> {
	
	// const modelName = getModelName(method);
	const modelName = getModelName();
	logObj.prompt = promptObj[1].content;
	
	const apiKey = configInstance.deepseekApiKey;
	
	if (!apiKey) {
		throw new Error('Deepseek API key not configured. Please set it in VS Code settings.');
	}
	
	const openai = new OpenAI({
		baseURL: 'https://api.deepseek.com',
		apiKey: apiKey,
	});
	try {
		const response = await openai.chat.completions.create({
			model: modelName,
			messages: promptObj
		});

		const result = response.choices[0].message.content! + "<think>" + ((response.choices[0].message as any).reasoning_content || '');
		const tokenUsage = response.usage!.prompt_tokens;
		logObj.tokenUsage = tokenUsage;
		logObj.result = result;
		// console.log('Generated test code:', result);
		// console.log('Token usage:', tokenUsage);
		return result;
	} catch (e) {
		console.error('Error generating test code:', e);
		throw e;
	}
}

export async function callOpenAi(promptObj: any, logObj: any): Promise<string> {

	const proxy = configInstance.proxyUrl;
	const apiKey = configInstance.openaiApiKey;
	// console.log('invokeLLM::callOpenAi::proxy', proxy);
	// console.log('invokeLLM::callOpenAi::apiKey', apiKey);
	if (!apiKey) {
		throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
	}
	
	// const modelName = getModelName(method);
	const modelName = getModelName();
	console.log('invokeLLM::callOpenAi::modelName', modelName);
	if (proxy) {
		process.env.http_proxy = proxy;
		process.env.https_proxy = proxy;
		process.env.HTTP_PROXY = proxy;
		process.env.HTTPS_PROXY = proxy;
		process.env.OPENAI_PROXY_URL = proxy;
	}
	
	logObj.prompt = promptObj[1].content;
	const openai = new OpenAI({
		apiKey: apiKey,
		...(proxy && { httpAgent: new HttpsProxyAgent(proxy) })
	});
	try {
		const response = await openai.chat.completions.create({
			model: modelName,
			messages: promptObj
		});
		const result = response.choices[0].message.content!;
		const tokenUsage = response.usage!.prompt_tokens;
		logObj.tokenUsage = tokenUsage;
		logObj.result = result;
		// console.log('Generated test code:', result);
		// console.log('Token usage:', tokenUsage);
		return result;
	} catch (e) {
		console.error('Error generating test code:', e);
		throw e;
	}
}