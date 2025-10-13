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

export interface GoExecutorOptions {
  logsDir: string;
  junitDir?: string; // currently unused for Go
  timeout?: number; // seconds, 0 = no timeout
  env?: NodeJS.ProcessEnv;
  cleanCache?: boolean; // Clean build cache before tests
  verbose?: boolean; // Extra logging
  coverageDir?: string; // Optional coverage output
  buildFlags?: string[]; // Additional go test flags
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

class GoExecutor implements BaseExecutor {
  private logsDir: string;
  private junitDir: string | null;
  private timeoutSec: number;
  private env: NodeJS.ProcessEnv;
  private cleanCache: boolean;
  private verbose: boolean;
  private coverageDir: string | null;
  private buildFlags: string[];

  constructor(opts: GoExecutorOptions) {
    this.logsDir = path.resolve(opts.logsDir);
    this.junitDir = opts.junitDir ? path.resolve(opts.junitDir) : null;
    this.timeoutSec = Math.max(0, opts.timeout ?? 0);
    this.env = { ...process.env, ...(opts.env || {}) };
    this.cleanCache = opts.cleanCache ?? false;
    this.verbose = opts.verbose ?? false;
    this.coverageDir = opts.coverageDir ? path.resolve(opts.coverageDir) : null;
    this.buildFlags = opts.buildFlags ?? [];
    
    ensureDir(this.logsDir);
    if (this.junitDir) {
      ensureDir(this.junitDir);
    }
    if (this.coverageDir) {
      ensureDir(this.coverageDir);
    }
    
    // Validate go toolchain early
    try {
      const v = execSync('go version', { encoding: 'utf8', timeout: 5000 });
      console.log(`[EXECUTOR][GO] ${v.trim()}`);
    } catch (e) {
      throw new Error('Go toolchain not found in PATH (need `go` command)');
    }
  }

  private findModuleRoot(startDir: string): string {
    let dir = path.resolve(startDir);
    const maxDepth = 20; // prevent infinite loops
    let depth = 0;
    
    while (depth < maxDepth) {
      const candidate = path.join(dir, 'go.mod');
      if (fs.existsSync(candidate)) {
        if (this.verbose) {
          console.log(`[EXECUTOR][GO] Found go.mod at: ${dir}`);
        }
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
      depth++;
    }
    
    console.warn(`[EXECUTOR][GO] No go.mod found within ${maxDepth} levels, using directory: ${startDir}`);
    return startDir; // Fallback to original directory
  }

  private listTestNamesInFile(filePath: string): string[] {
    try {
      const src = fs.readFileSync(filePath, 'utf8');
      const names: string[] = [];
      
      // Match various test function patterns:
      // - func TestName(t *testing.T)
      // - func TestName(t *testing.TB)
      // - func TestName(t testing.TB)
      // - func BenchmarkName(b *testing.B)
      // - func ExampleName()
      const patterns = [
        /\bfunc\s+(Test[\w\d_]+)\s*\(\s*\w+\s+\*?testing\.T\w*\s*\)/g,
        /\bfunc\s+(Benchmark[\w\d_]+)\s*\(\s*\w+\s+\*testing\.B\s*\)/g,
        /\bfunc\s+(Example[\w\d_]+)\s*\(\s*\)/g,
      ];
      
      for (const pattern of patterns) {
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(src)) !== null) {
          names.push(m[1]);
        }
      }
      
      if (this.verbose) {
        console.log(`[EXECUTOR][GO] Found ${names.length} tests in ${path.basename(filePath)}: ${names.join(', ')}`);
      }
      return names;
    } catch (error) {
      console.error(`[EXECUTOR][GO] Failed to extract test names from ${filePath}:`, error);
      return [];
    }
  }

