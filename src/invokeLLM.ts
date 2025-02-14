import * as vscode from "vscode";
import { OpenAI } from "openai";
import { HttpsProxyAgent } from "https-proxy-agent/dist";
import { Ollama } from 'ollama';

export const TOKENTHRESHOLD = 2000; // Define your token threshold here

export const BASELINE = "naive";

export class TokenLimitExceededError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TokenLimitExceededError";
	}
}

const OPENAIMODELNAME = "gpt";
export function isOpenAi(method: string): boolean {
	return method.includes(OPENAIMODELNAME);
}

const LLAMAMODELNAME = "llama";
export function isLlama(method: string): boolean {
	return method.includes(LLAMAMODELNAME);
}

const DEEPSEEKMODELNAME = "deepseek";
export function isDeepSeek(method: string): boolean {
	return method.includes(DEEPSEEKMODELNAME);
}

export function getModelName(method: string): string {
	return method.split("_").pop()!;
}


export function getModelConfigError(method: string): string | undefined {
    const config = vscode.workspace.getConfiguration('lspAi');

    if (method.includes(OPENAIMODELNAME) && !config.get<string>('openaiApiKey')) {
        return 'OpenAI API key is not configured. Please set lspAi.openaiApiKey in settings.';
    }

    if (method.includes(LLAMAMODELNAME) && !config.get<string>('localLLMUrl')) {
        return 'Local LLM URL is not configured. Please set lspAi.localLLMUrl in settings.';
    }

    if (method.includes(DEEPSEEKMODELNAME) && !config.get<string>('deepseekApiKey')) {
        return 'Deepseek API key is not configured. Please set lspAi.deepseekApiKey in settings.';
    }

    return undefined;
}


export async function callLocalLLM(method: string, promptObj: any, logObj: any): Promise<string> {
	const modelName = getModelName(method);
	logObj.prompt = promptObj[1]?.content; // Adjusted to ensure promptObj[1] exists
	const config = vscode.workspace.getConfiguration('lspAi');
	const ollama = new Ollama({ host: config.get<string>('localLLMUrl') })
	try {
		const response = await ollama.chat({
			model: modelName,
			messages: promptObj,
			stream: false,
		})
	const result = await response;
	const content = (response as any).message.content;
    // Assuming the response contains 'usage' data with token usage
    // const tokenUsage = (result as any).usage.total_tokens || 0;
    // logObj.tokenUsage = tokenUsage;
    logObj.result = result;
	// console.log("Response content:", content);
	return content;
	} catch (error) {
	  console.error("Error sending chat request:", error);
	  throw error;
	}
  }

export async function invokeLLM(method: string, promptObj: any, logObj: any): Promise<string> {
	// LLM生成单元测试代码
	const error = getModelConfigError(method);
	if (error) {
		vscode.window.showErrorMessage(error);
		return "";
	}
	const messageTokens = promptObj[1].content.split(/\s+/).length;
	console.log("Invoking . . .");
	if (messageTokens > TOKENTHRESHOLD) {
		throw new TokenLimitExceededError(`Prompt exceeds token limit of ${TOKENTHRESHOLD} tokens.`);
	}
	if (isOpenAi(method)) {
		return callOpenAi(method, promptObj, logObj);
	} else if (isLlama(method)) {
		return callLocalLLM(method, promptObj, logObj);
	} else if (isDeepSeek(method)) {
		return callDeepSeek(method, promptObj, logObj);
	} else {
		vscode.window.showErrorMessage('wrong model name!');
		return "";
	}
}

export async function callDeepSeek(method: string, promptObj: any, logObj: any): Promise<string> {
	
	const modelName = getModelName(method);
	logObj.prompt = promptObj[1].content;
	
	const config = vscode.workspace.getConfiguration('lspAi');
	const apiKey = config.get<string>('deepseekApiKey');
	
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
		const result = response.choices[0].message.content!;
		const tokenUsage = response.usage!.total_tokens;
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

export async function callOpenAi(method: string, promptObj: any, logObj: any): Promise<string> {
	const config = vscode.workspace.getConfiguration('lspAi');
	const proxy = config.get<string>('proxyUrl');
	const apiKey = config.get<string>('openaiApiKey');
	
	if (!apiKey) {
		throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
	}
	
	const modelName = getModelName(method);
	
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
		const tokenUsage = response.usage!.total_tokens;
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