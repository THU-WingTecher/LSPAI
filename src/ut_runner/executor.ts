// src/ut_runner/executor.ts
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';
import { ExecutionResult, TestFile } from './types';

export interface BaseExecutor {
  executeMany(testFiles: TestFile[], jobs: number): Promise<ExecutionResult[]>;
}

export interface PytestExecutorOptions {
  pythonExe: string;
  logsDir: string;
  junitDir: string;
  timeout?: number; // seconds, 0 = no timeout
  env?: NodeJS.ProcessEnv;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

async function runWithLimit<T>(limit: number, items: T[], fn: (it: T) => Promise<any>): Promise<any[]> {
  const results: any[] = [];
  const executing: Promise<any>[] = [];
  const max = Math.max(1, Math.floor(limit || 1));
  for (const it of items) {
    const p = Promise.resolve().then(() => fn(it));
    results.push(p);
    if (max > 0) {
      const e = p.finally(() => {
        executing.splice(executing.indexOf(e), 1);
      });
      executing.push(e);
      if (executing.length >= max) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

export class PytestExecutor implements BaseExecutor {
  private pythonExe: string;
  private logsDir: string;
  private junitDir: string;
  private timeoutSec: number;
  private env: NodeJS.ProcessEnv;

  constructor(opts: PytestExecutorOptions) {
    this.pythonExe = opts.pythonExe;
    this.logsDir = path.resolve(opts.logsDir);
    this.junitDir = path.resolve(opts.junitDir);
    this.timeoutSec = Math.max(0, opts.timeout ?? 0);
    this.env = { ...process.env, ...(opts.env || {}) };
    ensureDir(this.logsDir);
    ensureDir(this.junitDir);
  }

  private async runOne(tf: TestFile): Promise<ExecutionResult> {
    const logPath = path.join(this.logsDir, path.basename(tf.path) + '.log');
    const junitPath = path.join(this.junitDir, path.basename(tf.path) + '.xml');
    const cmd = [
      '-m',
      'pytest',
      '-vv',
      '--tb=long',
      '--color=no',
      '-ra',
      tf.path,
      `--junitxml=${junitPath}`,
    ];
    const started = new Date();
    let timeoutHit = false;
    let processId: number | undefined;
    let signalReceived: string | undefined;

    // Enhanced executable validation and logging
    console.log(`[EXECUTOR] Starting test execution for: ${tf.path}`);
    console.log(`[EXECUTOR] Working directory: ${path.dirname(tf.path)}`);
    console.log(`[EXECUTOR] Log file: ${logPath}`);
    console.log(`[EXECUTOR] JUnit XML: ${junitPath}`);
    console.log(`[EXECUTOR] Timeout: ${this.timeoutSec}s`);
    console.log(`[EXECUTOR] Environment PYTHONPATH: ${this.env.PYTHONPATH || 'not set'}`);
    
    // Validate Python executable
    console.log(`[EXECUTOR] Validating Python executable: ${this.pythonExe}`);
    const resolveViaPath = (cmd: string): string => {
      if (cmd.includes('/') || cmd.includes('\\')) return cmd;
      try {
        return execSync(`command -v ${cmd}`, { encoding: 'utf8', timeout: 3000 }).trim();
      } catch {
        return cmd;
      }
    };
    const resolvedExe = resolveViaPath(this.pythonExe);
    try {
      const stats = fs.statSync(resolvedExe);
      this.pythonExe = resolvedExe;
      console.log(`[EXECUTOR] Python executable exists: ${stats.isFile()}`);
      console.log(`[EXECUTOR] Python executable size: ${stats.size} bytes`);
      console.log(`[EXECUTOR] Python executable permissions: ${stats.mode.toString(8)}`);
      
      // Check if executable
      try {
        const version = execSync(`"${this.pythonExe}" --version`, { encoding: 'utf8', timeout: 5000 });
        console.log(`[EXECUTOR] Python version check successful: ${version.trim()}`);
      } catch (versionError) {
        console.error(`[EXECUTOR] Python version check failed:`, versionError);
      }
    } catch (statError) {
      console.error(`[EXECUTOR] Python executable validation failed:`, statError);
      console.error(`[EXECUTOR] Executable path: ${resolvedExe}`);
      console.error(`[EXECUTOR] Current working directory: ${process.cwd()}`);
      console.error(`[EXECUTOR] PATH environment: ${process.env.PATH}`);
      
      // Try to find alternative Python executables
      console.log(`[EXECUTOR] Searching for alternative Python executables...`);
      const alternatives = ['python3', 'python', 'py'];
      for (const alt of alternatives) {
        try {
          const altResolved = resolveViaPath(alt);
          const altVersion = execSync(`"${altResolved}" --version`, { encoding: 'utf8', timeout: 5000 });
          console.log(`[EXECUTOR] Found alternative: ${altResolved} -> ${altVersion.trim()}`);
          this.pythonExe = altResolved;
          break;
        } catch (altError) {
          console.log(`[EXECUTOR] Alternative ${alt} not available`);
        }
      }
    }

    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(logPath, { flags: 'w' });
      
      // Enhanced header with detailed context
      ws.write(`=== TEST EXECUTION LOG ===\n`);
      ws.write(`=== Test File: ${tf.path} ===\n`);
      ws.write(`=== Language: ${tf.language} ===\n`);
      ws.write(`=== Command: ${this.pythonExe} ${cmd.join(' ')} ===\n`);
      ws.write(`=== Working Directory: ${path.dirname(tf.path)} ===\n`);
      ws.write(`=== Started: ${formatDate(started)} ===\n`);
      ws.write(`=== Timeout: ${this.timeoutSec}s ===\n`);
      ws.write(`=== Environment Variables ===\n`);
      ws.write(`PYTHONPATH: ${this.env.PYTHONPATH || 'not set'}\n`);
      ws.write(`PATH: ${this.env.PATH || 'not set'}\n`);
      ws.write(`PYTHON_EXE: ${this.pythonExe}\n`);
      ws.write(`=== Execution Context ===\n`);
      ws.write(`Node.js Version: ${process.version}\n`);
      ws.write(`Platform: ${process.platform}\n`);
      ws.write(`Architecture: ${process.arch}\n`);
      ws.write(`=== Test Execution Output ===\n\n`);

      const child = spawn(this.pythonExe, cmd, {
        cwd: path.dirname(tf.path),
        env: this.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      processId = child.pid;
      console.log(`[EXECUTOR] Spawned process PID: ${processId}`);

      const timer =
        this.timeoutSec > 0
          ? setTimeout(() => {
              timeoutHit = true;
              console.log(`[EXECUTOR] TIMEOUT reached for ${tf.path} (PID: ${processId})`);
              ws.write(`\n=== TIMEOUT DETECTED ===\n`);
              ws.write(`Timeout duration: ${this.timeoutSec}s\n`);
              ws.write(`Process PID: ${processId}\n`);
              ws.write(`Timestamp: ${formatDate(new Date())}\n`);
              ws.write(`Attempting to kill process...\n`);
              try {
                child.kill('SIGKILL');
                ws.write(`Process killed successfully\n`);
                console.log(`[EXECUTOR] Process ${processId} killed due to timeout`);
              } catch (killError) {
                ws.write(`Failed to kill process: ${killError}\n`);
                console.error(`[EXECUTOR] Failed to kill process ${processId}:`, killError);
              }
            }, this.timeoutSec * 1000)
          : null;

      child.stdout.on('data', (data) => {
        ws.write(data);
      });

      child.stderr.on('data', (data) => {
        ws.write(data);
      });

      child.on('error', (error) => {
        console.error(`[EXECUTOR] Process error for ${tf.path}:`, error);
        ws.write(`\n=== PROCESS ERROR ===\n`);
        ws.write(`Error: ${error.message}\n`);
        ws.write(`Stack: ${error.stack}\n`);
        ws.write(`PID: ${processId}\n`);
        ws.write(`Timestamp: ${formatDate(new Date())}\n`);
        if (timer) clearTimeout(timer);
        ws.end();
        reject(error);
      });

      child.on('close', (code, signal) => {
        const ended = new Date();
        const duration = ended.getTime() - started.getTime();
        
        console.log(`[EXECUTOR] Process closed for ${tf.path} - Code: ${code}, Signal: ${signal}, Duration: ${duration}ms`);
        
        ws.write(`\n=== PROCESS TERMINATION ===\n`);
        ws.write(`Exit Code: ${code}\n`);
        ws.write(`Signal: ${signal || 'none'}\n`);
        ws.write(`Duration: ${duration}ms\n`);
        ws.write(`Ended: ${formatDate(ended)}\n`);
        ws.write(`PID: ${processId}\n`);
        
        if (timeoutHit) {
          ws.write(`Termination Reason: TIMEOUT\n`);
        } else if (signal) {
          ws.write(`Termination Reason: SIGNAL (${signal})\n`);
          signalReceived = signal;
        } else {
          ws.write(`Termination Reason: NORMAL\n`);
        }
        
        if (timer) clearTimeout(timer);
        ws.end();
        resolve();
      });
    });

    const ended = new Date();
    const duration = ended.getTime() - started.getTime();
    const exitCode = timeoutHit ? 124 : await readExitCodeFromLogTail(logPath);
    
    console.log(`[EXECUTOR] Completed ${tf.path} - Exit: ${exitCode}, Duration: ${duration}ms, Timeout: ${timeoutHit}`);
    
    return {
      testFile: tf,
      exitCode,
      logPath,
      junitPath,
      startedAt: formatDate(started),
      endedAt: formatDate(ended),
      timeout: timeoutHit,
    };
  }

  async executeMany(testFiles: TestFile[], jobs: number): Promise<ExecutionResult[]> {
    const startTime = new Date();
    const maxJobs = Math.max(1, Number(jobs || 1));
    
    console.log(`[EXECUTOR] Starting batch execution`);
    console.log(`[EXECUTOR] Total test files: ${testFiles.length}`);
    console.log(`[EXECUTOR] Max concurrent jobs: ${maxJobs}`);
    console.log(`[EXECUTOR] Logs directory: ${this.logsDir}`);
    console.log(`[EXECUTOR] JUnit directory: ${this.junitDir}`);
    
    try {
      const results = await runWithLimit(maxJobs, testFiles, (tf) => this.runOne(tf));
      const endTime = new Date();
      const totalDuration = endTime.getTime() - startTime.getTime();
      
      // Analyze results for fault localization
      const successful = results.filter(r => r.exitCode === 0 && !r.timeout);
      const failed = results.filter(r => r.exitCode !== 0);
      const timedOut = results.filter(r => r.timeout);
      
      console.log(`[EXECUTOR] Batch execution completed`);
      console.log(`[EXECUTOR] Total duration: ${totalDuration}ms`);
      console.log(`[EXECUTOR] Successful: ${successful.length}`);
      console.log(`[EXECUTOR] Failed: ${failed.length}`);
      console.log(`[EXECUTOR] Timed out: ${timedOut.length}`);
      
      if (failed.length > 0) {
        console.log(`[EXECUTOR] Failed test files:`);
        failed.forEach(r => {
          console.log(`[EXECUTOR]   - ${r.testFile.path} (exit code: ${r.exitCode})`);
        });
      }
      
      if (timedOut.length > 0) {
        console.log(`[EXECUTOR] Timed out test files:`);
        timedOut.forEach(r => {
          console.log(`[EXECUTOR]   - ${r.testFile.path}`);
        });
      }
      
      return results as ExecutionResult[];
    } catch (error) {
      const endTime = new Date();
      const totalDuration = endTime.getTime() - startTime.getTime();
      
      console.error(`[EXECUTOR] Batch execution failed after ${totalDuration}ms:`, error);
      console.error(`[EXECUTOR] Error stack:`, error instanceof Error ? error.stack : 'No stack trace available');
      
      throw error;
    }
  }
}

async function readExitCodeFromLogTail(logPath: string): Promise<number> {
  // Enhanced exit code detection with detailed logging
  try {
    const st = fs.statSync(logPath);
    const logContent = fs.readFileSync(logPath, 'utf8');
    
    console.log(`[EXECUTOR] Analyzing log file: ${logPath}`);
    console.log(`[EXECUTOR] Log file size: ${st.size} bytes`);
    
    // Look for pytest exit patterns in the log
    if (logContent.includes('FAILED') || logContent.includes('ERROR')) {
      console.log(`[EXECUTOR] Found FAILED/ERROR in log, returning exit code 1`);
      return 1;
    }
    
    if (logContent.includes('PASSED') && !logContent.includes('FAILED') && !logContent.includes('ERROR')) {
      console.log(`[EXECUTOR] Found PASSED without failures, returning exit code 0`);
      return 0;
    }
    
    // Check for specific pytest patterns
    const pytestPatterns = [
      /(\d+) failed/,
      /(\d+) error/,
      /(\d+) passed/,
      /(\d+) skipped/
    ];
    
    let hasFailures = false;
    let hasErrors = false;
    
    for (const pattern of pytestPatterns) {
      const match = logContent.match(pattern);
      if (match) {
        const count = parseInt(match[1], 10);
        if (pattern.source.includes('failed') || pattern.source.includes('error')) {
          if (count > 0) {
            hasFailures = true;
            console.log(`[EXECUTOR] Found ${count} failures/errors in log`);
          }
        }
      }
    }
    
    if (hasFailures || hasErrors) {
      console.log(`[EXECUTOR] Detected failures/errors, returning exit code 1`);
      return 1;
    }
    
    // Default behavior based on file size
    const exitCode = st.size > 0 ? 0 : 1;
    console.log(`[EXECUTOR] Using default exit code ${exitCode} based on file size`);
    return exitCode;
    
  } catch (error) {
    console.error(`[EXECUTOR] Error reading log file ${logPath}:`, error);
    console.log(`[EXECUTOR] Returning exit code 1 due to read error`);
    return 1;
  }
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

export function makeExecutor(language: string, opts: any): BaseExecutor {
  if (language === 'python') {
    return new PytestExecutor(opts as PytestExecutorOptions);
  }
  throw new Error(`Executor for language '${language}' is not implemented yet.`);
}