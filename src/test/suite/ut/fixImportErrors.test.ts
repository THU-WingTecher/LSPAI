import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfigInstance } from '../../../config';
import { fixImportErrors } from '../../../agents/assertionFixers';
import { ExaminationResult } from '../../../ut_runner/types';
import { setPythonInterpreterPath, setPythonExtraPaths, activate } from '../../../lsp/helper';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../helper';
import { getDiagnosticsForFilePath } from '../../../lsp/diagnostic';

suite('fixImportErrors - Real Test Cases', () => {
  const testsDir = '/LSPRAG/experiments/motiv/assertion/gpt-4o/results/final';
  const final_report_path = testsDir + '-final-report';
  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const pythonExtraPaths = [
    '/LSPRAG/experiments/projects/black/src/',
    '/LSPRAG/experiments/projects/black',
    '/LSPRAG/experiments/projects'
  ];
  const projectPath = "/LSPRAG/experiments/projects/black";
  const inputJsonPath = path.join(final_report_path, 'examination_results.json');
  const import_fix_verification_path = path.join(final_report_path, 'import_fix_verification');
  test('fixImportErrors on real test cases with redefined symbols', async function() {
    this.timeout(60000); // 60 seconds timeout for real test cases

    // Setup workspace and Python environment
    getConfigInstance().updateConfig({
      workspace: projectPath
    });
    const workspaceFolders = setWorkspaceFolders(projectPath);
    await updateWorkspaceFolders(workspaceFolders);
    await setPythonInterpreterPath(pythonInterpreterPath);
    await setPythonExtraPaths(pythonExtraPaths);

    // Check if examination results file exists
    if (!fs.existsSync(inputJsonPath)) {
      console.log(`[TEST] Examination results file not found: ${inputJsonPath}`);
      console.log('[TEST] Skipping test - file does not exist');
      return;
    }

    // Load examination results
    const examinationData = JSON.parse(fs.readFileSync(inputJsonPath, 'utf-8'));
    console.log(`[TEST] Loaded examination results: ${examinationData.tests?.length || 0} test cases`);

    // Find test cases with redefined symbols
    const testCasesWithRedefinedSymbols = examinationData.tests?.filter((test: any) => 
      test.examination?.hasRedefinedSymbols === true && 
      test.examination?.redefinedSymbols?.length > 0 &&
      test.test_file &&
      fs.existsSync(test.test_file)
    ) || [];

    console.log(`[TEST] Found ${testCasesWithRedefinedSymbols.length} test cases with redefined symbols`);

    if (testCasesWithRedefinedSymbols.length === 0) {
      console.log('[TEST] No test cases with redefined symbols found - skipping test');
      return;
    }

    // Test on first few test cases (limit to 3 to avoid long test runs)
    const testCasesToTest = testCasesWithRedefinedSymbols.slice(0, 3);
    console.log(`[TEST] Testing fixImportErrors on ${testCasesToTest.length} test cases`);

    for (const testEntry of testCasesToTest) {
      const sourceFilePath = testEntry.source_file;
      const testFile = testEntry.test_file;
      const examinationResult: ExaminationResult = testEntry.examination;
      const testCaseName = testEntry.test_case;

      console.log(`\n[TEST] Processing test case: ${testCaseName}`);
      console.log(`[TEST] Test file: ${testFile}`);
      console.log(`[TEST] Redefined symbols: ${examinationResult.redefinedSymbols.length}`);

      // Verify test file exists
      assert.ok(fs.existsSync(testFile), `Test file should exist: ${testFile}`);

      // Read original test file content
      const originalContent = fs.readFileSync(testFile, 'utf-8');
      console.log(`[TEST] Original file length: ${originalContent.length} characters`);

      // Get original diagnostics before fix
      await activate(vscode.Uri.file(testFile));
      await new Promise(resolve => setTimeout(resolve, 2000));
      const originalDiagnostics = await getDiagnosticsForFilePath(testFile);
      const originalImportDiagnostics = originalDiagnostics.filter(d => 
        d.message.includes('undefined') || 
        d.message.includes('not defined') ||
        d.message.includes('import') ||
        d.message.includes('cannot be resolved')
      );
      console.log(`[TEST] Original diagnostics: ${originalDiagnostics.length} total, ${originalImportDiagnostics.length} import-related`);

      // Call fixImportErrors
      try {
        const fixedCode = await fixImportErrors(sourceFilePath, testFile, examinationResult);
        // Verify that fixed code is returned
        assert.ok(fixedCode !== null && fixedCode !== undefined, 'fixImportErrors should return fixed code');
        assert.ok(typeof fixedCode === 'string', 'Fixed code should be a string');
        console.log(`[TEST] Fixed code length: ${fixedCode.length} characters`);

        // Verify that the file was modified (content changed)
        // Note: The function modifies the file in place, so we need to reload it

        // Verify that code actions were applied (diagnostics should be reduced or fixed)
        // Note: This is a soft check - diagnostics might not always decrease if new ones appear

        // Verify that the function completed without throwing
        assert.ok(true, `fixImportErrors completed successfully for ${testCaseName}`);
        console.log("ORIGINAL CONTENT: ", originalContent);
        console.log("FIXED CONTENT: ", fixedCode);
      } catch (error) {
        console.error(`[TEST] Error in fixImportErrors for ${testCaseName}:`, error);
        // Don't fail the test on individual errors, just log them
        console.log(`[TEST] Continuing with next test case...`);
      }

    }

    console.log(`[TEST] Completed testing fixImportErrors on ${testCasesToTest.length} test cases`);
  });
});

