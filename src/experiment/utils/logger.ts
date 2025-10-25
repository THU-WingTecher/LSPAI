/**
 * Comprehensive logging system for experiments
 * Tracks all actions including tool usage and multiple chat messages
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Log levels
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

/**
 * Action types for detailed logging
 */
export enum ActionType {
    EXPERIMENT_START = 'experiment_start',
    EXPERIMENT_END = 'experiment_end',
    TASK_START = 'task_start',
    TASK_END = 'task_end',
    PROMPT_SENT = 'prompt_sent',
    RESPONSE_RECEIVED = 'response_received',
    CODE_EXTRACTED = 'code_extracted',
    FILE_SAVED = 'file_saved',
    TOOL_USED = 'tool_used',
    CHAT_MESSAGE = 'chat_message',
    ERROR_OCCURRED = 'error_occurred',
    COST_QUERIED = 'cost_queried',
    SESSION_CREATED = 'session_created',
    PARALLEL_TASK_START = 'parallel_task_start',
    PARALLEL_TASK_END = 'parallel_task_end'
}

/**
 * Detailed log entry
 */
export interface DetailedLogEntry {
    timestamp: string;
    level: LogLevel;
    action: ActionType;
    message: string;
    data?: any;
    sessionId?: string;
    taskName?: string;
    durationMs?: number;
    metadata?: {
        model?: string;
        provider?: string;
        language?: string;
        filePath?: string;
        toolName?: string;
        chatTurn?: number;
        concurrency?: number;
        [key: string]: any;
    };
}

/**
 * Experiment logger with comprehensive tracking
 */
export class ExperimentLogger {
    private logDir: string;
    private sessionId: string;
    private experimentId: string;
    private logLevel: LogLevel;
    private logBuffer: DetailedLogEntry[] = [];
    private flushInterval: NodeJS.Timeout | null = null;

    constructor(
        logDir: string,
        sessionId: string,
        experimentId: string,
        logLevel: LogLevel = LogLevel.INFO
    ) {
        this.logDir = logDir;
        this.sessionId = sessionId;
        this.experimentId = experimentId;
        this.logLevel = logLevel;

        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        // Start periodic flush
        this.flushInterval = setInterval(() => {
            this.flush();
        }, 5000); // Flush every 5 seconds
    }

    /**
     * Log an action with detailed information
     */
    public log(
        level: LogLevel,
        action: ActionType,
        message: string,
        data?: any,
        metadata?: any
    ): void {
        if (level < this.logLevel) {
            return;
        }

        const entry: DetailedLogEntry = {
            timestamp: new Date().toISOString(),
            level,
            action,
            message,
            data,
            sessionId: this.sessionId,
            metadata: {
                experimentId: this.experimentId,
                ...metadata
            }
        };

        this.logBuffer.push(entry);

        // Also log to console for immediate feedback
        const levelStr = LogLevel[level];
        const prefix = `[${levelStr}] [${action}]`;
        console.log(`${prefix} ${message}`);
        
        if (data && level <= LogLevel.DEBUG) {
            console.log(`${prefix} Data:`, JSON.stringify(data, null, 2));
        }
    }

    /**
     * Log experiment start
     */
    public logExperimentStart(config: any): void {
        this.log(LogLevel.INFO, ActionType.EXPERIMENT_START, 'Experiment started', config, {
            totalTasks: config.totalTasks,
            model: config.model,
            provider: config.provider
        });
    }

    /**
     * Log experiment end
     */
    public logExperimentEnd(result: any): void {
        this.log(LogLevel.INFO, ActionType.EXPERIMENT_END, 'Experiment completed', result, {
            successCount: result.successCount,
            failureCount: result.failureCount,
            totalExecutionTimeMs: result.totalExecutionTimeMs
        });
    }

    /**
     * Log task start
     */
    public logTaskStart(taskName: string, metadata?: any): void {
        this.log(LogLevel.INFO, ActionType.TASK_START, `Starting task: ${taskName}`, null, {
            taskName,
            ...metadata
        });
    }

    /**
     * Log task end
     */
    public logTaskEnd(taskName: string, success: boolean, durationMs: number, metadata?: any): void {
        this.log(LogLevel.INFO, ActionType.TASK_END, `Task completed: ${taskName}`, null, {
            taskName,
            success,
            durationMs,
            ...metadata
        });
    }

