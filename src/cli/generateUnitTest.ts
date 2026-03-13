import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Configuration, getConfigInstance, Provider } from '../config';
import {
	downloadAndUnzipVSCode,
	resolveCliArgsFromVSCodeExecutablePath,
	runTests
} from '@vscode/test-electron';

type GenerateCliOptions = {
	workspace: string;
	workspaceExplicit: boolean;
	filePath: string;
	functionName?: string;
	line?: number;
	character?: number;
	provider?: Provider;
	model?: string;
	baseUrl?: string;
	timeoutMs?: number;
	savePath?: string;
	vscodeVersion?: string;
};

const DEFAULT_VSCODE_VERSION = 'stable';
const VSCODE_ENV_KEYS_TO_CLEAR = [
	'VSCODE_IPC_HOOK_CLI',
	'VSCODE_GIT_IPC_HANDLE',
	'VSCODE_GIT_ASKPASS_NODE',
	'VSCODE_GIT_ASKPASS_EXTRA_ARGS',
	'VSCODE_GIT_ASKPASS_MAIN',
	'VSCODE_CWD'
];

function printUsage(): void {
	console.log('Usage: npm run generate:cli -- --file PATH [--function NAME | --line N] [--character N] [--workspace PATH] [--provider openai|deepseek|local|ollama] [--model MODEL] [--base-url URL] [--timeout-ms MS] [--save-path PATH] [--vscode-version VERSION]');
	console.log('Examples:');
	console.log('  npm run generate:cli -- --file src/test/fixtures/python/calculator.py --function compute');
	console.log('  npm run generate:cli -- --file src/test/fixtures/python/calculator.py --line 3');
	console.log('  npm run generate:cli -- --file src/test/fixtures/python/calculator.py --function compute --vscode-version stable');
}

function normalizeProvider(value: string): Provider {
	if (value === 'ollama') {
		return 'local';
	}

	if (value === 'openai' || value === 'deepseek' || value === 'local') {
		return value;
	}

	throw new Error(`Unsupported provider: ${value}. Use openai, deepseek, local, or ollama.`);
}

function requireValue(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith('--')) {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
}

function toNumber(value: string | undefined, flagName: string): number | undefined {
	if (!value) {
		return undefined;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`${flagName} must be a number`);
	}
	return parsed;
}

function findNearestWorkspaceForFile(filePath: string): string {
	const extension = path.extname(filePath).toLowerCase();
	const markersByExtension: Record<string, string[]> = {
		'.py': ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'],
		'.go': ['go.mod'],
		'.java': ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts']
	};
	const markers = markersByExtension[extension] ?? [];
	let currentDir = path.dirname(filePath);

	while (true) {
		if (markers.some(marker => fs.existsSync(path.join(currentDir, marker)))) {
			return currentDir;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			return path.dirname(filePath);
		}
		currentDir = parentDir;
	}
}

