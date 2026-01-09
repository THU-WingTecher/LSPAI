import * as fs from 'fs';
import * as path from 'path';
import { CategoryStructure, CategorizationResult, loadCategoryStructure } from './categorizer';

export interface CategoryDiff {
  timestamp: string;
  testCaseName: string;
  action: 'added_to_existing' | 'created_big_category';
  bigCategory: string;
  rootCauseSummary: string;
  reasoning: string;
  previousCategoryCount?: {
    bigCategories: number;
    testCases: number;
  };
  newCategoryCount?: {
    bigCategories: number;
    testCases: number;
  };
}

export interface CategoryDiffLog {
  logVersion: string;
  createdAt: string;
  lastUpdated: string;
  totalCategorizations: number;
  categoryStatistics: {
    totalBigCategories: number;
    totalTestCases: number;
    categoryDistribution: Record<string, number>; // big category -> count of test cases
  };
  diffs: CategoryDiff[];
}

/**
 * Calculates category statistics from category structure
 */
function calculateCategoryStats(categories: CategoryStructure): {
  totalBigCategories: number;
  totalTestCases: number;
  categoryDistribution: Record<string, number>;
} {
  const totalBigCategories = Object.keys(categories).length;
  let totalTestCases = 0;
  const categoryDistribution: Record<string, number> = {};

  for (const [bigCategory, testCases] of Object.entries(categories)) {
    const count = (testCases as string[]).length;
    totalTestCases += count;
    categoryDistribution[bigCategory] = count;
  }

  return {
    totalBigCategories,
    totalTestCases,
    categoryDistribution
  };
}

/**
 * Determines the action type from categorization result
 */
function determineAction(result: CategorizationResult): CategoryDiff['action'] {
  switch (result.categorizationDecision) {
    case '1':
      return 'added_to_existing';
    default:
      return 'created_big_category';
  }
}

/**
 * Creates a diff entry for a categorization result
 */
export function createCategoryDiff(
  result: CategorizationResult,
  previousCategories: CategoryStructure,
  newCategories: CategoryStructure
): CategoryDiff {
  const previousStats = calculateCategoryStats(previousCategories);
  const newStats = calculateCategoryStats(newCategories);

  return {
    timestamp: result.timestamp,
    testCaseName: result.testCaseName,
    action: determineAction(result),
    bigCategory: result.bigCategory,
    rootCauseSummary: result.rootCauseSummary,
    reasoning: result.reasoning,
    previousCategoryCount: {
      bigCategories: previousStats.totalBigCategories,
      testCases: previousStats.totalTestCases
    },
    newCategoryCount: {
      bigCategories: newStats.totalBigCategories,
      testCases: newStats.totalTestCases
    }
  };
}

/**
 * Loads existing diff log from file
 */
export function loadDiffLog(filePath: string): CategoryDiffLog | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Creates a new diff log
 */
export function createDiffLog(): CategoryDiffLog {
  return {
    logVersion: '1.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalCategorizations: 0,
    categoryStatistics: {
      totalBigCategories: 0,
      totalTestCases: 0,
      categoryDistribution: {}
    },
    diffs: []
  };
}

/**
 * Appends a diff to the log
 */
export function appendDiffToLog(
  log: CategoryDiffLog,
  diff: CategoryDiff,
  newCategories: CategoryStructure
): CategoryDiffLog {
  const updated = {
    ...log,
    lastUpdated: new Date().toISOString(),
    totalCategorizations: log.totalCategorizations + 1,
    categoryStatistics: calculateCategoryStats(newCategories),
    diffs: [...log.diffs, diff]
  };

  return updated;
}

/**
 * Saves diff log to file
 */
export function saveDiffLog(filePath: string, log: CategoryDiffLog): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(log, null, 2), { encoding: 'utf-8' });
}

/**
 * Logs a categorization diff
 */
export function logCategorizationDiff(
  result: CategorizationResult,
  previousCategories: CategoryStructure,
  newCategories: CategoryStructure,
  diffLogPath: string
): void {
  let log = loadDiffLog(diffLogPath);
  
  if (!log) {
    log = createDiffLog();
  }

  const diff = createCategoryDiff(result, previousCategories, newCategories);
  const updatedLog = appendDiffToLog(log, diff, newCategories);
  
  saveDiffLog(diffLogPath, updatedLog);
}

/**
 * Generates a summary report from diff log
 */
