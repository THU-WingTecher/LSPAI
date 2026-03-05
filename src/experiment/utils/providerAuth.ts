export type ExperimentTypeForProvider = 'baseline' | 'opencode' | 'claudecode';

export function normalizeToken(rawValue?: string): string | undefined {
    const value = rawValue?.trim();
    if (!value) {
        return undefined;
    }
    return value.endsWith(',') ? value.slice(0, -1).trim() : value;
}

export function normalizeProviderName(rawValue: string): string {
    const normalized = (rawValue || '').trim().toLowerCase();
    return normalized === 'anthopic' ? 'anthropic' : normalized;
}

export function normalizeProviderForType(provider: string, type: ExperimentTypeForProvider): string {
    const normalized = normalizeProviderName(provider);
    if ((type === 'opencode' || type === 'claudecode') && normalized === 'claude') {
        return 'anthropic';
    }
    return normalized;
}

export function normalizeOpencodeProviderID(providerID: string): string {
    const normalized = normalizeProviderName(providerID);
    return normalized === 'claude' ? 'anthropic' : normalized;
}

export function syncAnthropicCredentials(env: NodeJS.ProcessEnv = process.env): string | undefined {
    const credential = normalizeToken(env.ANTHROPIC_AUTH_TOKEN) || normalizeToken(env.ANTHROPIC_API_KEY);
    if (!credential) {
        return undefined;
    }

    env.ANTHROPIC_AUTH_TOKEN = credential;
    env.ANTHROPIC_API_KEY = credential;
    return credential;
}

export function ensureAnthropicCredentials(
    context: 'opencode' | 'claudecode',
    env: NodeJS.ProcessEnv = process.env
): string {
    const credential = syncAnthropicCredentials(env);
    if (!credential) {
        throw new Error(
            `${context} with Anthropic provider requires ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY.`
        );
    }
    return credential;
}

export function getProviderApiKeyFromEnv(
    providerID: string,
    env: NodeJS.ProcessEnv = process.env
): string {
    const normalizedProviderID = normalizeOpencodeProviderID(providerID);
    if (normalizedProviderID === 'openai') {
        return normalizeToken(env.OPENAI_API_KEY) ?? '';
    }
    if (normalizedProviderID === 'deepseek') {
        return normalizeToken(env.DEEPSEEK_API_KEY) ?? '';
    }
    if (normalizedProviderID === 'anthropic') {
        return normalizeToken(env.ANTHROPIC_AUTH_TOKEN) || normalizeToken(env.ANTHROPIC_API_KEY) || '';
    }
    return normalizeToken(env.OPENAI_API_KEY) ?? '';
}
