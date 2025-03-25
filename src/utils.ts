import * as vscode from 'vscode';
import { assert } from 'console';
import { getPackageStatement } from './retrieve';
import { getConfigInstance } from './config';

// patterns.ts

export function testFunc() {
    console.log('checking test');
}

export interface LanguagePatterns {
    [language: string]: string[];
}

export const languageStandardPatterns: LanguagePatterns = {
    java: [
        '/java.',
        '/javax.',
        '/javafx.',
        '/jdk.',
        '/sun.',
        'src.zip',
        '/mockito-core', // For locating the Mockito core library in Maven/Gradle builds
        '/libs/mockito', // If you're storing the mockito jars in a libs folder (adjust based on your project structure)
        '/test/mockito', // If you have test folders that contain mockito-related code
    ],
    python: [
        '/lib/python',
        '/site-packages/',
        '/python3.',
        '/dist-packages/'
    ],
    typescript: [
        '/node_modules/',

        '/typescript/',
        '/@types/'
    ],
    go: [
        '/pkg/',
        '/src/',
        '/vendor/'
    ],
    // Add more languages and their patterns here
};


/**
 * Checks if a given URI corresponds to a standard class/module based on the programming language.
 * @param uri - The URI to check.
 * @param language - The programming language identifier (e.g., 'java', 'python').
 * @returns A boolean indicating whether the URI is a standard class/module.
 */
export function isStandardClass(uri: string, language: string): boolean {
    const decodedUri = decodeURIComponent(uri);
    
    const patterns: string[] | undefined = languageStandardPatterns[language.toLowerCase()];
    
    if (!patterns) {
        console.warn(`No standard patterns defined for language: ${language}`);
        return false;
    }
    
    return patterns.some(pattern => decodedUri.includes(pattern));
}

export async function customExecuteDocumentSymbolProvider(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
	const symbols = await Promise.race([
		vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
			'vscode.executeDocumentSymbolProvider',
			uri
		),
		new Promise<vscode.DocumentSymbol[]>(resolve => setTimeout(() => resolve([]), 5000))
	]);
	return symbols || [];
}

export function parseCode(response: string): string {
    // Regular expression to match code block wrapped by triple backticks, optional `~~`, and language tag
    const regex = /```(?:\w+)?(?:~~)?\s*([\s\S]*?)\s*```/;

    // Match the response against the regular expression
    const match = response.match(regex);

    // If a match is found, return the extracted code
    if (match) {
        return match[1].trim(); // match[1] contains the code inside the backticks
    }

    // If no code block is found, return the original response
    return response.trim();
}

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

/**
 * Retrieves summarized information of a given symbol.
 * For classes, includes constructor information.
 * @param document - The text document containing the symbol.
 * @param symbol - The DocumentSymbol to summarize.
 * @returns A string summarizing the symbol's details.
 */
export function getSymbolDetail(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, getFullInfo: boolean = false): string {
    // symbol.kind >= vscode.SymbolKind.Variable  MEANS that the symbol is a variable, constant, ... other no need to summarize symbols
    // if (symbol.kind >= vscode.SymbolKind.Variable){
    //     return '';
    // }
    let detail = '';
    if (!getConfigInstance().summarizeContext) {
        return removeComments(document.getText(symbol.range));
    }
    // if (getFullInfo && document.getText(symbol.range).split('\n').length < 40 ) {
    //     return removeComments(document.getText(symbol.range));
    // } 
    if (getFullInfo) {
        return removeComments(document.getText(symbol.range));
    } 
    if (symbol.kind === vscode.SymbolKind.Class) {
        // Retrieve the line text where the class is defined
        const packageStatement = getPackageStatement(document, document.languageId);
        detail += packageStatement ? packageStatement[0] + '\n' : '';
        detail += document.lineAt(symbol.selectionRange.start.line).text.trim() + '\n';

        // Initialize an array to hold constructor details
        const constructorsInfo: string[] = [];
        const fieldsInfo: string[] = [];
        let classDetail = '';
        // Check if the class has children symbols
        if (symbol.children && symbol.children.length > 0) {
            // Iterate over the children to find constructors
            for (const childSymbol of symbol.children) {
                // if (!isPublic(childSymbol, document)) {
                //     continue;
                // }
                if (childSymbol.kind === vscode.SymbolKind.Constructor) {
                    // Extract constructor details

                    const constructorDetail = getConstructorDetail(document, childSymbol);
                    if (constructorDetail) {
                        constructorsInfo.push(constructorDetail);
                    }
                }
                if (childSymbol.kind === vscode.SymbolKind.Property || childSymbol.kind === vscode.SymbolKind.Field) {
                    // Extract constructor details
                    const fieldDetail = getFieldDetail(document, childSymbol);
                    if (fieldDetail) {
                        fieldsInfo.push(fieldDetail);
                    }
                }
                if (childSymbol.kind === vscode.SymbolKind.Class) {
                    // Extract constructor details
                    classDetail = getSymbolDetail(document, childSymbol);
                }
            }
        }

        // Append field information if available
        if (fieldsInfo.length > 0) {
            // detail += '\n  Constructors:\n';
            for (const fieldInfo of fieldsInfo) {
                detail += `    ${fieldInfo}\n`;
            }
        }

        // Append constructor information if available
        if (constructorsInfo.length > 0) {
            // detail += '\n  Constructors:\n';
            for (const constructorInfo of constructorsInfo) {
                detail += `    ${constructorInfo}\n`;
            }
        }

        if (classDetail) {
                detail += `    ${classDetail}\n`;
            }
        

    } else if (symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Function) {
        // For methods and functions, include name and detail (e.g., parameters)
        detail = symbol.name;
        if (symbol.detail) {
            detail += ` ${symbol.detail}`;
        }

    // } else if (symbol.kind === vscode.SymbolKind.Property || symbol.kind === vscode.SymbolKind.Field) {
    //     // For properties and fields, retrieve the line text
    //     detail = document.lineAt(symbol.selectionRange.start.line).text.trim();

    } else {
        // For other symbol kinds, retrieve the line text
        detail = document.lineAt(symbol.selectionRange.start.line).text.trim();
    }

    return removeComments(detail);
    ;
}

