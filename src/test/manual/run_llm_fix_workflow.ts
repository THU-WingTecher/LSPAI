// Example usage of LLM fix workflow
// This is a manual test script for the LLM-based test fixing workflow

import * as path from 'path';
import { runLLMFixWorkflow } from '../../ut_runner/analysis/llm_fix_workflow';

/**
 * Example: Run LLM fix workflow on examination results
 * 
 * Usage:
 *   node out/test/manual/run_llm_fix_workflow.js [input_json] [output_dir] [python_exe]
 */
async function main() {
  // Similar to execute.test.ts configuration
  const testsDir = '/LSPRAG/experiments/projects/old_black/src/lsprag_tests/gpt-4o-1';
  const pythonInterpreterPath = '/root/miniconda3/envs/black/bin/python';
  const pythonExtraPaths = [
    '/LSPRAG/experiments/projects/black/src/',
    '/LSPRAG/experiments/projects/black',
    '/LSPRAG/experiments/projects'
  ];
  
  // Default paths - adjust as needed
  const inputJsonPath = process.argv[2] || path.join(
    testsDir,
    '-final-report/examination_results.json'
  );
  
  const outputDir = process.argv[3] || path.join(testsDir, '-fix-output');
  const pythonExe = process.argv[4] || pythonInterpreterPath;

  console.log('='.repeat(80));
  console.log('LLM Fix Workflow');
  console.log('='.repeat(80));
  console.log(`Input:  ${inputJsonPath}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Python:  ${pythonExe}`);
  console.log(`PYTHONPATH: ${pythonExtraPaths.join(', ')}`);
  console.log('='.repeat(80));

  try {
    await runLLMFixWorkflow(inputJsonPath, outputDir, {
      language: 'python',
      pythonExe: pythonExe,
      jobs: 16,
      timeoutSec: 30,
      pythonpath: pythonExtraPaths
    });
    console.log('\nWorkflow completed successfully!');
  } catch (error) {
    console.error('\nWorkflow failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
