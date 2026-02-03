/**
 * Claude Code Test Generator
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Task, TestResult, LogEntry, PromptTemplate } from '../core/types';
import { buildTestPrompt, detectLanguage, generateSystemPrompt } from '../prompts/templates';
import { buildTestPromptWithCFG } from '../prompts/cfgPrompt';
import { extractCleanCode } from '../utils/codeExtractor';
import { generateTestFileName } from '../utils/fileNameGenerator';
import { FileNameParams } from '../core/types';
import { buildTaskKey, formatTaskLabel } from '../utils/taskKey';
import { runWithRetries } from '../utils/retry';

/**
 * Claude SDK is ESM-only, but the VSCode extension host test runner loads code as CommonJS.
 * So we MUST NOT `import { query } ...` at module load time (it would become require() after build).
 * Instead we use a runtime dynamic import, and allow tests to inject a mock query implementation.
 */
export type QueryFn = (args: any) => AsyncIterable<any>;

let cachedQuery: QueryFn | null = null;
async function getQuery(): Promise<QueryFn> {
    if (cachedQuery) return cachedQuery;
    // Force a real dynamic import() even when TypeScript emits CommonJS.
    const loader = new Function('return import("@anthropic-ai/claude-agent-sdk")');
    const mod = (await loader()) as { query: QueryFn };
    cachedQuery = mod.query;
    return cachedQuery!;
}

let queryImplForTest: QueryFn | null = null;
export function __setQueryForTest(mockQuery: QueryFn): void {
    queryImplForTest = mockQuery;
}
export function __resetQueryForTest(): void {
    queryImplForTest = null;
}

function truncateString(s: string, maxLen: number): string {
    return s.length > maxLen ? s.slice(0, maxLen) + '…(truncated)' : s;
}

function safeToString(value: unknown, maxLen: number = 12000): string {
    try {
        if (value == null) return String(value);
        if (typeof value === 'string') return truncateString(value, maxLen);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyVal: any = value as any;
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(anyVal)) {
            return truncateString(anyVal.toString('utf8'), maxLen);
        }
        const s = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        return truncateString(s, maxLen);
    } catch {
        return '[unserializable]';
    }
}

// Capture subprocess stderr/stdout/etc. when the SDK throws a wrapped process error.
function serializeErrorForLog(err: unknown, depth: number = 0): Record<string, unknown> {
    if (depth > 3) return { note: 'max depth reached' };
    if (!(err instanceof Error)) return { raw: safeToString(err) };

    const out: Record<string, unknown> = {
        name: err.name,
        message: err.message,
        stack: err.stack
    };

    const anyErr = err as any;
    const props = new Set<string>([
        ...Object.getOwnPropertyNames(anyErr),
        'code',
        'status',
        'statusCode',
        'exitCode',
        'signal',
        'stdout',
        'stderr',
        'command',
        'args',
        'cause'
    ]);

    for (const k of props) {
        if (k in anyErr && out[k] === undefined) {
            const v = anyErr[k];
            if (k === 'cause' && v) {
                out.cause = serializeErrorForLog(v, depth + 1);
            } else if (k === 'stderr' || k === 'stdout') {
                out[k] = safeToString(v, 24000);
            } else {
                out[k] = typeof v === 'string' ? truncateString(v, 4000) : v;
            }
        }
    }
    return out;
}

/**
 * Claude Code Manager for handling queries and logging
 */
export class ClaudeCodeManager {
    private sessionId: string;
    private logsDir: string;
    private codesDir: string;
    private projectDir: string;
    private model: string;

    constructor(config: {
        sessionId: string;
        logsDir: string;
        codesDir: string;
        projectDir: string;
        model: string;
    }) {
        this.sessionId = config.sessionId;
        this.logsDir = config.logsDir;
        this.codesDir = config.codesDir;
        this.projectDir = config.projectDir;
        this.model = config.model;
    }

    public getSessionId(): string {
        return this.sessionId;
    }

    public getLogsDir(): string {
        return this.logsDir;
    }

    public getCodesDir(): string {
        return this.codesDir;
    }

