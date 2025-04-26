import * as assert from 'assert';
import { PythonCFGBuilder } from '../../cfg/python';
import { PathCollector } from '../../cfg/path';

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
    const pathCollector = new PathCollector();
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 2, "Should have exactly 2 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'y = 1',
            path: 'x > 0'
        },
        {
            code: 'y = 2',
            path: '!(x > 0)'
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
    const pathCollector = new PathCollector();
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 2, "Should have exactly 2 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'y = 1\nz = 3',
            path: 'x > 0'
        },
        {
            code: 'y = 2\nz = 3',
            path: '!(x > 0)'
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
    const pathCollector = new PathCollector();
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 5, "Should have exactly 5 paths");
    assert.deepStrictEqual(paths, [
        {
            code: 'result = x + y',
            path: 'x > 10 && y > 5'
        },
        {
            code: 'result = x - z',
            path: 'x > 10 && !(y > 5) && z > 0'
        },
        {
            code: 'result = x',
            path: 'x > 10 && !(y > 5) && !(z > 0)'
        },
        {
            code: 'result = -y',
            path: '!(x > 10) && y < 0'
        },
        {
            code: 'result = 0',
            path: '!(x > 10) && !(y < 0)'
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
    const pathCollector = new PathCollector();
    const paths = pathCollector.collect(cfg.entry);

    // Test paths for first iteration
    assert.ok(paths.some(p => p.path.includes('x > 0 && y > x')), 
        "Should have path for x > 0 && y > x");
    assert.ok(paths.some(p => p.path.includes('x > 0 && !(y > x) && y > 10')), 
        "Should have path for break condition");
    assert.ok(paths.some(p => p.path.includes('x > 0 && y > x && x == 5')), 
        "Should have path for continue condition");
    // assert.ok(paths.some(p => p.path.includes('x > 0 && y > x && x == 5 && !(y > 10)')), 
    //     "Should recognize the break condition");
});