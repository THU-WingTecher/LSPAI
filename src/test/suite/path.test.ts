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
    assert.ok(paths.some(p => p.path.includes('x > 0 && !(y > x) && !(y > 10) && !(x == 5)')), 
        "Should recognize the break condition");
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
    const pathCollector = new PathCollector();
    const paths = pathCollector.collect(cfg.entry);

    // Path 1: Early continue path with contradictory conditions
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('y = 2 * i') &&
            p.code.includes('z = i * i') &&
            p.code.includes('final = result + 1') &&
            p.path === 'i < 3 && !(i < 3) && i > 7'
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
            p.path === 'i < 3 && !(i < 3) && !(i > 7) && !(i == 5)'
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
            p.path === '!(i < 3) && i > 7'
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
            p.path === '!(i < 3) && !(i > 7) && !(i == 5)'
        ),
        "Should have normal execution path"
    );

    // Verify number of paths
    assert.equal(paths.length, 4, "Should have exactly 4 paths");

    // Verify all paths end with final statement
    assert.ok(
        paths.every(p => p.code.endsWith('final = result + 1')),
        "All paths should end with final statement"
    );

    // Verify path conditions
    const expectedPaths = [
        'i < 3 && !(i < 3) && i > 7',
        'i < 3 && !(i < 3) && !(i > 7) && !(i == 5)',
        '!(i < 3) && i > 7',
        '!(i < 3) && !(i > 7) && !(i == 5)'
    ];

    expectedPaths.forEach(expectedPath => {
        assert.ok(
            paths.some(p => p.path === expectedPath),
            `Should have path with conditions: ${expectedPath}`
        );
    });

    // Verify code sequences
    paths.forEach(path => {
        // All paths should start with x = i + 1
        assert.ok(path.code.startsWith('x = i + 1'), 
            "All paths should start with x = i + 1");

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