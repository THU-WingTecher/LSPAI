import * as vscode from 'vscode';
import { DecodedToken, getSymbolKindString } from './token';
import { getSymbolDetail, isStandardClass, removeComments } from './utils';
import { getAllSymbols, getOuterSymbols } from './lsp';
import path from 'path';
import { getConfigInstance, Configuration } from './config';
import { genPythonicSrcImportStatement } from './helper';
export function getSourcCodes(document: vscode.TextDocument, functionSymbol: vscode.DocumentSymbol): string {
    const functionRange = functionSymbol.range;
    const text = document.getText(functionRange);
    return removeComments(text);
}

export function getReturnTokens(
    document: vscode.TextDocument,
    DefUseMap: DecodedToken[],
    functionSymbol: vscode.DocumentSymbol
): DecodedToken[] {
    const returnedTokens: DecodedToken[] = [];
    
    // Get the document text within the function's range
    const functionRange = functionSymbol.range;
    const text = document.getText(functionRange);
    
    // Split the function text into lines
    const lines = text.split('\n');
    
    // Iterate through each line to find return statements
    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i].trim();
        
        // Check if the line starts with 'return'
        if (lineText.startsWith('return')) {
            // Extract the returned expression
            const returnExpression = lineText.substring(6).trim().replace(';', '');
            
            // Handle multiple return variables (if any)
            const variables = returnExpression.split(',').map(varName => varName.trim());
            
            for (const varName of variables) {
                // Handle cases like 'new Var1()', 'Var1.method()', etc.
                // Extract the variable name using regex
                const match = varName.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
                if (match && match[1]) {
                    const cleanVarName = match[1];
                    
                    // Find the corresponding token in DefUseMap
                    const token = DefUseMap.find(t => t.word === cleanVarName);
                    
                    if (token) {
                        returnedTokens.push(token);
                    } else {
                        // Handle cases where the variable is not found in DefUseMap
                        console.log(`Variable "${cleanVarName}" returned but not found in DefUseMap.`);
                    }
                }
            }
        }
    }
    
    return returnedTokens;
}

export async function getMethodOrFunctionsParamTokens(document: vscode.TextDocument, DefUseMap: DecodedToken[], functionSymbol: vscode.DocumentSymbol): Promise<DecodedToken[]> {
    
    const functionSignature = functionSymbol.name;
    const methodOrFunctionParamTokens: DecodedToken[] = [];
    for (const token of DefUseMap) {
        if (functionSignature.includes(token.word) && token.type === 'parameter') {
            methodOrFunctionParamTokens.push(token);
        }
    }
    return methodOrFunctionParamTokens;
}

/**
 * Traverses the tokenMap to load definitions and handle tokens without definitions
 * @param tokenMap - Map containing tokens grouped by URI
 * @returns Processed tokens with their definitions
 */
export async function processTokenDefinitions(tokenMap: Map<string, DecodedToken[]>): Promise<Map<string, DecodedToken[]>> {
    const processedMap = new Map<string, DecodedToken[]>();
    
    // Iterate through each URI in the tokenMap
    for (const [uri, tokens] of tokenMap.entries()) {
        console.log(`Processing tokens for URI: ${uri}`);
        const symbols = await getAllSymbols(vscode.Uri.parse(uri));
        const validTokens: DecodedToken[] = [];
        
        // Process each token in the current URI
        for (const token of tokens) {
            try {
                // Try to open the document containing the token
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
                const defSymbol = symbols.find(s => s.range.contains(new vscode.Position(token.line, token.startChar))) || null;
                if (defSymbol) {
                    token.defSymbol = defSymbol;
                    // 1. Load its definition and code using getSymbolDetail
                    const symbolDetail = await getSymbolDetail(document, token.defSymbol!, true);
                    token.context = symbolDetail;
                    validTokens.push(token);
                } else {
                    console.log(`No symbol found for token: ${token.word} in ${uri}`);
                }
            } catch (error) {
                // Handle errors during processing
                console.error(`Error processing token ${token.word} in ${uri}:`, error);
                // 2. Log error and remove from data structure
                console.log(`Removing token due to error: ${token.word} in ${uri}`);
            }
        }
        
        // Only add to processed map if there are valid tokens
        if (validTokens.length > 0) {
            processedMap.set(uri, validTokens);
        }
    }
    
    console.log(`Processed ${processedMap.size} URIs with valid definitions`);
    return processedMap;
}