function parseArgs(argv: string[]): GenerateCliOptions {
	const options: Partial<GenerateCliOptions> = {};

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === '--help' || arg === '-h') {
			printUsage();
			process.exit(0);
		}

		if (arg === '--workspace') {
			options.workspace = requireValue(argv, index, arg);
			index++;
			continue;
		}
		if (arg.startsWith('--workspace=')) {
			options.workspace = arg.slice('--workspace='.length);
			continue;
		}

		if (arg === '--file') {
			options.filePath = requireValue(argv, index, arg);
			index++;
			continue;
		}
		if (arg.startsWith('--file=')) {
			options.filePath = arg.slice('--file='.length);
			continue;
		}

		if (arg === '--function') {
			options.functionName = requireValue(argv, index, arg);
			index++;
			continue;
		}
		if (arg.startsWith('--function=')) {
			options.functionName = arg.slice('--function='.length);
			continue;
		}

		if (arg === '--line') {
			options.line = toNumber(requireValue(argv, index, arg), 'line');
			index++;
			continue;
		}
		if (arg.startsWith('--line=')) {
			options.line = toNumber(arg.slice('--line='.length), 'line');
			continue;
		}

		if (arg === '--character') {
			options.character = toNumber(requireValue(argv, index, arg), 'character');
			index++;
			continue;
		}
		if (arg.startsWith('--character=')) {
			options.character = toNumber(arg.slice('--character='.length), 'character');
			continue;
		}

		if (arg === '--provider') {
			options.provider = normalizeProvider(requireValue(argv, index, arg));
			index++;
			continue;
		}
		if (arg.startsWith('--provider=')) {
			options.provider = normalizeProvider(arg.slice('--provider='.length));
			continue;
		}

		if (arg === '--model') {
			options.model = requireValue(argv, index, arg);
			index++;
			continue;
		}
		if (arg.startsWith('--model=')) {
			options.model = arg.slice('--model='.length);
			continue;
		}

		if (arg === '--base-url') {
			options.baseUrl = requireValue(argv, index, arg);
			index++;
			continue;
		}
		if (arg.startsWith('--base-url=')) {
			options.baseUrl = arg.slice('--base-url='.length);
			continue;
		}

		if (arg === '--timeout-ms') {
			options.timeoutMs = toNumber(requireValue(argv, index, arg), 'timeout-ms');
			index++;
			continue;
		}
		if (arg.startsWith('--timeout-ms=')) {
			options.timeoutMs = toNumber(arg.slice('--timeout-ms='.length), 'timeout-ms');
			continue;
		}

		if (arg === '--save-path') {
			options.savePath = requireValue(argv, index, arg);
			index++;
			continue;
		}
		if (arg.startsWith('--save-path=')) {
			options.savePath = arg.slice('--save-path='.length);
			continue;
		}

		if (arg === '--vscode-version') {
			options.vscodeVersion = requireValue(argv, index, arg);
			index++;
			continue;
		}
		if (arg.startsWith('--vscode-version=')) {
			options.vscodeVersion = arg.slice('--vscode-version='.length);
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!options.filePath) {
		throw new Error('Missing required argument: --file');
	}

	if (!options.functionName && options.line === undefined) {
		throw new Error('You must provide either --function or --line');
	}

	const workspace = path.resolve(options.workspace || process.cwd());
	const filePath = path.isAbsolute(options.filePath)
		? options.filePath
		: path.resolve(workspace, options.filePath);
	const inferredWorkspace = options.workspace
		? path.resolve(options.workspace)
		: findNearestWorkspaceForFile(filePath);

	return {
		workspace: inferredWorkspace,
		workspaceExplicit: Boolean(options.workspace),
		filePath,
		functionName: options.functionName,
		line: options.line,
		character: options.character ?? 0,
		provider: options.provider,
		model: options.model,
		baseUrl: options.baseUrl,
		timeoutMs: options.timeoutMs,
		savePath: options.savePath,
		vscodeVersion: options.vscodeVersion || process.env.LSPRAG_CLI_VSCODE_VERSION || DEFAULT_VSCODE_VERSION
	};
}

function installLanguageExtensions(cliPath: string, args: string[]): void {
	cp.spawnSync(
		cliPath,
		[
			...args,
			'--install-extension', 'ms-python.python',
			'--install-extension', 'ms-python.vscode-pylance',
			'--install-extension', 'redhat.java',
			'--install-extension', 'golang.go'
		],
		{
			encoding: 'utf-8',
			stdio: 'inherit',
			env: createIsolatedVSCodeEnv()
		}
	);
}

function createIsolatedVSCodeEnv(extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		...process.env,
		DONT_PROMPT_WSL_INSTALL: '1',
		...extraEnv
	};

	for (const key of VSCODE_ENV_KEYS_TO_CLEAR) {
		env[key] = '';
	}

	return env;
}

function getExtensionInstallRoots(): string[] {
	const homeDir = os.homedir();
	return [
		path.join(homeDir, '.vscode-server', 'extensions'),
		path.join(homeDir, '.vscode', 'extensions')
	];
}

function findInstalledExtensionDir(extensionId: string): string | null {
	for (const installRoot of getExtensionInstallRoots()) {
		if (!fs.existsSync(installRoot)) {
			continue;
		}

		const matchedDirs = fs.readdirSync(installRoot)
			.filter(entry => entry === extensionId || entry.startsWith(`${extensionId}-`))
			.map(entry => path.join(installRoot, entry))
			.sort((left, right) => {
				return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
			});
		if (matchedDirs.length > 0) {
			return matchedDirs[0];
		}
	}

	return null;
}

