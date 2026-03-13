import { getConfigInstance } from './config';
import { invokeLLM } from './invokeLLM';

type PromptMessage = {
	role: 'system' | 'user';
	content: string;
};

export interface LLMHealthcheckResult {
	provider: string;
	model: string;
	timeoutSeconds: number;
	elapsedMs: number;
	response: string;
}

export function createLLMHealthcheckPrompt(): PromptMessage[] {
	return [
		{
			role: 'system',
			content: 'Reply with exactly: OK'
		},
		{
			role: 'user',
			content: 'Reply with exactly: OK'
		}
	];
}

export async function runLLMHealthcheck(): Promise<LLMHealthcheckResult> {
	const config = getConfigInstance();
	const provider = config.provider;
	const model = config.model;
	const timeoutSeconds = Math.round(config.timeoutMs / 1000);
	const startedAt = Date.now();

	const response = (await invokeLLM(createLLMHealthcheckPrompt(), [], 1, 0)).trim();
	if (response !== 'OK') {
		throw new Error(`Unexpected LLM response: ${response || '(empty)'}`);
	}

	return {
		provider,
		model,
		timeoutSeconds,
		elapsedMs: Date.now() - startedAt,
		response
	};
}