// Usage example:
// const tokenMap = await classifyTokenByUri(document, DefUseMap);
// console.log('collectinfo::tokenMap', Array.from(tokenMap.values()).map(t => t.map(t => t.word)));
// const processedTokenMap = await processTokenDefinitions(tokenMap);

export async function getDependentContext(
    document: vscode.TextDocument,
    DefUseMap: DecodedToken[],
    functionSymbol: vscode.DocumentSymbol,
    summarizeContext: boolean = true // New parameter with default value
): Promise<DpendenceAnalysisResult> { 

    // const uniqueTokensMap = new Map<string, DecodedToken>();
    // // console.log('collectinfo::DefUseMap', DefUseMap);
    // for (const token of DefUseMap) {
    //     if (!uniqueTokensMap.has(token.id)) {
    //         uniqueTokensMap.set(token.id, token);
    //     }
    // }
    // const uniqueTokens = Array.from(uniqueTokensMap.values());
    // // console.log('collectinfo::uniqueTokens', uniqueTokens);
    // // Collect dependencies for all unique tokens in parallel
    // const dependenciesArrays = await Promise.all(uniqueTokens.map(token => 
    //     followSymbolDataFlowAndCollectDependency(document, DefUseMap, functionSymbol, token)
    // ));
    // // console.log('collectinfo::dependenciesArrays', dependenciesArrays);
    // // Flatten the array of dependencies
    // const dependenciesArray = dependenciesArrays.flat();

    // const uniqueDependenciesMap = new Map<string, DecodedToken>();
    // // console.log('collectinfo::DefUseMap', DefUseMap);
    // for (const token of dependenciesArray) {
    //     if (!uniqueDependenciesMap.has(token.id)) {
    //         uniqueDependenciesMap.set(token.id, token);
    //     }
    // }
    // // Classify tokens by URI and generate the hierarchy
    // const uniqueDependencies = Array.from(uniqueDependenciesMap.values());
    // const uniqueDependenciesWithDef = await retrieveDef(document, DefUseMap, true);
    const tokenMap = await classifyTokenByUri(document, DefUseMap);
    console.log('collectinfo::tokenMap', Array.from(tokenMap.values()).map(t => t.map(t => t.word)));
    // Use the summarizeContext parameter to determine whether to summarize or provide full context
    const processedTokenMap = await processTokenDefinitions(tokenMap);
    const result = await processAndGenerateHierarchy(document, functionSymbol, processedTokenMap);
    // console.log('collectinfo::result', result);
    return result;
}

interface ParentDefinition {
    parent: vscode.DocumentSymbol;
    uri: string;
    children: ParentDefinition[];
}
function generateSymbolKey(symbol: vscode.DocumentSymbol): string {
    const { start, end } = symbol.selectionRange;
    return `${symbol.name}-${start.line}:${start.character}-${end.line}:${end.character}`;
}
/**
 * Maps filtered DocumentSymbols into ParentDefinition structures.
 * 
 * @param rootSymbols - The root DocumentSymbols of the document.
 * @param filteredSymbols - The list of filtered DocumentSymbols to map.
 * @param uri - The URI of the document containing the symbols.
 * @returns An array of ParentDefinition objects representing the hierarchical mapping.
 */
