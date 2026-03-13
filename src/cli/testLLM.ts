import { Configuration, getConfigInstance, Provider } from '../config';
import { runLLMHealthcheck } from '../llmHealthcheck';

type CliOverrides = {
	workspace?: string;
	provider?: Provider;
	model?: string;
	baseUrl?: string;
	timeoutMs?: number;
	localLLMUrl?: string;
};

function printUsage(): void {
	console.log('Usage: npm run test:llm -- [--provider openai|deepseek|local|ollama] [--model MODEL] [--base-url URL] [--timeout-ms MS] [--workspace PATH] [--local-llm-url URL]');
	console.log('Environment overrides: OPENAI_API_KEY, DEEPSEEK_API_KEY, LOCAL_LLM_URL, LSPRAG_PROVIDER, LSPRAG_MODEL, LSPRAG_BASE_URL, LSPRAG_TIMEOUT_MS');
	console.log('Workspace .vscode/settings.json is also read automatically when available.');
}

function normalizeProvider(value: string): Provider {
	if (value === 'ollama') {
		return 'local';
	}

	if (value === 'openai' || value === 'deepseek' || value === 'local') {
		return value;
	}

	throw new Error(`Unsupported provider: ${value}`);
}

function requireValue(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith('--')) {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
}

function parseCliArgs(args: string[]): CliOverrides {
	const overrides: CliOverrides = {};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === '--help' || arg === '-h') {
			printUsage();
			process.exit(0);
		}

		if (arg === '--provider') {
			overrides.provider = normalizeProvider(requireValue(args, index, arg));
			index++;
			continue;
		}

		if (arg.startsWith('--provider=')) {
			overrides.provider = normalizeProvider(arg.slice('--provider='.length));
			continue;
		}

		if (arg === '--model') {
			overrides.model = requireValue(args, index, arg);
			index++;
			continue;
		}

		if (arg.startsWith('--model=')) {
			overrides.model = arg.slice('--model='.length);
			continue;
		}

		if (arg === '--base-url') {
			overrides.baseUrl = requireValue(args, index, arg);
			index++;
			continue;
		}

		if (arg.startsWith('--base-url=')) {
			overrides.baseUrl = arg.slice('--base-url='.length);
			continue;
		}

		if (arg === '--timeout-ms') {
			overrides.timeoutMs = Number(requireValue(args, index, arg));
			index++;
			continue;
		}

		if (arg.startsWith('--timeout-ms=')) {
			overrides.timeoutMs = Number(arg.slice('--timeout-ms='.length));
			continue;
		}

		if (arg === '--workspace') {
			overrides.workspace = requireValue(args, index, arg);
			index++;
			continue;
		}

		if (arg.startsWith('--workspace=')) {
			overrides.workspace = arg.slice('--workspace='.length);
			continue;
		}

		if (arg === '--local-llm-url') {
			overrides.localLLMUrl = requireValue(args, index, arg);
			index++;
			continue;
		}

		if (arg.startsWith('--local-llm-url=')) {
			overrides.localLLMUrl = arg.slice('--local-llm-url='.length);
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (overrides.timeoutMs !== undefined && !Number.isFinite(overrides.timeoutMs)) {
		throw new Error('timeout-ms must be a number');
	}

	return overrides;
}

async function main(): Promise<void> {
	const overrides = parseCliArgs(process.argv.slice(2));
	Configuration.resetInstance();

	const config = getConfigInstance();
	config.updateConfig({
		workspace: overrides.workspace || process.cwd(),
		...(overrides.provider ? { provider: overrides.provider } : {}),
		...(overrides.model ? { model: overrides.model } : {}),
		...(overrides.baseUrl ? { baseUrl: overrides.baseUrl } : {}),
		...(overrides.timeoutMs !== undefined ? { timeoutMs: overrides.timeoutMs } : {}),
		...(overrides.localLLMUrl ? { localLLMUrl: overrides.localLLMUrl } : {})
	});

	console.log(`[LSPRAG] Testing ${config.provider}/${config.model}`);
	console.log(`[LSPRAG] Workspace: ${config.workspace}`);
	console.log(`[LSPRAG] Timeout: ${Math.round(config.timeoutMs / 1000)}s`);
	if (config.baseUrl) {
		console.log(`[LSPRAG] Base URL: ${config.baseUrl}`);
	}
	if (config.proxyUrl) {
		console.log(`[LSPRAG] Proxy: ${config.proxyUrl}`);
	}

	const result = await runLLMHealthcheck();
	console.log(`[LSPRAG] Success in ${result.elapsedMs}ms: ${result.response}`);
}

main().catch((error) => {
	const errorMessage = error instanceof Error ? error.message : String(error);
	console.error(`[LSPRAG] Test LLM failed: ${errorMessage}`);
	process.exit(1);
});
