import { GolangCFGBuilder } from '../../cfg/golang';
import { CFGNodeType } from '../../cfg/types';
import { strict as assert } from 'assert';

test('Golang CFG - Simple Statement', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = 'x := 1';
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    assert.equal(cfg.nodes.size, 3); // entry, statement, exit
    assert.equal(cfg.entry.type, CFGNodeType.ENTRY);
    assert.equal(cfg.exit.type, CFGNodeType.EXIT);

    // Check connections
    const statement = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.STATEMENT && n !== cfg.entry && n !== cfg.exit);
    assert.notEqual(statement, undefined);
    assert.equal(statement?.predecessors[0], cfg.entry);
    assert.equal(statement?.successors[0], cfg.exit);
});

test('Golang CFG - If Statement', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
if x > 0 {
    y := 1
} else {
    y := 2
}
z := 1
z = 3
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the condition node
    const condition = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.CONDITION);
    assert.notEqual(condition, undefined);
    assert.notEqual(condition?.trueBlock, undefined);
    assert.notEqual(condition?.falseBlock, undefined);

    // Check the condition node
    assert.ok(condition?.condition?.includes('x > 0'));

    // Check true branch
    assert.ok(condition?.trueBlock?.astNode.text.includes('y := 1'));
    
    // Check false branch
    assert.ok(condition?.falseBlock?.astNode.text.includes('y := 2'));
});

test('Golang CFG - While Loop', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
for x < 10 {
    x += 1
}
x += 2
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the loop node
    const loop = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.LOOP);
    assert.notEqual(loop, undefined);

    const body = loop?.successors[0];
    assert.notEqual(body, undefined);
    // the next node from entry is a condition node 
    // assert.equal(cfg.entry.successors[0].type, CFGNodeType.STATEMENT);
    assert.equal(body?.type, CFGNodeType.BLOCK);
    assert.equal(body?.successors[0].type, CFGNodeType.STATEMENT);
});

test('Golang CFG - Complex Control Flow', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
func calculate(x int) int {
    if x > 0 {
        for x < 10 {
            x += 1
            if x == 5 {
                break
            }
        }
    }
    return x
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
    
    const whileCondition = conditions.filter(c => c.condition?.includes('x < 10'));
    assert.ok(whileCondition.length === 1, "Should have one condition for the while loop");
    // Verify the loop is inside the true branch of the if statement
    assert.equal(loop?.predecessors[0], whileCondition[0]?.trueBlock, "Loop should be inside the true branch of the if statement");
    
    // Verify loop node contains the while statement
    assert.ok(loop?.astNode.text.includes('for x < 10'), "Loop should contain the while statement");
}); 

test('Golang CFG - Nested If-Else with Multiple Branches', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
if x > 10 {
    if y > 5 {
        result := x + y
    } else {
        if z > 0 {
            result := x - z
        } else {
            result := x
        }
    }
} else {
    if y < 0 {
        result := -y
    } else {
        result := 0
    }
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the outer if condition (x > 10)
    const outerCondition = Array.from(cfg.nodes.values()).find(n => 
        n.type === CFGNodeType.CONDITION && 
        n.condition === 'x > 10'
    );
    assert.notEqual(outerCondition, undefined, "Outer condition should exist");

    // Find the first nested if condition (y > 5)
    const nestedCondition = Array.from(cfg.nodes.values()).find(n => 
        n.type === CFGNodeType.CONDITION && 
        n.condition === 'y > 5'
    );
    assert.notEqual(nestedCondition, undefined, "Nested condition should exist");

    // Verify the nested condition is not including the outer condition text
    assert.ok(
        !nestedCondition?.condition?.includes('x > 10'),
        "Nested condition should not include outer condition text"
    );

    // Get the true block of the outer condition
    const outerTrueBlock = outerCondition?.trueBlock;
    assert.notEqual(outerTrueBlock, undefined, "Outer condition should have a true block");

    // Verify the connection
    assert.equal(
        nestedCondition, 
        outerTrueBlock?.successors[0],
        `Nested condition should be the successor of the outer condition's true block.\n` +
        `Nested condition text: ${nestedCondition?.condition}\n` +
        `Outer true block text: ${outerTrueBlock?.astNode.text}`
    );
});

test('Golang CFG - Mixed Loop and Condition', async function() {
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
        continue
    }
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the while loop node using the condition expression

    // Find conditions inside the loop by their specific expressions
    const conditions = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.CONDITION)

    assert.equal(conditions.length, 4, "Should have exactly 4 conditions");

    const finalCondition = conditions.find(n => 
        n.condition === 'x == 5'
    );
    assert.notEqual(finalCondition, undefined, "Final condition (x == 5) should exist");

    // Verify x == 5 condition comes after the main if/else block
    // It should have a predecessor that is either:
    // 1. The merge node of the main if/else block, or
    // 2. A statement node that follows the if/else block
    assert.ok(
        finalCondition!.predecessors.some(p => 
            p.type === CFGNodeType.MERGED
        ),
        "x == 5 condition should follow the main if/else block"
    );

});