function mapFilteredSymbols(
    rootSymbols: vscode.DocumentSymbol[],
    filteredSymbols: vscode.DocumentSymbol[],
    uri: string
): ParentDefinition[] {
    // Map to store child symbol -> parent symbol
    const symbolToParentMap = new Map<string, vscode.DocumentSymbol>();

    /**
     * Recursively traverses the symbol tree to populate symbolToParentMap.
     * 
     * @param symbols - The current list of symbols to traverse.
     * @param parent - The parent symbol of the current symbols.
     */
    function traverseSymbols(symbols: vscode.DocumentSymbol[], parent: vscode.DocumentSymbol | null = null) {
        for (const symbol of symbols) {
            if (parent) {
                symbolToParentMap.set(generateSymbolKey(symbol), parent);
            }
            if (symbol.children && symbol.children.length > 0) {
                traverseSymbols(symbol.children, symbol);
            }
        }
    }

    // Initialize traversal from root symbols
    traverseSymbols(rootSymbols);

    // Map to group filtered symbols by their immediate parent
    const parentGroupedMap = new Map<vscode.DocumentSymbol | null, vscode.DocumentSymbol[]>();

    for (const filteredSymbol of filteredSymbols) {
        const symbolKey = generateSymbolKey(filteredSymbol);
        const parent = symbolToParentMap.get(symbolKey);
        if (parent) {
            if (!parentGroupedMap.has(parent)) {
                parentGroupedMap.set(parent, []);
            }
            parentGroupedMap.get(parent)!.push(filteredSymbol);
        } else {
            // Handle symbols without a parent (i.e., root symbols)
            if (!parentGroupedMap.has(null)) {
                parentGroupedMap.set(null, []);
            }
            parentGroupedMap.get(null)!.push(filteredSymbol);
        }
    }

    const parentDefinitions: ParentDefinition[] = [];

    for (const [parent, children] of parentGroupedMap.entries()) {
        if (parent) {
            const parentDef: ParentDefinition = {
                parent: parent,
                uri: uri, // Assuming all symbols share the same URI
                children: children.map(child => ({
                    parent: child,
                    uri: uri,
                    children: [] // Assuming children do not have further filtered descendants
                }))
            };
            parentDefinitions.push(parentDef);
        } else {
            // Handle root-level filtered symbols
            children.forEach(child => {
                const parentDef: ParentDefinition = {
                    parent: child,
                    uri: uri,
                    children: [] // No further children
                };
                parentDefinitions.push(parentDef);
            });
        }
    }

    return parentDefinitions;
}

function isInWorkspace(uriString: string): boolean {
    if (uriString) {
        if (Configuration.isTestingEnvironment() || Configuration.isExperimentEnvironment()) {
            const srcPath = vscode.Uri.parse(getConfigInstance().workspace);
            // console.log('collectinfo::isInWorkspace', uriString, getConfigInstance().srcPath);
            // console.log(vscode.Uri.parse(getConfigInstance().srcPath).fsPath);
            // console.log(vscode.Uri.parse(getConfigInstance().srcPath));
            return uriString.startsWith(srcPath.toString());
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            return workspaceFolders.some(folder => uriString.startsWith(folder.uri.toString()));
        }
    }
    return false;
}

export async function classifyTokenByUri(document: vscode.TextDocument, DefUseMap: DecodedToken[]): Promise<Map<string, DecodedToken[]>> {
    // Get all definitions from DefUseMap, but we retreive the method and definition together
    // Define the structure for ParentDefinition
    const tokenMap = new Map<string, DecodedToken[]>();

    for (const token of DefUseMap) {
        // console.log('collectinfo::token', token);
        const uri = token.definition?.[0]?.uri.toString();
        // console.log('collectinfo::uri', uri);
        // console.log('collectinfo::isInWorkspace', isInWorkspace(uri));
        if (uri && isInWorkspace(uri)) {
            // console.log('collectinfo::uri and isInWorkspace', uri, isInWorkspace(uri));
            if (!tokenMap.has(uri)) {
                tokenMap.set(uri, []);
            }
            const tokens = tokenMap.get(uri)!;
            // console.log('collectinfo::tokens', tokens);
            try {
                if (token.line !== undefined && token.startChar !== undefined) {
                    if (!tokens.some(t => t.line === token.line && t.startChar === token.startChar)) {
                        tokens.push(token);
                    }
                } else {
                    console.error(`Token has undefined line or startChar: ${JSON.stringify(token)}`);
                }
            } catch (error) {
                console.error(`Error processing token: ${JSON.stringify(token)}`, error);
            }

        } else {
            console.log(`collectinfo::${token.word} is not in workspace: ${uri}`);
        }
    }
    return tokenMap;
}

