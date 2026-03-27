/**
 * Manager for running OpenCode programmatically
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { LogEntry } from '../core/types';
import {
    getProviderApiKeyFromEnv,
    normalizeOpencodeProviderID,
    syncAnthropicCredentials
} from '../utils/providerAuth';

const MAX_OPENCODE_PROMPT_LENGTH = 30000;

type DetectedToolCall = {
    tool: string;
    status?: string;
};

function collectToolCalls(value: any, out: DetectedToolCall[]): void {
    if (!value) {
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectToolCalls(item, out);
        }
        return;
    }
    if (typeof value !== 'object') {
        return;
    }

    const candidateType = value.type;
    const candidateTool = value.tool;
    if (candidateType === 'tool' && typeof candidateTool === 'string' && candidateTool.length > 0) {
        out.push({
            tool: candidateTool,
            status: typeof value.state?.status === 'string' ? value.state.status : undefined
        });
    }

    for (const nested of Object.values(value)) {
        collectToolCalls(nested, out);
    }
}

function extractToolCalls(payload: any): DetectedToolCall[] {
    const calls: DetectedToolCall[] = [];
    collectToolCalls(payload, calls);
    const seen = new Set<string>();
    return calls.filter(call => {
        const key = `${call.tool}|${call.status ?? ''}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function isLspRelatedToolName(toolName: string): boolean {
    return toolName === 'lsp' || toolName.startsWith('lsprag_lsp_');
}

/**
 * Configuration for OpenCode Manager
 */
export interface OpencodeConfig {
    sessionId?: string;
    outputDir?: string;
    projectDir?: string;
    model?: string;
    provider?: string;
    sharedClient?: any;
}

/**
 * Manager for running OpenCode programmatically
 */
export class OpencodeManager {
    private sessionId: string;
    private outputDir: string;
    private projectDir: string;
    private currentDateDir: string;
    private logsDir: string;
    private codesDir: string;
    private model: string;
    private provider: string;
    // private client: any;
    private sharedClient: any;
    private authConfigured: boolean = false;

    constructor(config: OpencodeConfig = {}) {
        this.sessionId = config.sessionId || randomUUID();
        this.projectDir = config.projectDir || '/LSPRAG';
        this.model = config.model || 'o3-mini';
        this.provider = this.normalizeProviderID(config.provider || process.env.OPENCODE_PROVIDER || 'openai');
        this.sharedClient = config.sharedClient;
        
        // Create date-based directory structure
        const currentDate = new Date().toISOString().split('T')[0];
        this.currentDateDir = config.outputDir || path.join(process.cwd(), 'opencode-outputs', currentDate);
        this.logsDir = path.join(this.currentDateDir, 'logs');
        this.codesDir = path.join(this.currentDateDir, 'codes');
        this.outputDir = this.logsDir;
        
        // Create directories
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
        if (!fs.existsSync(this.codesDir)) {
            fs.mkdirSync(this.codesDir, { recursive: true });
        }
    }

    private normalizeProviderID(providerID: string): string {
        return normalizeOpencodeProviderID(providerID);
    }

    /**
     * Initialize OpenCode client (lazy initialization)
     */
    private async initClient() {
        // if (this.client) return this.client;

        if (this.sharedClient) {
            // this.client = this.sharedClient;
            return this.sharedClient;
        }

        // Avoid spinning up another server; reuse existing one via BASE_URL
        const baseUrl = process.env.OPENCODE_BASE_URL;
        if (baseUrl) {
            const sdk = await (eval('import("@opencode-ai/sdk")') as Promise<any>);
            const password = process.env.OPENCODE_SERVER_PASSWORD || '';
            const basicAuth =
                password ? `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` : undefined;
            const authedFetch = basicAuth
                ? ((input: any, init?: any) => {
                      if (typeof globalThis.fetch !== 'function') {
                          throw new Error('globalThis.fetch is not available; cannot inject OPENCODE_SERVER_PASSWORD auth header');
                      }
                      const req = input instanceof Request ? input : new Request(input, init);
                      const headers = new Headers(req.headers);
                      headers.set('Authorization', basicAuth);
                      const authedReq = new Request(req, { headers });
                      return globalThis.fetch(authedReq);
                  }) satisfies (typeof fetch)
                : undefined;
            this.sharedClient = sdk.createOpencodeClient({
                baseUrl,
                fetch: authedFetch
            });
            await this.ensureProviderAuth();
            return this.sharedClient;
        }

        throw new Error(
            'OpenCode client not initialized. Pass sharedClient or set OPENCODE_BASE_URL.'
        );
    }

