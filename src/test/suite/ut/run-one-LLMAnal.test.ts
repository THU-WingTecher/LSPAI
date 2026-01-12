import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from '../../../ut_runner/runner';
import { getConfigInstance, getProjectSrcPath } from '../../../config';
import { Analyzer } from '../../../ut_runner/analyzer';
import { examineTestCasesBatch, filterTestCasesForExamination } from '../../../ut_runner/analysis/examiner';
import { runLLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';
import { TestCaseResult } from '../../../ut_runner/types';

/**
 * End-to-end test for examination and fix workflow
 * 
 * This test:
 * 1. Runs pipeline on a test file to get test results
 * 2. Runs examination on test cases with assertion errors
 * 3. Creates examination_results.json
 * 4. Runs fix workflow on the examination results
 * 
 * Input: test file path
 */
suite('EXAMINATION_FIX_WORKFLOW - End-to-end test', () => {
  // Configuration - adjust these paths as needed
  const testFilePath = process.env.TEST_FILE_PATH || '/LSPRAG/experiments/data/motiv/codes/pytree_optimize_8858_test.py';
  const projectPath = '/LSPRAG/experiments/projects/black';
  const testFileMapPath = '/LSPRAG/experiments/config/black_test_file_map.json';
  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const pythonExtraPaths = [
    '/LSPRAG/experiments/projects/black/src/',
    '/LSPRAG/experiments/projects/black',
    '/LSPRAG/experiments/projects'
  ];

  // Setup workspace config
  getConfigInstance().updateConfig({
    workspace: projectPath,
  });

  test('run examination and fix workflow for single test file', async () => {
    // Validate test file exists
    if (!fs.existsSync(testFilePath)) {
      throw new Error(`Test file not found: ${testFilePath}`);
    }

    const testDir = path.dirname(testFilePath);
    const testFileName = path.basename(testFilePath);
    const outputDir = path.join(testDir, 'workflow-output');
    
    // Clean up previous output
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    console.log('='.repeat(80));
    console.log('EXAMINATION AND FIX WORKFLOW TEST');
    console.log('='.repeat(80));
    console.log(`Test file: ${testFilePath}`);
    console.log(`Output directory: ${outputDir}`);
    console.log('='.repeat(80));

    // Step 1: Run pipeline to get test results
    console.log('\n[STEP 1] Running pipeline to collect test results...');
    await runPipeline(testDir, outputDir, testFileMapPath, {
      language: 'python',
      pythonExe: pythonInterpreterPath,
      include: [testFileName],
      timeoutSec: 30,
      jobs: 1,
      pythonpath: pythonExtraPaths,
    });

    // Step 2: Load analysis results
    console.log('\n[STEP 2] Loading analysis results...');
    const analyzer = new Analyzer('python');
    const testResultsJson = path.join(outputDir, 'test_results.json');
    
    if (!fs.existsSync(testResultsJson)) {
      throw new Error(`Test results file not found: ${testResultsJson}`);
    }

    const testResultsData = JSON.parse(fs.readFileSync(testResultsJson, 'utf-8'));
    
    // test_results.json has structure: { tests: { "<key>": { code_name, status, ... } }, meta: {...} }
    // Convert snake_case JSON format to camelCase TestCaseResult format
    const testCases: TestCaseResult[] = Object.values(testResultsData.tests || {}).map((entry: any) => ({
      codeName: entry.code_name || entry.codeName || '',
      status: entry.status || '',
      errorType: entry.error_type || entry.errorType || null,
      detail: entry.detail || '',
      testFile: entry.test_file || entry.testFile || '',
      logPath: entry.log_path || entry.logPath || '',
      symbolName: entry.symbol_name || entry.symbolName || null,
      focalModule: entry.focal_module || entry.focalModule || null,
      focalFunction: entry.focal_function || entry.focalFunction || null,
      focalRandom: entry.focal_random || entry.focalRandom || null,
      implementationOrigin: entry.implementation_origin || entry.implementationOrigin || null,
      importLine: entry.import_line || entry.importLine || null,
      modulePath: entry.module_path || entry.modulePath || null,
      sourceFile: entry.source_file || entry.sourceFile || null,
      testSource: entry.test_source || entry.testSource || null,
      functionSource: entry.function_source || entry.functionSource || null,
      examination: entry.examination || null,
    }));
    
    console.log(`Found ${testCases.length} test cases`);
    
    // Filter test cases with assertion errors
    console.log('testCases: ', testCases);
    const testCasesForExamination = filterTestCasesForExamination(testCases);
    console.log(`Test cases with assertion errors: ${testCasesForExamination.length}`);

    if (testCasesForExamination.length === 0) {
      console.log('No test cases with assertion errors to examine. Skipping examination and fix.');
      return;
    }

    // Step 3: Run examination
    console.log('\n[STEP 3] Running examination on test cases...');
    const sourceFileResolver = (tc: TestCaseResult): string | null => {
      // Try to find source file from test file map
      const testFileMap = JSON.parse(fs.readFileSync(testFileMapPath, 'utf-8'));
      const testBasename = path.basename(tc.testFile);
      const mapping = testFileMap[testBasename];
      
      if (mapping && mapping.file_name) {
        const srcPath = getProjectSrcPath('black');
        return path.join(srcPath, mapping.file_name);
      }
      return tc.sourceFile || null;
    };

    const symbolNameResolver = (tc: TestCaseResult): string | null => {
      const testFileMap = JSON.parse(fs.readFileSync(testFileMapPath, 'utf-8'));
      const testBasename = path.basename(tc.testFile);
      const mapping = testFileMap[testBasename];
      return mapping?.symbol_name || tc.symbolName || null;
    };

    const examinationResults = await examineTestCasesBatch(
      testCasesForExamination,
      sourceFileResolver,
      symbolNameResolver,
      1 // concurrency
    );

    console.log(`Examination complete: ${examinationResults.length} results`);
    console.log(`  With redefined symbols: ${examinationResults.filter(r => r.hasRedefinedSymbols).length}`);

    // Step 4: Create examination_results.json
    console.log('\n[STEP 4] Creating examination_results.json...');
    const examinationDir = path.join(outputDir, 'examination');
    fs.mkdirSync(examinationDir, { recursive: true });

    // Map examination results back to test cases
    const examinationMap = new Map(examinationResults.map(r => [r.testCaseName, r]));
    
    const examinationData = {
      summary: {
        total_examined: examinationResults.length,
        with_redefined_symbols: examinationResults.filter(r => r.hasRedefinedSymbols).length,
        examination_errors: examinationResults.filter(r => r.examinationError).length,
      },
      tests: testCasesForExamination.map(tc => {
        const examination = examinationMap.get(tc.codeName);
        return {
          test_case: tc.codeName,
          test_file: tc.testFile,
          symbol_name: symbolNameResolver(tc),
          source_file: sourceFileResolver(tc),
          focal_function: tc.focalFunction || null,
          detailError: tc.detail || null,
          status: tc.status,
          examination: examination || null,
        };
      }),
    };

    const examinationJsonPath = path.join(examinationDir, 'examination_results.json');
    fs.writeFileSync(examinationJsonPath, JSON.stringify(examinationData, null, 2), 'utf-8');
    console.log(`Created: ${examinationJsonPath}`);

    // Step 5: Run fix workflow
    console.log('\n[STEP 5] Running fix workflow...');
    const fixOutputDir = path.join(outputDir, 'fix-output');
    fs.mkdirSync(fixOutputDir, { recursive: true });

    await runLLMFixWorkflow(examinationJsonPath, fixOutputDir, {
      language: 'python',
      pythonExe: pythonInterpreterPath,
      jobs: 1,
      timeoutSec: 30,
      pythonpath: pythonExtraPaths,
    });

    console.log('\n[STEP 6] Verifying outputs...');
    
    // Verify fix summary documents were created
    const fixSummaryFiles = fs.readdirSync(fixOutputDir)
      .filter(f => f.endsWith('_test_fix_summary.md'));
    
    console.log(`Fix summary documents created: ${fixSummaryFiles.length}`);
    assert.ok(fixSummaryFiles.length > 0, 'At least one fix summary document should be created');

    // Verify fix history was created
    const fixHistoryPath = path.join(fixOutputDir, 'fix_history.json');
    if (fs.existsSync(fixHistoryPath)) {
      const fixHistory = JSON.parse(fs.readFileSync(fixHistoryPath, 'utf-8'));
      console.log(`Fix history entries: ${Object.keys(fixHistory).length}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('WORKFLOW COMPLETE');
    console.log('='.repeat(80));
    console.log(`Output directory: ${outputDir}`);
    console.log(`Fix output directory: ${fixOutputDir}`);
    console.log(`Examination results: ${examinationJsonPath}`);
    console.log('='.repeat(80));
  });
});

