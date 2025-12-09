import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runPipeline } from '../../../ut_runner/runner';
import { getConfigInstance, getProjectPythonExe, getProjectPythonPath, Provider, getProjectWorkspace, ProjectConfigName } from '../../../config';
import { runLLMFixWorkflow, LLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';


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
      const currentConfig = {
        workspace: projectPath,
        model: 'gpt-5',
        provider: 'openai' as Provider,
      };
      getConfigInstance().updateConfig({
        ...currentConfig
      });
      if (!fs.existsSync(inputJsonPath)) {
        await runPipeline(testsDir, final_report_path, testFileMapPath, {
          language: 'python',
          pythonExe: pythonInterpreterPath,
          jobs: 20,
          timeoutSec: 30,
          pythonpath: pythonExtraPaths
        });
      }
      await runLLMFixWorkflow(inputJsonPath, outputDir, {
        language: 'python',
        pythonExe: pythonInterpreterPath,
        jobs: 30,
        timeoutSec: 30,
        pythonpath: pythonExtraPaths
      });
    }
  });
});

// suite('LLM Fix Workflow - addTestFunction Tests', () => {
//   let tempDir: string;
  
//   setup(() => {
//     tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-fix-workflow-test-'));
//   });

//   teardown(() => {
//     if (fs.existsSync(tempDir)) {
//       fs.rmSync(tempDir, { recursive: true, force: true });
//     }
//   });

//   test('addTestFunction adds method inside class correctly', async () => {
//     // Create a class-based test file
//     const testFile = path.join(tempDir, 'test_class.py');
//     const originalContent = `import unittest

// class TestExample(unittest.TestCase):
//     def test_existing(self):
//         """Existing test method"""
//         self.assertEqual(1 + 1, 2)

// if __name__ == "__main__":
//     unittest.main()
// `;
//     fs.writeFileSync(testFile, originalContent);

//     const workflow = new LLMFixWorkflow('', tempDir, {
//       language: 'python',
//       pythonExe: 'python3'
//     });

//     // New test method to add (no indentation - function will add it)
//     const newTestCode = `def test_new_method(self):
//     """New test method"""
//     self.assertEqual(2 + 2, 4)`;
    
//     // Expected result: method should be indented 4 spaces inside class

//     await workflow.addTestFunction(testFile, newTestCode);

//     const updatedContent = fs.readFileSync(testFile, 'utf-8');
//     console.log(updatedContent);
//     // Verify original method remains
//     assert.ok(updatedContent.includes('def test_existing(self)'), 'Original method should remain');
    
//     // Verify new method was added inside the class with proper indentation
//     const lines = updatedContent.split('\n');
//     let inClass = false;
//     let foundTestNew = false;
    
//     for (const line of lines) {
//       if (line.includes('class TestExample')) {
//         inClass = true;
//         continue;
//       }
      
//       if (inClass && line.includes('def test_new_method')) {
//         foundTestNew = true;
//         // Check that it's properly indented (4 spaces for class method, not 8)
//         // Methods inside a class should have 4 spaces (class indent + method indent relative to class)
//         const indentMatch = line.match(/^(\s*)def test_new_method/);
//         console.log('Found test_new_method with indent:', JSON.stringify(indentMatch?.[1]), 'length:', indentMatch?.[1]?.length);
//         assert.ok(line.match(/^    def test_new_method/), 'Method should be indented with 4 spaces, got: ' + indentMatch?.[1]);
//         break;
//       }
      
//       if (line.trim().startsWith('if __name__')) {
//         break;
//       }
//     }
    
//     assert.ok(foundTestNew, 'New method should be added inside the class');
    
//     // Verify __main__ block is preserved
//     assert.ok(updatedContent.includes('if __name__'), '__main__ block should be preserved');
//   });

//   test('addTestFunction creates backup file', async () => {
//     const testFile = path.join(tempDir, 'test_backup.py');
//     const content = `def test_something():
//     assert True
// `;
//     fs.writeFileSync(testFile, content);

//     const workflow = new LLMFixWorkflow('', tempDir, {
//       language: 'python',
//       pythonExe: 'python3'
//     });

//     const newTestCode = `def test_new():
//     assert False
// `;

//     await workflow.addTestFunction(testFile, newTestCode);

//     const backupPath = testFile + '.backup';
//     assert.ok(fs.existsSync(backupPath), 'Backup file should exist');
    
//     const backupContent = fs.readFileSync(backupPath, 'utf-8');
//     assert.strictEqual(backupContent, content, 'Backup should have original content');
//   });

//   test('addTestFunction appends to empty file', async () => {
//     const testFile = path.join(tempDir, 'test_empty.py');
//     const content = '';
//     fs.writeFileSync(testFile, content);

//     const workflow = new LLMFixWorkflow('', tempDir, {
//       language: 'python',
//       pythonExe: 'python3'
//     });

//     const newTestCode = `def test_empty():
//     assert True
// `;

//     await workflow.addTestFunction(testFile, newTestCode);

//     const updatedContent = fs.readFileSync(testFile, 'utf-8');
//     assert.ok(updatedContent.includes('def test_empty'), 'Test should be added to empty file');
//   });

//   test('addTestFunction handles multi-line code', async () => {
//     const testFile = path.join(tempDir, 'test_multiline.py');
//     const content = `def test_existing():
//     assert True
// `;
//     fs.writeFileSync(testFile, content);

//     const workflow = new LLMFixWorkflow('', tempDir, {
//       language: 'python',
//       pythonExe: 'python3'
//     });

//     const newTestCode = `def test_new():
//     result = 1 + 1
//     assert result == 2
//     assert type(result) == int
// `;

//     await workflow.addTestFunction(testFile, newTestCode);

//     const updatedContent = fs.readFileSync(testFile, 'utf-8');
//     assert.ok(updatedContent.includes('def test_existing'), 'Original function should remain');
//     assert.ok(updatedContent.includes('def test_new'), 'New function should be added');
//     assert.ok(updatedContent.includes('assert result == 2'), 'Should contain first assertion');
//     assert.ok(updatedContent.includes('assert type(result) == int'), 'Should contain second assertion');
//   });

//   test('addTestFunction preserves file structure', async () => {
//     const testFile = path.join(tempDir, 'test_structure.py');
//     const content = `import sys
// import os

// def test_before():
//     pass
// `;
//     fs.writeFileSync(testFile, content);

//     const workflow = new LLMFixWorkflow('', tempDir, {
//       language: 'python',
//       pythonExe: 'python3'
//     });

//     const newTestCode = `def test_new():
//     assert 1 == 1
// `;

//     await workflow.addTestFunction(testFile, newTestCode);

//     const updatedContent = fs.readFileSync(testFile, 'utf-8');
//     // Verify imports remain
//     assert.ok(updatedContent.includes('import sys'), 'Should preserve imports');
//     assert.ok(updatedContent.includes('import os'), 'Should preserve imports');
//     // Verify existing function remains
//     assert.ok(updatedContent.includes('def test_before'), 'Should preserve test_before');
//     // Verify new function was added
//     assert.ok(updatedContent.includes('def test_new'), 'New function should be added');
//   });
// });
