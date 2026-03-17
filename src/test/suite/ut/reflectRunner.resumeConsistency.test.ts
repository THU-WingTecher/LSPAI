import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ExperimentContinuityManager } from '../../../experiment';
import { resolveTestFileNameFromTestFileMap } from '../../../strategy/generators/lsprag_reflect';

suite('Reflect Resume Consistency - Unit', () => {
  const tempDirs: string[] = [];

  teardown(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures in test teardown
      }
    }
  });

  test('reconcileCompletedTasksWithArtifacts resets completed task when mapped final file is missing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-reconcile-'));
    tempDirs.push(root);
    const resultsDir = path.join(root, 'results');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(path.join(resultsDir, 'final'), { recursive: true });

    const manager = new ExperimentContinuityManager(resultsDir, root);
    const taskList = [
      {
        symbolName: 'foo',
        relativeDocumentPath: 'pkg/a.py',
        sourceCode: 'def foo(): pass',
        importString: '',
        lineNum: 1,
        location: 10,
      },
      {
        symbolName: 'bar',
        relativeDocumentPath: 'pkg/a.py',
        sourceCode: 'def bar(): pass',
        importString: '',
        lineNum: 1,
        location: 20,
      },
    ];

    await manager.initializeFromTaskList(taskList);
    await manager.markTaskComplete('foo', 'pkg/a.py', 1, 10);
    await manager.markTaskComplete('bar', 'pkg/a.py', 1, 20);

    const mapPath = path.join(resultsDir, 'test_file_map.json');
    fs.writeFileSync(
      mapPath,
      JSON.stringify(
        {
          'a_foo_1111_test.py': {
            project_name: 'test',
            file_name: 'pkg/a.py',
            symbol_name: 'foo',
            line_num: 11,
            task_key: 'pkg/a.py::foo::11',
          },
          'a_bar_2222_test.py': {
            project_name: 'test',
            file_name: 'pkg/a.py',
            symbol_name: 'bar',
            line_num: 21,
            task_key: 'pkg/a.py::bar::21',
          },
        },
        null,
        2
      )
    );

    fs.writeFileSync(path.join(resultsDir, 'final', 'a_foo_1111_test.py'), 'def test_foo():\n    assert True\n');

    await manager.reconcileCompletedTasksWithArtifacts(mapPath, path.join(resultsDir, 'final'));
    const progress = await manager.getProgress();

    const fooTask = progress.tasks.find((t) => t.symbolName === 'foo')!;
    const barTask = progress.tasks.find((t) => t.symbolName === 'bar')!;
    assert.strictEqual(fooTask.completed, true, 'foo should remain completed because mapped file exists');
    assert.strictEqual(barTask.completed, false, 'bar should be reset because mapped file is missing');
    assert.ok(
      (barTask.error || '').includes('[reconcile]'),
      `bar task should include reconcile error marker, got: ${barTask.error}`
    );
  });

  test('resolveTestFileNameFromTestFileMap fails closed on task_key mismatch for duplicate symbols', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-map-'));
    tempDirs.push(root);
    const mapPath = path.join(root, 'test_file_map.json');

    fs.writeFileSync(
      mapPath,
      JSON.stringify(
        {
          'testing_tearDown_1111_test.py': {
            project_name: 'tornado',
            file_name: 'tornado/testing.py',
            symbol_name: 'tearDown',
            line_num: 164,
            task_key: 'tornado/testing.py::tearDown::164',
          },
          'testing_tearDown_2222_test.py': {
            project_name: 'tornado',
            file_name: 'tornado/testing.py',
            symbol_name: 'tearDown',
            line_num: 471,
            task_key: 'tornado/testing.py::tearDown::471',
          },
        },
        null,
        2
      )
    );

    const mismatch = resolveTestFileNameFromTestFileMap({
      dirForReuse: root,
      symbolName: 'tearDown',
      sourceFile: '/workspace/tornado/testing.py',
      testFileMapPath: mapPath,
      taskKey: 'tornado/testing.py::tearDown::999',
    });
    assert.strictEqual(mismatch, null, 'task_key mismatch should not silently map to another duplicate symbol');

    const exact = resolveTestFileNameFromTestFileMap({
      dirForReuse: root,
      symbolName: 'tearDown',
      sourceFile: '/workspace/tornado/testing.py',
      testFileMapPath: mapPath,
      taskKey: 'tornado/testing.py::tearDown::471',
    });
    assert.strictEqual(exact, 'testing_tearDown_2222_test.py');
  });
});
