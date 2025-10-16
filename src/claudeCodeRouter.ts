import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * Configuration for Claude Code Router
 */
export interface ClaudeCodeRouterConfig {
    sessionId?: string;  // UUID for session continuity
    outputDir?: string;  // Directory to save outputs
}

/**
 * Response from ccr command
 */
export interface CCRResponse {
    result?: string;
    content?: string;
    response?: string;
    text?: string;
    sessionId?: string;
    [key: string]: any;
}

/**
 * Manager for running claude-code-router programmatically
 * Based on CLI approach: ccr code -p "prompt" --session-id <UUID> --output-format json
 */
export class ClaudeCodeRouterManager {
    private sessionId: string;
    private outputDir: string;

    constructor(config: ClaudeCodeRouterConfig = {}) {
        this.sessionId = config.sessionId || randomUUID();
        this.outputDir = config.outputDir || path.join(process.cwd(), 'ccr-outputs');
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
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
        const timestamp = Date.now();
        const fileName = outputName || `prompt_${timestamp}`;
        const outputFile = path.join(this.outputDir, `${fileName}.json`);

        console.log(`Running prompt: ${prompt.substring(0, 60)}...`);
        console.log(`Session ID: ${this.sessionId}`);

        const scriptPath = path.join(__dirname, '../scripts/claude-code-router/run-prompt.sh');
        const envPath = path.join(__dirname, '../.env.sh');
        
        const escapedPrompt = prompt.replace(/'/g, "'\\''");
        
        const command = fs.existsSync(envPath)
            ? `source "${envPath}" && bash "${scriptPath}" "${escapedPrompt}" "${outputFile}" "${this.sessionId}"`
            : `bash "${scriptPath}" "${escapedPrompt}" "${outputFile}" "${this.sessionId}"`;

        try {
            const child = spawn('/bin/bash', ['-c', command], {
                cwd: '/LSPRAG',
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 120000
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            const exitCode = await new Promise<number>((resolve, reject) => {
                child.on('error', reject);
                child.on('close', (code) => resolve(code || 0));
            });

            await this.sleep(500);

            if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
                throw new Error(`ccr command failed: exit code ${exitCode}\nstderr: ${stderr}`);
            }

        } catch (error: any) {
            await this.sleep(1000);
            
            if (!fs.existsSync(outputFile)) {
                throw new Error(`ccr command failed (no output file): ${error.message}`);
            }
            
            if (fs.statSync(outputFile).size === 0) {
                fs.writeFileSync(outputFile, JSON.stringify({ error: error.message }, null, 2));
                throw new Error(`ccr command failed (empty output): ${error.message}`);
            }
        }

        console.log(`✓ Saved to: ${outputFile}`);

        const fileContent = fs.readFileSync(outputFile, 'utf-8');
        
        let content = '';
        try {
            const response: CCRResponse = JSON.parse(fileContent);
            content = response.result || response.content || response.response || response.text || '';
        } catch {
            content = fileContent;
        }

        const txtFile = outputFile.replace('.json', '.txt');
        fs.writeFileSync(txtFile, content);

        return content;
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
     * Extract content from JSON response file
     */
    public extractContent(jsonFile: string, txtFile?: string): string {
        const content = fs.readFileSync(jsonFile, 'utf-8');
        const response: CCRResponse = JSON.parse(content);
        const text = response.content || response.response || response.text || '';
        
        if (txtFile) {
            fs.writeFileSync(txtFile, text);
        }
        
        return text;
    }

    /**
     * Get output directory
     */
    public getOutputDir(): string {
        return this.outputDir;
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
export async function quickPrompt(prompt: string, sessionId?: string): Promise<string> {
    const manager = new ClaudeCodeRouterManager({ sessionId });
    return manager.runPrompt(prompt);
}
