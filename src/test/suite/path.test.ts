import * as assert from 'assert';
import { PythonCFGBuilder } from '../../cfg/python';
import { PathCollector } from '../../cfg/path';
import { JavaCFGBuilder } from '../../cfg/java';
import { CFGNodeType } from '../../cfg/types';
// Known issues : we cannot detect the break / continue condition in the loop
// Basic path tests
test('Python CFG Path - Simple If-Else', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
if x > 0:
    y = 1
else:
    y = 2
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('python');
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 2, "Should have exactly 2 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'y = 1',
            path: 'where (\n\tx > 0\n)'
        },
        {
            code: 'y = 2',
            path: 'where (\n\t!(x > 0)\n)'
        }
    ]);
});

test('Python CFG Path - If-Else with Merge Point', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
if x > 0:
    y = 1
else:
    y = 2
z = 3  # This is after the merge point
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('python');
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 2, "Should have exactly 2 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'y = 1\nz = 3',
            path: 'where (\n\tx > 0\n)'
        },
        {
            code: 'y = 2\nz = 3',
            path: 'where (\n\t!(x > 0)\n)'
        }
    ]);
});

test('Python CFG Path - Nested If-Else with Multiple Branches', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
if x > 10:
    if y > 5:
        result = x + y
    else:
        if z > 0:
            result = x - z
        else:
            result = x
else:
    if y < 0:
        result = -y
    else:
        result = 0
    `;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('python');
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 5, "Should have exactly 5 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'result = x + y',
            path: 'where (\n\tx > 10\n\ty > 5\n)'
        },
        {
            code: 'result = x - z',
            path: 'where (\n\tx > 10\n\t!(y > 5)\n\tz > 0\n)'
        },
        {
            code: 'result = x',
            path: 'where (\n\tx > 10\n\t!(y > 5)\n\t!(z > 0)\n)'
        },
        {
            code: 'result = -y',
            path: 'where (\n\t!(x > 10)\n\ty < 0\n)'
        },
        {
            code: 'result = 0',
            path: 'where (\n\t!(x > 10)\n\t!(y < 0)\n)'
        }
    ]);
});


test('Python CFG Path - While Loop with Conditions', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
while x > 0:
    if y > x:
        x = x - 1
    else:
        y = y + 1
        if y > 10:
            break
    if x == 5:
        y += 2
    `;

    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('python');
    const paths = pathCollector.collect(cfg.entry);

    // assert that there are 6 paths
    assert.equal(paths.length, 6, "Should have exactly 6 paths");
    // Test paths for first iteration
    assert.ok(paths.some(p => p.path.includes('x > 0\n\ty > x')), 
            "Should have path for x > 0 && y > x");
    assert.ok(paths.some(p => p.path.includes('x > 0\n\t!(y > x)\n\ty > 10')), 
        "Should have path for break condition");
    assert.ok(paths.some(p => p.path.includes('x > 0\n\ty > x\n\tx == 5')), 
        "Should have path for continue condition");
    assert.ok(paths.some(p => p.path.includes('x > 0\n\t!(y > x)\n\t!(y > 10)\n\t!(x == 5)')), 
        "Should recognize the break condition");
    // if !(x > 0) exist under p.path, then p.code should not include "while" 
    paths.forEach(p => {
        if (p.path.includes('!(x > 0)')) {
            assert.ok(!p.code.includes('while'), "Should not have while loop if !(x > 0) exists in the condition");
        }
    });
});