/**
 * Retrieves definitions by mapping tokens to their parent symbols.
 * Ensures that standalone parents are not created if they have children.
 * @param tokenMap - A map of URIs to arrays of Tokens.
 * @param DefUseMap - An array of Tokens representing definitions and usages.
 * @returns An array of ParentDefinition objects without redundancies.
 */
export async function constructSymbolRelationShip(
    tokenMap: Map<string, DecodedToken[]>,
): Promise<ParentDefinition[]> {
    // Initialize an array to hold all ParentDefinitions
    const parentToChildrenMap: ParentDefinition[] = [];

    // Cache symbols per URI to avoid redundant retrievals
    const symbolsCache = new Map<string, vscode.DocumentSymbol[]>();

    // Process each URI in the tokenMap
    for (const uri of tokenMap.keys()) {
        const documentUri = vscode.Uri.parse(uri);

        // Retrieve and cache symbols if not already cached
        if (!symbolsCache.has(uri)) {
            const allSymbols = await getAllSymbols(documentUri);
            const tokens = tokenMap.get(uri)!;

            // Filter symbols based on the provided tokens
            const filteredSymbols = allSymbols.filter(symbol => 
                tokens.some(token => symbol.range.contains(token.definition[0].range))
            );

            symbolsCache.set(uri, filteredSymbols);
        }

        // Retrieve the filtered symbols for the current URI
        const symbolsNotMapped = symbolsCache.get(uri)!;

        // Get the outermost symbols (e.g., top-level classes)
        const outerSymbols = await getOuterSymbols(documentUri);

        // Map the filtered symbols to ParentDefinition objects
        let mapped : ParentDefinition[] = [];
        try {
            mapped = mapFilteredSymbols(outerSymbols, symbolsNotMapped, uri);
        } catch {
            console.error(`Error mapping symbols for URI ${uri}`);
        }

        // Add the mapped ParentDefinitions to the main array
        parentToChildrenMap.push(...mapped);
    }

    /**
     * At this point, parentToChildrenMap may contain:
     * - ParentDefinitions with children
     * - ParentDefinitions without children
     * 
     * We need to eliminate ParentDefinitions without children if their parent has children.
     */

    // Step 1: Identify all parents that have children
    const parentsWithChildren = new Set<string>();

    for (const parentDef of parentToChildrenMap) {
        if (parentDef.children && parentDef.children.length > 0) {
            // Assuming 'uri' uniquely identifies a parent
            parentsWithChildren.add(parentDef.uri);
        }
    }

    // Step 2: Filter out standalone parents if they exist in parentsWithChildren
    const uniqueParentToChildrenMap: ParentDefinition[] = parentToChildrenMap.filter(parentDef => {
        if (parentDef.children && parentDef.children.length > 0) {
            // Keep ParentDefinitions that have children
            return true;
        } else {
            // Exclude standalone parents if they are already listed as having children
            return !parentsWithChildren.has(parentDef.uri);
        }
    });

    return uniqueParentToChildrenMap;
}