function clearObsoleteMarkers(targetRoot: string, extensionIds: string[]): void {
	const obsoletePath = path.join(targetRoot, '.obsolete');
	if (!fs.existsSync(obsoletePath)) {
		return;
	}

	try {
		const raw = fs.readFileSync(obsoletePath, 'utf8').trim();
		if (!raw) {
			return;
		}

		const parsed = JSON.parse(raw) as Record<string, boolean>;
		let changed = false;

		for (const key of Object.keys(parsed)) {
			if (extensionIds.some(extensionId => key === extensionId || key.startsWith(`${extensionId}-`))) {
				delete parsed[key];
				changed = true;
			}
		}

		if (!changed) {
			return;
		}

		if (Object.keys(parsed).length === 0) {
			fs.writeFileSync(obsoletePath, '{}', 'utf8');
			return;
		}

		fs.writeFileSync(obsoletePath, JSON.stringify(parsed), 'utf8');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[LSPRAG] Failed to clean obsolete extension markers in ${targetRoot}: ${message}`);
	}
}

function syncExtensionsToCodeProfiles(extensionDevelopmentPath: string, extensionIds: string[]): void {
	const targetDirs = [
		path.join(extensionDevelopmentPath, '.vscode-test', 'extensions'),
		path.join(os.homedir(), '.vscode', 'extensions')
	];

	targetDirs.forEach(targetDir => {
		fs.mkdirSync(targetDir, { recursive: true });
		clearObsoleteMarkers(targetDir, extensionIds);
	});

	for (const extensionId of extensionIds) {
		const sourceDir = findInstalledExtensionDir(extensionId);
		if (!sourceDir) {
			console.warn(`[LSPRAG] Installed extension not found in user directories: ${extensionId}`);
			continue;
		}

		for (const targetRoot of targetDirs) {
			const targetDir = path.join(targetRoot, path.basename(sourceDir));
			fs.rmSync(targetDir, { recursive: true, force: true });
			fs.cpSync(sourceDir, targetDir, { recursive: true });
			console.log(`[LSPRAG] Synced extension into ${targetRoot}: ${path.basename(sourceDir)}`);
			clearObsoleteMarkers(targetRoot, extensionIds);
		}
	}
}

function buildResultFilePath(): string {
	return path.join(os.tmpdir(), `lsprag-generate-${Date.now()}.json`);
}

function buildCliConfig(options: GenerateCliOptions) {
	process.env.LSPRAG_WORKSPACE = options.workspace;
	if (options.provider) {
		process.env.LSPRAG_PROVIDER = options.provider;
	}
	if (options.model) {
		process.env.LSPRAG_MODEL = options.model;
	}
	if (options.baseUrl) {
		process.env.LSPRAG_BASE_URL = options.baseUrl;
	}
	if (options.timeoutMs !== undefined) {
		process.env.LSPRAG_TIMEOUT_MS = options.timeoutMs.toString();
	}

	Configuration.resetInstance();
	const config = getConfigInstance();
	config.updateConfig({
		workspace: options.workspace,
		...(options.provider ? { provider: options.provider } : {}),
		...(options.model ? { model: options.model } : {}),
		...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
		...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
		...(options.savePath ? { savePath: options.savePath } : {})
	});
	return config;
}

function buildCredentialHintMessage(workspace: string, provider: Provider): string {
	const settingsPath = path.join(workspace, '.vscode', 'settings.json');
	switch (provider) {
		case 'openai':
			return [
				'OpenAI requires an API key before generation can start.',
				`Set \`OPENAI_API_KEY\` in your shell, or add \`"LSPRAG.openaiApiKey"\` to ${settingsPath}.`,
				'You can also switch provider with `--provider deepseek` or `--provider ollama`.'
			].join(' ');
		case 'deepseek':
			return [
				'DeepSeek requires an API key before generation can start.',
				`Set \`DEEPSEEK_API_KEY\` in your shell, or add \`"LSPRAG.deepseekApiKey"\` to ${settingsPath}.`,
				'You can also switch provider with `--provider openai` or `--provider ollama`.'
			].join(' ');
		case 'local':
			return [
				'Local/Ollama generation requires an endpoint URL before generation can start.',
				`Set \`LOCAL_LLM_URL\` in your shell, or add \`"LSPRAG.localLLMUrl"\` to ${settingsPath}.`,
				'Example: `--provider ollama --model llama3 --base-url` is not enough without `LOCAL_LLM_URL`.'
			].join(' ');
	}
}