export function generateDiffSummary(log: CategoryDiffLog): string {
  const lines: string[] = [];
  
  lines.push('=== Categorization Diff Summary ===');
  lines.push(`Total Categorizations: ${log.totalCategorizations}`);
  lines.push(`Created: ${log.createdAt}`);
  lines.push(`Last Updated: ${log.lastUpdated}`);
  lines.push('');
  
  lines.push('=== Category Statistics ===');
  lines.push(`Total Big Categories: ${log.categoryStatistics.totalBigCategories}`);
  lines.push(`Total Test Cases Tracked: ${log.categoryStatistics.totalTestCases}`);
  lines.push('');
  
  lines.push('=== Category Distribution ===');
  for (const [bigCategory, count] of Object.entries(log.categoryStatistics.categoryDistribution)) {
    lines.push(`  ${bigCategory}: ${count} test case${count === 1 ? '' : 's'}`);
  }
  lines.push('');
  
  lines.push('=== Action Summary ===');
  const actionCounts: Record<string, number> = {};
  for (const diff of log.diffs) {
    actionCounts[diff.action] = (actionCounts[diff.action] || 0) + 1;
  }
  for (const [action, count] of Object.entries(actionCounts)) {
    lines.push(`  ${action}: ${count}`);
  }
  lines.push('');
  
  lines.push('=== Recent Categorizations (Last 10) ===');
  const recentDiffs = log.diffs.slice(-10).reverse();
  for (const diff of recentDiffs) {
    lines.push(`[${diff.timestamp}] ${diff.testCaseName}`);
    lines.push(`  Action: ${diff.action}`);
    lines.push(`  Category: ${diff.bigCategory}`);
    lines.push(`  Summary: ${diff.rootCauseSummary}`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Exports diff log as human-readable text file
 */
export function exportDiffLogAsText(diffLogPath: string, outputPath: string): void {
  const log = loadDiffLog(diffLogPath);
  if (!log) {
    throw new Error(`Diff log not found: ${diffLogPath}`);
  }
  
  const summary = generateDiffSummary(log);
  fs.writeFileSync(outputPath, summary, { encoding: 'utf-8' });
}

/**
 * Generates a comprehensive final categorization summary report
 */
export function generateFinalCategorizationSummary(
  diffLogPath: string,
  categoryStructurePath: string,
  fixHistoryPath?: string
): string {
  const log = loadDiffLog(diffLogPath);
  const categories = loadCategoryStructure(categoryStructurePath);
  
  if (!log || log.totalCategorizations === 0) {
    return '=== Categorization Summary ===\n\nNo categorizations found.\n';
  }

  const lines: string[] = [];
  
  // Header
  lines.push('# Categorization Summary Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Total Categorizations:** ${log.totalCategorizations}`);
  lines.push('');
  
  // Overall Statistics
  lines.push('## Overall Statistics');
  lines.push('');
  lines.push(`- **Total Big Categories:** ${log.categoryStatistics.totalBigCategories}`);
  lines.push(`- **Total Test Cases Tracked:** ${log.categoryStatistics.totalTestCases}`);
  lines.push(`- **Total Categorizations:** ${log.totalCategorizations}`);
  lines.push('');
  
  // Category Distribution
  lines.push('## Category Distribution');
  lines.push('');
  lines.push('### By Big Category');
  lines.push('');
  
  const sortedCategories = Object.entries(categories)
    .sort(([, a], [, b]) => (b as string[]).length - (a as string[]).length);
  
  for (const [bigCategory, testCases] of sortedCategories) {
    const count = (testCases as string[]).length;
    const percentage = log.totalCategorizations === 0
      ? '0.0'
      : ((count / log.totalCategorizations) * 100).toFixed(1);
    lines.push(`### ${bigCategory}`);
    lines.push(`- **Test Cases:** ${count} (${percentage}%)`);
    if (count > 0) {
      lines.push('  - ' + (testCases as string[]).sort().join(', '));
    }
    lines.push('');
  }
  
  // Action Summary
  lines.push('## Categorization Actions');
  lines.push('');
  const actionCounts: Record<string, number> = {};
  for (const diff of log.diffs) {
    actionCounts[diff.action] = (actionCounts[diff.action] || 0) + 1;
  }
  
  const actionLabels: Record<string, string> = {
    'added_to_existing': 'Used Existing Category',
    'created_big_category': 'Created New Big Category'
  };
  
  for (const [action, count] of Object.entries(actionCounts).sort(([, a], [, b]) => b - a)) {
    const label = actionLabels[action] || action;
    const percentage = ((count / log.totalCategorizations) * 100).toFixed(1);
    lines.push(`- **${label}:** ${count} (${percentage}%)`);
  }
  lines.push('');
  
  // Test Cases by Category
  lines.push('## Test Cases by Category');
  lines.push('');
  
  for (const [bigCategory, testCases] of Object.entries(categories)) {
    lines.push(`### ${bigCategory}`);
    lines.push('');
    const cases = (testCases as string[]).sort();
    for (const testCase of cases) {
      lines.push(`- \`${testCase}\``);
    }
    if (cases.length === 0) {
      lines.push('- (none)');
    }
    lines.push('');
  }
  
  // Root Cause Analysis
  lines.push('## Root Cause Analysis');
  lines.push('');
  lines.push('### Most Common Root Causes');
  lines.push('');
  
  const rootCauseCounts: Record<string, number> = {};
  for (const diff of log.diffs) {
    const summary = diff.rootCauseSummary.toLowerCase();
    // Simple keyword extraction for grouping similar root causes
    const key = summary.substring(0, Math.min(50, summary.length));
    rootCauseCounts[key] = (rootCauseCounts[key] || 0) + 1;
  }
  
  const topRootCauses = Object.entries(rootCauseCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  
  for (const [rootCause, count] of topRootCauses) {
    lines.push(`- **${count}** test case${count > 1 ? 's' : ''}: ${rootCause}...`);
  }
  lines.push('');
  
  // Timeline
  lines.push('## Categorization Timeline');
  lines.push('');
  lines.push(`- **First Categorization:** ${log.createdAt}`);
  lines.push(`- **Last Categorization:** ${log.lastUpdated}`);
  lines.push(`- **Duration:** ${Math.round((new Date(log.lastUpdated).getTime() - new Date(log.createdAt).getTime()) / 1000 / 60)} minutes`);
  lines.push('');
  
  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*This report was automatically generated from categorization data.*');
  
  return lines.join('\n');
}

/**
 * Exports final categorization summary as markdown file
 */
export function exportFinalCategorizationSummary(
  diffLogPath: string,
  categoryStructurePath: string,
  outputPath: string,
  fixHistoryPath?: string
): void {
  const summary = generateFinalCategorizationSummary(
    diffLogPath,
    categoryStructurePath,
    fixHistoryPath
  );
  fs.writeFileSync(outputPath, summary, { encoding: 'utf-8' });
}