function getPackageOrUri(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): string {
    return symbol.name;
    // const packageStatement = getpackageStatement(document);
    // if (packageStatement) {
    //     // Extract the package name
    //     // exclude package name and leading/trailing whitespace
    //     return packageStatement[0];
    // }
    // return document.uri.toString();
}

export interface DpendenceAnalysisResult {
    dependencies: string[];
    mainFunctionDependencies: string[];
    mainfunctionParent: string[]; // Replace with the actual type
}
    /**
     * Recursively processes a ParentDefinition and its children to build the hierarchy string.
     * 
     * @param def - The current ParentDefinition to process.
     * @param indent - The current indentation level for formatting.
     * @returns A string representing the processed hierarchy.
     */
    export async function processParentDefinition(def: ParentDefinition, indent: string = '', context: string = "dependent", getFullInfo: boolean = false): Promise<string[]> {
        try {
            // Open the document containing the symbol
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(def.uri));
            
            // Retrieve detailed information about the parent symbol
            const parentDetail = await getSymbolDetail(document, def.parent, getFullInfo);
            const packagOrName = getPackageOrUri(document, def.parent);
            const symboltype = getSymbolKindString(def.parent.kind);
            
            // Initialize results array
            let results: string[] = [];
            
            // Create the parent entry
            if (indent === '') {
                results.push(`${indent}The brief information of dependent ${symboltype} \`${packagOrName}\` is \`\`\`\n${indent}${parentDetail}\n${indent}\`\`\``);
            } else {
                results.push(`${indent}${parentDetail}\n${indent}\`\`\``);
            }
    
            // Iterate through each child ParentDefinition
            for (const childDef of def.children) {
                // Recursively process the child definitions with increased indentation
                const childResults = await processParentDefinition(childDef, indent + '  ', context, getFullInfo);
                results = results.concat(childResults);
            }
    
            return results;
        } catch (error) {
            console.error(`Error processing symbol ${def.parent.name} in ${def.uri}:`, error);
            return [`${indent}The brief information of dependent class \`${def.parent.name}\` is \n${indent}${def.parent.name} (Error retrieving details)\n`];
        }
    }

/**
 * Processes class definitions and generates a formatted hierarchy string with detailed information.
 *
 * @param tokenMap - A map of tokens associated with their definitions.
 * @param DefUseMap - An array of decoded tokens representing definitions and uses.
 * @returns A promise that resolves to a formatted hierarchy string.
 */
export async function processAndGenerateHierarchy(
    document: vscode.TextDocument,
    mainFunctionsymbol: vscode.DocumentSymbol,
    tokenMap: Map<string, DecodedToken[]>,
): Promise<DpendenceAnalysisResult> {
    // Retrieve all definitions
    const allDef: ParentDefinition[] = await constructSymbolRelationShip(tokenMap);
    const getFullinfo = document.languageId !== "java";
    let mainFunctionDependencies: string[] = [];  // Changed to array
    let mainfunctionParent: string[] = [];       // Already an array
    let dependencies: string[] = [];              // Changed to array

    for (const def of allDef) {
        const currDependencies = await processParentDefinition(def, '', "dependent", getFullinfo);
        dependencies.push(...currDependencies); 
        // console.log('collectinfo::currDependencies', currDependencies);
        // Check if the current definition or its children contain the main function
        async function containsMainFunction(def: ParentDefinition): Promise<boolean> {
            if (def.parent.name === mainFunctionsymbol.name) {
            return true;
            }
            for (const child of def.children) {
            if (await containsMainFunction(child)) {
                return true;
            }
            }
            return false;
        }

        if (await containsMainFunction(def)) {
            mainFunctionDependencies.push(
                currDependencies[0].replace(/The brief information of dependent class/g, 
                    "The brief information of current class")
            );
            mainfunctionParent.push(def.parent.name);
        }
        // Add an empty line for better readability between different top-level definitions
    }
    if (mainFunctionsymbol.name === mainfunctionParent[0]) {
        mainfunctionParent = [path.relative(vscode.workspace.rootPath!, document.uri.path)];
    }
    
    console.log(dependencies);
    // Output the hierarchy string (e.g., log it or display in a VSCode output channel)
    return { dependencies, mainFunctionDependencies, mainfunctionParent };
}

