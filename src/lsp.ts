/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import { customExecuteDocumentSymbolProvider } from './utils';
import { sleep } from './helper';
export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

export async function closeEditor(editor: vscode.TextEditor) {
    editor.edit(editBuilder => {
        editBuilder.delete(new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(editor.document.lineCount, 0)
        ));
    }).then(() => {
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
}

export async function getSymbolByLocation(document: vscode.TextDocument, location: vscode.Position): Promise<vscode.DocumentSymbol | null> {
    const symbols = await getAllSymbols(document.uri);
    const shortestSymbol = getShortestSymbol(symbols, new vscode.Range(location, location));
    if (shortestSymbol) {
        return shortestSymbol;
    }
    return null;
}
/**
 * Activates the vscode.lsp-sample extension
 */
export async function activate(docUri: vscode.Uri | undefined = undefined) {
	// The extensionId is `publisher.name` from package.json
	const ext = vscode.extensions.getExtension('GwihwanGo.LSPAI');
	if (!ext) {
		throw new Error('Extension not found');
	}	
	await ext.activate();
    console.log("activate docUri", docUri);
	if (docUri) {
		try {
			doc = await vscode.workspace.openTextDocument(docUri);
			// editor = await vscode.window.showTextDocument(doc);
			await sleep(2000); // Wait for server activation
		} catch (e) {
			console.error(e);
		}
	}
}


export const getDocPath = (p: string) => {
	return path.resolve(__dirname, '../manual-testing-sandbox', p);
};
export const getDocUri = (p: string) => {
	return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
	const all = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length)
	);
	return editor.edit(eb => eb.replace(all, content));
}

export async function getReference(symbol: vscode.DocumentSymbol): Promise<string> {
    const reference = symbol.children.find(child => child.name === 'Reference');
    if (reference) {
        return reference.children[0].name;
    }
    return '';
}

export async function getAllSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
    const allSymbols: vscode.DocumentSymbol[] = [];
    // console.log("sending request to get all symbols");
    const symbols = await customExecuteDocumentSymbolProvider(uri);
    // console.log(`uri = ${uri}, symbols = ${symbols}`);
    function collectSymbols(symbols: vscode.DocumentSymbol[]) {
        // console.log("collecting...")
        for (const symbol of symbols) {
            allSymbols.push(symbol);
            if (symbol.children.length > 0) {
                collectSymbols(symbol.children);
            }
        }
    }

    if (symbols) {
        collectSymbols(symbols);
    }

    return allSymbols;
}

export function getShortestSymbol(symbols: vscode.DocumentSymbol[], range: vscode.Range): vscode.DocumentSymbol | null {
    let shortestSymbol: vscode.DocumentSymbol | null = null;
    for (const symbol of symbols) {
        if (symbol.range.contains(range)) {
            if (!shortestSymbol || (symbol.range.end.line - symbol.range.start.line) < (shortestSymbol.range.end.line - shortestSymbol.range.start.line)) {
                shortestSymbol = symbol;
            }
        }
    }
    return shortestSymbol;
}

