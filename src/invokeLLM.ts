import * as vscode from "vscode";
import { OpenAI } from "openai";
import { HttpsProxyAgent } from "https-proxy-agent/dist";
import { Ollama } from 'ollama';
import { Configuration, getConfigInstance } from "./config";
import * as fs from 'fs';
import * as path from 'path';

export const TOKENTHRESHOLD = 3000; // Define your token threshold here

export const BASELINE = "naive";

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function envFlagEnabled(value: string | undefined): boolean {
	return TRUE_VALUES.has((value || '').trim().toLowerCase());
}

export function isSkipLLMRequested(): boolean {
	return envFlagEnabled(process.env.LSPRAG_SKIP_LLM) || envFlagEnabled(process.env.TEST_SKIP_LLM);
}

function getDraftCodeFromPrompt(userPrompt: string): string {
	const markers = [
		'### Draft test code with test prefix path coverage requirements',
		'### Draft test code'
	];
	for (const marker of markers) {
		const markerIndex = userPrompt.indexOf(marker);
		if (markerIndex < 0) {
			continue;
		}
		const region = userPrompt.slice(markerIndex + marker.length);
		const match = region.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
		if (match?.[1]) {
			return match[1].trim();
		}
	}
	return '';
}

export function isSkipLLMModeEnabled(): boolean {
	if (!isSkipLLMRequested()) {
		return false;
	}
	return (process.env.TEST_TYPE || '').trim().toLowerCase() === 'config';
}

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
			if (!getConfigInstance().openaiApiKey && !process.env.OPENAI_API_KEY) {
				return 'OpenAI API key is not configured. Please set LSPRAG.openaiApiKey in settings.';
			}
			break;
		case 'local':
			if (!getConfigInstance().localLLMUrl) {
				return 'Local LLM URL is not configured. Please set LSPRAG.localLLMUrl in settings.';
			}
			break;
		case 'deepseek':
			if (!getConfigInstance().deepseekApiKey && !process.env.DEEPSEEK_API_KEY) {
				return 'Deepseek API key is not configured. Please set LSPRAG.deepseekApiKey in settings.';
			}
			break;
		case 'anthropic':
			if (!getClaudeAuthToken()) {
				return 'Claude auth token is not configured. Please set ANTHROPIC_AUTH_TOKEN (or ANTHROPIC_API_KEY).';
			}
			break;
	}
	return undefined;
}

function normalizeToken(rawValue: string | undefined): string | undefined {
	const value = rawValue?.trim();
	if (!value) {
		return undefined;
	}
	return value.endsWith(',') ? value.slice(0, -1).trim() : value;
}

function getClaudeAuthToken(): string | undefined {
	return normalizeToken(process.env.ANTHROPIC_AUTH_TOKEN) || normalizeToken(process.env.ANTHROPIC_API_KEY);
}

function getClaudeBaseUrl(): string {
	const rawBaseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
	if (!rawBaseUrl) {
		return 'https://api.anthropic.com';
	}
	return rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
}

function logLLMInteraction(prompt: string, response: string): void {
	try {
		const logSavePath = getConfigInstance().logSavePath;
		if (!logSavePath) {
			return;
		}

		// Ensure the log directory exists
		if (!fs.existsSync(logSavePath)) {
			fs.mkdirSync(logSavePath, { recursive: true });
		}

		const logFilePath = path.join(logSavePath, 'llm_logs');
		const timestamp = new Date().toISOString();
		const logEntry = `\n${'='.repeat(80)}\n[${timestamp}]\n${'='.repeat(80)}\n\nPROMPT:\n${prompt}\n\n${'-'.repeat(80)}\n\nRESPONSE:\n${response}\n\n`;

		fs.appendFileSync(logFilePath, logEntry, 'utf8');
	} catch (error) {
		console.error('Failed to log LLM interaction:', error);
	}
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
		// // console.log("Response content:", content);
		return content;
	} catch (error) {
		console.error("Error sending chat request:", error);
		throw error;
	}
  }