    private getProviderApiKey(): string {
        return getProviderApiKeyFromEnv(this.provider || '');
    }

    private async ensureProviderAuth(): Promise<void> {
        if (this.authConfigured) {
            return;
        }
        this.authConfigured = true;

        if (this.normalizeProviderID(this.provider) === 'anthropic') {
            const credential = syncAnthropicCredentials();
            if (!credential) {
                throw new Error(
                    "Anthropic API key is missing. Set ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY before running opencode."
                );
            }
        }

        const skipAuthSet = process.env.OPENCODE_SKIP_AUTH_SET === '1';
        if (skipAuthSet) {
            return;
        }

        const apiKey = this.getProviderApiKey();
        if (!apiKey) {
            return;
        }

        try {
            const providerID = this.normalizeProviderID(this.provider);
            const result = await this.sharedClient?.auth?.set?.({
                path: { id: providerID },
                query: this.projectDir ? { directory: this.projectDir } : undefined,
                body: { type: 'api', key: apiKey }
            });
            if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
                const msg = `[opencode] auth.set returned error: ${JSON.stringify((result as any).error)}`;
                if (providerID === 'anthropic') {
                    throw new Error(msg);
                }
                console.warn(`${msg} set OPENCODE_SKIP_AUTH_SET=1 to skip.`);
            }
        } catch (e) {
            if (this.normalizeProviderID(this.provider) === 'anthropic') {
                throw e;
            }
            console.warn('[opencode] auth.set threw; set OPENCODE_SKIP_AUTH_SET=1 to skip.', e);
        }
    }

    public getProjectDir(): string {
        return this.projectDir;
    }

    public getSessionId(): string {
        return this.sessionId;
    }

    public setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    /**
     * Run a single prompt and save output
     */
    public async runPrompt(prompt: string, outputName?: string): Promise<string> {
        const startTime = new Date();
        const timestamp = Date.now();
        const fileName = outputName || `prompt_${timestamp}`;
        const outputFile = path.join(this.logsDir, `${fileName}.json`);
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        let sessionCreateResponse: any;
        let promptResponse: any;
        let sessionMessagesResponse: any;
        const requestPayload: any = {};
        const truncationMarker = '\n...[truncated]...\n';
        const keepLength = MAX_OPENCODE_PROMPT_LENGTH - truncationMarker.length;
        const headLength = Math.ceil(keepLength * 0.7);
        const finalPrompt = prompt.length > MAX_OPENCODE_PROMPT_LENGTH
            ? prompt.slice(0, headLength) + truncationMarker + prompt.slice(-(keepLength - headLength))
            : prompt;

        console.log(`Running OpenCode prompt: ${finalPrompt.substring(0, 60)}...`);
        console.log(`Session ID: ${this.sessionId}`);
        console.log(`Model: ${this.model}`);
        console.log(`Prompt length: ${finalPrompt.length} chars`);
        if (finalPrompt !== prompt) {
            console.warn(
                `   Prompt exceeded ${MAX_OPENCODE_PROMPT_LENGTH} chars and was truncated ` +
                `from ${prompt.length} to ${finalPrompt.length} chars.`
            );
            requestPayload.promptTruncation = {
                originalLength: prompt.length,
                truncatedLength: finalPrompt.length,
                maxLength: MAX_OPENCODE_PROMPT_LENGTH
            };
        }

        try {
            const client = await this.initClient();
            // Sanity check connection
            // await client.global.health();
            // await client.auth.set({
            //     path: { id: "openai" },
            //     body: { type: "api", key: process.env.OPENAI_API_KEY },
            //   })
            // console.log('client', client);

            // Create session
            sessionCreateResponse = await client.session.create({
                query: this.projectDir ? { directory: this.projectDir } : undefined,
                body: {
                    title: fileName
                }
            });
            // console.log('sessionResponse', sessionCreateResponse);
            const sessionCreateStatus = (sessionCreateResponse as any)?.response?.status;
            const sessionCreateStatusText = (sessionCreateResponse as any)?.response?.statusText;
            if (sessionCreateStatus || sessionCreateStatusText) {
                console.log(`   session.create HTTP: ${sessionCreateStatus ?? 'unknown'} ${sessionCreateStatusText ?? ''}`);
            }
            let sessionId = this.sessionId;
            if (sessionCreateResponse.data && sessionCreateResponse.data.id) {
                sessionId = sessionCreateResponse.data.id;
            }

            // Log explicit mapping between local task session and remote OpenCode session
            console.log(`   Task Session ID (local): ${this.sessionId}`);
            console.log(`   OpenCode Session ID (remote): ${sessionId}`);
            
            // Parse model string
            const modelParts = this.model.includes('/') ? this.model.split('/') : [this.provider, this.model];
            const providerID = this.normalizeProviderID(modelParts[0] || this.provider);
            const modelID = modelParts[1] || this.model;
            console.log(`   Provider ID: ${providerID}, Model ID: ${modelID}`);
            
            // Send prompt
            requestPayload.model = { providerID, modelID };
            requestPayload.parts = [{ type: "text", text: finalPrompt }];
            const promptRequest: any = {
                path: { 
                    id: sessionId
                },
                query: this.projectDir ? { directory: this.projectDir } : undefined,
                body: {
                    model: requestPayload.model,
                    parts: requestPayload.parts
                }
            };
            promptResponse = await client.session.prompt(promptRequest);
            console.log('response', promptResponse);
            const promptStatus = (promptResponse as any)?.response?.status;
            const promptStatusText = (promptResponse as any)?.response?.statusText;
            if (promptStatus || promptStatusText) {
                console.log(`   prompt HTTP: ${promptStatus ?? 'unknown'} ${promptStatusText ?? ''}`);
            }
            const providerDetail = (promptResponse as any)?.data?.provider;
            if (providerDetail) {
                console.log(`   prompt provider detail: ${JSON.stringify(providerDetail, null, 2)}`);
            }
            const endTime = new Date();
            const durationMs = endTime.getTime() - startTime.getTime();

            // Check for errors in response
            if (promptResponse && promptResponse.error) {
                const errorMsg = `OpenCode API Error: ${promptResponse.error.name} - ${JSON.stringify(promptResponse.error.data)}`;
                console.error(`   ${errorMsg}`);
                throw new Error(errorMsg);
            }
            const providerError = (promptResponse as any)?.data?.info?.error;
            if (providerError) {
                const providerName = providerError?.name ?? 'ProviderError';
                const providerData = providerError?.data ?? {};
                const providerMessage = providerData?.message || JSON.stringify(providerData || providerError);
                const providerUrl = providerData?.metadata?.url ? ` url=${providerData.metadata.url}` : '';
                const providerStatus = providerData?.statusCode ? ` status=${providerData.statusCode}` : '';
                const errorMsg = `OpenCode provider error (${providerName}): ${providerMessage}${providerStatus}${providerUrl}`;
                console.error(`   ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // Debug: Log raw response structure
            console.log(`   Raw response type: ${typeof promptResponse}`);
            console.log(`   Raw response keys: ${promptResponse ? Object.keys(promptResponse) : 'null'}`);
            if (promptResponse && promptResponse.data) {
                console.log(`   Response.data keys: ${Object.keys(promptResponse.data)}`);
                if (promptResponse.data.parts) {
                    console.log(`   Response.data.parts length: ${promptResponse.data.parts.length}`);
                    console.log(`   Response.data.parts:`, JSON.stringify(promptResponse.data.parts, null, 2));
                }
                if (promptResponse.data.blocked) {
                    console.log(`   Response blocked: ${promptResponse.data.blocked}`);
                }
                if (promptResponse.data.info) {
                    console.log(`   Response info:`, JSON.stringify(promptResponse.data.info, null, 2));
                }
            }

            // Extract content
            let content = '';
            if (promptResponse && promptResponse.data) {
                if (promptResponse.data.parts && Array.isArray(promptResponse.data.parts)) {
                    const textParts = promptResponse.data.parts
                        .filter((p: any) => p.type === 'text')
                        .map((p: any) => p.text)
                        .join('\n');
                    content = textParts;
                } else if (promptResponse.data.text) {
                    content = promptResponse.data.text;
                } else {
                    content = JSON.stringify(promptResponse.data);
                }
            } else if (typeof promptResponse === 'string') {
                content = promptResponse;
            } else if (promptResponse && typeof promptResponse === 'object') {
                content = promptResponse.content || promptResponse.result || promptResponse.text || JSON.stringify(promptResponse);
            }

            // Check for empty content
            if (!content || content.trim() === '') {
                throw new Error(
                    `Empty response from OpenCode (status=${promptStatus ?? 'n/a'} ${promptStatusText ?? ''}): ${JSON.stringify(promptResponse, null, 2)}`
                );
            }

            // Create log entry
            sessionMessagesResponse = await client.session.messages({
                path: { id: sessionId },
                query: this.projectDir ? { directory: this.projectDir } : undefined
            });
            
            const logEntry: LogEntry = {
                prompt: finalPrompt,
                name: fileName,
                response: content,
                sessionId: this.sessionId,
                opencodeSessionId: sessionId,
                opencodeSessionDetails: sessionMessagesResponse,
                requestPayload,
                promptResponse,
                sessionCreateResponse,
                sessionMessagesResponse,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                durationMs: durationMs,
                timestamp: timestamp,
                model: this.model
            };

            const toolCalls = extractToolCalls(sessionMessagesResponse);
            if (toolCalls.length > 0) {
                console.log(`   Tool calls: ${toolCalls.map(call => `${call.tool}${call.status ? `(${call.status})` : ''}`).join(', ')}`);
            }
            const lspToolCalls = toolCalls.filter(call => isLspRelatedToolName(call.tool));
            if (lspToolCalls.length > 0) {
                console.log(`   LSP tool calls: ${lspToolCalls.map(call => call.tool).join(', ')}`);
            } else {
                console.warn('   No LSP-related tool call detected in session messages.');
            }
            (logEntry as any).toolCalls = toolCalls;
            (logEntry as any).lspToolCalls = lspToolCalls;

            fs.writeFileSync(outputFile, JSON.stringify(logEntry, null, 2));

            console.log(`✓ Saved to: ${outputFile}`);
            console.log(`✓ Duration: ${durationMs}ms (${(durationMs / 1000).toFixed(2)}s)`);

            return content;

        } catch (error: any) {
            const endTime = new Date();
            const durationMs = endTime.getTime() - startTime.getTime();
            
            const errorMsg = error.message || String(error);
            console.log(
                `[opencode][prompt-failed] name=${fileName} session=${this.sessionId} ` +
                `provider=${this.provider} model=${this.model} durationMs=${durationMs} error=${errorMsg}`
            );
            console.error(`✗ OpenCode error: ${errorMsg}`);
            
            // Provide detailed error information
            if (errorMsg.includes('fetch failed')) {
                console.error(`
================================================================================
FETCH FAILED ERROR - This usually indicates:

1. Missing or invalid OpenAI API key
   - Check if OPENAI_API_KEY environment variable is set
   - Run: echo $OPENAI_API_KEY
   - If empty, set it: export OPENAI_API_KEY="your-key-here"

2. Network connectivity issues
   - Check if you can reach api.openai.com
   - Run: curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"

3. OpenCode configuration
   - OpenCode might need additional configuration
   - Check OpenCode logs at: ~/.local/share/opencode/log/

4. Model availability
   - The model "${this.model}" might not be available in your OpenAI account
   - Try: gpt-4o, gpt-4o-mini, or gpt-3.5-turbo

5. Rate limits or quota
   - Check if you've exceeded API rate limits
   - Visit: https://platform.openai.com/account/usage

Error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}
================================================================================
`);
            }

            const errorLogEntry = {
                prompt: finalPrompt,
                name: fileName,
                error: errorMsg,
                errorStack: error.stack,
                errorDetails: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
                sessionId: this.sessionId,
                sessionCreateResponse,
                promptResponse,
                sessionMessagesResponse,
                requestPayload,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                durationMs: durationMs,
                timestamp: timestamp,
                model: this.model
            };
            fs.writeFileSync(outputFile, JSON.stringify(errorLogEntry, null, 2));

            throw new Error(`OpenCode command failed: ${errorMsg}`);
        }
    }

    public getOutputDir(): string {
        return this.outputDir;
    }

    public getLogsDir(): string {
        return this.logsDir;
    }

    public getCodesDir(): string {
        return this.codesDir;
    }

    public getCurrentDateDir(): string {
        return this.currentDateDir;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Generate a new UUID for session ID
 */
export function generateUUID(): string {
    return randomUUID();
}
