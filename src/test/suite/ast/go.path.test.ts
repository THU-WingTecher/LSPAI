import * as assert from 'assert';
import { GolangCFGBuilder } from '../../../cfg/golang';
import { PathCollector } from '../../../cfg/path';
import { CFGNodeType } from '../../../cfg/types';
import { activate, getPythonExtraPaths, getPythonInterpreterPath, setPythonExtraPaths, setPythonInterpreterPath } from '../../../lsp';

import { loadAllTargetSymbolsFromWorkspace, setWorkspaceFolders } from '../../../helper';
import { collectPathforSymbols } from '../../../experiment';
// Known issues : we cannot detect the break / continue condition in the loop
// Basic path tests
test('Golang CFG Path - Simple If-Else', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
if x > 0 {
    y = 1
} else {
    y = 2
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('go');
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 2, "Should have exactly 2 paths");
    const actualConditions = pathCollector.getPaths().map(
        p => p['segments'].map(seg => seg.condition).filter(Boolean)
    );
    const expectedConditions = [
        ['x > 0'],
        ['!(x > 0)']
    ];
    assert.deepStrictEqual(actualConditions, expectedConditions);
});

test('Golang CFG Path - If-Else with Merge Point', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
if x > 0 {
    y = 1
} else {
    y = 2
}
z := 3 // This is after the merge point
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('go');
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 2, "Should have exactly 2 paths");
    const actualConditions = pathCollector.getPaths().map(
        p => p['segments'].map(seg => seg.condition).filter(Boolean)
    );
    const expectedConditions = [
        ['x > 0'],
        ['!(x > 0)']
    ];
    assert.deepStrictEqual(actualConditions, expectedConditions);
    const actualCodes = pathCollector.getPaths().map(
        p => p['segments'].map(seg => seg.code).filter(Boolean)
    );
    const expectedCodes = [
        ['y = 1', 'z := 3'],
        ['y = 2', 'z := 3']
    ];
    assert.deepStrictEqual(actualCodes, expectedCodes);

});

test('Golang CFG Path - If-Else If-Else with Multiple Conditions', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
if x > 10 {
    y = 1
} else if y > 5 {
    y = 2
} else if z == 0 {
    y = 3
} else {
    y = 4
}
    `;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('go');
    pathCollector.collect(cfg.entry);
    const actualConditions = pathCollector.getPaths().map(
        p => p['segments'].map(seg => seg.condition).filter(Boolean)
    );
    assert.equal(actualConditions.length, 4, "Should have exactly 4 paths");
    const expectedConditions = [
        ['x > 10'],
        ['!(x > 10)', 'y > 5'],
        ['!(x > 10)', '!(y > 5)', 'z == 0'],
        ['!(x > 10)', '!(y > 5)', '!(z == 0)']
    ];
    expectedConditions.forEach(condition => {
        assert.ok(
            actualConditions.some(c => c.length === condition.length && c.every((v, i) => v === condition[i])),
            `Should have path with conditions: ${condition.join(' && ')}`
        );
    });
});

test('Golang CFG Path - Nested If-Else with Multiple Branches', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
if x > 10 {
    if y > 5 {
        result = x + y
    } else {
        if z > 0 {
            result = x - z
        } else {
            result = x
        }
    }
} else {
    if y < 0 {
        result = -y
    } else {
        result = 0
    }
}
    `;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('go');
    const paths = pathCollector.collect(cfg.entry);

    assert.equal(paths.length, 5, "Should have exactly 5 paths");
    const actualConditions = pathCollector.getPaths().map(
        p => p['segments'].map(seg => seg.condition).filter(Boolean)
    );
    const expectedConditions = [
        ['x > 10', 'y > 5'],
        ['x > 10', '!(y > 5)', 'z > 0'],
        ['x > 10', '!(y > 5)', '!(z > 0)'],
        ['!(x > 10)', 'y < 0'],
        ['!(x > 10)', '!(y < 0)']
    ];
    assert.deepStrictEqual(actualConditions, expectedConditions);
    const actualCodes = pathCollector.getPaths().map(
        p => p['segments'].map(seg => seg.code).filter(Boolean)
    );
    const expectedCodes = [
        ['result = x + y'],
        ['result = x - z'],
        ['result = x'],
        ['result = -y'],
        ['result = 0']
    ];
    assert.deepStrictEqual(actualCodes, expectedCodes);
    // assert.deepStrictEqual(paths, [
    //     {
    //         code: 'result = x + y',
    //         path: 'where (\n\tx > 10\n\ty > 5\n)'
    //     },
    //     {
    //         code: 'result = x - z',
    //         path: 'where (\n\tx > 10\n\t!(y > 5)\n\tz > 0\n)'
    //     },
    //     {
    //         code: 'result = x',
    //         path: 'where (\n\tx > 10\n\t!(y > 5)\n\t!(z > 0)\n)'
    //     },
    //     {
    //         code: 'result = -y',
    //         path: 'where (\n\t!(x > 10)\n\ty < 0\n)'
    //     },
    //     {
    //         code: 'result = 0',
    //         path: 'where (\n\t!(x > 10)\n\t!(y < 0)\n)'
    //     }
    // ]);
});


