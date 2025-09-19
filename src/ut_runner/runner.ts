// src/ut_runner/runner.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { Collector } from './collector';
import { makeExecutor } from './executor';
import { Analyzer } from './analyzer';
import { Writer } from './writer';
import { ExecutionResult, TestFile } from './types';

export function reportLogCoverage(testFiles: TestFile[], logsDir: string, junitDir: string): void {
  const expected = new Set(testFiles.map((t) => path.basename(t.path)));

  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(junitDir, { recursive: true });

  const existingLogs = new Set(fs.readdirSync(logsDir).filter((n) => n.endsWith('.log')).map((n) => n.slice(0, -4)));
  const existingXmls = new Set(fs.readdirSync(junitDir).filter((n) => n.endsWith('.xml')).map((n) => n.slice(0, -4)));

  // eslint-disable-next-line no-console
  console.log(`Existing logs in ${logsDir}: ${existingLogs.size}`);
  if (existingLogs.size) {
    // eslint-disable-next-line no-console
    console.log(`Logs: ${Array.from(existingLogs).sort().join(', ')}`);
  }

  const missingLogs = new Set([...expected].filter((f) => !existingLogs.has(f)));
  if (missingLogs.size) {
    // eslint-disable-next-line no-console
    console.log(`Missing logs for ${missingLogs.size} collected tests:`);
    // eslint-disable-next-line no-console
    console.log(Array.from(missingLogs).sort().join(', '));
  }

  const orphanLogs = new Set([...existingLogs].filter((f) => !expected.has(f)));
  if (orphanLogs.size) {
    // eslint-disable-next-line no-console
    console.log(`Orphan logs (not in current collection): ${orphanLogs.size}`);
    // eslint-disable-next-line no-console
    console.log(Array.from(orphanLogs).sort().join(', '));
  }

  const logsWithoutJunit = new Set([...existingLogs].filter((f) => !existingXmls.has(f)));
  if (logsWithoutJunit.size) {
    // eslint-disable-next-line no-console
    console.log(`Logs without matching JUnit XML: ${logsWithoutJunit.size}`);
    // eslint-disable-next-line no-console
    console.log(Array.from(logsWithoutJunit).sort().join(', '));
  }

  const junitWithoutLogs = new Set([...existingXmls].filter((f) => !existingLogs.has(f)));
  if (junitWithoutLogs.size) {
    // eslint-disable-next-line no-console
    console.log(`JUnit XML without matching logs: ${junitWithoutLogs.size}`);
    // eslint-disable-next-line no-console
    console.log(Array.from(junitWithoutLogs).sort().join(', '));
  }
}

export function splitCached(testFiles: TestFile[], logsDir: string, junitDir: string): [ExecutionResult[], TestFile[]] {
  console.log(`[RUNNER] Analyzing cache for ${testFiles.length} test files`);
  console.log(`[RUNNER] Logs directory: ${logsDir}`);
  console.log(`[RUNNER] JUnit directory: ${junitDir}`);
  
  const cached: ExecutionResult[] = [];
  const toRun: TestFile[] = [];
  const cacheIssues: string[] = [];
  
  for (const tf of testFiles) {
    const logPath = path.join(logsDir, path.basename(tf.path) + '.log');
    const junitPath = path.join(junitDir, path.basename(tf.path) + '.xml');
    
    const logExists = fs.existsSync(logPath);
    const junitExists = fs.existsSync(junitPath);
    const logSize = logExists ? fs.statSync(logPath).size : 0;
    const junitSize = junitExists ? fs.statSync(junitPath).size : 0;
    
    if (logExists && junitExists && logSize > 0 && junitSize > 0) {
      cached.push({
        testFile: tf,
        exitCode: 0,
        logPath,
        junitPath,
        startedAt: 'CACHED',
        endedAt: 'CACHED',
        timeout: false,
      });
    } else {
      toRun.push(tf);
      
      // Log cache issues for debugging
      const issues: string[] = [];
      if (!logExists) issues.push('missing log');
      if (!junitExists) issues.push('missing junit');
      if (logExists && logSize === 0) issues.push('empty log');
      if (junitExists && junitSize === 0) issues.push('empty junit');
      
      if (issues.length > 0) {
        cacheIssues.push(`${tf.path}: ${issues.join(', ')}`);
      }
    }
  }
  
  console.log(`[RUNNER] Cache analysis results:`);
  console.log(`[RUNNER]   Cached: ${cached.length}`);
  console.log(`[RUNNER]   To run: ${toRun.length}`);
  
  if (cacheIssues.length > 0) {
    console.log(`[RUNNER] Cache issues found:`);
    cacheIssues.slice(0, 5).forEach(issue => {
      console.log(`[RUNNER]   - ${issue}`);
    });
    if (cacheIssues.length > 5) {
      console.log(`[RUNNER]   ... and ${cacheIssues.length - 5} more issues`);
    }
  }
  
  return [cached, toRun];
}

