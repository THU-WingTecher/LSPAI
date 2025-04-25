import { PythonCFGBuilder } from '../../cfg/python';
import { CFGNodeType } from '../../cfg/types';
import { strict as assert } from 'assert';

test('Python CFG - Simple Statement', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = 'x = 1';
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

test('Python CFG - If Statement', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
if x > 0:
    y = 1
else:
    y = 2
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the condition node
    const condition = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.CONDITION);
    assert.notEqual(condition, undefined);
    assert.notEqual(condition?.trueBlock, undefined);
    assert.notEqual(condition?.falseBlock, undefined);

    // Check the condition node
    assert.ok((condition?.astNode as any).conditionNode.text.includes('x > 0'));

    // Check true branch
    assert.ok(condition?.trueBlock?.astNode.text.includes('y = 1'));
    
    // Check false branch
    assert.ok(condition?.falseBlock?.astNode.text.includes('y = 2'));
});

test('Python CFG - While Loop', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
while x < 10:
    x += 1
x +=2
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the loop node
    const loop = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.LOOP);
    assert.notEqual(loop, undefined);

    const body = loop?.successors[0];
    assert.notEqual(body, undefined);
    assert.equal(body?.type, CFGNodeType.CONDITION);
    assert.equal(body?.successors[0].type, CFGNodeType.BLOCK);
});

test('Python CFG - For Loop', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
for i in range(5):
    print(i)
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the loop node
    const loop = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.LOOP);
    assert.notEqual(loop, undefined);

    // Check loop structure
    const body = loop?.successors[0];
    assert.notEqual(body, undefined);
    assert.equal(body?.type, CFGNodeType.STATEMENT);
    assert.equal(body?.successors[0].type, CFGNodeType.STATEMENT);
});

test('Python CFG - Complex Control Flow', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
def calculate(x):
    if x > 0:
        while x < 10:
            x += 1
            if x == 5:
                break
    return x
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Verify basic structure
    assert.notEqual(cfg.entry, undefined);
    assert.notEqual(cfg.exit, undefined);

    // Find key nodes
    const condition = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.CONDITION);
    const loop = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.LOOP);
    
    assert.notEqual(condition, undefined);
    assert.notEqual(loop, undefined);
    
    // Verify the loop is inside the true branch of the if statement
    assert.notEqual(condition?.trueBlock, undefined);
    assert.equal(loop?.predecessors[0], condition?.trueBlock);
    
    // Verify loop node contains the while statement
    assert.ok(loop?.astNode.text.includes('while x < 10'));
}); 

test('Python CFG - Nested If-Else with Multiple Branches', async function() {
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
    builder.printCFGGraph(cfg.entry);
    // Find the outer if condition (x > 10)
    const outerCondition = Array.from(cfg.nodes.values()).find(n => 
        n.type === CFGNodeType.CONDITION && 
        n.astNode.childForFieldName('condition')?.text === 'x > 10'
    );
    assert.notEqual(outerCondition, undefined, "Outer condition should exist");

    // Find the first nested if condition (y > 5)
    const nestedCondition = Array.from(cfg.nodes.values()).find(n => 
        n.type === CFGNodeType.CONDITION && 
        n.astNode.childForFieldName('condition')?.text === 'y > 5'
    );
    assert.notEqual(nestedCondition, undefined, "Nested condition should exist");

    // Verify the nested condition is not including the outer condition text
    assert.ok(
        !nestedCondition?.astNode.text.includes('x > 10'),
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
        `Nested condition text: ${nestedCondition?.astNode.childForFieldName('condition')?.text}\n` +
        `Outer true block text: ${outerTrueBlock?.astNode.text}`
    );
});
test('Python CFG - Mixed Loop and Condition', async function() {
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
        continue
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the while loop node using the condition expression
    const loop = Array.from(cfg.nodes.values()).find(n => 
        n.type === CFGNodeType.LOOP && 
        n.astNode.childForFieldName('condition')?.text === 'x > 0'
    );
    assert.notEqual(loop, undefined, "While loop should exist");

    // Find conditions inside the loop by their specific expressions
    const conditions = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.CONDITION)
        // .filter(n => {
        //     const condText = n.astNode.childForFieldName('condition')?.text;
        //     return condText === 'y > x' || 
        //            condText === 'y > 10' || 
        //            condText === 'x == 5';
        // });
    assert.equal(conditions.length, 4, "Should have exactly 4 conditions");
    // const nestedConditions = Array.from(cfg.nodes.values())
    //     .filter(n => n.type === CFGNodeType.CONDITION)
    //     .filter(n => {
    //         const condText = n.astNode.childForFieldName('condition')?.text;
    //         return condText === 'y > x' || 
    //                condText === 'y > 10' || 
    //                condText === 'x == 5';
    //     });

    // Verify that conditions are properly nested inside the loop
    // nestedConditions.forEach(condition => {
    //     assert.ok(
    //         condition.predecessors.some(p => p === loop || p.type === CFGNodeType.STATEMENT),
    //         `Condition "${condition.astNode.childForFieldName('condition')?.text}" should be nested under loop or statement`
    //     );
    // });
});

test('Python CFG - Nested Loops with Conditions', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
for i in range(5):
    if i % 2 == 0:
        for j in range(i):
            if j > 2:
                break
            x = x + j
    else:
        while x > 0:
            x = x - 1
            if x == 5:
                continue
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find the outer for loop
    const outerLoop = Array.from(cfg.nodes.values()).find(n => 
        n.type === CFGNodeType.LOOP && 
        n.astNode.type === 'for_statement' &&
        n.astNode.text.includes('range(5)')
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

test('Python CFG - Complex Control Flow with Multiple Paths', async function() {
    const builder = new PythonCFGBuilder('python');
    const code = `
def process_value(x):
    result = 0
    if x > 0:
        while x > 10:
            if x % 2 == 0:
                x = x // 2
            else:
                x = x - 1
            if x == 5:
                break
            for i in range(3):
                if i == x:
                    result += i
                    break
    else:
        for i in range(5):
            if i > 2:
                if x < -5:
                    result -= i
                continue
            result += i
    return result
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);
    // Find all conditions by their AST node type
    const conditions = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.CONDITION && 
                    n.astNode.type === 'if_statement');
    assert.equal(conditions.length, 6, "Should have exactly 6 conditions");

    // Find all loops by their AST node type
    const loops = Array.from(cfg.nodes.values())
        .filter(n => n.type === CFGNodeType.LOOP &&
                    (n.astNode.type === 'for_statement' || 
                     n.astNode.type === 'while_statement'));
    assert.equal(loops.length, 3, "Should have exactly 3 loops");

    // Find the main if condition
    const mainCondition = conditions.find(n => 
        n.astNode.type === 'if_statement' && 
        n.astNode.text.includes('x > 0')
    );
    assert.notEqual(mainCondition, undefined, "Main condition should exist");

    // Verify loop nesting
    loops.forEach(loop => {
        assert.ok(
            loop.predecessors.some(p => p.type === CFGNodeType.CONDITION || 
                                      p.type === CFGNodeType.STATEMENT),
            `Loop should be nested under condition or statement`
        );
    });

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