test('Python CFG - For Loop Path Collection', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
for i in range(10):
    x = i + 1
    if i < 3:
        y = 2 * i
        continue
    if i > 7:
        z = i * i
        break
    if i == 5:
        w = i + 10
        continue
    result = i * 2
final = result + 1
    `;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('python');
    const paths = pathCollector.collect(cfg.entry);

    // Path 1: Early continue path with contradictory conditions
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('y = 2 * i') &&
            p.code.includes('z = i * i') &&
            p.code.includes('final = result + 1') &&
            p.path === 'where (\n\ti < 3\n\t!(i < 3)\n\ti > 7\n)'
        ),
        "Should have contradictory path with continue and break"
    );

    // Path 2: Early continue with normal execution
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('y = 2 * i') &&
            p.code.includes('result = i * 2') &&
            p.code.includes('final = result + 1') &&
            p.path === 'where (\n\ti < 3\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)'
        ),
        "Should have continue path with normal execution"
    );

    // Path 3: Break path
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('z = i * i') &&
            p.code.includes('final = result + 1') &&
            !p.code.includes('result = i * 2') &&
            p.path === 'where (\n\t!(i < 3)\n\ti > 7\n)'
        ),
        "Should have break path"
    );

    // Path 4: Normal execution path
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('result = i * 2') &&
            p.code.includes('final = result + 1') &&
            !p.code.includes('z = i * i') &&
            p.path === 'where (\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)'
        ),
        "Should have normal execution path"
    );

    // Verify number of paths
    assert.equal(paths.length, 6, "Should have exactly 6 paths");

    // Verify all paths end with final statement
    assert.ok(
        paths.every(p => p.code.endsWith('final = result + 1')),
        "All paths should end with final statement"
    );

    // Verify path conditions
    const expectedPaths = [
        'where (\n\ti < 3\n\t!(i < 3)\n\ti > 7\n)',
        'where (\n\ti < 3\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)',
        'where (\n\t!(i < 3)\n\ti > 7\n)',
        'where (\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)'
    ];

    expectedPaths.forEach(expectedPath => {
        assert.ok(
            paths.some(p => p.path === expectedPath),
            `Should have path with conditions: ${expectedPath}`
        );
    });

    // Verify code sequences
    paths.forEach(path => {
        // All paths should start with for i in range(10):
        assert.ok(path.code.startsWith('for i in range(10):'), 
            "All paths should start with for i in range(10):");

        // Break paths should include z = i * i
        if (path.path.includes(' i > 7 ')) {
            assert.ok(path.code.includes('z = i * i'),
                "Break paths should include z = i * i");
        }

        // Normal execution paths should include result = i * 2
        if (path.path.includes('!(i > 7) && !(i == 5)')) {
            assert.ok(path.code.includes('result = i * 2'),
                "Normal paths should include result calculation");
        }
    });
});

test('Python CFG Path - Try Except Else Finally', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
try:
    x = 1
    y = 2
except ValueError:
    x = -1
    z = 3
except Exception:
    x = -2
    z = 4
else:
    y = y + 1
    w = 4
finally:
    cleanup = True
result = x + y
    `;

    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('python');
    const paths = pathCollector.collect(cfg.entry);

    // Should have exactly 2 paths:
    // 1. Try succeeds -> else -> finally
    // 2. Try fails with ValueError -> except -> finally
    assert.equal(paths.length, 3, "Should have exactly 3 paths");

    // Path 1: Normal execution (no exception)
    // if no exception, then the path should be:
    // TRY_START -> x = 1 -> y = 2  -> TRY_END -> y = y + 1 -> w = 4 -> cleanup = True -> result = x + y

    assert.ok(
        paths.some(p => 
            p.code === 'TRY_START\nx = 1\ny = 2\nTRY_END\ny = y + 1\nw = 4\ncleanup = True\nresult = x + y' &&
            p.path === 'where (\n\tno_exception\n)'
        ),
        "Should have path for successful try block execution"
    );
    // Path 2: Exception path
    // TRY_START -> x = -1 -> z = 3 -> TRY_END -> cleanup = True -> result = x + y
    assert.ok(
        paths.some(p => 
            p.code === 'TRY_START\nx = 1\ny = 2\nTRY_END\nx = -1\nz = 3\ncleanup = True\nresult = x + y' &&
            p.path === 'where (\n\tthrows ValueError\n)'
        ),
        "Should have path for ValueError exception"
    );
    // Path 3: Exception path
    // TRY_START -> x = -2 -> z = 4 -> TRY_END -> cleanup = True -> result = x + y
    assert.ok(
        paths.some(p => 
            p.code === 'TRY_START\nx = 1\ny = 2\nTRY_END\nx = -2\nz = 4\ncleanup = True\nresult = x + y' &&
            p.path === 'where (\n\tthrows Exception\n)'
        ),
        "Should have path for Exception exception"
    );
    // Verify all paths include finally block and final result
    assert.ok(
        paths.every(p => 
            p.code.includes('cleanup = True') &&
            p.code.includes('result = x + y')
        ),
        "All paths should include finally block and result calculation"
    );
});