test('Golang CFG - Nested Loops with Conditions', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
for i := 0; i < 5; i++ {
    if i % 2 == 0 {
        for j := 0; j < i; j++ {
            if j > 2 {
                break
            }
            x = x + j
        }
    } else {
        for x > 0 {
            x = x - 1
            if x == 5 {
                continue
            }
        }
    }
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the outer for loop
    const outerLoop = Array.from(cfg.nodes.values()).find(n => 
        n.type === CFGNodeType.LOOP && 
        n.astNode.type === 'for_statement' &&
        n.astNode.text.includes('i < 5')
    );
    assert.notEqual(outerLoop, undefined, "Outer for loop should exist");

    // Find all loops
    const allLoops = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.LOOP);
    assert.equal(allLoops.length, 3, "Should have exactly three loops");

    // Find all conditions
    const conditions = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.CONDITION && 
                    n.astNode.type === 'if_statement');
    assert.equal(conditions.length, 3, "Should have exactly 3 conditions");
});

test('Golang CFG - Complex Control Flow', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
func processValue(x int) int {
    result := 0
    if x > 0 {
        for x > 10 {
            if x % 2 == 0 {
                x = x / 2
            } else {
                x = x - 1
            }
            if x == 5 {
                break
            }
            for i := 0; i < 3; i++ {
                if i == x {
                    result += i
                    break
                }
            }
        }
    } else {
        for i := 0; i < 5; i++ {
            if i > 2 {
                if x < -5 {
                    result -= i
                }
                continue
            }
            result += i
        }
    }
    return result
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find Function Signature Information 
    const functionInfo = builder.getFunctionInfo();
    assert.equal(functionInfo.get('signature'), '(x int)', "Should have the correct function signature");

    // Find all conditions by their AST node type
    const conditions = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.CONDITION);
    assert.equal(conditions.length, 7, "Should have exactly 7 conditions");

    // Find all loops by their AST node type
    const loops = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.LOOP &&
                    (n.astNode.type === 'for_statement'));
    assert.equal(loops.length, 3, "Should have exactly 3 loops");

    // Find the main if condition
    const mainCondition = conditions.find(n => 
        n.astNode.type === 'if_statement' && 
        n.astNode.text.includes('x > 0')
    );
    assert.notEqual(mainCondition, undefined, "Main condition should exist");

    // Verify loop nesting
    // get loops of while statement
    const whileLoops = loops.filter(l => l.astNode.text.includes('x > 10'));
    assert.equal(whileLoops.length, 1, "Should have exactly 1 while loop");
    const whileLoop = whileLoops[0];
    assert.ok(
        whileLoop.predecessors[0].type === CFGNodeType.STATEMENT ||
        whileLoop.predecessors[0].type === CFGNodeType.BLOCK,
        `Loop should be nested under block of true block of condition`
    );

    // get first for loop
    // const forLoops = loops.filter(l => l.astNode.text.includes('i < 3') || l.astNode.text.includes('i < 5'));

    // // Verify loop nesting
    // forLoops.forEach(loop => {
    //     assert.ok(
    //         loop.predecessors[0].predecessors.some(p => p.type === CFGNodeType.MERGED || 
    //                                   p.type === CFGNodeType.BLOCK),
    //         `Loop should be nested under condition or statement`
    //     );
    // });

    // Verify statement connections
    const statements = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.STATEMENT && 
                    n !== cfg.entry && 
                    n !== cfg.exit);
    statements.forEach(stmt => {
        if (stmt.successors.length === 0) {
            assert.ok(
                stmt.predecessors.some(p => p.type === CFGNodeType.LOOP),
                "Terminal statements should be preceded by a loop"
            );
        }
    });
});

test('Golang CFG - Break and Continue Recognition', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
for x > 0 {
    if x > 10 {
        continue
    }
    if x < 5 {
        break
    }
    x = x - 1
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);

    // Find all nodes
    const nodes = Array.from(cfg.nodes.values());
    const loopNode = nodes.find(n => n.type === CFGNodeType.LOOP);
    const conditions = nodes.filter(n => n.type === CFGNodeType.CONDITION);
    const statements = nodes.filter(n => n.type === CFGNodeType.STATEMENT);
    const exitNode = nodes.find(n => n.type === CFGNodeType.EXIT_MERGED);
    // find break statement 
    const breakStatement = nodes.find(n => n.type === CFGNodeType.BREAK);
    const continueStatement = nodes.find(n => n.type === CFGNodeType.CONTINUE);
    // break statement should connect to exit node
    assert.ok(breakStatement?.successors.some(s => s === exitNode), "Break statement should connect to exit node");
    // continue statement should connect to loop node
    assert.ok(continueStatement?.successors.some(s => s === loopNode), "Continue statement should connect to loop node");
    // Basic structure assertions
    assert.notEqual(loopNode, undefined, "Should have a loop node");
    assert.equal(conditions.length, 3, "Should have three conditions (loop condition, continue condition, break condition)");
    
    // Find specific nodes
    const continueCondition = conditions.find(n => n.astNode.text.includes('x > 10'));
    const breakCondition = conditions.find(n => n.astNode.text.includes('x < 5'));
    const decrementStatement = statements.find(n => n.astNode.text.includes('x = x - 1'));
    
    assert.notEqual(continueCondition, undefined, "Should have continue condition");
    assert.notEqual(breakCondition, undefined, "Should have break condition");
    assert.notEqual(decrementStatement, undefined, "Should have decrement statement");
});

