import { TestResult } from '../core/types';

export async function runWithRetries(
    taskLabel: string,
    maxRetries: number,
    fn: () => Promise<TestResult>
): Promise<TestResult> {
    const retries = Number.isFinite(maxRetries) ? Math.max(0, Math.floor(maxRetries)) : 0;
    const maxAttempts = 1 + retries;
    let attempt = 0;
    let lastResult: TestResult | null = null;

    while (attempt < maxAttempts) {
        attempt += 1;
        const result = await fn();
        const enriched = { ...result, attempts: attempt };
        lastResult = enriched;

        if (result.success) {
            return enriched;
        }

        const failureReason = result.error ? ` error="${result.error}"` : '';
        console.log(`[retry] ${taskLabel} failed attempt ${attempt}/${maxAttempts}.${failureReason}`);

        if (attempt < maxAttempts) {
            console.warn(`Retrying ${taskLabel} (attempt ${attempt + 1}/${maxAttempts})`);
            console.log(`[retry] Retrying ${taskLabel} (attempt ${attempt + 1}/${maxAttempts})`);
        }
    }

    console.log(`[retry] ${taskLabel} exhausted retries (${maxAttempts} attempts).`);
    return lastResult as TestResult;
}