export function getPackageStatement(document: vscode.TextDocument, language: string): string[] | null {
    const documentText = document.getText();

    switch (language) {
        case "python":
            // Python does not use a package statement, return null for package
            return null;
        case "go":
            // Go: Match 'package' followed by the package name (no semicolon)
            return documentText.match(/package\s+.*/g); 
        case "java":
            // Java: Match 'package' followed by the package name (ending with a semicolon)
            return documentText.match(/package\s+.*;/g);
        default:
            return null;
    }
}

// function genPythonicSrcImportStatement(document: vscode.TextDocument, symbol: vscode.DocumentSymbol | null): string {
//     // const workspaceFolders = getConfigInstance().workspace;
//     // if (!workspaceFolders) {
//     //     throw new Error("No workspace folder found");
//     // }

//     const workspacePath = getConfigInstance().workspace;
//     let importStatement = document.uri.fsPath.replace(workspacePath, '');
//     // Check if the import statement starts with a '/', and remove it if it does
//     if (importStatement.startsWith('/')) {
//         importStatement = importStatement.substring(1);
//     }
//     importStatement = importStatement.replace(/\//g, ".").replace(/\.py/g, "");
//     let res = `from ${importStatement} import *\n`;
//     if (symbol) {
//         res.replace("import *", `import ${document.getText(symbol.selectionRange)}`);
//     }
//     return res;
// }
// function genPythonicSrcImportStatement(document: vscode.TextDocument, symbol: vscode.DocumentSymbol | null): string {
//     // const workspaceFolders = getConfigInstance().workspace;
//     // if (!workspaceFolders) {
//     //     throw new Error("No workspace folder found");
//     // }

//     const workspacePath = getConfigInstance().workspace;
//     let importStatement = document.uri.fsPath.replace(workspacePath, '');
//     // Check if the import statement starts with a '/', and remove it if it does
//     if (importStatement.startsWith('/')) {
//         importStatement = importStatement.substring(1);
//     }
//     importStatement = importStatement.replace(/\//g, ".").replace(/\.py/g, "");
//     let res = `from ${importStatement} import *\n`;
//     if (symbol) {
//         res.replace("import *", `import ${document.getText(symbol.selectionRange)}`);
//     }
//     return res;
// }

export function getImportStatement(document: vscode.TextDocument, language: string, symbol: vscode.DocumentSymbol | null = null): string {
    let allImportStatements = "";
    const documentText = document.getText();
    let importStatements;
    switch (language) {
        case "python":
            // Python: Match 'import' or 'from ... import'
            allImportStatements += genPythonicSrcImportStatement(documentText); // from src.black 
            // importStatements = documentText.match(/(?:import\s+\w+|from\s+\w+\s+import\s+\w+)/g);
            // allImportStatements += importStatements ? importStatements.join('\n') + '\n' : '';
            break;

        case "go":
            // Go: Match 'import' statements (including single-line and grouped imports)
            importStatements = documentText.match(/import\s+.*\n/g) || [];
            const packageStatement = getPackageStatement(document, language);
            allImportStatements += packageStatement ? packageStatement[0] + '\n' : '';
            allImportStatements += importStatements.join('');
            break;

        case "java":
            // Java: Match 'import' statements (one per line)
            const javaImportStatements = documentText.match(/import\s+.*;/g) || [];
            const javaPackageStatement = getPackageStatement(document, language);
            allImportStatements += javaPackageStatement ? javaPackageStatement[0] + '\n' : '';
            allImportStatements += javaImportStatements.join('\n');
            break;

        default:
            break;
    }

    return allImportStatements;
}


