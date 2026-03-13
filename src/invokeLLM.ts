import { OpenAI } from "openai";
import { HttpsProxyAgent } from "https-proxy-agent/dist";
import { Ollama } from 'ollama';
import { Configuration, getConfigInstance } from "./config";
import * as fs from 'fs';
import * as path from 'path';

type VSCodeLike = {
	window?: {
		showErrorMessage(message: string): void;
	};
};

let vscodeApi: VSCodeLike | null = null;
try {
	vscodeApi = require('vscode') as VSCodeLike;
} catch (error) {
	vscodeApi = null;
}

export const TOKENTHRESHOLD = 3000; // Define your token threshold here

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

function getConfiguredBaseUrl(provider: 'openai' | 'deepseek'): string {
	const customBaseUrl = getConfigInstance().baseUrl?.trim() || process.env.LSPRAG_BASE_URL?.trim();
	if (customBaseUrl) {
		return customBaseUrl;
	}
	return provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1';
}

function getRequestTimeoutMs(): number {
	return getConfigInstance().timeoutMs;
}

function createTimeoutError(provider: string, timeoutMs: number): Error {
	return new Error(`${provider} request timed out after ${Math.round(timeoutMs / 1000)}s`);
}

async function withTimeout<T>(promise: Promise<T>, provider: string, timeoutMs = getRequestTimeoutMs()): Promise<T> {
	let timeoutHandle: NodeJS.Timeout | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutHandle = setTimeout(() => reject(createTimeoutError(provider, timeoutMs)), timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

function extractMessageContent(response: any, provider: string): string {
	const firstChoice = response?.choices?.[0];
	const content = firstChoice?.message?.content;
	if (typeof content !== 'string' || content.length === 0) {
		throw new Error(`${provider} returned an unexpected response: missing choices[0].message.content`);
	}
	return content;
}

export function getModelConfigError(): string | undefined {
	const provider = getConfigInstance().provider;
	switch (provider) {
		case 'openai':
			if (!getConfigInstance().openaiApiKey && !process.env.OPENAI_API_KEY) {
				return 'OpenAI API key is not configured. Please set LSPRAG.openaiApiKey in settings.';
			}
			break;
		case 'local':
			if (!getConfigInstance().localLLMUrl && !process.env.LOCAL_LLM_URL) {
				return 'Local LLM URL is not configured. Please set LSPRAG.localLLMUrl in settings.';
			}
			break;
		case 'deepseek':
			if (!getConfigInstance().deepseekApiKey && !process.env.DEEPSEEK_API_KEY) {
				return 'Deepseek API key is not configured. Please set LSPRAG.deepseekApiKey in settings.';
			}
			break;
	}
	return undefined;
}

function showErrorMessage(message: string): void {
	if (vscodeApi?.window?.showErrorMessage) {
		vscodeApi.window.showErrorMessage(message);
		return;
	}

	console.error(message);
}

export async function callLocalLLM(promptObj: any, logObj: any): Promise<string> {
	// const modelName = getModelName(method);
	const modelName = getModelName();
	logObj.prompt = promptObj[1]?.content; // Adjusted to ensure promptObj[1] exists
	const localLLMUrl = getConfigInstance().localLLMUrl || process.env.LOCAL_LLM_URL;
	if (!localLLMUrl) {
		throw new Error('Local LLM URL not configured. Please set LSPRAG.localLLMUrl in settings or LOCAL_LLM_URL in the environment.');
	}
	const ollama = new Ollama({ host: localLLMUrl });
	try {
		const response = await withTimeout(
			ollama.chat({
				model: modelName,
				messages: promptObj,
				stream: false,
			}) as Promise<any>,
			'Local LLM'
		);
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
export async function invokeLLM(promptObj: any, logObj: any, maxRetries = 2, retryDelay = 2000): Promise<string> {
	const error = getModelConfigError();
	if (error) {
		showErrorMessage(error);
		console.error('invokeLLM::error', error);
		return "";
	}

	// Validate promptObj structure
	if (!Array.isArray(promptObj) || promptObj.length < 2) {
		const errorMsg = 'Invalid promptObj: must be an array with at least 2 elements';
		console.error('invokeLLM::error', errorMsg);
		showErrorMessage(errorMsg);
		return "";
	}

	if (!promptObj[0]?.content || !promptObj[1]?.content) {
		const errorMsg = 'Invalid promptObj: elements must have content property';
		console.error('invokeLLM::error', errorMsg);
		showErrorMessage(errorMsg);
		return "";
	}

	// console.log('invokeLLM::promptObj', promptObj);
	console.log('invokeLLM::promptObj_system', promptObj[0].content);
	console.log('invokeLLM::promptObj_user', promptObj[1].content);
	const messageTokens = promptObj[1].content.split(/\s+/).length;
	// console.log("Invoking . . .");
	// if (messageTokens > TOKENTHRESHOLD) {
	// 	throw new TokenLimitExceededError(`Prompt exceeds token limit of ${TOKENTHRESHOLD} tokens.`);
	// }

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
			if (fs.existsSync(getConfigInstance().logSavePath) && promptObj[1]?.content) {
				const logData = {
					prompt: promptObj[1].content,
					response: response,
					timestamp: new Date().toISOString()
				};
				const logFilePath = path.join(getConfigInstance().logSavePath, 'llm_logs.json');
				fs.appendFileSync(logFilePath, JSON.stringify(logData) + '\n');
			}

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
		showErrorMessage(`Failed after ${maxRetries} attempts: ${lastError.message}`);
		throw lastError;
	}
	
	return "";
}

export async function callDeepSeek(promptObj: any, logObj: any): Promise<string> {
	
	// const modelName = getModelName(method);
	const modelName = getModelName();
	logObj.prompt = promptObj[1]?.content || '';
	
	const proxy = getConfigInstance().proxyUrl || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
	const apiKey = getConfigInstance().deepseekApiKey || process.env.DEEPSEEK_API_KEY;
	
	if (!apiKey) {
		throw new Error('Deepseek API key not configured. Please set it in VS Code settings.');
	}
	
	const openai = new OpenAI({
		baseURL: getConfiguredBaseUrl('deepseek'),
		apiKey: apiKey,
		timeout: getRequestTimeoutMs(),
		...(proxy && { httpAgent: new HttpsProxyAgent(proxy) })
	});
	try {
		const response = await openai.chat.completions.create({
			model: modelName,
			messages: promptObj
		});
		console.log('invokeLLM::callDeepSeek::response', JSON.stringify(response, null, 2));
		const result = extractMessageContent(response, 'DeepSeek');
		const tokenUsage = response.usage?.prompt_tokens;
		logObj.tokenUsage = tokenUsage;
		logObj.result = result + "<think>" + ((response.choices?.[0]?.message as any)?.reasoning_content || '');
		// console.log('Generated test code:', result);
		// console.log('Token usage:', tokenUsage);
		return result;
	} catch (e) {
		console.error('Error generating test code:', e);
		throw e;
	}
}

export async function callOpenAi(promptObj: any, logObj: any): Promise<string> {
	// console.log('invokeLLM::callOpenAi::proxyUrl', getConfigInstance().logAllConfig());
	const proxy = getConfigInstance().proxyUrl || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
	const apiKey = getConfigInstance().openaiApiKey || process.env.OPENAI_API_KEY;
	console.log('invokeLLM::callOpenAi::proxy', proxy);
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
	
	logObj.prompt = promptObj[1]?.content || '';
	const openai = new OpenAI({
		baseURL: getConfiguredBaseUrl('openai'),
		apiKey: apiKey,
		timeout: getRequestTimeoutMs(),
		...(proxy && { httpAgent: new HttpsProxyAgent(proxy) })
	});
	try {
		const response = await openai.chat.completions.create({
			model: modelName,
			messages: promptObj
		});
		const result = extractMessageContent(response, 'OpenAI');
		const tokenUsage = response.usage?.prompt_tokens;
		logObj.tokenUsage = tokenUsage;
		logObj.result = result;
		console.log('Generated test code:', result);
		console.log('Token usage:', tokenUsage);
		return result;
	} catch (e) {
		console.error('Error generating test code:', e);
		throw e;
	}
}
