/**
 * Manager for running OpenCode programmatically
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { LogEntry } from '../core/types';

/**
 * Configuration for OpenCode Manager
 */
export interface OpencodeConfig {
    sessionId?: string;
    outputDir?: string;
    projectDir?: string;
    model?: string;
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
    private client: any;
    private sharedClient: any;

    constructor(config: OpencodeConfig = {}) {
        this.sessionId = config.sessionId || randomUUID();
        this.projectDir = config.projectDir || '/LSPRAG';
        this.model = config.model || 'o3-mini';
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

    /**
     * Initialize OpenCode client (lazy initialization)
     */
    private async initClient() {
        if (this.sharedClient) {
            this.client = this.sharedClient;
            return this.client;
        }
        
        if (!this.client) {
            try {
                const sdk = await (eval('import("@opencode-ai/sdk")') as Promise<any>);
                const result = await sdk.createOpencode({
                    directory: this.projectDir,
                });
                this.client = result.client;
                console.log('✓ OpenCode client initialized');
            } catch (error: any) {
                throw new Error(`Failed to initialize OpenCode client: ${error.message}`);
            }
        }
        return this.client;
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

        console.log(`Running OpenCode prompt: ${prompt.substring(0, 60)}...`);
        console.log(`Session ID: ${this.sessionId}`);
        console.log(`Model: ${this.model}`);

        try {
            const client = await this.initClient();

            // Create session with directory query parameter
            const sessionResponse = await client.session.create({
                // query: {
                //     directory: this.projectDir  // This sets the working directory!
                // },
                body: {
                    title: fileName
                }
            });
            
            let sessionId = this.sessionId;
            if (sessionResponse.data && sessionResponse.data.id) {
                sessionId = sessionResponse.data.id;
            }

            // Log explicit mapping between local task session and remote OpenCode session
            console.log(`   Task Session ID (local): ${this.sessionId}`);
            console.log(`   OpenCode Session ID (remote): ${sessionId}`);
            
            // Parse model string
            const modelParts = this.model.includes('/') ? this.model.split('/') : ['openai', this.model];
            const providerID = modelParts[0];
            const modelID = modelParts[1] || this.model;
            
            console.log(`   Provider ID: ${providerID}, Model ID: ${modelID}`);
            
            // Send prompt with directory query parameter
            const response = await client.session.prompt({
                path: { 
                    id: sessionId
                },
                // query: {
                //     directory: this.projectDir  // This sets the working directory!
                // },
                body: {
                    model: { 
                        providerID: providerID, 
                        modelID: modelID 
                    },
                    parts: [{ type: "text", text: prompt }]
                }
            });

            const endTime = new Date();
            const durationMs = endTime.getTime() - startTime.getTime();

            // Check for errors in response
            if (response && response.error) {
                const errorMsg = `OpenCode API Error: ${response.error.name} - ${JSON.stringify(response.error.data)}`;
                console.error(`   ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // Debug: Log raw response structure
            console.log(`   Raw response type: ${typeof response}`);
            console.log(`   Raw response keys: ${response ? Object.keys(response) : 'null'}`);
            if (response && response.data) {
                console.log(`   Response.data keys: ${Object.keys(response.data)}`);
                if (response.data.parts) {
                    console.log(`   Response.data.parts length: ${response.data.parts.length}`);
                    console.log(`   Response.data.parts:`, JSON.stringify(response.data.parts, null, 2));
                }
                if (response.data.blocked) {
                    console.log(`   Response blocked: ${response.data.blocked}`);
                }
                if (response.data.info) {
                    console.log(`   Response info:`, JSON.stringify(response.data.info, null, 2));
                }
            }

            // Extract content
            let content = '';
            if (response && response.data) {
                if (response.data.parts && Array.isArray(response.data.parts)) {
                    const textParts = response.data.parts
                        .filter((p: any) => p.type === 'text')
                        .map((p: any) => p.text)
                        .join('\n');
                    content = textParts;
                } else if (response.data.text) {
                    content = response.data.text;
                } else {
                    content = JSON.stringify(response.data);
                }
            } else if (typeof response === 'string') {
                content = response;
            } else if (response && typeof response === 'object') {
                content = response.content || response.result || response.text || JSON.stringify(response);
            }

            // Check for empty content
            if (!content || content.trim() === '') {
                throw new Error(`Empty response from OpenCode: ${JSON.stringify(response, null, 2)}`);
            }

            // Create log entry
            const sessionDetails = await client.session.messages({
                path: { id: sessionId }
            })
            
            const logEntry: LogEntry = {
                prompt: prompt,
                name: fileName,
                response: content,
                sessionId: this.sessionId,
                opencodeSessionId: sessionId,
                opencodeSessionDetails: sessionDetails,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                durationMs: durationMs,
                timestamp: timestamp,
                model: this.model
            };

            fs.writeFileSync(outputFile, JSON.stringify(logEntry, null, 2));

            console.log(`✓ Saved to: ${outputFile}`);
            console.log(`✓ Duration: ${durationMs}ms (${(durationMs / 1000).toFixed(2)}s)`);

            return content;

        } catch (error: any) {
            const endTime = new Date();
            const durationMs = endTime.getTime() - startTime.getTime();
            
            const errorMsg = error.message || String(error);
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
                prompt: prompt,
                name: fileName,
                error: errorMsg,
                errorStack: error.stack,
                errorDetails: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
                sessionId: this.sessionId,
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

