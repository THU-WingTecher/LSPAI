/**
 * Simplest OpenCode SDK invoke demo (server + client).
 *
 * Run:
 *   npm run compile
 *   node out/experiment/opencodeDemo.js
 *
 * Optional env:
 *   OPENCODE_HOSTNAME=127.0.0.1
 *   OPENCODE_PORT=4096
 *   OPENCODE_PROVIDER=openai|anthropic|deepseek|...
 *   OPENCODE_MODEL=gpt-4o-mini|claude-3-5-sonnet-20241022|deepseek-chat|...
 */

import * as net from 'net';

async function getAvailablePort(preferredPort: number, hostname: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const tryPreferred = net.createServer();
        tryPreferred.once('error', (err: any) => {
            if (err?.code === 'EADDRINUSE') {
                const fallback = net.createServer();
                fallback.listen(0, hostname, () => {
                    const address = fallback.address() as net.AddressInfo;
                    fallback.close(() => resolve(address.port));
                });
                fallback.on('error', reject);
            } else {
                reject(err);
            }
        });
        tryPreferred.listen(preferredPort, hostname, () => {
            const address = tryPreferred.address() as net.AddressInfo;
            tryPreferred.close(() => resolve(address.port));
        });
    });
}

function makeBasicAuthHeader(password: string | undefined): string | undefined {
    const pw = password?.trim();
    if (!pw) return undefined;
    return `Basic ${Buffer.from(`opencode:${pw}`).toString('base64')}`;
}

function makeFetchWithAuth(authHeader: string | undefined): typeof fetch | undefined {
    if (!authHeader) return undefined;
    if (typeof globalThis.fetch !== 'function') {
        throw new Error('globalThis.fetch is not available; cannot inject OPENCODE_SERVER_PASSWORD auth header');
    }
    return async (input: any, init?: any) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const headers = new Headers(req.headers);
        headers.set('Authorization', authHeader);
        const authedReq = new Request(req, { headers });
        if (process.env.OPENCODE_DEBUG === '1') {
            // eslint-disable-next-line no-console
            console.log(`[opencodeDemo] ${authedReq.method} ${authedReq.url}`);
            try {
                // eslint-disable-next-line no-console
                console.log(`[opencodeDemo] body=${await authedReq.clone().text()}`);
            } catch {
                // ignore
            }
        }
        return globalThis.fetch(authedReq);
    };
}

function getProviderApiKey(providerID: string): string {
    const p = providerID.toLowerCase();
    if (p === 'openai') return process.env.OPENAI_API_KEY ?? '';
    if (p === 'deepseek') return process.env.DEEPSEEK_API_KEY ?? '';
    if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY ?? '';
    return process.env.OPENAI_API_KEY ?? '';
}

async function main() {
    // Dynamic import to avoid TS moduleResolution issues with package exports.
    const sdk = await (eval('import("@opencode-ai/sdk")') as Promise<any>);
    const { createOpencode, createOpencodeClient } = sdk as { createOpencode: Function; createOpencodeClient: Function };

    const hostname = process.env.OPENCODE_HOSTNAME ?? '127.0.0.1';
    const preferredPort = Number(process.env.OPENCODE_PORT ?? '4096');
    const port = await getAvailablePort(preferredPort, hostname);
    const providerID = process.env.OPENCODE_PROVIDER ?? 'openai';
    const modelID = process.env.OPENCODE_MODEL ?? 'gpt-4o-mini';

    const opencode = await createOpencode({
        hostname,
        port,
        timeout: 30000
    });

    // IMPORTANT:
    // If OPENCODE_SERVER_PASSWORD is set (common for `opencode serve`), the server will return 401
    // unless requests include Basic auth. This 401 is about the server password, NOT your LLM API key.
    const authHeader = makeBasicAuthHeader(process.env.OPENCODE_SERVER_PASSWORD);
    const client = createOpencodeClient({
        baseUrl: opencode.server.url,
        fetch: makeFetchWithAuth(authHeader),
        throwOnError: true
    });

    try {
        const apiKey = getProviderApiKey(providerID);
        const skipAuthSet = process.env.OPENCODE_SKIP_AUTH_SET === '1';
        if (!skipAuthSet && apiKey) {
            try {
                await client.auth.set({
                    path: { id: providerID },
                    body: { type: 'api', key: apiKey }
                });
            } catch (e) {
                // If this fails, you can still proceed if the server already has credentials configured
                // (e.g. via env vars like OPENAI_API_KEY / DEEPSEEK_API_KEY / ANTHROPIC_API_KEY).
                // eslint-disable-next-line no-console
                console.error('[opencodeDemo] auth.set failed; try OPENCODE_SKIP_AUTH_SET=1', e);
            }
        }

        const session = await client.session.create({
            body: { title: 'demo' }
        });

        const sessionId = (session as any)?.data?.id ?? (session as any)?.id;
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
            throw new Error(`Failed to create session: ${JSON.stringify(session)}`);
        }

        const res = await client.session.prompt({
            path: { id: sessionId },
            body: {
                model: { providerID, modelID },
                parts: [{ type: 'text', text: 'Hello from OpenCode SDK. Reply with one short sentence.' }]
            }
        });

        if ((res as any)?.error) {
            throw new Error(`OpenCode error: ${JSON.stringify((res as any).error)}`);
        }

        const text =
            Array.isArray((res as any)?.data?.parts)
                ? (res as any).data.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
                : Array.isArray((res as any)?.data?.message?.parts)
                      ? (res as any).data.message.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
                      : JSON.stringify((res as any)?.data ?? res);

        // eslint-disable-next-line no-console
        console.log(text);
    } finally {
        opencode.server.close();
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
});


