import { getConfigInstance } from './config';

export function getCurrentSettingsLines(): string[] {
	const config = getConfigInstance();
	return [
		`Workspace: ${config.workspace}`,
		`Model: ${config.model}`,
		`Provider: ${config.provider}`,
		`Generation Type: ${config.generationType}`,
		`Max Rounds: ${config.maxRound}`,
		`Experiment Probability: ${config.expProb}`,
		`Save Path: ${config.savePath}`,
		`Timeout: ${config.timeoutMs}`
	];
}

export function getCurrentSettingsText(): string {
	return getCurrentSettingsLines().join('\n');
}