export async function summarizeClass(document: vscode.TextDocument, classSymbol: vscode.DocumentSymbol, language: string): Promise<string> {
    let result = "";
    const children = classSymbol.children;
    const importStatements = getImportStatement(document, language);
    result += importStatements + '\n';
    result += getSymbolDetail(document, classSymbol) + '\n';
    for (const child of children) {
        const methodDetail = getSymbolDetail(document, child);
        result += methodDetail + '\n';
    }
    return result;
}
export async function retrieveDefs(document: vscode.TextDocument, decodedTokens: DecodedToken[], skipDefinition: boolean = false): Promise<DecodedToken[]> {
    // console.log('Retrieving Def from Decoded tokens:', decodedTokens);
    const defTokens: DecodedToken[] = [];
    if (decodedTokens) {
        for (const token of decodedTokens) {
            const defToken = await retrieveDef(document, token, skipDefinition);
            defTokens.push(defToken);
        }
    }
    return defTokens;
}
// export async function getDecodedTokensForLine(editor: vscode.TextEditor, lineNumber: number): Promise<DecodedToken[]> {
//     if (!editor || !editor.document) {
//         vscode.window.showErrorMessage('Invalid editor or document.');
//         return [];
//     }
//     const document = editor.document;
//     if (lineNumber < 0 || lineNumber >= document.lineCount) {
//         vscode.window.showErrorMessage('Line number out of range.');
//         return [];
//     }
//     // Define the range for the entire line
//     const line = document.lineAt(lineNumber);
//     const range = new vscode.Range(line.range.start, line.range.end);
//     try {
//         // Retrieve semantic tokens for the specified range
//         const tokens: vscode.SemanticTokens | undefined = await vscode.commands.executeCommand(
//             'vscode.provideDocumentRangeSemanticTokens',
//             document.uri,
//             range
//         );
//         // Retrieve the semantic tokens legend
//         const tokensLegend: vscode.SemanticTokensLegend | undefined = await vscode.commands.executeCommand(
//             'vscode.provideDocumentRangeSemanticTokensLegend',
//             document.uri,
//             range
//         );
//         if (!tokens || !tokensLegend) {
//             vscode.window.showErrorMessage('Failed to retrieve semantic tokens or legend.');
//             return [];
//         }
//         // Decode the semantic tokens
//         const decodedTokens = await decodeSemanticTokens(Array.from(tokens.data), tokensLegend, lineNumber);
//         const decodedTokensWithDefUse = await retrieveDef(editor, decodedTokens);
//         return decodedTokensWithDefUse;
//     } catch (error) {
//         console.error('Error retrieving semantic tokens:', error);
//         vscode.window.showErrorMessage('An error occurred while retrieving semantic tokens.');
//         return [];
//     }
// }

export async function retrieveDef(document: vscode.TextDocument, decodedToken: DecodedToken, skipDefinition: boolean = false): Promise<DecodedToken> {
    if (decodedToken) {
        const startPos = new vscode.Position(decodedToken.line, decodedToken.startChar);
        const endPos = new vscode.Position(decodedToken.line, decodedToken.startChar + decodedToken.length);
        const range = new vscode.Range(startPos, endPos);
        decodedToken.word = document.getText(range);
        if (skipDefinition) {
            decodedToken.definition = [];
        } else {
            const definition = await vscode.commands.executeCommand<Array<vscode.Location>>(
                'vscode.executeDefinitionProvider',
                document.uri,
                startPos
            );
            decodedToken.definition = definition;
        }
    }
    return decodedToken;
}
// Example usage
// (async () => {
//     // Example tokenMap and DefUseMap (populate these as per your application's logic)
    
//     const DefUseMap: DecodedToken[] = []; // Populate as needed
    
//     const tokenMap = await classifyTokenByUri(editor, DefUseMap);
//     await processAndGenerateHierarchy(tokenMap, DefUseMap);
// })();    

