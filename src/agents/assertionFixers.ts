import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExaminationResult } from "../ut_runner/types";
import { getAllSymbols } from "../lsp/symbol";
import { getDiagnosticsForUri, applyCodeActions } from "../lsp/diagnostic";
import { getCodeAction } from "../lsp/codeaction";
import { activate, getPythonExtraPaths, setPythonExtraPaths } from "../lsp/helper";

export async function fixImportErrors(sourceFilePath: string, testfilePath: string, examinationResult: ExaminationResult, outputPath?: string): Promise<string> {
    console.log(`[fixImportErrors] Starting: ${path.basename(testfilePath)}, ${examinationResult.redefinedSymbols.length} redefined symbols`);

    let testDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(testfilePath));
    let testSymbols = await getAllSymbols(testDocument.uri);

    const workspaceEdit = new vscode.WorkspaceEdit();
    const symbolsToDelete: vscode.DocumentSymbol[] = [];

    for (const redefinedSymbol of examinationResult.redefinedSymbols) {
        const matchingSymbols = testSymbols.filter(s => s.name === redefinedSymbol.name);
        if (matchingSymbols.length > 0) {
            symbolsToDelete.push(...matchingSymbols);
        } else {
            console.log(`[fixImportErrors] Warning: Could not find symbol '${redefinedSymbol.name}' in test document`);
        }
    }

    const uniqueSymbols = new Map<string, vscode.DocumentSymbol>();
    for (const symbol of symbolsToDelete) {
        const selectionRange = symbol.selectionRange || symbol.range;
        const rangeKey = `${symbol.name}-${selectionRange.start.line}:${selectionRange.start.character}-${selectionRange.end.line}:${selectionRange.end.character}`;
        if (!uniqueSymbols.has(rangeKey)) {
            uniqueSymbols.set(rangeKey, symbol);
        }
    }
    
    const deduplicatedSymbols = Array.from(uniqueSymbols.values());
    
    const deletionRanges: vscode.Range[] = [];
    
    const computeDeletionRange = (symbol: vscode.DocumentSymbol): vscode.Range | null => {
        const startLine = symbol.range.start.line;
        const endLine = symbol.range.end.line;
        const startLineText = testDocument.lineAt(startLine).text;
        const endLineText = testDocument.lineAt(endLine).text;
        
        if (startLine === endLine) {
            const lineStart = new vscode.Position(startLine, 0);
            const lineEnd = new vscode.Position(startLine, startLineText.length);
            const trimmedLine = startLineText.trim();
            const symbolText = testDocument.getText(symbol.range).trim();
            
            if (trimmedLine === symbolText || trimmedLine.startsWith(symbolText)) {
                if (startLine < testDocument.lineCount - 1) {
                    const nextLineStart = new vscode.Position(startLine + 1, 0);
                    return new vscode.Range(lineStart, nextLineStart);
                }
                return new vscode.Range(lineStart, lineEnd);
            }
            
            if (symbol.range.start.isBefore(symbol.range.end) || symbol.range.start.isEqual(symbol.range.end)) {
                return symbol.range;
            }
            
            console.warn(`[fixImportErrors] Invalid symbol range for ${symbol.name}, skipping deletion`);
            return null;
        }
        
        const startPos = new vscode.Position(startLine, 0);
        const endPos = endLine < testDocument.lineCount - 1
            ? new vscode.Position(endLine + 1, 0)
            : new vscode.Position(endLine, endLineText.length);
        
        if (startPos.isBefore(endPos) || startPos.isEqual(endPos)) {
            return new vscode.Range(startPos, endPos);
        }
        
        console.warn(`[fixImportErrors] Invalid range for multi-line symbol ${symbol.name}, skipping deletion`);
        return null;
    };
    
    for (const symbol of deduplicatedSymbols) {
        const range = computeDeletionRange(symbol);
        if (range) {
            deletionRanges.push(range);
        }
    }
    
    const mergeRanges = (ranges: vscode.Range[]): vscode.Range[] => {
        if (ranges.length === 0) return [];
        
        const sorted = [...ranges].sort((a, b) => {
            if (a.start.line !== b.start.line) {
                return a.start.line - b.start.line;
            }
            return a.start.character - b.start.character;
        });
        
        const merged: vscode.Range[] = [];
        let current = sorted[0];
        
        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            if (next.start.isBeforeOrEqual(current.end)) {
                // Extend the current range if needed
                if (next.end.isAfter(current.end)) {
                    current = new vscode.Range(current.start, next.end);
                }
            } else {
                merged.push(current);
                current = next;
            }
        }
        
        merged.push(current);
        return merged;
    };
    
    const mergedRanges = mergeRanges(deletionRanges);
    
    for (const range of mergedRanges) {
        workspaceEdit.delete(testDocument.uri, range);
    }

    const saveAndReturn = (code: string, outputPath?: string): string => {
        if (outputPath) {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, code, 'utf-8');
        }
        return code;
    };

    if (mergedRanges.length > 0) {
        const success = await vscode.workspace.applyEdit(workspaceEdit);
        if (!success) {
            console.error('[fixImportErrors] Failed to apply workspace edit for deleting symbols');
            return saveAndReturn(testDocument.getText(), outputPath);
        }
        
        const updatedDocument = await vscode.workspace.openTextDocument(testDocument.uri);
        testDocument = updatedDocument;
    }

    if (testDocument.languageId === 'python') {
        const sourceDir = path.dirname(sourceFilePath);
        const testDir = path.dirname(testfilePath);
        const currentExtraPaths = await getPythonExtraPaths();
        const pathsToAdd: string[] = [];
        
        if (!currentExtraPaths.includes(sourceDir)) {
            pathsToAdd.push(sourceDir);
        }
        if (!currentExtraPaths.includes(testDir)) {
            pathsToAdd.push(testDir);
        }
        
        if (pathsToAdd.length > 0) {
            await setPythonExtraPaths([...currentExtraPaths, ...pathsToAdd]);
        }
    }
    
    await activate(testDocument.uri);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const diagnostics = await getDiagnosticsForUri(testDocument.uri);

    if (diagnostics.length === 0) {
        return saveAndReturn(testDocument.getText(), outputPath);
    }
    
    const importRelatedDiagnostics = diagnostics.filter(d => 
        d.message.includes('undefined') || 
        d.message.includes('not defined') ||
        d.message.includes('import') ||
        d.message.includes('cannot be resolved') ||
        d.message.includes('cannot find symbol')
    );

    if (importRelatedDiagnostics.length === 0) {
        return saveAndReturn(testDocument.getText(), outputPath);
    }
    
    const uniqueActions = new Map<string, vscode.CodeAction>();
    for (const diagnostic of importRelatedDiagnostics) {
        const codeActions = await getCodeAction(testDocument.uri, diagnostic);
        for (const action of codeActions) {
            if (!uniqueActions.has(action.title)) {
                uniqueActions.set(action.title, action);
            }
        }
    }
    
    const allCodeActions = Array.from(uniqueActions.values());
    
    if (allCodeActions.length === 0) {
        return saveAndReturn(testDocument.getText(), outputPath);
    }
    
    try {
        const fixedCode = await applyCodeActions(testDocument.uri, allCodeActions, testDocument);
        return saveAndReturn(fixedCode, outputPath);
    } catch (error) {
        console.warn('[fixImportErrors] Failed to apply code actions:', error);
        return saveAndReturn(testDocument.getText(), outputPath);
    }
}