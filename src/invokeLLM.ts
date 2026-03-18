import * as vscode from "vscode";
import { OpenAI } from "openai";
import { HttpsProxyAgent } from "https-proxy-agent/dist";
import { Ollama } from 'ollama';
import { getConfigInstance } from "./config";
import * as fs from 'fs';
import * as path from 'path';

export const TOKENTHRESHOLD = 3000;
export const BASELINE = "naive";

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEFAULT_CLAUDE_MAX_TOKENS = 12000;

type LLMFailureContext = {
	provider?: string;
	stage?: string;
	attempt?: number;
	maxAttempts?: number;
	retryable?: boolean;
};

function envFlagEnabled(value: string | undefined): boolean {
	return TRUE_VALUES.has((value || '').trim().toLowerCase());
}

function normalizeToken(rawValue: string | undefined): string | undefined {
	const value = rawValue?.trim();
	if (!value) {
		return undefined;
	}
	return value.endsWith(',') ? value.slice(0, -1).trim() : value;
}

function parsePositiveInteger(rawValue: string | undefined): number | undefined {
	if (!rawValue) {
		return undefined;
	}
	const parsed = Number.parseInt(rawValue.trim(), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeInteger(rawValue: string | undefined): number | undefined {
	if (!rawValue) {
		return undefined;
	}
	const parsed = Number.parseInt(rawValue.trim(), 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function isSkipLLMRequested(): boolean {
	return envFlagEnabled(process.env.LSPRAG_SKIP_LLM) || envFlagEnabled(process.env.TEST_SKIP_LLM);
}

export function isSkipLLMModeEnabled(): boolean {
	return isSkipLLMRequested() && (process.env.TEST_TYPE || '').trim().toLowerCase() === 'config';
}

export class TokenLimitExceededError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TokenLimitExceededError";
	}
}

export function getModelName(): string {
	return getConfigInstance().model.split("_").pop()!;
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

function getClaudeMaxTokens(): number {
	return (
		parsePositiveInteger(process.env.LSPRAG_CLAUDE_MAX_TOKENS) ??
		parsePositiveInteger(process.env.ANTHROPIC_MAX_TOKENS) ??
		DEFAULT_CLAUDE_MAX_TOKENS
	);
}

function getInvokeLLMMaxAttempts(defaultValue: number): number {
	const overridden = parseNonNegativeInteger(process.env.LSPRAG_LLM_MAX_ATTEMPTS);
	const value = overridden ?? defaultValue;
	return Math.max(1, value);
}

function getOpenAiSdkMaxRetries(): number {
	return parseNonNegativeInteger(process.env.LSPRAG_OPENAI_SDK_MAX_RETRIES) ?? 0;
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

function getPromptTextForLogging(promptObj: any): string {
	if (Array.isArray(promptObj) && typeof promptObj[1]?.content === 'string') {
		return promptObj[1].content;
	}
	if (typeof promptObj === 'string') {
		return promptObj;
	}
	try {
		return JSON.stringify(promptObj);
	} catch {
		return String(promptObj ?? '');
	}
}

function getPromptValidationError(promptObj: any): string | undefined {
	if (!Array.isArray(promptObj) || promptObj.length < 2) {
		return 'Invalid promptObj: must be an array with at least 2 elements';
	}
	if (!promptObj[0]?.content || !promptObj[1]?.content) {
		return 'Invalid promptObj: elements must have content property';
	}
	return undefined;
}

function ensureLogDirectory(logSavePath: string): void {
	if (!fs.existsSync(logSavePath)) {
		fs.mkdirSync(logSavePath, { recursive: true });
	}
}

function logLLMInteraction(prompt: string, response: string): void {
	try {
		const logSavePath = getConfigInstance().logSavePath;
		if (!logSavePath) {
			return;
		}
		ensureLogDirectory(logSavePath);
		const logFilePath = path.join(logSavePath, 'llm_logs');
		const timestamp = new Date().toISOString();
		const logEntry = `\n${'='.repeat(80)}\n[${timestamp}]\n${'='.repeat(80)}\n\nPROMPT:\n${prompt}\n\n${'-'.repeat(80)}\n\nRESPONSE:\n${response}\n\n`;
		fs.appendFileSync(logFilePath, logEntry, 'utf8');
	} catch (error) {
		console.error('Failed to log LLM interaction:', error);
	}
}

function getErrorStatusCode(error: unknown): number | undefined {
	const rawStatus = (error as any)?.status ?? (error as any)?.statusCode ?? (error as any)?.response?.status;
	const status = Number(rawStatus);
	return Number.isFinite(status) ? status : undefined;
}

function shouldRetryLLMError(error: unknown): boolean {
	const status = getErrorStatusCode(error);
	if (status !== undefined) {
		return status === 408 || status === 409 || status === 429 || status >= 500;
	}

	const code = String((error as any)?.code || '').trim().toUpperCase();
	const retryableCodes = new Set([
		'ECONNRESET',
		'ECONNABORTED',
		'ETIMEDOUT',
		'EAI_AGAIN',
		'ENOTFOUND',
		'ECONNREFUSED',
		'UND_ERR_CONNECT_TIMEOUT',
		'UND_ERR_HEADERS_TIMEOUT',
		'UND_ERR_SOCKET'
	]);
	if (retryableCodes.has(code)) {
		return true;
	}

	const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
	const retryableFragments = [
		'connection error',
		'timeout',
		'timed out',
		'rate limit',
		'too many requests',
		'service unavailable',
		'temporarily unavailable',
		'gateway timeout',
		'bad gateway',
		'internal server error',
		'network error',
		'socket hang up',
		'fetch failed'
	];
	return retryableFragments.some(fragment => message.includes(fragment));
}

function logLLMFailure(prompt: string, error: unknown, context: LLMFailureContext = {}): void {
	const statusCode = getErrorStatusCode(error);
	const rawCode = (error as any)?.code;
	const errorCode = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : undefined;
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : undefined;

	const metaParts: string[] = [];
	if (context.provider) metaParts.push(`provider=${context.provider}`);
	if (context.stage) metaParts.push(`stage=${context.stage}`);
	if (Number.isFinite(context.attempt) && Number.isFinite(context.maxAttempts)) {
		metaParts.push(`attempt=${context.attempt}/${context.maxAttempts}`);
	}
	if (context.retryable !== undefined) metaParts.push(`retryable=${context.retryable}`);
	if (statusCode !== undefined) metaParts.push(`status=${statusCode}`);
	if (errorCode) metaParts.push(`code=${errorCode}`);

	const responsePayload = [
		'[LLM_CALL_FAILED]',
		`META: ${metaParts.length > 0 ? metaParts.join(', ') : 'none'}`,
		`MESSAGE: ${errorMessage}`,
		errorStack ? `STACK:\n${errorStack}` : ''
	]
		.filter(Boolean)
		.join('\n');

	logLLMInteraction(prompt, responsePayload);
}

function applyProxyEnvironment(proxy: string): void {
	process.env.http_proxy = proxy;
	process.env.https_proxy = proxy;
	process.env.HTTP_PROXY = proxy;
	process.env.HTTPS_PROXY = proxy;
	process.env.OPENAI_PROXY_URL = proxy;
}

function createOpenAiClient(apiKey: string, options?: { baseURL?: string; proxy?: string }): OpenAI {
	const proxy = options?.proxy;
	if (proxy) {
		applyProxyEnvironment(proxy);
	}
	return new OpenAI({
		apiKey,
		maxRetries: getOpenAiSdkMaxRetries(),
		...(options?.baseURL ? { baseURL: options.baseURL } : {}),
		...(proxy ? { httpAgent: new HttpsProxyAgent(proxy) } : {})
	});
}

function updateLogObj(logObj: any, values: { prompt?: string; tokenUsage?: any; result?: any }): void {
	if (values.prompt !== undefined) {
		logObj.prompt = values.prompt;
	}
	if (values.tokenUsage !== undefined) {
		logObj.tokenUsage = values.tokenUsage;
	}
	if (values.result !== undefined) {
		logObj.result = values.result;
	}
}

export async function callLocalLLM(promptObj: any, logObj: any): Promise<string> {
	const modelName = getModelName();
	updateLogObj(logObj, { prompt: promptObj[1]?.content });
	const ollama = new Ollama({ host: getConfigInstance().localLLMUrl });

	try {
		const response = await ollama.chat({
			model: modelName,
			messages: promptObj,
			stream: false,
		});
		const content = response.message.content;
		updateLogObj(logObj, {
			tokenUsage: response.prompt_eval_count,
			result: response
		});
		return content;
	} catch (error) {
		console.error("Error sending chat request:", error);
		throw error;
	}
}

export async function callDeepSeek(promptObj: any, logObj: any): Promise<string> {
	const modelName = getModelName();
	updateLogObj(logObj, { prompt: promptObj[1]?.content || '' });

	const apiKey = getConfigInstance().deepseekApiKey;
	if (!apiKey) {
		throw new Error('Deepseek API key not configured. Please set it in VS Code settings.');
	}

	const openai = createOpenAiClient(apiKey, {
		baseURL: 'https://api.deepseek.com'
	});

	try {
		const response = await openai.chat.completions.create({
			model: modelName,
			messages: promptObj
		});
		const result = response.choices[0].message.content!;
		updateLogObj(logObj, {
			tokenUsage: response.usage!.prompt_tokens,
			result: result + "<think>" + ((response.choices[0].message as any).reasoning_content || '')
		});
		return result;
	} catch (error) {
		console.error('Error generating test code:', error);
		throw error;
	}
}

export async function callOpenAi(promptObj: any, logObj: any): Promise<string> {
	const proxy = getConfigInstance().proxyUrl;
	const apiKey = getConfigInstance().openaiApiKey;
	if (!apiKey) {
		throw new Error('OpenAI API key not configured. Please set it in VS Code settings.');
	}

	const modelName = getModelName();
	updateLogObj(logObj, { prompt: promptObj[1]?.content || '' });

	const openai = createOpenAiClient(apiKey, {
		proxy: proxy || undefined
	});

	try {
		const response = await openai.chat.completions.create({
			model: modelName,
			messages: promptObj
		});
		const result = response.choices[0].message.content!;
		updateLogObj(logObj, {
			tokenUsage: response.usage!.prompt_tokens,
			result
		});
		return result;
	} catch (error) {
		console.error('Error generating test code:', error);
		throw error;
	}
}

export async function callClaude(promptObj: any, logObj: any): Promise<string> {
	const modelName = getModelName();
	updateLogObj(logObj, { prompt: promptObj[1]?.content || '' });

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
		max_tokens: getClaudeMaxTokens(),
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

	updateLogObj(logObj, {
		tokenUsage: data?.usage?.input_tokens ?? 0,
		result: data
	});
	return result;
}

async function callProvider(provider: string, promptObj: any, logObj: any): Promise<string> {
	switch (provider) {
		case 'openai':
			return callOpenAi(promptObj, logObj);
		case 'local':
			return callLocalLLM(promptObj, logObj);
		case 'deepseek':
			return callDeepSeek(promptObj, logObj);
		case 'anthropic':
			return callClaude(promptObj, logObj);
		default:
			throw new Error(`Unsupported provider: ${provider}`);
	}
}

function buildSkipLLMResponse(promptObj: any, logObj: any): string {
	const userPrompt = promptObj[1]?.content || '';
	const draft = getDraftCodeFromPrompt(userPrompt);
	const syntheticResponse = draft ? `\`\`\`\n${draft}\n\`\`\`` : '```python\npass\n```';
	updateLogObj(logObj, {
		prompt: userPrompt,
		result: syntheticResponse,
		tokenUsage: '0'
	});
	logLLMInteraction(userPrompt, syntheticResponse);
	return syntheticResponse;
}

export async function invokeLLM(
	promptObj: any,
	logObj: any = { prompt: '', result: '', tokenUsage: 0, model: '' },
	maxRetries = 2,
	retryDelay = 2000
): Promise<string> {
	const promptForLogging = getPromptTextForLogging(promptObj);

	const validationError = getPromptValidationError(promptObj);
	if (validationError) {
		console.error('invokeLLM::error', validationError);
		vscode.window.showErrorMessage(validationError);
		logLLMFailure(promptForLogging, new Error(validationError), { stage: 'validation' });
		return "";
	}

	if (isSkipLLMModeEnabled()) {
		return buildSkipLLMResponse(promptObj, logObj);
	}

	const configError = getModelConfigError();
	if (configError) {
		vscode.window.showErrorMessage(configError);
		console.error('invokeLLM::error', configError);
		logLLMFailure(promptForLogging, new Error(configError), { stage: 'config' });
		return "";
	}

	const provider = getConfigInstance().provider;
	const maxAttempts = getInvokeLLMMaxAttempts(maxRetries);
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await callProvider(provider, promptObj, logObj);
			logLLMInteraction(promptForLogging, response);
			return response;
		} catch (error) {
			lastError = error as Error;
			const retryable = shouldRetryLLMError(error);
			logLLMFailure(promptForLogging, error, {
				provider,
				stage: 'call',
				attempt,
				maxAttempts,
				retryable
			});

			if (attempt >= maxAttempts || !retryable) {
				break;
			}

			const jitter = Math.random() * 1000;
			const delay = retryDelay * Math.pow(2, attempt - 1) + jitter;
			console.warn(
				`invokeLLM retrying attempt ${attempt + 1}/${maxAttempts} after ${Math.round(delay)}ms:`,
				lastError.message
			);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}

	if (lastError) {
		vscode.window.showErrorMessage(`Failed after ${maxAttempts} attempts: ${lastError.message}`);
		throw lastError;
	}

	return "";
}
