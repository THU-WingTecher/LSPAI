import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runPipeline } from '../../../ut_runner/runner';
import { getConfigInstance, getProjectPythonExe, getProjectPythonPath, Provider, getProjectWorkspace, ProjectConfigName } from '../../../config';
import { runLLMFixWorkflow, LLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';
import { Analyzer } from '../../../ut_runner/analyzer';

type TestFileClassification = {
  fileName: string;
  testFilePath: string;
  status: 'passed' | 'failed';
  passedCases: string[];
  failedCases: string[];
  focalModule: string | null;
  focalFunction: string | null;
};

/**
 * Classify test results per test file.
 * If any test case belonging to a file is not Passed, that file is marked failed.
 */
function analyzeTestResult(testResultPath: string): TestFileClassification[] {
  const raw = JSON.parse(fs.readFileSync(testResultPath, 'utf-8'));

  // test_result.json is usually { tests: { "<id>": {...} } }. Accept array fallback.
  const entries: any[] = Array.isArray(raw)
    ? raw
    : raw?.tests
      ? Object.values(raw.tests)
      : Object.values(raw || {});

  const grouped = new Map<string, TestFileClassification>();

  for (const entry of entries) {
    // Prefer explicit test_file, otherwise derive from code name prefix.
    const testFilePath: string = entry.test_file || entry.testFile || '';
    const fileName =
      path.basename(testFilePath || '') ||
      (entry.code_name?.split('::')?.[0] ?? 'unknown');
    const codeName: string = entry.code_name || entry.codeName || entry.test_name || 'unknown';
    const status: string = (entry.status || '').toLowerCase();
    const focalModule: string | null = entry.focal_module || entry.focalModule || null;
    const focalFunction: string | null = entry.focal_function || entry.focalFunction || null;

    if (!grouped.has(fileName)) {
      grouped.set(fileName, {
        fileName,
        testFilePath,
        status: 'passed',
        passedCases: [],
        failedCases: [],
        focalModule,
        focalFunction,
      });
    }

    const agg = grouped.get(fileName)!;
    const isPassed = status === 'passed';
    if (isPassed) {
      agg.passedCases.push(codeName);
    } else {
      agg.failedCases.push(codeName);
      agg.status = 'failed';
    }
  }

  return Array.from(grouped.values());
}

interface AELLMAnalysisTestConfig {
  projectName: string;
  testsDir: string;
  testFileMapPath: string;
}

suite('EXECUTE - Python', () => {
  /////////////////////////////////////
  const configs: AELLMAnalysisTestConfig[] = [
    { projectName: "tornado",
    testsDir: '/LSPRAG/opencode-tests/gpt-5/2025-12-03T14-58-39/gpt-5/codes',
    testFileMapPath: '/LSPRAG/opencode-tests/gpt-5/2025-12-03T14-58-39/test_file_map.json'
    },
    { projectName: "tornado",
    testsDir: '/LSPRAG/experiments/projects/tornado/lsprag-workspace/20251203_145746/tornado/lsprag_withcontext_/gpt-5/results/final',
    testFileMapPath: '/LSPRAG/experiments/projects/tornado/lsprag-workspace/20251203_145746/tornado/lsprag_withcontext_/gpt-5/results/test_file_map.json'
    },
    { projectName: "black",
    testsDir: '/LSPRAG/experiments/motiv/assertion/opencode/gpt-5/codes',
    testFileMapPath: '/LSPRAG/experiments/motiv/assertion/opencode/test_file_map.json'
    },
    { projectName: "black",
    testsDir: '/LSPRAG/experiments/projects/black/lsprag-workspace/20251203_114956/black/lsprag_withcontext_/gpt-5/results/final',
    testFileMapPath: '/LSPRAG/experiments/projects/black/lsprag-workspace/20251203_114956/black/lsprag_withcontext_/gpt-5/results/test_file_map.json'
    },
  ];

  // const projectPath = getProjectWorkspace(projectName);
  // const pythonInterpreterPath = getProjectPythonExe(projectName);
  // const pythonExtraPaths = getProjectPythonPath(projectName);

  test('execute all python files and produce reports', async () => {
    for (const config of configs) {
      const projectName = config.projectName as ProjectConfigName
      const projectPath = getProjectWorkspace(projectName);
      const pythonInterpreterPath = getProjectPythonExe(projectName);
      const pythonExtraPaths = getProjectPythonPath(projectName);
      const testsDir = config.testsDir;
      const testFileMapPath = config.testFileMapPath;
      const final_report_path = testsDir+'-final-report';
      const outputDir = path.join(final_report_path, 'fix-output');
      const inputJsonPath = path.join(
        final_report_path,
        'examination_results.json'
      );
      const test_result_path = '/LSPRAG/experiments/projects/black/test_result.json';
      // const test_result_path = path.join(final_report_path, 'test_result.json');
      const currentConfig = {
        workspace: projectPath,
        model: 'gpt-5',
        provider: 'openai' as Provider,
      };
      getConfigInstance().updateConfig({
        ...currentConfig
      });
      
      // Analyze test results and classify by file
      const test_file_classifications = analyzeTestResult(test_result_path);
      
      // Initialize analyzer to find source files for failed tests
      const analyzer = new Analyzer('python');
      
      // Load test file map for source file resolution
      if (fs.existsSync(testFileMapPath)) {
        // Use reflection to access private method (for testing purposes)
        (analyzer as any).loadTestFileMap(testFileMapPath);
        (analyzer as any).loadSourceFiles(projectPath);
      }
      
      // Process each test file classification
      for (const test_file_classification of test_file_classifications) {
        if (test_file_classification.status === 'failed') {
          console.log(`\n[MUT-ANALYSIS] Test file: ${test_file_classification.fileName}`);
          console.log(`[MUT-ANALYSIS]   Status: FAILED`);
          console.log(`[MUT-ANALYSIS]   Failed cases: ${test_file_classification.failedCases.length}`);
          console.log(`[MUT-ANALYSIS]   Passed cases: ${test_file_classification.passedCases.length}`);
          
          // Find the source file containing the MUT
          if (test_file_classification.testFilePath && test_file_classification.focalFunction) {
            const sourceFile = analyzer.findSourceFileForTest(
              test_file_classification.testFilePath,
              test_file_classification.focalFunction
            );
            
            if (sourceFile) {
              console.log(`[MUT-ANALYSIS]   Focal module: ${test_file_classification.focalModule}`);
              console.log(`[MUT-ANALYSIS]   Focal function (MUT): ${test_file_classification.focalFunction}`);
              console.log(`[MUT-ANALYSIS]   Source file: ${sourceFile}`);
            } else {
              console.log(`[MUT-ANALYSIS]   WARNING: Could not find source file for MUT: ${test_file_classification.focalFunction}`);
            }
          } else {
            console.log(`[MUT-ANALYSIS]   WARNING: Missing test file path or focal function`);
          }
        }
      }
    }
  });
});