export function removeComments(code: string): string {
    // Regular expression to match comments in Go, Java, and Python
    const commentRegex = [
        /\/\/[^\n]*\n/g, // Go, Java, Python single-line comments (//...)
        /\/\*[\s\S]*?\*\//g, // Go, Java, Python multi-line comments (/*...*/)
        /'''[\s\S]*?'''/g, // Python triple single-quoted comments
        /"""[\s\S]*?"""/g,  // Python triple double-quoted comments
        /#.*$/gm // Python single-line comments (#...)
    ];

    // Remove comments by replacing them with an empty string
    return commentRegex.reduce((codeWithoutComments, regex) => {
        return codeWithoutComments.replace(regex, '');
    }, code);
}


/**
 * Extracts detailed information for a constructor symbol.
 * @param document - The text document containing the constructor.
 * @param constructorSymbol - The Constructor DocumentSymbol.
 * @returns A string detailing the constructor's signature.
 */
function getConstructorDetail(document: vscode.TextDocument, constructorSymbol: vscode.DocumentSymbol): string | null {
    // Retrieve the line text where the constructor is defined
    return document.getText(constructorSymbol.range);
    if (constructorSymbol.name){
        return constructorSymbol.name;
    } else {
        return document.lineAt(constructorSymbol.selectionRange.start.line).text.trim();
    }
}

/**
 * Extracts detailed information for a constructor symbol.
 * @param document - The text document containing the constructor.
 * @param constructorSymbol - The Constructor DocumentSymbol.
 * @returns A string detailing the constructor's signature.
 */
function getFieldDetail(document: vscode.TextDocument, fieldSymbol: vscode.DocumentSymbol): string | null {
    // Retrieve the line text where the constructor is defined
    return document.getText(fieldSymbol.range);
}

export async function closeActiveEditor(document:vscode.TextDocument){
    // if (document) {
    //     await document.save();
    //     if (document.isDirty) {
    //         await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    //     } else {
    //         await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    //     }
    // }
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

function extractCodeBetweenBackticks(text: string): string[] {
    const codeBlocks: string[] = [];
    const regex = /```(?:\w+)?\n([\s\S]*?)```/g;
    
    let match;
    while ((match = regex.exec(text)) !== null) {
        codeBlocks.push(match[1].trim());
    }
    
    return codeBlocks;
}

export function formatToJSON(input: string): any {
    // Remove any leading/trailing whitespace
    const codeBlocks = extractCodeBetweenBackticks(input);
    if (codeBlocks.length > 0) {
        return JSON.parse(codeBlocks[0]);
    }
    let cleanInput = input.trim();

    // If the input is wrapped in markdown code blocks, remove them
    cleanInput = cleanInput.replace(/^```[a-z]*\n|\n```$/g, '');

    // Handle escaped characters
    const unescapeString = (str: string): string => {
        return str
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/\\\\/g, '\\');
    };

    try {
        // First attempt: direct JSON parse
        return JSON.parse(cleanInput);
    } catch (e) {
        try {
            // Second attempt: Handle escaped JSON strings
            return JSON.parse(unescapeString(cleanInput));
        } catch (e2) {
            try {
                // Third attempt: Handle single-quoted JSON
                const doubleQuoted = cleanInput.replace(/'/g, '"');
                return JSON.parse(doubleQuoted);
            } catch (e3) {
                try {
                    // Fourth attempt: Handle literal string representation
                    // For cases like "{\n  \"key\": \"value\"\n}"
                    const evaluated = eval(`(${cleanInput})`);
                    if (typeof evaluated === 'object') {
                        return evaluated;
                    }
                    throw new Error('Evaluated result is not an object');
                } catch (e4) {
                    // Final attempt: Try to extract JSON-like structure
                    const jsonMatch = cleanInput.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            return JSON.parse(jsonMatch[0]);
                        } catch (e5) {
                            throw new Error(`Failed to parse JSON after all attempts: ${e5}`);
                        }
                    }
                    throw new Error('No valid JSON structure found in input');
                }
            }
        }
    }
}



export function extractArrayFromJSON(jsonContent: any): any[] {
    // If it's already an array, return it
    if (Array.isArray(jsonContent)) {
        return jsonContent;
    }
    
    // If it's an object with a single key containing an array
    if (typeof jsonContent === 'object' && jsonContent !== null) {
        const values = Object.values(jsonContent);
        if (values.length === 1 && Array.isArray(values[0])) {
            return values[0];
        }
    }
    
    // If neither format matches, return empty array
    return [];
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


function isPublic(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): boolean {
    const funcDefinition = document.lineAt(symbol.selectionRange.start.line).text;
    return funcDefinition.includes('public') || false;
}