function validateLLMConfiguration(options: GenerateCliOptions): void {
	const config = buildCliConfig(options);
	console.log(`[LSPRAG] LLM: ${config.provider}/${config.model}`);

	switch (config.provider) {
		case 'openai':
			if (!config.openaiApiKey && !process.env.OPENAI_API_KEY) {
				throw new Error(buildCredentialHintMessage(options.workspace, 'openai'));
			}
			return;
		case 'deepseek':
			if (!config.deepseekApiKey && !process.env.DEEPSEEK_API_KEY) {
				throw new Error(buildCredentialHintMessage(options.workspace, 'deepseek'));
			}
			return;
		case 'local':
			if (!config.localLLMUrl && !process.env.LOCAL_LLM_URL) {
				throw new Error(buildCredentialHintMessage(options.workspace, 'local'));
			}
			return;
	}
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const extensionDevelopmentPath = path.resolve(__dirname, '../../');
	const extensionTestsPath = path.resolve(__dirname, '../test/generateCliHost');
	const resultFile = buildResultFilePath();

	console.log(`[LSPRAG] Workspace: ${options.workspace}`);
	if (!options.workspaceExplicit) {
		console.log('[LSPRAG] Workspace inferred from target file. Use --workspace to override.');
	}
	console.log(`[LSPRAG] File: ${options.filePath}`);
	if (options.functionName) {
		console.log(`[LSPRAG] Function: ${options.functionName}`);
	}
	if (options.line !== undefined) {
		console.log(`[LSPRAG] Line: ${options.line}`);
	}
	console.log(`[LSPRAG] VS Code version: ${options.vscodeVersion}`);
	validateLLMConfiguration(options);

	const vscodeExecutablePath = await downloadAndUnzipVSCode(options.vscodeVersion || DEFAULT_VSCODE_VERSION);
	const [cliPath, ...vscodeArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
	installLanguageExtensions(cliPath, vscodeArgs);
	syncExtensionsToCodeProfiles(extensionDevelopmentPath, [
		'ms-python.python',
		'ms-python.vscode-pylance',
		'redhat.java',
		'golang.go'
	]);

	try {
		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [options.workspace],
			extensionTestsEnv: {
				...createIsolatedVSCodeEnv(),
				LSPRAG_CLI_WORKSPACE: options.workspace,
				LSPRAG_CLI_FILE_PATH: options.filePath,
				LSPRAG_CLI_FUNCTION_NAME: options.functionName || '',
				LSPRAG_CLI_LINE: options.line?.toString() || '',
				LSPRAG_CLI_CHARACTER: options.character?.toString() || '0',
				LSPRAG_CLI_PROVIDER: options.provider || '',
				LSPRAG_CLI_MODEL: options.model || '',
				LSPRAG_CLI_BASE_URL: options.baseUrl || '',
				LSPRAG_CLI_TIMEOUT_MS: options.timeoutMs?.toString() || '',
				LSPRAG_CLI_SAVE_PATH: options.savePath || '',
				LSPRAG_CLI_RESULT_FILE: resultFile,
				OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
				DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
				LOCAL_LLM_URL: process.env.LOCAL_LLM_URL || '',
				HTTP_PROXY: process.env.HTTP_PROXY || '',
				HTTPS_PROXY: process.env.HTTPS_PROXY || ''
			}
		});
	} catch (error) {
		if (fs.existsSync(resultFile)) {
			const failedResult = JSON.parse(fs.readFileSync(resultFile, 'utf8')) as { error?: string };
			if (failedResult.error) {
				throw new Error(failedResult.error);
			}
		}
		throw error;
	}

	const rawResult = fs.readFileSync(resultFile, 'utf8');
	const parsedResult = JSON.parse(rawResult) as {
		ok: boolean;
		error?: string;
		savedFilePath?: string;
		functionName?: string;
	};

	if (!parsedResult.ok || !parsedResult.savedFilePath) {
		throw new Error(parsedResult.error || 'Generation did not produce an output file.');
	}

	console.log(`[LSPRAG] Generated ${parsedResult.functionName} -> ${parsedResult.savedFilePath}`);
}

main().catch((error) => {
	const errorMessage = error instanceof Error ? error.message : String(error);
	console.error(`[LSPRAG] Generate Unit Test failed: ${errorMessage}`);
	process.exit(1);
});