test('Python CFG Path - If-Else with multiple loop', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
def replace(self, new: Union[NL, list[NL]]) -> None:
    """Replace this node with a new one in the parent."""
    assert self.parent is not None, str(self)
    assert new is not None
    if not isinstance(new, list):
        new = [new]
    l_children = []
    found = False
    for ch in self.parent.children:
        if ch is self:
            assert not found, (self.parent.children, self, new)
            if new is not None:
                l_children.extend(new)
            found = True
        else:
            l_children.append(ch)
    assert found, (self.children, self, new)
    self.parent.children = l_children
    self.parent.changed()
    self.parent.invalidate_sibling_maps()
    for x in new:
        x.parent = self.parent
    self.parent = None
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('python');
    // pathCollector.setMaxLoopIterations(10);
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 6, "Should have exactly 6 paths");

});
test('Python CFG Path - Path Minimization', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `  
async def schedule_formatting(
    sources: set[Path],
    fast: bool,
    write_back: WriteBack,
    mode: Mode,
    report: \"Report\",
    loop: asyncio.AbstractEventLoop,
    executor: \"Executor\",
) -> None:
    \"\"\"Run formatting of "sources" in parallel using the provided "executor".

    (Use ProcessPoolExecutors for actual parallelism.)

    "write_back", "fast", and "mode" options are passed to
    :func:"format_file_in_place".
    \"\"\"
    cache = Cache.read(mode)
    if write_back not in (WriteBack.DIFF, WriteBack.COLOR_DIFF):
        sources, cached = cache.filtered_cached(sources)
        for src in sorted(cached):
            report.done(src, Changed.CACHED)
    if not sources:
        return

    cancelled = []
    sources_to_cache = []
    lock = None
    if write_back in (WriteBack.DIFF, WriteBack.COLOR_DIFF):
        # For diff output, we need locks to ensure we don't interleave output
        # from different processes.
        manager = Manager()
        lock = manager.Lock()
    tasks = {
        asyncio.ensure_future(
            loop.run_in_executor(
                executor, format_file_in_place, src, fast, mode, write_back, lock
            )
        ): src
        for src in sorted(sources)
    }
    pending = tasks.keys()
    try:
        loop.add_signal_handler(signal.SIGINT, cancel, pending)
        loop.add_signal_handler(signal.SIGTERM, cancel, pending)
    except NotImplementedError:
        # There are no good alternatives for these on Windows.
        pass
    while pending:
        done, _ = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            src = tasks.pop(task)
            if task.cancelled():
                cancelled.append(task)
            elif exc := task.exception():
                if report.verbose:
                    traceback.print_exception(type(exc), exc, exc.__traceback__)
                report.failed(src, str(exc))
            else:
                changed = Changed.YES if task.result() else Changed.NO
                # If the file was written back or was successfully checked as
                # well-formatted, store this information in the cache.
                if write_back is WriteBack.YES or (
                    write_back is WriteBack.CHECK and changed is Changed.NO
                ):
                    sources_to_cache.append(src)
                report.done(src, changed)
    if cancelled:
        await asyncio.gather(*cancelled, return_exceptions=True)
    if sources_to_cache:
        cache.write(sources_to_cache)"
    `;
    const cfg = await builder.buildFromCode(code);
    // builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('python');
    const paths = pathCollector.collect(cfg.entry);
    console.log("before minimization", paths.length);
    assert.equal(paths.length, 162, "Should have exactly 162 paths");
    const minimizedPaths = pathCollector.minimizePaths(paths);
    console.log("after minimization", minimizedPaths.length);
    console.log(minimizedPaths.map(p => p.path));
    // assert.equal(minimizedPaths.length, 10, "Should have exactly 10 paths");
});
test('Python CFG Path - Return Statement Exits Function', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
def foo(x):
    y = 1
    if x > 0:
        return 42
    if y > 2:
        return 3
    y = 2
    return 0
`;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('python');
    const paths = pathCollector.collect(cfg.entry);

    // Find the path(s) that include the first return
    const return42Path = paths.find(p => p.path.includes('return 42'))!;
    assert.ok(return42Path, "Should have a path with 'return 42'");
    // The path with 'return 42' should NOT include 'y = 2' or 'return 0'
    assert.ok(!return42Path.code.includes('y = 2'), "Path with 'return 42' should not include 'y = 2'");
    assert.ok(!return42Path.path.includes('y > 2'), "Path with 'return 42' should not include 'return 0'");

    // The other path should include 'y = 2' and 'return 0'
    const return0Path = paths.find(p => p.path.includes('return 0'))!;
    assert.ok(return0Path, "Should have a path with 'return 0'");
    assert.ok(return0Path.code.includes('y = 2'), "Path with 'return 0' should include 'y = 2'");
    assert.ok(!return0Path.code.includes('return 42'), "Path with 'return 0' should not include 'return 42'");
});

// Known issues : we cannot detect the break / continue condition in the loop
// Basic path tests
test('Java CFG Path - Simple If-Else', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
if (x > 0) {
    y = 1;
} else {
    y = 2;
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('java');
    const paths = pathCollector.collect(cfg.entry);
    // const allPaths = pathCollector.getPaths();
    assert.equal(paths.length, 2, "Should have exactly 2 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'y = 1;',
            path: 'where (\n\t(x > 0)\n)'
        },
        {
            code: 'y = 2;',
            path: 'where (\n\t!(x > 0)\n)'
        }
    ]);
});

test('Java CFG - Complex Control Flow', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
public int calculate(int x) {
    if (x > 0) {
        while (x < 10) {
            x += 1
            if (x == 5) {
                break;
            }
        }
    }
    return x;
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Verify basic structure
    assert.notEqual(cfg.entry, undefined);
    assert.notEqual(cfg.exit, undefined);

    // Find key nodes
    const conditions = Array.from(cfg.nodes.values()).filter(n => n.type === CFGNodeType.CONDITION);
    const loop = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.LOOP);
    
    // should have two conditions 
    assert.equal(conditions.length, 3, "Should have three conditions");
    assert.notEqual(conditions[0], undefined, "Should have a condition node");
    assert.notEqual(conditions[1], undefined, "Should have a condition node");
    assert.notEqual(loop, undefined, "Should have a loop node");
    
    const whileCondition = conditions.filter(c => (c.text.includes('(x < 10)') && !c.text.includes('(x > 0)')));
    assert.equal(whileCondition.length, 1, "Should have one condition for the while loop");
    // Verify the loop is inside the true branch of the if statement
    assert.equal(loop?.predecessors[0], whileCondition[0]?.trueBlock, "Loop should be inside the true branch of the if statement");
    
    // Verify loop node contains the while statement
    assert.ok(loop?.astNode.text.includes('while (x < 10)'), "Loop should contain the while statement");
}); 

test('Java CFG Path - If-Else with Merge Point', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
if (x > 0) {
    y = 1;
} else {
    y = 2;
}
z = 3; // This is after the merge point
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('java');
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 2, "Should have exactly 2 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'y = 1;\nz = 3;',
            path: 'where (\n\t(x > 0)\n)'
        },
        {
            code: 'y = 2;\nz = 3;',
            path: 'where (\n\t!(x > 0)\n)'
        }
    ]);
});

test('Java CFG Path - Nested If-Else with Multiple Branches', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
if (x > 10) {
    if (y > 5) {
        result = x + y;
    } else {
        if (z > 0) {
            result = x - z;
        } else {
            result = x;
        }
    }
} else {
    if (y < 0) {
        result = -y;
    } else {
        result = 0;
    }
}
    `;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('java');
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 5, "Should have exactly 5 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'result = x + y;',
            path: 'where (\n\t(x > 10)\n\t(y > 5)\n)'
        },
        {
            code: 'result = x - z;',
            path: 'where (\n\t(x > 10)\n\t!(y > 5)\n\t(z > 0)\n)'
        },
        {
            code: 'result = x;',
            path: 'where (\n\t(x > 10)\n\t!(y > 5)\n\t!(z > 0)\n)'
        },
        {
            code: 'result = -y;',
            path: 'where (\n\t!(x > 10)\n\t(y < 0)\n)'
        },
        {
            code: 'result = 0;',
            path: 'where (\n\t!(x > 10)\n\t!(y < 0)\n)'
        }
    ]);
});

