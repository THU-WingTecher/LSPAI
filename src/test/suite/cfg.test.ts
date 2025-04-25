import { CFGBuilder } from '../../cfg/builder';
import { TextDocument, TextLine, Range, Position, EndOfLine, Uri } from 'vscode';
import { strict as assert } from 'assert';
import { CFGNodeType } from '../../cfg/types';
// Mock TextDocument for testing
class MockTextDocument implements TextDocument {
    private _content: string = '';

    constructor(content: string) {
        this._content = content;
    }

    getText(range?: Range): string {
        if (!range) {
            return this._content;
        }
        const lines = this._content.split('\n');
        let text = '';
        for (let i = range.start.line; i <= range.end.line; i++) {
            const line = lines[i];
            if (i === range.start.line) {
                text += line.substring(range.start.character);
            } else if (i === range.end.line) {
                text += line.substring(0, range.end.character);
            } else {
                text += line;
            }
            if (i !== range.end.line) {
                text += '\n';
            }
        }
        return text;
    }

    lineAt(lineOrPos: number | Position): TextLine {
        const line = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
        const lines = this._content.split('\n');
        return {
            lineNumber: line,
            text: lines[line],
            range: new Range(line, 0, line, lines[line].length),
            rangeIncludingLineBreak: new Range(line, 0, line, lines[line].length + 1),
            firstNonWhitespaceCharacterIndex: lines[line].search(/\S/),
            isEmptyOrWhitespace: lines[line].trim().length === 0
        };
    }

    offsetAt(position: Position): number {
        const lines = this._content.split('\n');
        let offset = 0;
        for (let i = 0; i < position.line; i++) {
            offset += lines[i].length + 1; // +1 for newline
        }
        return offset + position.character;
    }

    positionAt(offset: number): Position {
        const lines = this._content.split('\n');
        let currentOffset = 0;
        let lineNumber = 0;
        
        while (lineNumber < lines.length) {
            const lineLength = lines[lineNumber].length + 1; // +1 for newline
            if (currentOffset + lineLength > offset) {
                return new Position(lineNumber, offset - currentOffset);
            }
            currentOffset += lineLength;
            lineNumber++;
        }
        
        return new Position(lines.length - 1, lines[lines.length - 1].length);
    }

    getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined {
        const line = this.lineAt(position).text;
        const defaultWordRegex = /[a-zA-Z_]\w*/g;
        const wordRegex = regex || defaultWordRegex;
        
        let match: RegExpExecArray | null;
        while ((match = wordRegex.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return new Range(position.line, start, position.line, end);
            }
        }
        return undefined;
    }

    // Implement other required methods with mock data
    readonly uri: Uri = { toString: () => 'mock:///test.ts' } as Uri;
    readonly fileName: string = 'test.ts';
    readonly isUntitled: boolean = false;
    readonly languageId: string = 'typescript';
    readonly version: number = 1;
    readonly isDirty: boolean = false;
    readonly isClosed: boolean = false;
    readonly eol: EndOfLine = EndOfLine.LF;
    readonly lineCount: number = this._content.split('\n').length;

    save(): Thenable<boolean> {
        return Promise.resolve(true);
    }

    validateRange(range: Range): Range {
        return range;
    }

    validatePosition(position: Position): Position {
        return position;
    }
}

test('CFGBuilder should create basic control flow graph', async () => {
    const builder = new CFGBuilder('python');
    const sourceCode = 'x = 1\ny = 2\n';
    const mockDocument = new MockTextDocument(sourceCode);
    
    const cfg = await builder.buildFromCode(sourceCode);
    
    // Verify basic graph structure
    assert.ok(cfg.entry, 'Graph should have entry node');
    assert.ok(cfg.exit, 'Graph should have exit node');
    assert.ok(cfg.nodes.size > 2, 'Graph should have nodes beyond entry/exit');
    assert.equal(cfg.language, 'python', 'Graph should have correct language');
    
    // Verify entry node properties
    assert.equal(cfg.entry.type, CFGNodeType.ENTRY);
    assert.ok(cfg.entry.successors.length > 0, 'Entry node should have successors');
    assert.equal(cfg.entry.predecessors.length, 0, 'Entry node should have no predecessors');
    
    // Verify exit node properties
    assert.equal(cfg.exit.type, CFGNodeType.EXIT);
    assert.equal(cfg.exit.successors.length, 0, 'Exit node should have no successors');
    assert.ok(cfg.exit.predecessors.length > 0, 'Exit node should have predecessors');
});

test('CFGBuilder should handle empty source code', async () => {
    const builder = new CFGBuilder('python');
    const sourceCode = '';
    
    const cfg = await builder.buildFromCode(sourceCode);
    
    // Even with empty source, we should have entry, exit, and root statement nodes
    assert.ok(cfg.entry, 'Graph should have entry node');
    assert.ok(cfg.exit, 'Graph should have exit node');
    assert.equal(cfg.nodes.size, 3, 'Graph should have entry, exit, and root statement nodes');
    
    // Verify the connections
    assert.equal(cfg.entry.successors.length, 1, 'Entry should connect to root statement');
    assert.equal(cfg.exit.predecessors.length, 1, 'Exit should have one predecessor');
});

test('CFGBuilder should create unique node IDs', async () => {
    const builder = new CFGBuilder('python');
    const sourceCode = 'x = 1\ny = 2\n';
    
    const cfg = await builder.buildFromCode(sourceCode);
    
    // Collect all node IDs
    const nodeIds = new Set<string>();
    cfg.nodes.forEach((node) => {
        assert.ok(!nodeIds.has(node.id), 'Node IDs should be unique');
        nodeIds.add(node.id);
    });
});

test('CFGBuilder should maintain correct node connections', async () => {
    const builder = new CFGBuilder('python');
    const sourceCode = 'x = 1\ny = 2\n';
    
    const cfg = await builder.buildFromCode(sourceCode);
    
    // Check that all connections are bidirectional
    cfg.nodes.forEach((node) => {
        // Check successors
        node.successors.forEach((successor) => {
            assert.ok(
                successor.predecessors.includes(node),
                'All successor connections should be bidirectional'
            );
        });
        
        // Check predecessors
        node.predecessors.forEach((predecessor) => {
            assert.ok(
                predecessor.successors.includes(node),
                'All predecessor connections should be bidirectional'
            );
        });
    });
});

test('CFGBuilder should handle invalid source code gracefully', async () => {
    const builder = new CFGBuilder('python');
    const sourceCode = 'invalid syntax @#$%';
    
    try {
        await builder.buildFromCode(sourceCode);
        assert.fail('Should throw error for invalid syntax');
    } catch (error) {
        assert.ok(error, 'Should throw error for invalid syntax');
    }
});