test('Golang CFG - For Loop Break Conditions', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
for i := 0; i < 10; i++ {
    x = i + 1
    if i > 5 {
        break
    }
    result = i * 2
}
final := x + 1
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);

    // Find all nodes
    const nodes = Array.from(cfg.nodes.values());
    const loopNode = nodes.find(n => n.type === CFGNodeType.LOOP);
    const conditions = nodes.filter(n => n.type === CFGNodeType.CONDITION);
    const statements = nodes.filter(n => n.type === CFGNodeType.STATEMENT);
    const exitNode = nodes.find(n => n.type === CFGNodeType.EXIT_MERGED);
    const breakStatement = nodes.find(n => n.type === CFGNodeType.BREAK);

    // Basic structure assertions
    assert.notEqual(loopNode, undefined, "Should have a loop node");
    assert.equal(conditions.length, 1, "Should have one condition (break condition)");
    assert.notEqual(breakStatement, undefined, "Should have break statement");
    assert.notEqual(exitNode, undefined, "Should have exit node");

    // Break connections
    assert.ok(breakStatement?.successors.some(s => s === exitNode), 
        "Break statement should connect to exit node");
    assert.ok(!breakStatement?.successors.some(s => s === loopNode), 
        "Break statement should not connect back to loop node");

    // Find specific nodes
    const breakCondition = conditions.find(n => n.astNode.text.includes('i > 5'));
    const resultStatement = statements.find(n => n.astNode.text.includes('result = i * 2'));
    const finalStatement = statements.find(n => n.astNode.text.includes('final := x + 1'));

    assert.notEqual(breakCondition, undefined, "Should have break condition");
    assert.notEqual(resultStatement, undefined, "Should have result statement");
    assert.notEqual(finalStatement, undefined, "Should have final statement");

    // Verify control flow
    assert.ok(exitNode?.successors.some(s => s === finalStatement), 
        "Exit node should connect to final statement");
});

// Test nested continue case
test('Golang CFG - Nested For Loop Continue', async function() {
    const builder = new GolangCFGBuilder('go');
    const code = `
for i := 0; i < 5; i++ {
    x = i
    for j := 0; j < 3; j++ {
        if j < 2 {
            continue
        }
        y = j
    }
    z = x + 1
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);

    // Find all nodes
    const nodes = Array.from(cfg.nodes.values());
    const loopNodes = nodes.filter(n => n.type === CFGNodeType.LOOP);
    const conditions = nodes.filter(n => n.type === CFGNodeType.CONDITION);
    const continueStatement = nodes.find(n => n.type === CFGNodeType.CONTINUE);

    // Basic structure assertions
    assert.equal(loopNodes.length, 2, "Should have two loop nodes (outer and inner)");
    assert.equal(conditions.length, 1, "Should have one condition (continue condition)");
    assert.notEqual(continueStatement, undefined, "Should have continue statement");

    // Find specific nodes
    const innerLoop = loopNodes.find(n => 
        n.astNode.text.includes('j < 3') && !n.astNode.text.includes('i < 5')
    );
    const outerLoop = loopNodes.find(n => 
        n.astNode.text.includes('i < 5')
    );
    const continueCondition = conditions.find(n => n.astNode.text.includes('j < 2'));
    const yStatement = nodes.find(n => n.astNode.text.includes('y = j'));
    const zStatement = nodes.find(n => n.astNode.text.includes('z = x + 1'));

    assert.notEqual(innerLoop, undefined, "Should have inner loop");
    assert.notEqual(outerLoop, undefined, "Should have outer loop");
    assert.notEqual(continueCondition, undefined, "Should have continue condition");
    assert.notEqual(yStatement, undefined, "Should have y statement");
    assert.notEqual(zStatement, undefined, "Should have z statement");

    // Verify continue connections
    assert.ok(continueStatement?.successors.some(s => s === innerLoop), 
        "Continue statement should connect back to inner loop node");
    assert.ok(!continueStatement?.successors.some(s => s === outerLoop), 
        "Continue statement should not connect to outer loop node");

    // Verify continue skips remaining inner loop statements
    assert.ok(!continueStatement?.successors.some(s => s === yStatement), 
        "Continue statement should not connect to y statement");
});

// Go does not have try/except/else/finally, so the last test is omitted.