export function computeJobs(jobsOpt?: number | null): number {
  console.log(`[RUNNER] Computing optimal job count`);
  console.log(`[RUNNER]   Requested jobs: ${jobsOpt || 'auto'}`);
  
  if (jobsOpt && jobsOpt > 0) {
    console.log(`[RUNNER]   Using requested job count: ${jobsOpt}`);
    return jobsOpt;
  }
  
  try {
    const cpuCount = os.cpus()?.length || 1;
    const computedJobs = Math.max(1, Math.floor((cpuCount * 3) / 4));
    console.log(`[RUNNER]   CPU cores detected: ${cpuCount}`);
    console.log(`[RUNNER]   Computed job count: ${computedJobs} (75% of CPU cores)`);
    return computedJobs;
  } catch (error) {
    console.error(`[RUNNER]   Error detecting CPU count:`, error);
    console.log(`[RUNNER]   Using fallback job count: 1`);
    return 1;
  }
}

export function validatePythonExecutable(pythonExe: string): string {
  console.log(`[RUNNER] Validating Python executable: ${pythonExe}`);

  const resolveViaPath = (cmd: string): string => {
    if (cmd.includes('/') || cmd.includes('\\')) return cmd;
    try {
      return execSync(`command -v ${cmd}`, { encoding: 'utf8', timeout: 3000 }).trim();
    } catch {
      return cmd;
    }
  };

  let candidate = resolveViaPath(pythonExe);

  try {
    const stats = fs.statSync(candidate);
    if (stats.isFile()) {
      console.log(`[RUNNER] Python executable validated successfully: ${candidate}`);
      return candidate;
    } else {
      console.error(`[RUNNER] Path exists but is not a file: ${candidate}`);
    }
  } catch (error) {
    console.error(`[RUNNER] Python executable validation failed:`, error);
    console.log(`[RUNNER] Searching for alternative Python executables...`);

    const alternatives = ['python3', 'python', 'py'];
    for (const alt of alternatives) {
      const resolved = resolveViaPath(alt);
      try {
        const version = execSync(`"${resolved}" --version`, { encoding: 'utf8', timeout: 5000 });
        console.log(`[RUNNER] Found working alternative: ${resolved} -> ${version.trim()}`);
        return resolved;
      } catch {
        console.log(`[RUNNER] Alternative ${alt} not available`);
      }
    }

    console.error(`[RUNNER] No working Python executable found!`);
    throw new Error(`Python executable not found: ${pythonExe}`);
  }

  return candidate;
}

export function buildEnv(pythonpathList: string[]): NodeJS.ProcessEnv {
  console.log(`[RUNNER] Building environment variables`);
  console.log(`[RUNNER]   Python path list: ${pythonpathList.length} entries`);
  
  const env = { ...process.env };
  
  // Default PYTHONPATH for the black project
  const defaultPythonPaths = [
    '/LSPAI/experiments/projects/black/src/',
    '/LSPAI/experiments/projects/black',
    '/LSPAI/experiments/projects'
  ];
  
  const existing = env.PYTHONPATH || '';
  const allPaths = [...defaultPythonPaths, ...(pythonpathList || [])];
  const filtered = allPaths.filter(Boolean);
  const merged = filtered.join(':');
  
  console.log(`[RUNNER]   Existing PYTHONPATH: ${existing || 'not set'}`);
  console.log(`[RUNNER]   Default paths: ${defaultPythonPaths.length}`);
  defaultPythonPaths.forEach((path, i) => {
    console.log(`[RUNNER]     ${i + 1}. ${path}`);
  });
  console.log(`[RUNNER]   Additional paths: ${pythonpathList ? pythonpathList.length : 0}`);
  if (pythonpathList && pythonpathList.length) {
    pythonpathList.forEach((path, i) => {
      console.log(`[RUNNER]     ${i + 1}. ${path}`);
    });
  }
  
  env.PYTHONPATH = [merged, existing].filter(Boolean).join(':');
  console.log(`[RUNNER]   Final PYTHONPATH: ${env.PYTHONPATH}`);
  
  return env;
}