test('Java CFG Path - While Loop with Conditions', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
while (x > 0) {
    if (y > x) {
        x = x - 1;
    } else {
        y = y + 1;
        if (y > 10) {
            break;
        }
    }
    if (x == 5) {
        y += 2;
    }
}
`;

    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('java');
    const paths = pathCollector.collect(cfg.entry);

    // assert that there are 6 paths
    assert.equal(paths.length, 6, "Should have exactly 6 paths");
    // Test paths for first iteration
    assert.ok(paths.some(p => p.path.includes('(x > 0)\n\t(y > x)')), 
            "Should have path for x > 0 && y > x");
    assert.ok(paths.some(p => p.path.includes('(x > 0)\n\t!(y > x)\n\t(y > 10)')), 
        "Should have path for break condition");
    assert.ok(paths.some(p => p.path.includes('(x > 0)\n\t(y > x)\n\t(x == 5)')), 
        "Should have path for continue condition");
    assert.ok(paths.some(p => p.path.includes('(x > 0)\n\t!(y > x)\n\t!(y > 10)\n\t!(x == 5)')), 
        "Should recognize the break condition");
    // if !(x > 0) exist under p.path, then p.code should not include "while" 
    paths.forEach(p => {
        if (p.path.includes('!(x > 0)')) {
            assert.ok(!p.code.includes('while'), "Should not have while loop if !(x > 0) exists in the condition");
        }
    });
});

test('Java CFG - For Loop Path Collection', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
for (int i = 0; i < 10; i++) {
    x = i + 1;
    if (i < 3) {
        y = 2 * i;
        continue;
    }
    if (i > 7) {
        z = i * i;
        break;
    }
    if (i == 5) {
        w = i + 10;
        continue;
    }
    result = i * 2;
}
finalResult = result + 1;
    `;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('java');
    const paths = pathCollector.collect(cfg.entry);

    // Path 1: Early continue path with contradictory conditions
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('y = 2 * i') &&
            p.code.includes('z = i * i') &&
            p.code.includes('finalResult = result + 1') &&
            p.path === 'where (\n\t(i < 3)\n\t!(i < 3)\n\t(i > 7)\n)'
        ),
        "Should have contradictory path with continue and break"
    );

    // Path 2: Early continue with normal execution
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('y = 2 * i') &&
            p.code.includes('result = i * 2') &&
            p.code.includes('finalResult = result + 1') &&
            p.path === 'where (\n\t(i < 3)\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)'
        ),
        "Should have continue path with normal execution"
    );

    // Path 3: Break path
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('z = i * i') &&
            p.code.includes('finalResult = result + 1') &&
            !p.code.includes('result = i * 2') &&
            p.path === 'where (\n\t!(i < 3)\n\t(i > 7)\n)'
        ),
        "Should have break path"
    );

    // Path 4: Normal execution path
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('result = i * 2') &&
            p.code.includes('finalResult = result + 1') &&
            !p.code.includes('z = i * i') &&
            p.path === 'where (\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)'
        ),
        "Should have normal execution path"
    );

    // Verify number of paths
    assert.equal(paths.length, 6, "Should have exactly 6 paths");

    // Verify all paths end with final statement
    assert.ok(
        paths.every(p => p.code.endsWith('finalResult = result + 1;')),
        "All paths should end with final statement"
    );

    // Verify path conditions
    const expectedPaths = [
        'where (\n\t(i < 3)\n\t!(i < 3)\n\t(i > 7)\n)',
        'where (\n\t(i < 3)\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)',
        'where (\n\t!(i < 3)\n\t(i > 7)\n)',
        'where (\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)'
    ];

    expectedPaths.forEach(expectedPath => {
        assert.ok(
            paths.some(p => p.path === expectedPath),
            `Should have path with conditions: ${expectedPath}`
        );
    });

    // Verify code sequences
    paths.forEach(path => {
        // All paths should start with for i in range(10):
        assert.ok(path.code.startsWith('for (int i = 0; i < 10; i++) {'), 
            "All paths should start with for (int i = 0; i < 10; i++) {");

        // Break paths should include z = i * i
        // include (i > 7)， at the same time do not include !(i > 7)
        if (path.path.includes('(i > 7)') && !path.path.includes('!(i > 7)')) {
            assert.ok(path.code.includes('z = i * i'),
                "Break paths should include z = i * i");
        }

        // Normal execution paths should include result = i * 2
        if (path.path.includes('!(i > 7)\n\t!(i == 5)')) {
            assert.ok(path.code.includes('result = i * 2'),
                "Normal paths should include result calculation");
        }
    });
});

