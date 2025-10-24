import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * Configuration for OpenCode Manager
 */
export interface OpencodeConfig {
    sessionId?: string;  // UUID for session continuity
    outputDir?: string;  // Directory to save outputs
    projectDir?: string;  // Project root directory
    model?: string;      // Model to use (e.g., gpt-4, claude-3-5-sonnet)
}

/**
 * Log entry with metadata
 */
export interface OpencodeLogEntry {
    prompt: string;
    name: string;
    response: string;
    sessionId: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    timestamp: number;
    model: string;
}

/**
 * Manager for running OpenCode programmatically
 * This mirrors the ClaudeCodeRouterManager interface
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
    private sharedClient: any; // For reusing an existing client

    constructor(config: OpencodeConfig = {}) {
        this.sessionId = config.sessionId || randomUUID();
        this.projectDir = config.projectDir || '/LSPRAG';
        this.model = config.model || 'gpt-4';
        this.sharedClient = (config as any).sharedClient; // Accept existing client
        
        // Create date-based directory structure: YYYY-MM-DD/
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        this.currentDateDir = config.outputDir || path.join(process.cwd(), 'opencode-outputs', currentDate);
        this.logsDir = path.join(this.currentDateDir, 'logs');
        this.codesDir = path.join(this.currentDateDir, 'codes');
        this.outputDir = this.logsDir; // Keep compatibility
        
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
        // If a shared client was provided, use it
        if (this.sharedClient) {
            this.client = this.sharedClient;
            return this.client;
        }
        
        if (!this.client) {
            try {
                // OpenCode SDK is ESM-only, use dynamic import
                // TypeScript will compile this to a proper dynamic import
                const sdk = await (eval('import("@opencode-ai/sdk")') as Promise<any>);
                const result = await sdk.createOpencode({
                    workspaceDir: this.projectDir
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

    /**
     * Get current session ID
     */
    public getSessionId(): string {
        return this.sessionId;
    }

    /**
     * Set a new session ID (must be valid UUID)
     */
    public setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    /**
     * Run a single prompt and save output
     * @param prompt The prompt to send
     * @param outputName Optional custom name for output file
     * @returns Promise with response content
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
            // Initialize client if not already done
            const client = await this.initClient();

            // Create a session first (or use existing sessionId)
            let sessionId = this.sessionId;
            // Create and manage sessions

            // Create session if it doesn't exist yet
            const sessionResponse = await client.session.create({
                body: {
                    title: fileName
                }
            });
            
            if (sessionResponse.data && sessionResponse.data.id) {
                sessionId = sessionResponse.data.id;
            }

            // Parse model string (e.g., "gpt-4" from "openai" provider)
            // Default to openai/gpt-4 if not specified correctly
            const modelParts = this.model.includes('/') ? this.model.split('/') : ['openai', this.model];
            const providerID = modelParts[0];
            const modelID = modelParts[1] || this.model;
            
            // Now send the prompt to the session
            const response = await client.session.prompt({
                path: { id: sessionId },
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

            // Extract content from response
            let content = '';
            if (response && response.data) {
                // Extract text from parts
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

            // Create enhanced log entry with metadata
            const logEntry: OpencodeLogEntry = {
                prompt: prompt,
                name: fileName,
                response: content,
                sessionId: this.sessionId,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                durationMs: durationMs,
                timestamp: timestamp,
                model: this.model
            };

            // Save enhanced log file
            fs.writeFileSync(outputFile, JSON.stringify(logEntry, null, 2));

            console.log(`✓ Saved to: ${outputFile}`);
            console.log(`✓ Duration: ${durationMs}ms (${(durationMs / 1000).toFixed(2)}s)`);

            return content;

        } catch (error: any) {
            const endTime = new Date();
            const durationMs = endTime.getTime() - startTime.getTime();
            
            const errorMsg = error.message || String(error);
            console.error(`✗ OpenCode error: ${errorMsg}`);

            // Save error log
            const errorLogEntry = {
                prompt: prompt,
                name: fileName,
                error: errorMsg,
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

    /**
     * Run multiple prompts in sequence with same session
     * @param prompts Array of prompts to run
     * @returns Promise with array of responses
     */
    public async runPrompts(prompts: string[]): Promise<string[]> {
        const results: string[] = [];
        
        for (let i = 0; i < prompts.length; i++) {
            console.log(`\n[${i + 1}/${prompts.length}] Processing...`);
            const result = await this.runPrompt(prompts[i], `step${i + 1}_${Date.now()}`);
            results.push(result);
            await this.sleep(1000);
        }
        
        return results;
    }

    /**
     * Run batch prompts from array of prompt objects
     */
    public async runBatch(batch: Array<{ name: string; prompt: string }>): Promise<string[]> {
        const results: string[] = [];
        
        for (let i = 0; i < batch.length; i++) {
            const { name, prompt } = batch[i];
            console.log(`\n[${i + 1}/${batch.length}] Processing: ${name}`);
            const result = await this.runPrompt(prompt, `${name}_${Date.now()}`);
            results.push(result);
            await this.sleep(1000);
        }
        
        return results;
    }

    /**
     * Run batch from JSON file
     */
    public async runBatchFromFile(filePath: string): Promise<string[]> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const batch = JSON.parse(content);
        return this.runBatch(batch);
    }

    /**
     * Get output directory (logs directory)
     */
    public getOutputDir(): string {
        return this.outputDir;
    }

    /**
     * Get logs directory
     */
    public getLogsDir(): string {
        return this.logsDir;
    }

    /**
     * Get codes directory for test files
     */
    public getCodesDir(): string {
        return this.codesDir;
    }

    /**
     * Get current date directory
     */
    public getCurrentDateDir(): string {
        return this.currentDateDir;
    }

    /**
     * Sleep utility
     */
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

/**
 * Helper function to run a single prompt quickly
 */
export async function quickPrompt(prompt: string, sessionId?: string, model?: string): Promise<string> {
    const manager = new OpencodeManager({ sessionId, model });
    return manager.runPrompt(prompt);
}