  private cleanBuildCache(modRoot: string): void {
    if (!this.cleanCache) {
      return;
    }
    
    try {
      console.log(`[EXECUTOR][GO] Cleaning build cache for ${modRoot}`);
      execSync('go clean -cache -testcache', {
        cwd: modRoot,
        encoding: 'utf8',
        timeout: 10000,
      });
      console.log(`[EXECUTOR][GO] Build cache cleaned successfully`);
    } catch (error) {
      console.warn(`[EXECUTOR][GO] Failed to clean build cache:`, error);
      // Non-fatal, continue execution
    }
  }

  private buildTestCommand(tf: TestFile, modRoot: string): { args: string[]; pkgPath: string } {
    const pkgDir = path.dirname(tf.path);
    const relPkg = path.relative(modRoot, pkgDir);
    
    // Normalize package path
    let pkgPath = relPkg || '.';
    if (!pkgPath.startsWith('./') && pkgPath !== '.') {
      pkgPath = `./${pkgPath}`;
    }
    
    const testNames = this.listTestNamesInFile(tf.path);
    const args: string[] = ['test'];
    
    // JSON output for parsing
    args.push('-json');
    
    // Force re-run (no cache)
    args.push('-count=1');
    
    // Verbose output
    args.push('-v');
    
    // Add custom build flags
    if (this.buildFlags.length > 0) {
      args.push(...this.buildFlags);
    }
    
    // Add coverage if configured
    if (this.coverageDir) {
      const coverageFile = path.join(
        this.coverageDir,
        path.basename(tf.path) + '.coverage'
      );
      args.push('-cover');
      args.push('-coverprofile', coverageFile);
      if (this.verbose) {
        console.log(`[EXECUTOR][GO] Coverage will be written to: ${coverageFile}`);
      }
    }
    
    // Add test filter if we found test names
    if (testNames.length > 0) {
      const pattern = `^(${testNames.join('|')})$`;
      args.push('-run', pattern);
    }
    
    // Package path
    args.push(pkgPath);
    
    console.log(`[EXECUTOR][GO] Command: go ${args.join(' ')}`);
    console.log(`[EXECUTOR][GO] Working directory: ${modRoot}`);
    
    return { args, pkgPath };
  }