test('Java CFG Path - Try Except Else Finally', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
try {
    x = 1;
    y = 2;
} catch (ValueException e) {
    x = -1;
    z = 3;
} catch (Exception e) {
    x = -2;
    z = 4;
} finally {
    cleanup = true;
}
result = x + y;
    `;

    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('java');
    const paths = pathCollector.collect(cfg.entry);

    // Should have exactly 2 paths:
    // 1. Try succeeds -> else -> finally
    // 2. Try fails with ValueError -> except -> finally
    assert.equal(paths.length, 3, "Should have exactly 3 paths");

    // Path 1: Normal execution (no exception)
    // if no exception, then the path should be:
    // TRY_START -> x = 1 -> y = 2  -> TRY_END -> y = y + 1 -> w = 4 -> cleanup = True -> result = x + y
'TRY_START\nx = 1;\ny = 2;\nTRY_END\nx = -1;\nz = 3;\ncleanup = true;\nresult = x + y;'

    assert.ok(
        paths.some(p => 
            p.code === 'TRY_START\nx = 1;\ny = 2;\nTRY_END\ncleanup = true;\nresult = x + y;' &&
            p.path === 'where (\n\t\n)'
        ),
        "Should have path for successful try block execution"
    );
    // Path 2: Exception path
    // TRY_START -> x = -1 -> z = 3 -> TRY_END -> cleanup = True -> result = x + y
    assert.ok(
        paths.some(p => 
            p.code === 'TRY_START\nx = 1;\ny = 2;\nTRY_END\nx = -1;\nz = 3;\ncleanup = true;\nresult = x + y;' &&
            p.path === 'where (\n\tthrows ValueException\n)'
        ),
        "Should have path for ValueError exception"
    );
    // Path 3: Exception path
    // TRY_START -> x = -2 -> z = 4 -> TRY_END -> cleanup = True -> result = x + y
    assert.ok(
        paths.some(p => 
            p.code === 'TRY_START\nx = 1;\ny = 2;\nTRY_END\nx = -2;\nz = 4;\ncleanup = true;\nresult = x + y;' &&
            p.path === 'where (\n\tthrows Exception\n)'
        ),
        "Should have path for Exception exception"
    );
    // Verify all paths include finally block and final result
    assert.ok(
        paths.every(p => 
            p.code.includes('cleanup = true') &&
            p.code.includes('result = x + y')
        ),
        "All paths should include finally block and result calculation"
    );
});

test('Java CFG Path - If-Else with multiple loop', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
void replace(Node newNode) {
    assert this.parent != null;
    assert newNode != null;
    List<Node> newList;
    if (!(newNode instanceof List)) {
        newList = Arrays.asList(newNode);
    } else {
        newList = (List<Node>) newNode;
    }
    List<Node> lChildren = new ArrayList<>();
    boolean found = false;
    for (Node ch : this.parent.children) {
        if (ch == this) {
            assert !found;
            if (newNode != null) {
                lChildren.addAll(newList);
            }
            found = true;
        } else {
            lChildren.add(ch);
        }
    }
    assert found;
    this.parent.children = lChildren;
    this.parent.changed();
    this.parent.invalidateSiblingMaps();
    for (Node x : newList) {
        x.parent = this.parent;
    }
    this.parent = null;
}
`;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('java');
    // pathCollector.setMaxLoopIterations(10);
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 6, "Should have exactly 6 paths");

});
test('Java CFG Path - Path Minimization', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
void scheduleFormatting(Set<Path> sources, boolean fast, WriteBack writeBack, Mode mode, Report report, ExecutorService executor) {
    Cache cache = Cache.read(mode);
    if (writeBack != WriteBack.DIFF && writeBack != WriteBack.COLOR_DIFF) {
        Pair<Set<Path>, Set<Path>> filtered = cache.filteredCached(sources);
        sources = filtered.getFirst();
        Set<Path> cached = filtered.getSecond();
        for (Path src : cached) {
            report.done(src, Changed.CACHED);
        }
    }
    if (sources.isEmpty()) {
        return;
    }
    List<Future<?>> tasks = new ArrayList<>();
    for (Path src : sources) {
        tasks.add(executor.submit(() -> formatFileInPlace(src, fast, mode, writeBack)));
    }
    List<Future<?>> cancelled = new ArrayList<>();
    List<Path> sourcesToCache = new ArrayList<>();
    Object lock = null;
    if (writeBack == WriteBack.DIFF || writeBack == WriteBack.COLOR_DIFF) {
        lock = new Object();
    }
    for (Future<?> task : tasks) {
        try {
            Object result = task.get();
            boolean changed = (result != null);
            if (writeBack == WriteBack.YES || (writeBack == WriteBack.CHECK && !changed)) {
                sourcesToCache.add(/* src */);
            }
            report.done(/* src */, changed ? Changed.YES : Changed.NO);
        } catch (Exception e) {
            if (report.verbose()) {
                e.printStackTrace();
            }
            report.failed(/* src */, e.getMessage());
        }
    }
    if (!cancelled.isEmpty()) {
        // handle cancelled
    }
    if (!sourcesToCache.isEmpty()) {
        cache.write(sourcesToCache);
    }
}
`;
    const cfg = await builder.buildFromCode(code);
    // builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('java');
    const paths = pathCollector.collect(cfg.entry);
    console.log("before minimization", paths.length);
    assert.equal(paths.length, 98, "Should have exactly 98 paths");
    const minimizedPaths = pathCollector.minimizePaths(paths);
    console.log("after minimization", minimizedPaths.length);
    console.log(minimizedPaths.map(p => p.path));
    assert.equal(minimizedPaths.length, 8, "Should have exactly 8 paths");
});

test('Java CFG Path - Return Statement Exits Function', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
int foo(int x) {
    int y = 1;
    if (x > 0) {
        return 42;
    }
    if (y > 2) {
        return 3;
    }
    y = 2;
    return 0;
}
`;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('java');
    const paths = pathCollector.collect(cfg.entry);

    // Find the path(s) that include the first return
    const return42Path = paths.find(p => p.path.includes('return 42'))!;
    assert.ok(return42Path, "Should have a path with 'return 42'");
    // The path with 'return 42' should NOT include 'y = 2' or 'return 0'
    assert.ok(!return42Path.code.includes('y = 2'), "Path with 'return 42' should not include 'y = 2'");
    assert.ok(!return42Path.path.includes('y > 2'), "Path with 'return 42' should not include 'return 0'");

    // The other path should include 'y = 2' and 'return 0'
    const return0Path = paths.find(p => p.path.includes('return 0'))!;
    assert.ok(return0Path, "Should have a path with 'return 0'");
    assert.ok(return0Path.code.includes('y = 2'), "Path with 'return 0' should include 'y = 2'");
    assert.ok(!return0Path.code.includes('return 42'), "Path with 'return 0' should not include 'return 42'");
});