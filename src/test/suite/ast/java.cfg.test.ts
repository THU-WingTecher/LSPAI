import { JavaCFGBuilder } from '../../../cfg/java';
import { CFGNodeType } from '../../../cfg/types';
import { strict as assert } from 'assert';

test('Java CFG - Simple Statement', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = 'int x = 1;';
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    assert.equal(cfg.nodes.size, 3); // entry, statement, exit
    assert.equal(cfg.entry.type, CFGNodeType.ENTRY);
    assert.equal(cfg.exit.type, CFGNodeType.EXIT);

    const statement = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.STATEMENT && n !== cfg.entry && n !== cfg.exit);
    assert.notEqual(statement, undefined);
    assert.equal(statement?.predecessors[0], cfg.entry);
    assert.equal(statement?.successors[0], cfg.exit);
});

test('Java CFG - If Statement', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
if (x > 0) {
    y = 1;
} else {
    y = 2;
}
z = 1;
z = 3;
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const condition = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.CONDITION);
    assert.notEqual(condition, undefined);
    assert.notEqual(condition?.trueBlock, undefined);
    assert.notEqual(condition?.falseBlock, undefined);

    assert.ok(condition?.condition?.includes('x > 0'));
    assert.ok(condition?.trueBlock?.astNode.text.includes('y = 1'));
    assert.ok(condition?.falseBlock?.astNode.text.includes('y = 2'));
});


test('Java CFG - While Loop', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
while (x < 10) {
    x += 1;
}
x += 2;
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const loop = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.LOOP);
    assert.notEqual(loop, undefined);

    const body = loop?.successors[0];
    assert.notEqual(body, undefined);
    assert.equal(cfg.entry.successors[0].type, CFGNodeType.CONDITION);
    assert.equal(body?.type, CFGNodeType.BLOCK);
    assert.equal(body?.successors[0].type, CFGNodeType.STATEMENT);
});

test('Java CFG - For Loop', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
for (int i = 0; i < 10; i++) {
    x += i;
    if (i > 5) {
        break;
    }
    y += 2;
}
finalResult = x + y;
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);

    const loopNode = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.LOOP);
    const breakStatement = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.BREAK);
    const exitNode = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.EXIT_MERGED);

    assert.notEqual(loopNode, undefined, "Should have a loop node");
    assert.notEqual(breakStatement, undefined, "Should have break statement");
    assert.notEqual(exitNode, undefined, "Should have exit node");
    assert.ok(breakStatement?.successors.some(s => s === exitNode), "Break should connect to exit node");
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
    
    // Find Function Signature Information 
    const functionInfo = builder.getFunctionInfo();
    assert.equal(functionInfo.get('signature'), '(int x)', "Should have the correct function signature");
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

test('Java CFG - Nested If-Else', async function() {
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
    builder.printCFGGraph(cfg.entry);

    const outerCondition = Array.from(cfg.nodes.values()).find(n =>
        n.type === CFGNodeType.CONDITION &&
        n.condition === '(x > 10)'  
    );
    assert.notEqual(outerCondition, undefined, "Outer condition should exist");

    const nestedCondition = Array.from(cfg.nodes.values()).find(n =>
        n.type === CFGNodeType.CONDITION &&
        n.condition === '(y > 5)'
    );
    assert.notEqual(nestedCondition, undefined, "Nested condition should exist");
});

test('Java CFG - Mixed Loop and Condition', async function() {
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
        continue;
    }
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);

    const loop = Array.from(cfg.nodes.values()).find(n =>
        n.type === CFGNodeType.LOOP &&
        n.astNode.text.includes('x > 0')
    );
    assert.notEqual(loop, undefined, "While loop should exist");

    const conditions = Array.from(cfg.nodes.values()).filter(n => n.type === CFGNodeType.CONDITION);
    assert.ok(conditions.length >= 3, "Should have at least 3 conditions");
    const continueStatement = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.CONTINUE);
    assert.notEqual(continueStatement, undefined, "Should have continue statement");
});

test('Java CFG - Nested Loops with Conditions', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
for (int i = 0; i < 5; i++) {
    if (i % 2 == 0) {
        for (int j = 0; j < i; j++) {
            if (j > 2) {
                break;
            }
            x = x + j;
        }
    } else {
        while (x > 0) {
            x = x - 1
            if (x == 5) {
                continue;
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
        n.astNode.text.includes('int j = 0')
    );
    assert.notEqual(outerLoop, undefined, "Outer for loop should exist");

    // Find all loops
    const allLoops = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.LOOP &&
                    (n.astNode.type === 'for_statement' || 
                     n.astNode.type === 'while_statement'));
    assert.equal(allLoops.length, 3, "Should have exactly three loops");

    // Find all conditions
    const conditions = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.CONDITION && 
                    n.astNode.type === 'if_statement');
    assert.equal(conditions.length, 3, "Should have exactly 3 conditions");
});

test('Java CFG - Try Catch Finally', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
try {
    x = 1;
    y = 2;
} catch (Exception e) {
    x = -1;
    z = 3;
} finally {
    cleanup();
}
result = x + y;
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    const nodes = Array.from(cfg.nodes.values());

    // Test 1: Verify basic block structure
    const tryBlock = nodes.find(n => n.type === CFGNodeType.TRY);
    const exceptBlock = nodes.find(n => n.type === CFGNodeType.CATCH);
    const finallyBlock = nodes.find(n => n.type === CFGNodeType.FINALLY);

    assert.notEqual(tryBlock, undefined, "Should have a try block");
    assert.notEqual(exceptBlock, undefined, "Should have an except block");
    assert.notEqual(finallyBlock, undefined, "Should have a finally block");

    // Test 2: Verify try block connections
    const lastTryNode = nodes.find(n => 
        n.type === CFGNodeType.TRY_ENDED
    );
    assert.notEqual(lastTryNode, undefined, "Should have last statement in try block");

    // Test 3: Verify try block connects to both except and else
    assert.ok(
        lastTryNode!.successors.some(s => s.type === CFGNodeType.CATCH),
        "Last node in try block should connect to except block"
    );
    assert.ok(
        lastTryNode!.successors.some(s => s.type === CFGNodeType.MERGED),
        "Last node in try block should connect to else block"
    );


    // Test 5: Verify except and else blocks connect to finally
    const lastExceptNode = nodes.find(n => 
        n.type === CFGNodeType.STATEMENT && 
        n.astNode.text.includes('z = 3')
    );
    
    const mergedNode = nodes.find(n => n.type === CFGNodeType.MERGED);
    assert.notEqual(mergedNode, undefined, "Should have a merged node");
    assert.equal(mergedNode!.predecessors.length, 2, "Merged node should have two predecessors (except and else)");
    
    assert.ok(
        lastExceptNode!.successors.some(s => s === mergedNode),
        "Last node in except block should connect to merged node"
    );

    // Test 6: Verify finally block and final result
    const lastFinallyNode = nodes.find(n => 
        n.type === CFGNodeType.STATEMENT && 
        n.astNode.text.includes('cleanup()')
    );
    const resultStatement = nodes.find(n => 
        n.type === CFGNodeType.STATEMENT && 
        n.astNode.text.includes('result = x + y')
    );

    assert.notEqual(lastFinallyNode, undefined, "Should have last node in finally block");
    assert.notEqual(resultStatement, undefined, "Should have result statement");
    assert.ok(
        lastFinallyNode!.successors.some(s => s === resultStatement),
        "Finally block should connect to result statement"
    );
});