    /**
     * Run a prompt through Claude Code and return the response
     */
    public async runPrompt(fullPrompt: string, logFileName: string): Promise<string> {
        const startTime = new Date();
        const timestamp = Date.now();
        let responseText = '';
        let toolCalls: string[] = [];

        try {
            let lastError: any = null;
            
            // Stream messages from Claude Code
            const query = queryImplForTest ?? (await getQuery());
            for await (const message of query({
                prompt: fullPrompt,
                options: {
                    model: this.model,
                    allowedTools: ["Read", "Glob"],
                    // permissionMode: "acceptResults"
                }
            })) {
                if (message.type === "assistant" && message.message?.content) {
                    for (const block of message.message.content) {
                        if ("text" in block) {
                            responseText += block.text;
                        } else if ("name" in block) {
                            toolCalls.push(block.name);
                        }
                    }
                } else if (message.type === "result") {
                    // Handle different result subtypes
                    if (message.subtype === "success" && message.result) {
                        // Extract text from result if available
                        if (typeof message.result === 'string') {
                            responseText += message.result;
                        } else if (message.result && typeof message.result === 'object') {
                            // Try to extract text from result object
                            const resultStr = JSON.stringify(message.result, null, 2);
                            responseText += resultStr;
                        }
                    } else {
                        // Handle error result subtypes (error_during_execution, error_max_turns, etc.)
                        lastError = message;
                        const errorInfo: any = {
                            subtype: message.subtype,
                            result: (message as any).result,
                            error: (message as any).error,
                            message: (message as any).message
                        };
                        const errorStr = JSON.stringify(errorInfo, null, 2);
                        responseText += `\n\nError occurred: ${errorStr}`;
                    }
                }
                
                // Check for any error properties in the message
                const msgAny = message as any;
                if (msgAny.error || (msgAny.type && msgAny.type.includes('error'))) {
                    lastError = message;
                    const errorInfo: any = {
                        type: msgAny.type,
                        error: msgAny.error,
                        message: msgAny.message,
                        details: message
                    };
                    const errorStr = JSON.stringify(errorInfo, null, 2);
                    responseText += `\n\nError: ${errorStr}`;
                }
            }
            
            // If we encountered an error during streaming, throw it
            if (lastError) {
                const errorDetails = lastError.subtype === "error" || lastError.subtype === "failure"
                    ? `Claude Code ${lastError.subtype}: ${JSON.stringify(lastError.result || lastError.error || lastError)}`
                    : `Claude Code error: ${JSON.stringify(lastError)}`;
                throw new Error(errorDetails);
            }

            const endTime = new Date();
            const durationMs = endTime.getTime() - startTime.getTime();

            // Create log entry
            const logEntry: LogEntry = {
                prompt: fullPrompt,
                name: logFileName,
                response: responseText,
                sessionId: this.sessionId,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                durationMs: durationMs,
                timestamp: timestamp,
                model: this.model
            };

            // Save log file
            const logPath = path.join(this.logsDir, `${logFileName}.json`);
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            await fs.promises.writeFile(logPath, JSON.stringify(logEntry, null, 2), 'utf8');

            return responseText;
        } catch (error) {
            const endTime = new Date();
            const durationMs = endTime.getTime() - startTime.getTime();
            
            // Extract comprehensive error information
            const errorDetails = serializeErrorForLog(error);
            const errorMsg = typeof errorDetails.message === 'string'
                ? errorDetails.message
                : safeToString(error);
            
            // Create detailed error message
            const detailedErrorMsg = errorMsg || JSON.stringify(errorDetails, null, 2);
            const fullErrorMsg = `Claude Code Error: ${detailedErrorMsg}${errorDetails.stack ? `\nStack: ${errorDetails.stack}` : ''}`;

            // Save error log with full details
            const logEntry: LogEntry = {
                prompt: fullPrompt,
                name: logFileName,
                response: `Error: ${fullErrorMsg}\n\nError Details: ${JSON.stringify(errorDetails, null, 2)}`,
                sessionId: this.sessionId,
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                durationMs: durationMs,
                timestamp: timestamp,
                model: this.model
            };

            const logPath = path.join(this.logsDir, `${logFileName}.json`);
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            await fs.promises.writeFile(logPath, JSON.stringify(logEntry, null, 2), 'utf8');

            // Throw error with detailed message
            const enhancedError = new Error(fullErrorMsg);
            if (error instanceof Error && error.stack) {
                enhancedError.stack = error.stack;
            }
            throw enhancedError;
        }
    }
}

/**
 * Generate a single unit test using Claude Code
 */