export interface RunOptions {
  language?: string;
  pythonExe?: string;
  include?: string[] | null;
  timeoutSec?: number;
  jobs?: number;
  pythonpath?: string[];
}

export async function runPipeline(testsDir: string, outputDir: string, options: RunOptions = {}) {
  const pipelineStartTime = new Date();
  
  console.log(`[RUNNER] Starting test pipeline execution`);
  console.log(`[RUNNER] Tests directory: ${testsDir}`);
  console.log(`[RUNNER] Output directory: ${outputDir}`);
  console.log(`[RUNNER] Options:`, JSON.stringify(options, null, 2));
  
  const language = options.language ?? 'python';
  const rawPythonExe = options.pythonExe ?? process.execPath;
  const pythonExe = validatePythonExecutable(rawPythonExe);
  const include = options.include ?? null;
  const timeout = options.timeoutSec ?? 0;
  const jobs = computeJobs(options.jobs ?? 0);
  const env = buildEnv(options.pythonpath ?? []);

  console.log(`[RUNNER] Configuration:`);
  console.log(`[RUNNER]   Language: ${language}`);
  console.log(`[RUNNER]   Original Python executable: ${rawPythonExe}`);
  console.log(`[RUNNER]   Validated Python executable: ${pythonExe}`);
  console.log(`[RUNNER]   Timeout: ${timeout}s`);
  console.log(`[RUNNER]   Jobs: ${jobs}`);
  console.log(`[RUNNER]   Include patterns: ${include ? include.join(', ') : 'none'}`);
  console.log(`[RUNNER]   PYTHONPATH: ${env.PYTHONPATH || 'not set'}`);

  const logsDir = path.join(path.resolve(outputDir), 'logs');
  const junitDir = path.join(path.resolve(outputDir), 'junit');
  
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(junitDir, { recursive: true });
    console.log(`[RUNNER] Created directories: ${logsDir}, ${junitDir}`);
  } catch (error) {
    console.error(`[RUNNER] Failed to create output directories:`, error);
    throw error;
  }

  // Collection phase
  console.log(`[RUNNER] Phase 1: Collecting test files`);
  const collectionStartTime = new Date();
  let testFiles: TestFile[];
  
  try {
    const collector = new Collector(language, include || undefined);
    testFiles = collector.collect(testsDir);
    const collectionDuration = new Date().getTime() - collectionStartTime.getTime();
    
    console.log(`[RUNNER] Collection completed in ${collectionDuration}ms`);
    console.log(`[RUNNER] Found ${testFiles.length} test files`);
    
    if (!testFiles.length) {
      console.log(`[RUNNER] No test files found in ${testsDir}`);
      return;
    }
    
    // Log first few test files for debugging
    const sampleFiles = testFiles.slice(0, 5);
    console.log(`[RUNNER] Sample test files:`);
    sampleFiles.forEach((tf, i) => {
      console.log(`[RUNNER]   ${i + 1}. ${tf.path} (${tf.language})`);
    });
    if (testFiles.length > 5) {
      console.log(`[RUNNER]   ... and ${testFiles.length - 5} more`);
    }
    
  } catch (error) {
    console.error(`[RUNNER] Collection phase failed:`, error);
    throw error;
  }

  // Cache analysis phase
  console.log(`[RUNNER] Phase 2: Analyzing cache`);
  const cacheStartTime = new Date();
  let cachedResults: ExecutionResult[];
  let toRun: TestFile[];
  
  try {
    [cachedResults, toRun] = splitCached(testFiles, logsDir, junitDir);
    const cacheDuration = new Date().getTime() - cacheStartTime.getTime();
    
    console.log(`[RUNNER] Cache analysis completed in ${cacheDuration}ms`);
    console.log(`[RUNNER] Cached results: ${cachedResults.length}`);
    console.log(`[RUNNER] Tests to run: ${toRun.length}`);
    
    if (cachedResults.length) {
      console.log(`[RUNNER] Using cache for ${cachedResults.length} test files`);
      // Log cache details for debugging
      const cacheDetails = cachedResults.map(r => ({
        path: r.testFile.path,
        logPath: r.logPath,
        junitPath: r.junitPath
      }));
      console.log(`[RUNNER] Cache details:`, JSON.stringify(cacheDetails.slice(0, 3), null, 2));
      if (cachedResults.length > 3) {
        console.log(`[RUNNER] ... and ${cachedResults.length - 3} more cached files`);
      }
    }
    
  } catch (error) {
    console.error(`[RUNNER] Cache analysis failed:`, error);
    throw error;
  }

  // Execution phase
  console.log(`[RUNNER] Phase 3: Test execution`);
  const executionStartTime = new Date();
  let execResults: ExecutionResult[];
  
  try {
    if (!toRun.length) {
      console.log(`[RUNNER] No tests to execute; all results loaded from cache`);
      execResults = cachedResults;
    } else {
      console.log(`[RUNNER] Executing ${toRun.length} test files (skipping ${cachedResults.length} cached)`);
      
      const executor =
        language === 'python'
          ? makeExecutor(language, {
              pythonExe,
              logsDir,
              junitDir,
              timeout,
              env,
            })
          : makeExecutor(language, {});
      
      const ran = await executor.executeMany(toRun, jobs);
      const executionDuration = new Date().getTime() - executionStartTime.getTime();
      
      console.log(`[RUNNER] Execution completed in ${executionDuration}ms`);
      console.log(`[RUNNER] Executed ${ran.length} test files`);
      
      execResults = cachedResults.concat(ran);
    }
    
  } catch (error) {
    const executionDuration = new Date().getTime() - executionStartTime.getTime();
    console.error(`[RUNNER] Execution phase failed after ${executionDuration}ms:`, error);
    console.error(`[RUNNER] Error stack:`, error instanceof Error ? error.stack : 'No stack trace available');
    throw error;
  }

  // Analysis phase
  console.log(`[RUNNER] Phase 4: Analysis`);
  const analysisStartTime = new Date();
  let report: any;
  
  try {
    const analyzer = new Analyzer(language);
    report = analyzer.analyze(execResults, path.resolve(testsDir), path.resolve(outputDir));
    const analysisDuration = new Date().getTime() - analysisStartTime.getTime();
    
    console.log(`[RUNNER] Analysis completed in ${analysisDuration}ms`);
    console.log(`[RUNNER] Analyzed ${Object.keys(report.tests).length} test cases`);
    console.log(`[RUNNER] Analyzed ${Object.keys(report.files).length} files`);
    
  } catch (error) {
    console.error(`[RUNNER] Analysis phase failed:`, error);
    throw error;
  }

  // Writing phase
  console.log(`[RUNNER] Phase 5: Writing results`);
  const writingStartTime = new Date();
  
  try {
    const writer = new Writer(outputDir);
    writer.writeUnifiedLog(execResults);
    writer.writeAnalysis(report);
    const writingDuration = new Date().getTime() - writingStartTime.getTime();
    
    console.log(`[RUNNER] Writing completed in ${writingDuration}ms`);
    
    // Enhanced output reporting
    console.log(`[RUNNER] Output files created:`);
    console.log(`[RUNNER]   Logs directory: ${writer.logsDir}`);
    console.log(`[RUNNER]   JUnit directory: ${writer.junitDir}`);
    console.log(`[RUNNER]   File results: ${writer.fileResultsJson}`);
    console.log(`[RUNNER]   Test results: ${writer.testResultsJson}`);
    console.log(`[RUNNER]   Summary files: ${writer.passedTxt}, ${writer.assertionTxt}, ${writer.errorsTxt}`);
    console.log(`[RUNNER]   Unified log: ${writer.unifiedLog}`);
    
  } catch (error) {
    console.error(`[RUNNER] Writing phase failed:`, error);
    throw error;
  }

  // Pipeline completion
  const pipelineDuration = new Date().getTime() - pipelineStartTime.getTime();
  console.log(`[RUNNER] Pipeline completed successfully in ${pipelineDuration}ms`);
  console.log(`[RUNNER] Total test files processed: ${execResults.length}`);
  
  // Summary statistics
  const successful = execResults.filter(r => r.exitCode === 0 && !r.timeout);
  const failed = execResults.filter(r => r.exitCode !== 0);
  const timedOut = execResults.filter(r => r.timeout);
  
  console.log(`[RUNNER] Final summary:`);
  console.log(`[RUNNER]   Successful: ${successful.length}`);
  console.log(`[RUNNER]   Failed: ${failed.length}`);
  console.log(`[RUNNER]   Timed out: ${timedOut.length}`);
  console.log(`[RUNNER]   Success rate: ${((successful.length / execResults.length) * 100).toFixed(1)}%`);
}