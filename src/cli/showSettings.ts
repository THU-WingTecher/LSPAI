import * as path from 'path';
import { Configuration } from '../config';
import { getCurrentSettingsText } from '../currentSettings';

type CliOverrides = {
	workspace?: string;
};

function printUsage(): void {
	console.log('Usage: npm run show:settings -- [--workspace PATH]');
	console.log('Examples:');
	console.log('  npm run show:settings');
	console.log('  npm run show:settings -- --workspace src/test/fixtures/python');
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

		if (arg === '--workspace') {
			overrides.workspace = requireValue(args, index, arg);
			index++;
			continue;
		}

		if (arg.startsWith('--workspace=')) {
			overrides.workspace = arg.slice('--workspace='.length);
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return overrides;
}

async function main(): Promise<void> {
	const overrides = parseCliArgs(process.argv.slice(2));
	const workspace = path.resolve(overrides.workspace || process.cwd());
	process.env.LSPRAG_WORKSPACE = workspace;

	Configuration.resetInstance();

	console.log('[LSPRAG] Current Settings');
	console.log(getCurrentSettingsText());
}

main().catch((error) => {
	const errorMessage = error instanceof Error ? error.message : String(error);
	console.error(`[LSPRAG] Show Settings failed: ${errorMessage}`);
	process.exit(1);
});