// ... existing code ...
export async function invokeLLM(promptObj: any, logObj: any = { prompt: '', result: '', tokenUsage: 0, model: '' }, maxRetries = 2, retryDelay = 2000): Promise<string> {
	// Validate promptObj structure
	if (!Array.isArray(promptObj) || promptObj.length < 2) {
		const errorMsg = 'Invalid promptObj: must be an array with at least 2 elements';
		console.error('invokeLLM::error', errorMsg);
		vscode.window.showErrorMessage(errorMsg);
		return "";
	}

	if (!promptObj[0]?.content || !promptObj[1]?.content) {
		const errorMsg = 'Invalid promptObj: elements must have content property';
		console.error('invokeLLM::error', errorMsg);
		vscode.window.showErrorMessage(errorMsg);
		return "";
	}

	if (isSkipLLMModeEnabled()) {
		const userPrompt = promptObj[1]?.content || '';
		const draft = getDraftCodeFromPrompt(userPrompt);
		const syntheticResponse = draft ? `\`\`\`\n${draft}\n\`\`\`` : '```python\npass\n```';
		logObj.prompt = userPrompt;
		logObj.result = syntheticResponse;
		logObj.tokenUsage = '0';
		logLLMInteraction(userPrompt, syntheticResponse);
		return syntheticResponse;
	}

	const error = getModelConfigError();
	if (error) {
		vscode.window.showErrorMessage(error);
		console.error('invokeLLM::error', error);
		return "";
	}

	// // console.log('invokeLLM::promptObj', promptObj);
	// // console.log('invokeLLM::promptObj_system', promptObj[0].content);
	// console.log('invokeLLM::promptObj_user', promptObj[1].content);
	const messageTokens = promptObj[1].content.split(/\s+/).length;
	// // console.log("Invoking . . .");
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
				case 'anthropic':
					response = await callClaude(promptObj, logObj);
					break;
				default:
					console.error("invokeLLM::provider::Wrong Provider", provider);
					throw new Error("Unsupported provider!");
			}
			
			// Log the prompt and response
			if (promptObj[1]?.content) {
				logLLMInteraction(promptObj[1].content, response);
			}

			return response;
		} catch (error) {
			lastError = error as Error;
			// console.log(`Attempt ${attempt}/${maxRetries} failed: ${error}`);
			
			if (attempt < maxRetries) {
				// Add exponential backoff with jitter for more robust retrying
				const jitter = Math.random() * 1000;
				const delay = retryDelay * Math.pow(2, attempt - 1) + jitter;
				// console.log(`Retrying in ${Math.round(delay / 1000)} seconds...`);
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
	logObj.prompt = promptObj[1]?.content || '';
	
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
		// console.log('invokeLLM::callDeepSeek::response', JSON.stringify(response, null, 2));
		const result = response.choices[0].message.content!;
		const tokenUsage = response.usage!.prompt_tokens;
		logObj.tokenUsage = tokenUsage;
		logObj.result = result + "<think>" + ((response.choices[0].message as any).reasoning_content || '');;
		// // console.log('Generated test code:', result);
		// // console.log('Token usage:', tokenUsage);
		return result;
	} catch (e) {
		console.error('Error generating test code:', e);
		throw e;
	}
}

export async function callOpenAi(promptObj: any, logObj: any): Promise<string> {
	// // console.log('invokeLLM::callOpenAi::proxyUrl', getConfigInstance().logAllConfig());
	const proxy = getConfigInstance().proxyUrl;
	const apiKey = getConfigInstance().openaiApiKey;
	// console.log('invokeLLM::callOpenAi::proxy', proxy);
	// // console.log('invokeLLM::callOpenAi::apiKey', apiKey);
	if (!apiKey) {
		throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
	}
	
	// const modelName = getModelName(method);
	const modelName = getModelName();
	// console.log('invokeLLM::callOpenAi::modelName', modelName);
	if (proxy) {
		process.env.http_proxy = proxy;
		process.env.https_proxy = proxy;
		process.env.HTTP_PROXY = proxy;
		process.env.HTTPS_PROXY = proxy;
		process.env.OPENAI_PROXY_URL = proxy;
	}
	
	logObj.prompt = promptObj[1]?.content || '';
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

export async function callClaude(promptObj: any, logObj: any): Promise<string> {
	const modelName = getModelName();
	logObj.prompt = promptObj[1]?.content || '';

	const authToken = getClaudeAuthToken();
	if (!authToken) {
		throw new Error('Claude auth token not configured. Please set ANTHROPIC_AUTH_TOKEN (or ANTHROPIC_API_KEY).');
	}

	if (typeof globalThis.fetch !== 'function') {
		throw new Error('globalThis.fetch is not available in this runtime.');
	}

	const systemPrompt = promptObj
		.filter((msg: any) => msg?.role === 'system' && typeof msg?.content === 'string')
		.map((msg: any) => msg.content)
		.join('\n\n');

	const messages = promptObj
		.filter((msg: any) => msg?.role !== 'system' && typeof msg?.content === 'string')
		.map((msg: any) => ({
			role: msg.role === 'assistant' ? 'assistant' : 'user',
			content: msg.content
		}));

	if (messages.length === 0 && promptObj[1]?.content) {
		messages.push({
			role: 'user',
			content: promptObj[1].content
		});
	}

	const payload: Record<string, any> = {
		model: modelName,
		max_tokens: 2048,
		messages
	};
	if (systemPrompt) {
		payload.system = systemPrompt;
	}

	const response = await globalThis.fetch(`${getClaudeBaseUrl()}/v1/messages`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'anthropic-version': '2023-06-01',
			'x-api-key': authToken,
			'authorization': `Bearer ${authToken}`
		},
		body: JSON.stringify(payload)
	});

	const responseText = await response.text();
	let data: any = null;
	try {
		data = responseText ? JSON.parse(responseText) : null;
	} catch {
		if (!response.ok) {
			throw new Error(`Claude API request failed (${response.status}): ${responseText}`);
		}
		throw new Error(`Claude API returned non-JSON response: ${responseText}`);
	}

	if (!response.ok) {
		const apiError = data?.error?.message || data?.message || responseText || 'Unknown Claude API error';
		throw new Error(`Claude API request failed (${response.status}): ${apiError}`);
	}

	const contentBlocks = Array.isArray(data?.content) ? data.content : [];
	const result = contentBlocks
		.filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
		.map((block: any) => block.text)
		.join('\n')
		.trim();

	if (!result) {
		throw new Error('Claude response did not contain any text content.');
	}

	logObj.tokenUsage = data?.usage?.input_tokens ?? 0;
	logObj.result = data;
	return result;
}
