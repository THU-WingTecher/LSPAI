import { LspDocument, LspPosition, LspRange } from './coreTypes';

export interface TextLine {
    text: string;
    range: LspRange;
}

export interface TextIndex {
    text: string;
    lineOffsets: number[];
    lineCount: number;
    offsetAt(position: LspPosition): number;
    lineAt(line: number): TextLine;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function createTextIndex(document: LspDocument): TextIndex {
    const text = document.getText();
    const lineOffsets: number[] = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
            lineOffsets.push(i + 1);
        }
    }
    const lineCount = lineOffsets.length;

    function offsetAt(position: LspPosition): number {
        const line = clamp(position.line, 0, lineCount - 1);
        const lineOffset = lineOffsets[line];
        const nextOffset = line + 1 < lineOffsets.length ? lineOffsets[line + 1] : text.length;
        const lineLength = nextOffset - lineOffset;
        const character = clamp(position.character, 0, lineLength);
        return lineOffset + character;
    }

    function lineAt(lineInput: number): TextLine {
        const line = clamp(lineInput, 0, lineCount - 1);
        const lineOffset = lineOffsets[line];
        const nextOffset = line + 1 < lineOffsets.length ? lineOffsets[line + 1] : text.length;
        let lineText = text.slice(lineOffset, nextOffset);
        if (lineText.endsWith('\n')) {
            lineText = lineText.slice(0, -1);
        }
        if (lineText.endsWith('\r')) {
            lineText = lineText.slice(0, -1);
        }
        const endChar = lineText.length;
        return {
            text: lineText,
            range: {
                start: { line, character: 0 },
                end: { line, character: endChar }
            }
        };
    }

    return {
        text,
        lineOffsets,
        lineCount,
        offsetAt,
        lineAt
    };
}