  private validateJsonOutput(logPath: string): {
    isValid: boolean;
    lineCount: number;
    errors: string[];
  } {
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      const errors: string[] = [];
      let validJsonLines = 0;
      
      for (const line of lines) {
        // Skip header lines
        if (line.startsWith('===') || line.startsWith('='.repeat(80))) {
          continue;
        }
        
        // Try to parse as JSON
        try {
          const parsed = JSON.parse(line);
          if (parsed.Time && parsed.Action) {
            validJsonLines++;
          }
        } catch (e) {
          // Not JSON, could be build output or errors
          if (!line.includes('PASS') && !line.includes('FAIL') && !line.includes('===')) {
            errors.push(line);
          }
        }
      }
      
      return {
        isValid: validJsonLines > 0,
        lineCount: validJsonLines,
        errors,
      };
    } catch (error) {
      return {
        isValid: false,
        lineCount: 0,
        errors: [`Failed to read log: ${error}`],
      };
    }
  }

  private detectExecutionIssues(logPath: string): {
    hasBuildErrors: boolean;
    hasRuntimePanics: boolean;
    hasTimeouts: boolean;
    issues: string[];
  } {
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const issues: string[] = [];
      
      // Detect build errors
      const buildErrors = content.match(/^# .+\n.*error:/gm);
      const hasBuildErrors = buildErrors !== null && buildErrors.length > 0;
      if (hasBuildErrors) {
        issues.push(`Build errors detected: ${buildErrors.length}`);
      }
      
      // Detect panics
      const panics = content.match(/panic:/g);
      const hasRuntimePanics = panics !== null && panics.length > 0;
      if (hasRuntimePanics) {
        issues.push(`Runtime panics detected: ${panics.length}`);
      }
      
      // Detect test timeouts
      const timeouts = content.match(/test timed out/gi);
      const hasTimeouts = timeouts !== null && timeouts.length > 0;
      if (hasTimeouts) {
        issues.push(`Test timeouts detected: ${timeouts.length}`);
      }
      
      return {
        hasBuildErrors,
        hasRuntimePanics,
        hasTimeouts,
        issues,
      };
    } catch (error) {
      console.error(`[EXECUTOR][GO] Error detecting execution issues:`, error);
      return {
        hasBuildErrors: false,
        hasRuntimePanics: false,
        hasTimeouts: false,
        issues: [],
      };
    }
  }

  private writeLogHeader(ws: fs.WriteStream, tf: TestFile, started: Date, command: string[], modRoot: string): void {
    ws.write(`${'='.repeat(80)}\n`);
    ws.write(`GO TEST EXECUTION LOG\n`);
    ws.write(`${'='.repeat(80)}\n`);
    ws.write(`Test File:        ${tf.path}\n`);
    ws.write(`Language:         ${tf.language}\n`);
    ws.write(`Module Root:      ${modRoot}\n`);
    ws.write(`Started:          ${formatDate(started)}\n`);
    ws.write(`Timeout:          ${this.timeoutSec > 0 ? this.timeoutSec + 's' : 'none'}\n`);
    ws.write(`Command:          go ${command.join(' ')}\n`);
    ws.write(`PATH:             ${this.env.PATH || 'not set'}\n`);
    ws.write(`${'='.repeat(80)}\n\n`);
  }

  private writeLogFooter(ws: fs.WriteStream, exitCode: number, started: Date, ended: Date, timeoutHit: boolean): void {
    const duration = ended.getTime() - started.getTime();
    
    ws.write(`\n${'='.repeat(80)}\n`);
    ws.write(`EXECUTION SUMMARY\n`);
    ws.write(`${'='.repeat(80)}\n`);
    ws.write(`Exit Code:        ${exitCode}\n`);
    ws.write(`Duration:         ${duration}ms (${(duration/1000).toFixed(2)}s)\n`);
    ws.write(`Ended:            ${formatDate(ended)}\n`);
    ws.write(`Status:           ${timeoutHit ? 'TIMEOUT' : exitCode === 0 ? 'SUCCESS' : 'FAILED'}\n`);
    ws.write(`${'='.repeat(80)}\n`);
  }

  private postExecutionValidation(logPath: string, tf: TestFile): {
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Check if log file exists
    if (!fs.existsSync(logPath)) {
      errors.push('Log file was not created');
      return { warnings, errors };
    }
    
    // Check log file size
    const stats = fs.statSync(logPath);
    if (stats.size === 0) {
      errors.push('Log file is empty');
    } else if (stats.size < 100) {
      warnings.push('Log file is suspiciously small');
    }
    
    // Validate JSON output
    const jsonValidation = this.validateJsonOutput(logPath);
    if (!jsonValidation.isValid) {
      warnings.push('No valid JSON output found in log');
    } else if (this.verbose) {
      console.log(`[EXECUTOR][GO] Found ${jsonValidation.lineCount} valid JSON lines`);
    }
    
    if (jsonValidation.errors.length > 0 && this.verbose) {
      console.log(`[EXECUTOR][GO] Found ${jsonValidation.errors.length} non-JSON lines`);
    }
    
    // Detect execution issues
    const issues = this.detectExecutionIssues(logPath);
    if (issues.issues.length > 0) {
      warnings.push(...issues.issues);
    }
    
    return { warnings, errors };
  }

  private async runOne(tf: TestFile): Promise<ExecutionResult> {
    const started = new Date();
    const logPath = path.join(this.logsDir, path.basename(tf.path) + '.log');
    const pkgDir = path.dirname(tf.path);
    const modRoot = this.findModuleRoot(pkgDir);

    // Clean build cache if configured
    this.cleanBuildCache(modRoot);

    // Build test command with all enhancements
    const { args, pkgPath } = this.buildTestCommand(tf, modRoot);

    console.log(`[EXECUTOR][GO] Executing test file: ${path.basename(tf.path)}`);
    console.log(`[EXECUTOR][GO] Module root: ${modRoot}`);
    console.log(`[EXECUTOR][GO] Package path: ${pkgPath}`);

    let timeoutHit = false;
    let exitCode = 1;
    
    await new Promise<void>((resolve) => {
      const ws = fs.createWriteStream(logPath, { flags: 'w' });
      
      // Write structured header
      this.writeLogHeader(ws, tf, started, args, modRoot);

      const child = spawn('go', args, {
        cwd: modRoot,
        env: this.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer =
        this.timeoutSec > 0
          ? setTimeout(() => {
              timeoutHit = true;
              console.log(`[EXECUTOR][GO] TIMEOUT for ${path.basename(tf.path)} after ${this.timeoutSec}s`);
              ws.write(`\n*** TIMEOUT DETECTED AFTER ${this.timeoutSec}s ***\n\n`);
              try { 
                child.kill('SIGKILL');
                console.log(`[EXECUTOR][GO] Process killed due to timeout`);
              } catch (err) {
                console.error(`[EXECUTOR][GO] Failed to kill process:`, err);
              }
            }, this.timeoutSec * 1000)
          : null;

      child.stdout.on('data', (d) => ws.write(d));
      child.stderr.on('data', (d) => ws.write(d));

      child.on('error', (error) => {
        console.error(`[EXECUTOR][GO] Process error for ${path.basename(tf.path)}:`, error);
        ws.write(`\n*** PROCESS ERROR ***\n`);
        ws.write(`${error.message}\n`);
        if (error.stack) {
          ws.write(`${error.stack}\n`);
        }
      });

      child.on('close', (code) => {
        if (timer) {
          clearTimeout(timer);
        }
        exitCode = timeoutHit ? 124 : Number(code ?? 1);
        const ended = new Date();
        
        // Write structured footer
        this.writeLogFooter(ws, exitCode, started, ended, timeoutHit);
        ws.end();
        resolve();
      });
    });

    const ended = new Date();
    const duration = ended.getTime() - started.getTime();
    
    // Post-execution validation
    const validation = this.postExecutionValidation(logPath, tf);
    
    if (validation.errors.length > 0) {
      console.error(`[EXECUTOR][GO] ERRORS for ${path.basename(tf.path)}:`);
      validation.errors.forEach(err => console.error(`[EXECUTOR][GO]   - ${err}`));
    }
    
    if (validation.warnings.length > 0) {
      console.warn(`[EXECUTOR][GO] Warnings for ${path.basename(tf.path)}:`);
      validation.warnings.forEach(warn => console.warn(`[EXECUTOR][GO]   - ${warn}`));
    }
    
    console.log(`[EXECUTOR][GO] Completed ${path.basename(tf.path)} - Exit: ${exitCode}, Duration: ${duration}ms, Timeout: ${timeoutHit}`);

    return {
      testFile: tf,
      exitCode,
      logPath,
      junitPath: null,
      startedAt: formatDate(started),
      endedAt: formatDate(ended),
      timeout: timeoutHit,
    };
  }

  async executeMany(testFiles: TestFile[], jobs: number): Promise<ExecutionResult[]> {
    const maxJobs = Math.max(1, Number(jobs || 1));
    return (await runWithLimit(maxJobs, testFiles, (tf) => this.runOne(tf))) as ExecutionResult[];
  }
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
      if (cmd.includes('/') || cmd.includes('\\')) {
        return cmd;
      }
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
        if (timer) {
          clearTimeout(timer);
        }
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
        
        if (timer) {
          clearTimeout(timer);
        }
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
  if (language === 'go' || language === 'golang') {
    return new GoExecutor(opts as GoExecutorOptions);
  }
  throw new Error(`Executor for language '${language}' is not implemented yet.`);
}