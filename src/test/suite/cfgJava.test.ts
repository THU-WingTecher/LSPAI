import { JavaCFGBuilder } from '../../cfg/java';
import { CFGNodeType } from '../../cfg/types';
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

    assert.ok((condition?.astNode as any).conditionNode.text.includes('x > 0'));
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
        n.astNode.childForFieldName('condition')?.text === 'x > 10'
    );
    assert.notEqual(outerCondition, undefined, "Outer condition should exist");

    const nestedCondition = Array.from(cfg.nodes.values()).find(n =>
        n.type === CFGNodeType.CONDITION &&
        n.astNode.childForFieldName('condition')?.text === 'y > 5'
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
        n.astNode.childForFieldName('condition')?.text === 'x > 0'
    );
    assert.notEqual(loop, undefined, "While loop should exist");

    const conditions = Array.from(cfg.nodes.values()).filter(n => n.type === CFGNodeType.CONDITION);
    assert.ok(conditions.length >= 3, "Should have at least 3 conditions");
    const continueStatement = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.CONTINUE);
    assert.notEqual(continueStatement, undefined, "Should have continue statement");
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

    const tryBlock = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.TRY);
    const catchBlock = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.CATCH);
    const finallyBlock = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.FINALLY);

    assert.notEqual(tryBlock, undefined, "Should have a try block");
    assert.notEqual(catchBlock, undefined, "Should have a catch block");
    assert.notEqual(finallyBlock, undefined, "Should have a finally block");

    const mergedNode = Array.from(cfg.nodes.values()).find(n => n.type === CFGNodeType.MERGED);
    assert.notEqual(mergedNode, undefined, "Should have a merged node");
    assert.ok(
        catchBlock!.successors.some(s => s === mergedNode),
        "Catch block should connect to merged node"
    );
    assert.ok(
        finallyBlock!.predecessors.some(p => p === mergedNode),
        "Finally block should connect from merged node"
    );
});

test('Java CFG - Return Statement', async function() {
    const builder = new JavaCFGBuilder('java');
    const code = `
int foo(int x) {
    if (x > 0) {
        return 1;
    }
    return 0;
}
    `;
    const cfg = await builder.buildFromCode(code);
    builder.printCFGGraph(cfg.entry);

    const returnNodes = Array.from(cfg.nodes.values()).filter(n => n.type === CFGNodeType.RETURN);
    assert.equal(returnNodes.length, 2, "Should have two return nodes");
    assert.ok(returnNodes.every(r => r.successors.length === 0 || r.successors[0].type === CFGNodeType.EXIT), "Return nodes should connect to exit or have no successors");
});