    /**
     * Log prompt sent to LLM
     */
    public logPromptSent(taskName: string, promptLength: number, metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.PROMPT_SENT, `Prompt sent for ${taskName}`, null, {
            taskName,
            promptLength,
            ...metadata
        });
    }

    /**
     * Log response received from LLM
     */
    public logResponseReceived(taskName: string, responseLength: number, durationMs: number, metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.RESPONSE_RECEIVED, `Response received for ${taskName}`, null, {
            taskName,
            responseLength,
            durationMs,
            ...metadata
        });
    }

    /**
     * Log code extraction
     */
    public logCodeExtracted(taskName: string, isValid: boolean, warnings: string[], metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.CODE_EXTRACTED, `Code extracted for ${taskName}`, null, {
            taskName,
            isValid,
            warningCount: warnings.length,
            ...metadata
        });
    }

    /**
     * Log file saved
     */
    public logFileSaved(filePath: string, fileSize: number, metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.FILE_SAVED, `File saved: ${path.basename(filePath)}`, null, {
            filePath,
            fileSize,
            ...metadata
        });
    }

    /**
     * Log tool usage
     */
    public logToolUsed(toolName: string, parameters: any, result?: any, metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.TOOL_USED, `Tool used: ${toolName}`, { parameters, result }, {
            toolName,
            ...metadata
        });
    }

    /**
     * Log chat message (for multi-turn conversations)
     */
    public logChatMessage(turn: number, messageType: 'user' | 'assistant', content: string, metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.CHAT_MESSAGE, `Chat message ${turn}`, null, {
            turn,
            messageType,
            contentLength: content.length,
            ...metadata
        });
    }

    /**
     * Log error
     */
    public logError(error: Error, context?: any, metadata?: any): void {
        this.log(LogLevel.ERROR, ActionType.ERROR_OCCURRED, error.message, {
            error: error.stack,
            context
        }, metadata);
    }

    /**
     * Log cost query
     */
    public logCostQueried(cost: number, metadata?: any): void {
        this.log(LogLevel.INFO, ActionType.COST_QUERIED, `Cost queried: $${cost.toFixed(4)}`, null, {
            cost,
            ...metadata
        });
    }

    /**
     * Log session creation
     */
    public logSessionCreated(sessionId: string, metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.SESSION_CREATED, `Session created: ${sessionId}`, null, {
            sessionId,
            ...metadata
        });
    }

    /**
     * Log parallel task operations
     */
    public logParallelTaskStart(taskName: string, concurrency: number, metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.PARALLEL_TASK_START, `Parallel task started: ${taskName}`, null, {
            taskName,
            concurrency,
            ...metadata
        });
    }

    public logParallelTaskEnd(taskName: string, success: boolean, metadata?: any): void {
        this.log(LogLevel.DEBUG, ActionType.PARALLEL_TASK_END, `Parallel task ended: ${taskName}`, null, {
            taskName,
            success,
            ...metadata
        });
    }

    /**
     * Flush logs to file
     */
    public flush(): void {
        if (this.logBuffer.length === 0) {
            return;
        }

        const logFile = path.join(this.logDir, `${this.experimentId}_detailed.log`);
        const entries = this.logBuffer.splice(0); // Clear buffer

        try {
            const logContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            fs.appendFileSync(logFile, logContent, 'utf8');
        } catch (error) {
            console.error('Failed to write log file:', error);
            // Put entries back in buffer for retry
            this.logBuffer.unshift(...entries);
        }
    }

    /**
     * Generate summary report
     */
    public generateSummary(): any {
        const summary = {
            experimentId: this.experimentId,
            sessionId: this.sessionId,
            totalLogEntries: this.logBuffer.length,
            actionCounts: {} as { [key: string]: number },
            errorCount: 0,
            totalDurationMs: 0,
            generatedAt: new Date().toISOString()
        };

        // Count actions
        for (const entry of this.logBuffer) {
            summary.actionCounts[entry.action] = (summary.actionCounts[entry.action] || 0) + 1;
            if (entry.action === ActionType.ERROR_OCCURRED) {
                summary.errorCount++;
            }
        }

        return summary;
    }

    /**
     * Save summary to file
     */
    public saveSummary(): void {
        const summary = this.generateSummary();
        const summaryFile = path.join(this.logDir, `${this.experimentId}_summary.json`);
        fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
    }

    /**
     * Cleanup and final flush
     */
    public close(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        this.flush();
        this.saveSummary();
    }
}

/**
 * Create a new experiment logger
 */
export function createExperimentLogger(
    logDir: string,
    sessionId: string,
    experimentId: string,
    logLevel: LogLevel = LogLevel.INFO
): ExperimentLogger {
    return new ExperimentLogger(logDir, sessionId, experimentId, logLevel);
}