export async function generateTest(
    task: Task,
    claudeCodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    promptTemplate: PromptTemplate = 'cfg'
): Promise<TestResult> {
    const startTime = Date.now();
    const taskKey = task.taskKey ?? buildTaskKey(task);
    
    try {
        console.log(`#### Generating test for ${task.symbolName}`);

        // Create date-based directory structure
        const currentDate = new Date().toISOString().split('T')[0];
        const dateDir = path.join(claudeCodeOutputDir, currentDate);
        const logsDir = path.join(dateDir, 'logs');
        const codesDir = path.join(dateDir, 'codes');

        // Create directories
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        if (!fs.existsSync(codesDir)) {
            fs.mkdirSync(codesDir, { recursive: true });
        }

        // Create a unique Claude Code manager for this task
        const sessionId = randomUUID();
        const claudeCodeManager = new ClaudeCodeManager({
            sessionId,
            logsDir,
            codesDir,
            projectDir,
            model
        });
        console.log(`   Session ID: ${sessionId}`);

        // Detect language
        const languageId = detectLanguage(task.relativeDocumentPath);
        console.log(`   Language: ${languageId}`);

        const systemPrompt = generateSystemPrompt();
        const prompt = promptTemplate === 'cfg'
            ? await buildTestPromptWithCFG(task, languageId, model)
            : buildTestPrompt(task, languageId);
        const fullPrompt = systemPrompt + "\n\n" + prompt;
        console.log(`   Prompt length: ${fullPrompt.length} chars`);

        // Generate test file name for log
        const fileNameParams: FileNameParams = {
            sourceFileName: path.basename(task.relativeDocumentPath),
            symbolName: task.symbolName,
            languageId: languageId,
            packageString: '',
            relativeFilePath: task.relativeDocumentPath
        };
        const testFileName = generateTestFileName(fileNameParams);
        const logFileName = `${testFileName}.log`;

        // Run through Claude Code
        const response = await claudeCodeManager.runPrompt(fullPrompt, logFileName);
        console.log(`   Response length: ${response.length} chars`);

        // Extract code
        const { code, isValid, warnings } = extractCleanCode(
            response,
            languageId,
            task.symbolName
        );

        if (!code) {
            return {
                taskName: task.symbolName,
                taskKey,
                success: false,
                error: 'Failed to extract code from Claude Code response',
                warnings,
                executionTimeMs: Date.now() - startTime
            };
        }

        // Save test code
        const outputPath = path.join(codesDir, testFileName);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, code, 'utf8');
        console.log(`   Saved to: ${outputPath}`);

        return {
            taskName: task.symbolName,
            taskKey,
            success: true,
            testCode: code,
            outputFilePath: outputPath,
            warnings: isValid ? [] : warnings,
            executionTimeMs: Date.now() - startTime
        };

    } catch (error) {
        // Extract comprehensive error information
        let errorMsg = '';
        if (error instanceof Error) {
            errorMsg = error.message;
            // Include stack trace if available and meaningful
            if (error.stack && error.stack.length < 500) {
                errorMsg += `\n${error.stack}`;
            }
        } else {
            errorMsg = String(error);
        }
        
        // If error message is empty or too generic, try to extract more details
        if (!errorMsg || errorMsg === 'undefined' || errorMsg === 'null') {
            errorMsg = `Unknown error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`;
        }
        
        console.error(`#### Error generating test for ${task.symbolName}:`, errorMsg);

        return {
            taskName: task.symbolName,
            taskKey,
            success: false,
            error: errorMsg,
            executionTimeMs: Date.now() - startTime
        };
    }
}

/**
 * Generate tests in batch (sequential)
 */
export async function generateTestsSequential(
    tasks: Task[],
    claudeCodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    maxRetries: number = 0,
    onProgress?: (completed: number, total: number, taskName: string) => void,
    promptTemplate: PromptTemplate = 'cfg'
): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const total = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const taskLabel = formatTaskLabel(task);
        const result = await runWithRetries(taskLabel, maxRetries, () =>
            generateTest(task, claudeCodeOutputDir, projectDir, outputDir, model, promptTemplate)
        );
        results.push(result);

        if (onProgress) {
            onProgress(i + 1, total, task.symbolName);
        }

        console.log(`#### Progress: ${i + 1}/${total} - ${task.symbolName} - ${result.success ? 'SUCCESS' : 'FAILED'}`);
    }

    return results;
}

/**
 * Generate tests in batch (parallel)
 */
export async function generateTestsParallel(
    tasks: Task[],
    claudeCodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    concurrency: number = 4,
    maxRetries: number = 0,
    onProgress?: (completed: number, total: number, taskName: string) => void,
    promptTemplate: PromptTemplate = 'cfg'
): Promise<TestResult[]> {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(concurrency);
    const total = tasks.length;
    let completed = 0;

    const taskPromises = tasks.map(task =>
        limit(async () => {
            const taskLabel = formatTaskLabel(task);
            const result = await runWithRetries(taskLabel, maxRetries, () =>
                generateTest(task, claudeCodeOutputDir, projectDir, outputDir, model, promptTemplate)
            );
            
            completed++;
            if (onProgress) {
                onProgress(completed, total, task.symbolName);
            }

            console.log(`#### Progress: ${completed}/${total} - ${task.symbolName} - ${result.success ? 'SUCCESS' : 'FAILED'}`);

            return result;
        })
    );

    return await Promise.all(taskPromises);
}
