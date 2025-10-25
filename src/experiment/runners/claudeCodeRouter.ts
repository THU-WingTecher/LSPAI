/**
 * Claude Code Router Manager
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * Configuration for Claude Code Router
 */
export interface ClaudeCodeRouterConfig {
    sessionId?: string;
    outputDir?: string;
    projectDir?: string;
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
 * Log entry with metadata
 */
export interface CCRLogEntry {
    prompt: string;
    name: string;
    response: string;
    sessionId: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    timestamp: number;
}

/**
 * Manager for running claude-code-router programmatically
 */
export class ClaudeCodeRouterManager {
    private sessionId: string;
    private outputDir: string;
    private projectDir: string;
    private currentDateDir: string;
    private logsDir: string;
    private codesDir: string;

    constructor(config: ClaudeCodeRouterConfig = {}) {
        this.sessionId = config.sessionId || randomUUID();
        this.projectDir = config.projectDir || '/LSPRAG';
        
        // Create date-based directory structure
        const currentDate = new Date().toISOString().split('T')[0];
        this.currentDateDir = config.outputDir || path.join(process.cwd(), 'ccr-outputs', currentDate);
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

        console.log(`Running prompt: ${prompt.substring(0, 60)}...`);
        console.log(`Session ID: ${this.sessionId}`);

        // Write prompt to a temporary file
        const tempPromptFile = path.join(this.logsDir, `${fileName}_prompt.txt`);
        fs.writeFileSync(tempPromptFile, prompt, 'utf-8');

        // Build ccr command
        const envPath = path.join(__dirname, '../../.env.sh');
        const ccrCommand = `ccr code -p --output-format json --session-id "${this.sessionId}"`;
        
        const command = fs.existsSync(envPath)
            ? `source "${envPath}" && cat "${tempPromptFile}" | ${ccrCommand} > "${outputFile}"`
            : `cat "${tempPromptFile}" | ${ccrCommand} > "${outputFile}"`;

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

            // Clean up temp file
            if (fs.existsSync(tempPromptFile)) {
                fs.unlinkSync(tempPromptFile);
            }

            if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
                throw new Error(`ccr command failed: exit code ${exitCode}\nstderr: ${stderr}`);
            }

        } catch (error: any) {
            await this.sleep(1000);
            
            // Clean up temp file
            if (fs.existsSync(tempPromptFile)) {
                fs.unlinkSync(tempPromptFile);
            }
            
            if (!fs.existsSync(outputFile)) {
                throw new Error(`ccr command failed (no output file): ${error.message}`);
            }
            
            if (fs.statSync(outputFile).size === 0) {
                fs.writeFileSync(outputFile, JSON.stringify({ error: error.message }, null, 2));
                throw new Error(`ccr command failed (empty output): ${error.message}`);
            }
        }

        const endTime = new Date();
        const durationMs = endTime.getTime() - startTime.getTime();

        console.log(`✓ Saved to: ${outputFile}`);
        console.log(`✓ Duration: ${durationMs}ms (${(durationMs / 1000).toFixed(2)}s)`);

        const fileContent = fs.readFileSync(outputFile, 'utf-8');
        
        let content = '';
        try {
            const response: CCRResponse = JSON.parse(fileContent);
            content = response.result || response.content || response.response || response.text || '';
        } catch {
            content = fileContent;
        }

        // Create enhanced log entry
        const logEntry: CCRLogEntry = {
            prompt: prompt,
            name: fileName,
            response: content,
            sessionId: this.sessionId,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            durationMs: durationMs,
            timestamp: timestamp
        };

        // Save enhanced log file
        fs.writeFileSync(outputFile, JSON.stringify(logEntry, null, 2));

        return content;
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

    /**
     * Run multiple prompts in sequence with same session
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

