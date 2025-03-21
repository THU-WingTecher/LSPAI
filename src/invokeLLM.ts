import * as vscode from "vscode";
import { OpenAI } from "openai";
import { HttpsProxyAgent } from "https-proxy-agent/dist";
import { Ollama } from 'ollama';
import { getConfigInstance } from "./config";
import * as fs from 'fs';
import * as path from 'path';

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
	return getConfigInstance().model.split("_").pop()!;
}

export function getModelConfigError(): string | undefined {
	const provider = getConfigInstance().provider;
	switch (provider) {
		case 'openai':
			if (!getConfigInstance().openaiApiKey) {
				return 'OpenAI API key is not configured. Please set lspAi.openaiApiKey in settings.';
			}
			break;
		case 'local':
			if (!getConfigInstance().localLLMUrl) {
				return 'Local LLM URL is not configured. Please set lspAi.localLLMUrl in settings.';
			}
			break;
		case 'deepseek':
			if (!getConfigInstance().deepseekApiKey) {
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
	const ollama = new Ollama({ host: getConfigInstance().localLLMUrl });
	try {
		const response = await ollama.chat({
			model: modelName,
			messages: promptObj,
			stream: false,
		});
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

// ... existing code ...
export async function invokeLLM(promptObj: any, logObj: any, maxRetries = 3, retryDelay = 2000): Promise<string> {
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

	const provider = getConfigInstance().provider;
	
	let lastError: Error | null = null;
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			let response: string;
			switch (provider) {
				case 'openai':
					response = await callOpenAi(promptObj, logObj);
					break;
				case 'local':
					response = await callLocalLLM(promptObj, logObj);
					break;
				case 'deepseek':
					response = await callDeepSeek(promptObj, logObj);
					break;
				default:
					console.error("invokeLLM::provider::Wrong Provider", provider);
					throw new Error("Unsupported provider!");
			}
			
			// Log the prompt and response
			const logData = {
				prompt: promptObj[1].content,
				response: response,
				timestamp: new Date().toISOString()
			};
			const logFilePath = path.join(getConfigInstance().logSavePath, 'llm_logs.json');
			fs.appendFileSync(logFilePath, JSON.stringify(logData) + '\n');

			return response;
		} catch (error) {
			lastError = error as Error;
			console.log(`Attempt ${attempt}/${maxRetries} failed: ${error}`);
			
			if (attempt < maxRetries) {
				// Add exponential backoff with jitter for more robust retrying
				const jitter = Math.random() * 1000;
				const delay = retryDelay * Math.pow(2, attempt - 1) + jitter;
				console.log(`Retrying in ${Math.round(delay / 1000)} seconds...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}
	
	// If we've exhausted all retries, throw the last error
	if (lastError) {
		vscode.window.showErrorMessage(`Failed after ${maxRetries} attempts: ${lastError.message}`);
		throw lastError;
	}
	
	return "";
}

export async function callDeepSeek(promptObj: any, logObj: any): Promise<string> {
	
	// const modelName = getModelName(method);
	const modelName = getModelName();
	logObj.prompt = promptObj[1].content;
	
	const apiKey = getConfigInstance().deepseekApiKey;
	
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
		console.log('invokeLLM::callDeepSeek::response', JSON.stringify(response, null, 2));
		const result = response.choices[0].message.content!;
		const tokenUsage = response.usage!.prompt_tokens;
		logObj.tokenUsage = tokenUsage;
		logObj.result = result + "<think>" + ((response.choices[0].message as any).reasoning_content || '');;
		// console.log('Generated test code:', result);
		// console.log('Token usage:', tokenUsage);
		return result;
	} catch (e) {
		console.error('Error generating test code:', e);
		throw e;
	}
}

export async function callOpenAi(promptObj: any, logObj: any): Promise<string> {

	const proxy = getConfigInstance().proxyUrl;
	const apiKey = getConfigInstance().openaiApiKey;
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