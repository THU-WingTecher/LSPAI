import * as fs from 'fs';
import * as path from 'path';

export interface FixDiffEntry {
  testCaseName: string;
  timestamp: string;
  originalCode: string;
  fixedCode: string;
  subagentCategory: 'redefined' | 'general';
  attemptNumber: number;
  totalAttempts: number;
  success: boolean;
  errorMessage?: string;
  changes: {
    linesAdded: number;
    linesRemoved: number;
    linesModified: number;
  };
}

export interface FixDiffReport {
  reportVersion: string;
  createdAt: string;
  lastUpdated: string;
  totalTestsProcessed: number;
  successfulFixes: number;
  failedFixes: number;
  subagentStats: {
    redefined: {
      totalAttempts: number;
      successfulFixes: number;
      failedFixes: number;
    };
    general: {
      totalAttempts: number;
      successfulFixes: number;
      failedFixes: number;
    };
  };
  fixes: FixDiffEntry[];
}

/**
 * Calculates simple line-based diff statistics
 */
export function calculateDiffStats(original: string, fixed: string): {
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
} {
  const originalLines = original.split('\n');
  const fixedLines = fixed.split('\n');
  
  // Simple line comparison (not a full diff algorithm, but good enough)
  const originalSet = new Set(originalLines);
  const fixedSet = new Set(fixedLines);
  
  let linesAdded = 0;
  let linesRemoved = 0;
  
  for (const line of fixedLines) {
    if (!originalSet.has(line)) {
      linesAdded++;
    }
  }
  
  for (const line of originalLines) {
    if (!fixedSet.has(line)) {
      linesRemoved++;
    }
  }
  
  const linesModified = Math.min(linesAdded, linesRemoved);
  linesAdded = linesAdded - linesModified;
  linesRemoved = linesRemoved - linesModified;
  
  return { linesAdded, linesRemoved, linesModified };
}

/**
 * Creates a new fix diff report
 */
export function createFixDiffReport(): FixDiffReport {
  return {
    reportVersion: '1.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalTestsProcessed: 0,
    successfulFixes: 0,
    failedFixes: 0,
    subagentStats: {
      redefined: {
        totalAttempts: 0,
        successfulFixes: 0,
        failedFixes: 0
      },
      general: {
        totalAttempts: 0,
        successfulFixes: 0,
        failedFixes: 0
      }
    },
    fixes: []
  };
}

/**
 * Loads existing fix diff report from file
 */
export function loadFixDiffReport(filePath: string): FixDiffReport | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Saves fix diff report to file
 */
export function saveFixDiffReport(filePath: string, report: FixDiffReport): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), { encoding: 'utf-8' });
}

/**
 * Adds a fix entry to the report
 */
export function addFixToReport(
  report: FixDiffReport,
  entry: FixDiffEntry
): FixDiffReport {
  const updated = {
    ...report,
    lastUpdated: new Date().toISOString(),
    totalTestsProcessed: report.totalTestsProcessed + 1,
    successfulFixes: entry.success ? report.successfulFixes + 1 : report.successfulFixes,
    failedFixes: !entry.success ? report.failedFixes + 1 : report.failedFixes,
    fixes: [...report.fixes, entry]
  };
  
  // Update subagent stats
  const subagent = entry.subagentCategory;
  updated.subagentStats[subagent].totalAttempts += entry.attemptNumber;
  if (entry.success) {
    updated.subagentStats[subagent].successfulFixes++;
  } else {
    updated.subagentStats[subagent].failedFixes++;
  }
  
  return updated;
}

/**
 * Logs a fix with diff information
 */
export function logFixDiff(
  testCaseName: string,
  originalCode: string,
  fixedCode: string,
  subagentCategory: 'redefined' | 'general',
  attemptNumber: number,
  totalAttempts: number,
  success: boolean,
  errorMessage: string | undefined,
  reportPath: string
): void {
  let report = loadFixDiffReport(reportPath);
  
  if (!report) {
    report = createFixDiffReport();
  }
  
  const changes = calculateDiffStats(originalCode, fixedCode);
  
  const entry: FixDiffEntry = {
    testCaseName,
    timestamp: new Date().toISOString(),
    originalCode,
    fixedCode,
    subagentCategory,
    attemptNumber,
    totalAttempts,
    success,
    errorMessage,
    changes
  };
  
  const updatedReport = addFixToReport(report, entry);
  saveFixDiffReport(reportPath, updatedReport);
}

