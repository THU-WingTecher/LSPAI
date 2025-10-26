import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from '../../../ut_runner/runner';
import { getConfigInstance } from '../../../config';

suite('EXECUTE - Python (black)', () => {
  const testsDir = '/LSPRAG/results/openCode-/gpt-5-nano/codes';

  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const outputDir = testsDir+'-final-report';
  const testFileMapPath = '/LSPRAG/experiments/config/black_test_file_map.json';
  const projectPath = "/LSPRAG/experiments/projects/black";
  const currentConfig = {
      workspace: projectPath,
  };
  const pythonExtraPaths = [
    '/LSPRAG/experiments/projects/black/src/',
    '/LSPRAG/experiments/projects/black',
    '/LSPRAG/experiments/projects'
  ]
  getConfigInstance().updateConfig({
    ...currentConfig
  });

  test('execute all python files and produce reports', async () => {
    await runPipeline(testsDir, outputDir, testFileMapPath, {
      language: 'python',
      pythonExe: pythonInterpreterPath,
      include: ['*.py'],          // run all .py files in the tree
      timeoutSec: 30,              // no per-file timeout
      jobs: 16,                    // keep CI stable; increase if needed
      pythonpath: pythonExtraPaths,             // add entries if imports require it
    });
  });
});