test('Golang CFG Path - While Loop with Conditions', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
for x > 0 {
    if y > x {
        x = x - 1
    } else {
        y = y + 1
        if y > 10 {
            break
        }
    }
    if x == 5 {
        y += 2
    }
}
    `;

    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const pathCollector = new PathCollector('go');
    const paths = pathCollector.collect(cfg.entry);

    // assert that there are 6 paths
    assert.equal(paths.length, 6, "Should have exactly 6 paths");
    // Test paths for first iteration
    const actualConditions = pathCollector.getPaths().map(
        p => p['segments'].map(seg => seg.condition).filter(Boolean)
    );
    const expectedConditions = [
        ['x > 0', 'y > x', 'x == 5'],
        ['x > 0', 'y > x', '!(x == 5)'],
        ['x > 0', '!(y > x)', 'y > 10'],
        ['x > 0', '!(y > x)', '!(y > 10)', 'x == 5'],
        ['x > 0', '!(y > x)', '!(y > 10)', '!(x == 5)']
    ];
    // actualConditions should include the elements in expectedConditions
    expectedConditions.forEach(condition => {
        assert.ok(
            actualConditions.some(c => c.length === condition.length && c.every((v, i) => v === condition[i])),
            `Should have path with conditions: ${condition.join(' && ')}`
        );
    });
    // const actualCodes = pathCollector.getPaths().map(
    //     p => p['segments'].map(seg => seg.code).filter(Boolean)
    // );
    // assert.ok(paths.some(p => p.path.includes('x > 0\n\ty > x')), 
    //         "Should have path for x > 0 && y > x");
    // assert.ok(paths.some(p => p.path.includes('x > 0\n\t!(y > x)\n\ty > 10')), 
    //     "Should have path for break condition");
    // assert.ok(paths.some(p => p.path.includes('x > 0\n\ty > x\n\tx == 5')), 
    //     "Should have path for continue condition");
    // assert.ok(paths.some(p => p.path.includes('x > 0\n\t!(y > x)\n\t!(y > 10)\n\t!(x == 5)')), 
    //     "Should recognize the break condition");
    // if !(x > 0) exist under p.path, then p.code should not include "while" 
    paths.forEach(p => {
        if (p.path.includes('!(x > 0)')) {
            assert.ok(!p.code.includes('while'), "Should not have while loop if !(x > 0) exists in the condition");
        }
    });
});

test('Golang CFG - For Loop Path Collection', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
for i := 0; i < 10; i++ {
    x = i + 1
    if i < 3 {
        y = 2 * i
        continue
    }
    if i > 7 {
        z = i * i
        break
    }
    if i == 5 {
        w = i + 10
        continue
    }
    result = i * 2
}
final := result + 1
    `;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('go');
    const paths = pathCollector.collect(cfg.entry);

    // Verify number of paths
    assert.equal(paths.length, 6, "Should have exactly 6 paths");
    // Path 1: Early continue path with contradictory conditions
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('y = 2 * i') &&
            p.code.includes('z = i * i') &&
            p.code.includes('final := result + 1') &&
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
            p.code.includes('final := result + 1') &&
            p.path === 'where (\n\ti < 3\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)'
        ),
        "Should have continue path with normal execution"
    );

    // Path 3: Break path
    assert.ok(
        paths.some(p => 
            p.code.includes('x = i + 1') &&
            p.code.includes('z = i * i') &&
            p.code.includes('final := result + 1') &&
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
            p.code.includes('final := result + 1') &&
            !p.code.includes('z = i * i') &&
            p.path === 'where (\n\t!(i < 3)\n\t!(i > 7)\n\t!(i == 5)\n)'
        ),
        "Should have normal execution path"
    );


    // Verify all paths end with final statement
    assert.ok(
        paths.every(p => p.code.endsWith('final := result + 1')),
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
        // All paths should start with for i := 0; i < 10;
        assert.ok(path.code.startsWith('for i := 0; i < 10;'), 
            "All paths should start with for i := 0; i < 10;");

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



test('Golang CFG Path - Return Statement Exits Function', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
func foo(x int) int {
    y := 1
    if x > 0 {
        return 42
    }
    if y > 2 {
        return 3
    }
    y = 2
    return 0
}
    `;
    const cfg = await builder.buildFromCode(code);
    const pathCollector = new PathCollector('go');
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


test('Run all functions under a repository : cobra', async function() {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        const projectPath = "/LSPRAG/experiments/projects/cobra";
        const workspaceFolders = setWorkspaceFolders(projectPath);
        // await updateWorkspaceFolders(workspaceFolders);
        console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);

        const symbols = await loadAllTargetSymbolsFromWorkspace('go');
        assert.ok(symbols.length > 0, 'symbols should not be empty');
        await collectPathforSymbols(symbols);
});