import * as vscode from 'vscode';
import { assert } from 'console';

export function getFunctionSymbol(symbols: vscode.DocumentSymbol[], functionPosition: vscode.Position): vscode.DocumentSymbol | null {
	for (const symbol of symbols) {
		if (symbol.children.length > 0) {
			const innerSymbol = getFunctionSymbol(symbol.children, functionPosition);
			if (innerSymbol) {
				return innerSymbol;
			}
		}
		if (symbol.range.contains(functionPosition)) {
			return symbol;
		}
	}
	return null;
}

export function getFunctionSymbolWithItsParents(symbols: vscode.DocumentSymbol[], functionPosition: vscode.Position): vscode.DocumentSymbol[] {
    const result: vscode.DocumentSymbol[] = [];

    function findSymbolWithParents(symbols: vscode.DocumentSymbol[], functionPosition: vscode.Position, parents: vscode.DocumentSymbol[]): boolean {
        for (const symbol of symbols) {
            const currentParents = [...parents, symbol];
            if (symbol.children.length > 0) {
                if (findSymbolWithParents(symbol.children, functionPosition, currentParents)) {
                    return true;
                }
            }
            if (symbol.range.contains(functionPosition)) {
                result.push(...currentParents);
                return true;
            }
        }
        return false;
    }

    findSymbolWithParents(symbols, functionPosition, []);
    return result;
}

export async function getHover(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): Promise<vscode.Hover | undefined> {
    const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        symbol.selectionRange.start
    );
    if (hover && hover.length > 0) {
        return hover[0];
}
}

export function getSymbolDetail(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): string {
    let detail = symbol.name;
    if (symbol.kind === vscode.SymbolKind.Class) {
        // class
        detail = document.lineAt(symbol.selectionRange.start.line).text;
    } else if (symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Function) {
        detail = symbol.name;
        detail += symbol.detail ? ' ' + symbol.detail : '';
    } else if (symbol.kind === vscode.SymbolKind.Property || symbol.kind === vscode.SymbolKind.Field) {
        detail = document.lineAt(symbol.selectionRange.start.line).text;
    } else {
        detail = document.lineAt(symbol.selectionRange.start.line).text;
    }
    return detail;
}


export function isValidFunctionSymbol(functionSymbol: vscode.DocumentSymbol): boolean {
	if (!functionSymbol.name) {
		vscode.window.showErrorMessage('Function symbol has no name!');
		return false;
	}
	if (!functionSymbol.range) {
		vscode.window.showErrorMessage('Function symbol has no range!');
		return false;
	}
	return true;
}



// type UseMap = Map<vscode.DocumentSymbol, Array<vscode.Location>>;
// type DefMap = Map<vscode.DocumentSymbol, vscode.Location | null>;

// return the use-def information of every variable in the function
// async function getUseDefInfo(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol): Promise<[UseMap, DefMap]> {
// 	const useMap = new Map<vscode.DocumentSymbol, Array<vscode.Location>>();
// 	const defMap = new Map<vscode.DocumentSymbol, vscode.Location | null>();


// 	for (const child of functionSymbol.children) {
// 		console.log('Child kind:', child.kind);
// 		if (child.kind === vscode.SymbolKind.Variable) {
// 			console.log('Function: ', functionSymbol.name, 'Variable: ', child.name);

// 			const childPosition = new vscode.Position(child.range.start.line, child.range.start.character);
// 			const references = await vscode.commands.executeCommand<vscode.Location[]>(
// 				'vscode.executeReferenceProvider',
// 				document.uri,
// 				childPosition
// 			);
// 			if (references) {
// 				useMap.set(child, references);
// 			} else {
// 				useMap.set(child, []);
// 			}

// 			const definition = await vscode.commands.executeCommand<vscode.Location>(
// 				'vscode.executeDefinitionProvider',
// 				document.uri,
// 				childPosition
// 			);
// 			if (definition) {
// 				defMap.set(child, definition);
// 			} else {
// 				defMap.set(child, null);
// 			}
// 		}
// 	}
// 	return [useMap, defMap];
// }



async function getFunctionNameWithLSP(editor: vscode.TextEditor, position: vscode.Position): Promise<string | null> {
    // 调用内置 LSP 客户端，获取光标下的定义
    const definitions = await vscode.commands.executeCommand<vscode.Location[] | vscode.LocationLink[]>(
        'vscode.executeDefinitionProvider',
        editor.document.uri,
        position
    );

    if (!definitions || definitions.length === 0) {
        vscode.window.showErrorMessage('No function definition found!');
        return null;
    }
    if (definitions.length > 1) {
        vscode.window.showErrorMessage('Multiple function definitions found!');
        return null;
    }
    assert(definitions.length === 1);

    var functionNameRange = null;
    if ((definitions[0] as vscode.Location).range !== undefined) {
        functionNameRange = (definitions[0] as vscode.Location).range;
    } else if ((definitions[0] as vscode.LocationLink).targetRange !== undefined) {
        functionNameRange = (definitions[0] as vscode.LocationLink).targetSelectionRange;
    } else {
        vscode.window.showErrorMessage('No function range found!');
        return null;
    }

    // 获取函数签名等信息
    return editor.document.getText(functionNameRange);
}

export function isFunctionSymbol(symbol: vscode.DocumentSymbol): boolean {
    return symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method;
}

// function findParametersOfFunction(defMap: DefMap): Array<vscode.DocumentSymbol> {
// 	const parameters: Array<vscode.DocumentSymbol> = [];
// 	for (const [symbol, definition] of defMap) {
// 		if (definition === null) {
// 			parameters.push(symbol);
// 		}
// 	}
// 	return parameters;
// }

