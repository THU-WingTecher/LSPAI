import * as fs from 'fs';
import * as vscode from 'vscode';
import { getConfigInstance } from '../config';
import { GenerateUnitTestCommandOptions, GenerateUnitTestCommandResult } from '../commands/generateUnitTestCommand';

type CliConfigOverrides = {
	workspace: string;
	provider?: string;
	model?: string;
	baseUrl?: string;
	timeoutMs?: number;
	savePath?: string;
	localLLMUrl?: string;
	openaiApiKey?: string;
	deepseekApiKey?: string;
	proxyUrl?: string;
};

function getRequiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function toNumber(value: string | undefined): number | undefined {
	if (!value || value.trim().length === 0) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function buildConfigOverrides(workspace: string): CliConfigOverrides {
	return {
		workspace,
		...(process.env.LSPRAG_CLI_PROVIDER ? { provider: process.env.LSPRAG_CLI_PROVIDER } : {}),
		...(process.env.LSPRAG_CLI_MODEL ? { model: process.env.LSPRAG_CLI_MODEL } : {}),
		...(process.env.LSPRAG_CLI_BASE_URL ? { baseUrl: process.env.LSPRAG_CLI_BASE_URL } : {}),
		...(toNumber(process.env.LSPRAG_CLI_TIMEOUT_MS) !== undefined ? { timeoutMs: toNumber(process.env.LSPRAG_CLI_TIMEOUT_MS) } : {}),
		...(process.env.LSPRAG_CLI_SAVE_PATH ? { savePath: process.env.LSPRAG_CLI_SAVE_PATH } : {}),
		...(process.env.LOCAL_LLM_URL ? { localLLMUrl: process.env.LOCAL_LLM_URL } : {}),
		...(process.env.OPENAI_API_KEY ? { openaiApiKey: process.env.OPENAI_API_KEY } : {}),
		...(process.env.DEEPSEEK_API_KEY ? { deepseekApiKey: process.env.DEEPSEEK_API_KEY } : {}),
		...(process.env.HTTP_PROXY || process.env.HTTPS_PROXY ? { proxyUrl: process.env.HTTP_PROXY || process.env.HTTPS_PROXY } : {})
	};
}

function applyConfigOverrides(workspace: string): void {
	const overrides = buildConfigOverrides(workspace);
	getConfigInstance().updateConfig(overrides as any);
}

function buildCommandOptions(filePath: string): GenerateUnitTestCommandOptions {
	return {
		filePath,
		functionName: process.env.LSPRAG_CLI_FUNCTION_NAME,
		line: toNumber(process.env.LSPRAG_CLI_LINE),
		character: toNumber(process.env.LSPRAG_CLI_CHARACTER) ?? 0,
		showGeneratedCode: false,
		silent: true
	};
}

function writeResult(resultFile: string, payload: Record<string, unknown>): void {
	fs.writeFileSync(resultFile, JSON.stringify(payload, null, 2), 'utf8');
}

function getExtensionIdsForLanguage(languageId: string): string[] {
	switch (languageId) {
		case 'python':
			return ['ms-python.python', 'ms-python.vscode-pylance'];
		case 'java':
			return ['redhat.java'];
		case 'go':
			return ['golang.go'];
		default:
			return [];
	}
}

async function activateLanguageExtensions(languageId: string): Promise<void> {
	console.log('[LSPRAG] Visible extensions:', vscode.extensions.all.map(extension => extension.id).join(', '));
	const extensionIds = getExtensionIdsForLanguage(languageId);
	for (const extensionId of extensionIds) {
		const extension = vscode.extensions.getExtension(extensionId);
		if (!extension) {
			console.warn(`[LSPRAG] Extension not found: ${extensionId}`);
			continue;
		}

		console.log(`[LSPRAG] Activating extension: ${extensionId}`);
		await extension.activate();
	}
}

async function activateDevelopmentExtension(): Promise<void> {
	const extension = vscode.extensions.getExtension('LSPRAG.LSPRAG');
	if (!extension) {
		throw new Error('Development extension LSPRAG.LSPRAG is not visible in the extension host.');
	}

	console.log(`[LSPRAG] Development extension active=${extension.isActive}`);
	if (!extension.isActive) {
		await extension.activate();
	}
	console.log(`[LSPRAG] Development extension active=${extension.isActive} after activation`);
}

export async function run(): Promise<void> {
	const workspace = getRequiredEnv('LSPRAG_CLI_WORKSPACE');
	const filePath = getRequiredEnv('LSPRAG_CLI_FILE_PATH');
	const resultFile = getRequiredEnv('LSPRAG_CLI_RESULT_FILE');

	try {
		await new Promise(resolve => setTimeout(resolve, 5000));
		applyConfigOverrides(workspace);

		const document = await vscode.workspace.openTextDocument(filePath);
		await vscode.window.showTextDocument(document, {
			preview: true,
			preserveFocus: true
		});
		await activateDevelopmentExtension();
		await activateLanguageExtensions(document.languageId);
		await new Promise(resolve => setTimeout(resolve, 8000));

		const result = await vscode.commands.executeCommand<GenerateUnitTestCommandResult | null>(
			'extension.generateUnitTest',
			buildCommandOptions(filePath)
		);

		if (!result?.savedFilePath) {
			throw new Error('Generation finished without a saved output file.');
		}

		writeResult(resultFile, {
			ok: true,
			sourceFilePath: result.sourceFilePath,
			functionName: result.functionName,
			savedFilePath: result.savedFilePath,
			fullFileName: result.fullFileName
		});
		console.log(`[LSPRAG] Generated test saved to ${result.savedFilePath}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		writeResult(resultFile, {
			ok: false,
			error: errorMessage,
			workspace,
			filePath
		});
		throw error;
	}
}