/**
 * Generates a summary of the fix diff report
 */
export function generateFixDiffSummary(report: FixDiffReport): string {
  const lines: string[] = [];
  
  lines.push('=== Fix Diff Summary ===');
  lines.push(`Total Tests Processed: ${report.totalTestsProcessed}`);
  lines.push(`Successful Fixes: ${report.successfulFixes}`);
  lines.push(`Failed Fixes: ${report.failedFixes}`);
  lines.push(`Success Rate: ${((report.successfulFixes / report.totalTestsProcessed) * 100).toFixed(1)}%`);
  lines.push('');
  
  lines.push('=== Subagent Statistics ===');
  lines.push('Redefined Subagent:');
  lines.push(`  Total Attempts: ${report.subagentStats.redefined.totalAttempts}`);
  lines.push(`  Successful: ${report.subagentStats.redefined.successfulFixes}`);
  lines.push(`  Failed: ${report.subagentStats.redefined.failedFixes}`);
  if (report.subagentStats.redefined.totalAttempts > 0) {
    lines.push(`  Success Rate: ${((report.subagentStats.redefined.successfulFixes / (report.subagentStats.redefined.successfulFixes + report.subagentStats.redefined.failedFixes)) * 100).toFixed(1)}%`);
  }
  lines.push('');
  
  lines.push('General Subagent:');
  lines.push(`  Total Attempts: ${report.subagentStats.general.totalAttempts}`);
  lines.push(`  Successful: ${report.subagentStats.general.successfulFixes}`);
  lines.push(`  Failed: ${report.subagentStats.general.failedFixes}`);
  if (report.subagentStats.general.totalAttempts > 0) {
    lines.push(`  Success Rate: ${((report.subagentStats.general.successfulFixes / (report.subagentStats.general.successfulFixes + report.subagentStats.general.failedFixes)) * 100).toFixed(1)}%`);
  }
  lines.push('');
  
  // Calculate aggregate change statistics
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalModified = 0;
  
  for (const fix of report.fixes) {
    totalAdded += fix.changes.linesAdded;
    totalRemoved += fix.changes.linesRemoved;
    totalModified += fix.changes.linesModified;
  }
  
  lines.push('=== Code Change Statistics ===');
  lines.push(`Total Lines Added: ${totalAdded}`);
  lines.push(`Total Lines Removed: ${totalRemoved}`);
  lines.push(`Total Lines Modified: ${totalModified}`);
  lines.push(`Average Changes per Test: ${((totalAdded + totalRemoved + totalModified) / report.totalTestsProcessed).toFixed(1)} lines`);
  lines.push('');
  
  lines.push('=== Recent Fixes (Last 5) ===');
  const recentFixes = report.fixes.slice(-5).reverse();
  for (const fix of recentFixes) {
    lines.push(`[${fix.timestamp}] ${fix.testCaseName}`);
    lines.push(`  Subagent: ${fix.subagentCategory}`);
    lines.push(`  Attempt: ${fix.attemptNumber}/${fix.totalAttempts}`);
    lines.push(`  Status: ${fix.success ? 'SUCCESS' : 'FAILED'}`);
    lines.push(`  Changes: +${fix.changes.linesAdded} -${fix.changes.linesRemoved} ~${fix.changes.linesModified}`);
    if (fix.errorMessage) {
      lines.push(`  Error: ${fix.errorMessage.substring(0, 100)}...`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Generates a simple git-like diff report between two test codes
 * Shows added lines with "+" and deleted lines with "-", each marked with line numbers
 */
export function generateSimpleDiffReport(originalCode: string, fixedCode: string): string {
  const originalLines = originalCode.split('\n');
  const fixedLines = fixedCode.split('\n');
  
  const diffLines: string[] = [];
  
  // Simple diff algorithm: compare line by line
  let origIdx = 0;
  let fixedIdx = 0;
  
  while (origIdx < originalLines.length || fixedIdx < fixedLines.length) {
    if (origIdx >= originalLines.length) {
      // Only fixed code remains (all additions)
      diffLines.push(`+${fixedIdx + 1}: ${fixedLines[fixedIdx]}`);
      fixedIdx++;
    } else if (fixedIdx >= fixedLines.length) {
      // Only original code remains (all deletions)
      diffLines.push(`-${origIdx + 1}: ${originalLines[origIdx]}`);
      origIdx++;
    } else if (originalLines[origIdx] === fixedLines[fixedIdx]) {
      // Lines match - show as unchanged with line number
      diffLines.push(` ${origIdx + 1}: ${originalLines[origIdx]}`);
      origIdx++;
      fixedIdx++;
    } else {
      // Lines differ - check ahead to see if we can find a match
      let foundMatch = false;
      
      // Look ahead in fixed to see if current original line appears
      for (let lookAhead = fixedIdx + 1; lookAhead < fixedLines.length && lookAhead <= fixedIdx + 10; lookAhead++) {
        if (originalLines[origIdx] === fixedLines[lookAhead]) {
          // Current original line appears later in fixed, so current fixed lines are additions
          for (let i = fixedIdx; i < lookAhead; i++) {
            diffLines.push(`+${i + 1}: ${fixedLines[i]}`);
          }
          fixedIdx = lookAhead;
          // Now process the matching line
          diffLines.push(` ${origIdx + 1}: ${originalLines[origIdx]}`);
          origIdx++;
          fixedIdx++;
          foundMatch = true;
          break;
        }
      }
      
      if (!foundMatch) {
        // Look ahead in original to see if current fixed line appears
        for (let lookAhead = origIdx + 1; lookAhead < originalLines.length && lookAhead <= origIdx + 10; lookAhead++) {
          if (fixedLines[fixedIdx] === originalLines[lookAhead]) {
            // Current fixed line appears later in original, so current original lines are deletions
            for (let i = origIdx; i < lookAhead; i++) {
              diffLines.push(`-${i + 1}: ${originalLines[i]}`);
            }
            origIdx = lookAhead;
            // Now process the matching line
            diffLines.push(` ${origIdx + 1}: ${originalLines[origIdx]}`);
            origIdx++;
            fixedIdx++;
            foundMatch = true;
            break;
          }
        }
      }
      
      if (!foundMatch) {
        // No match found - treat as modification (delete old, add new)
        diffLines.push(`-${origIdx + 1}: ${originalLines[origIdx]}`);
        diffLines.push(`+${fixedIdx + 1}: ${fixedLines[fixedIdx]}`);
        origIdx++;
        fixedIdx++;
      }
    }
  }
  
  return diffLines.join('\n');
}

/**
 * Generates a detailed markdown report with code diffs
 */
export function generateDetailedFixReport(report: FixDiffReport): string {
  const lines: string[] = [];
  
  lines.push('# Test Fix Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Report Period:** ${report.createdAt} to ${report.lastUpdated}`);
  lines.push('');
  
  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`- **Total Tests Processed:** ${report.totalTestsProcessed}`);
  lines.push(`- **Successful Fixes:** ${report.successfulFixes} (${((report.successfulFixes / report.totalTestsProcessed) * 100).toFixed(1)}%)`);
  lines.push(`- **Failed Fixes:** ${report.failedFixes} (${((report.failedFixes / report.totalTestsProcessed) * 100).toFixed(1)}%)`);
  lines.push('');
  
  // Subagent Performance
  lines.push('## Subagent Performance');
  lines.push('');
  
  lines.push('### Redefined Subagent');
  lines.push(`- **Total Attempts:** ${report.subagentStats.redefined.totalAttempts}`);
  lines.push(`- **Successful Fixes:** ${report.subagentStats.redefined.successfulFixes}`);
  lines.push(`- **Failed Fixes:** ${report.subagentStats.redefined.failedFixes}`);
  if (report.subagentStats.redefined.successfulFixes + report.subagentStats.redefined.failedFixes > 0) {
    const redefinedRate = (report.subagentStats.redefined.successfulFixes / (report.subagentStats.redefined.successfulFixes + report.subagentStats.redefined.failedFixes)) * 100;
    lines.push(`- **Success Rate:** ${redefinedRate.toFixed(1)}%`);
  }
  lines.push('');
  
  lines.push('### General Subagent');
  lines.push(`- **Total Attempts:** ${report.subagentStats.general.totalAttempts}`);
  lines.push(`- **Successful Fixes:** ${report.subagentStats.general.successfulFixes}`);
  lines.push(`- **Failed Fixes:** ${report.subagentStats.general.failedFixes}`);
  if (report.subagentStats.general.successfulFixes + report.subagentStats.general.failedFixes > 0) {
    const generalRate = (report.subagentStats.general.successfulFixes / (report.subagentStats.general.successfulFixes + report.subagentStats.general.failedFixes)) * 100;
    lines.push(`- **Success Rate:** ${generalRate.toFixed(1)}%`);
  }
  lines.push('');
  
  // Detailed Fix List
  lines.push('## Detailed Fix Results');
  lines.push('');
  
  // Group by success/failure
  const successfulFixes = report.fixes.filter(f => f.success);
  const failedFixes = report.fixes.filter(f => !f.success);
  
  lines.push(`### Successful Fixes (${successfulFixes.length})`);
  lines.push('');
  
  for (const fix of successfulFixes) {
    lines.push(`#### ${fix.testCaseName}`);
    lines.push(`- **Timestamp:** ${fix.timestamp}`);
    lines.push(`- **Subagent:** ${fix.subagentCategory}`);
    lines.push(`- **Attempts:** ${fix.attemptNumber}/${fix.totalAttempts}`);
    lines.push(`- **Code Changes:** +${fix.changes.linesAdded} -${fix.changes.linesRemoved} ~${fix.changes.linesModified}`);
    lines.push('');
    
    // Show code diff
    lines.push('<details>');
    lines.push('<summary>View Code Changes</summary>');
    lines.push('');
    lines.push('**Original Code:**');
    lines.push('```python');
    lines.push(fix.originalCode);
    lines.push('```');
    lines.push('');
    lines.push('**Fixed Code:**');
    lines.push('```python');
    lines.push(fix.fixedCode);
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }
  
  lines.push(`### Failed Fixes (${failedFixes.length})`);
  lines.push('');
  
  for (const fix of failedFixes) {
    lines.push(`#### ${fix.testCaseName}`);
    lines.push(`- **Timestamp:** ${fix.timestamp}`);
    lines.push(`- **Subagent:** ${fix.subagentCategory}`);
    lines.push(`- **Attempts:** ${fix.attemptNumber}/${fix.totalAttempts}`);
    lines.push(`- **Code Changes:** +${fix.changes.linesAdded} -${fix.changes.linesRemoved} ~${fix.changes.linesModified}`);
    if (fix.errorMessage) {
      lines.push(`- **Last Error:**`);
      lines.push('  ```');
      lines.push(`  ${fix.errorMessage}`);
      lines.push('  ```');
    }
    lines.push('');
    
    // Show code diff
    lines.push('<details>');
    lines.push('<summary>View Code Changes</summary>');
    lines.push('');
    lines.push('**Original Code:**');
    lines.push('```python');
    lines.push(fix.originalCode);
    lines.push('```');
    lines.push('');
    lines.push('**Attempted Fix:**');
    lines.push('```python');
    lines.push(fix.fixedCode);
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }
  
  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*This report was automatically generated from fix attempt data.*');
  
  return lines.join('\n');
}

/**
 * Exports fix diff report as text summary
 */
export function exportFixDiffSummary(reportPath: string, outputPath: string): void {
  const report = loadFixDiffReport(reportPath);
  if (!report) {
    throw new Error(`Fix diff report not found: ${reportPath}`);
  }
  
  const summary = generateFixDiffSummary(report);
  fs.writeFileSync(outputPath, summary, { encoding: 'utf-8' });
}

/**
 * Exports detailed fix diff report as markdown
 */
export function exportDetailedFixReport(reportPath: string, outputPath: string): void {
  const report = loadFixDiffReport(reportPath);
  if (!report) {
    throw new Error(`Fix diff report not found: ${reportPath}`);
  }
  
  const detailed = generateDetailedFixReport(report);
  fs.writeFileSync(outputPath, detailed, { encoding: 'utf-8' });
}

