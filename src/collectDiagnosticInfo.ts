import * as vscode from 'vscode';
import { DecodedToken, getDecodedTokensFromLine } from './lsp/token';
import { getImportStatement, getPackageStatement, retrieveDefs } from './lsp/definition';
import * as fpath from 'path';
import { getTypeInfo } from './lsp/helper';
import { getAllSymbols } from './lsp/symbol';
import { getSymbolByLocation } from './lsp/symbol';
import { getReferenceInfo } from './lsp/reference';
import { getLinesTexts } from './lsp/diagnostic';
import { isInWorkspace } from './agents/contextSelector';
import { getConfigInstance } from './config';

// Summary Statistics:
// ================================================================================
// Category                                 | Frequency 
// ----------------------------------------------------
// Redeclaration/Duplicate Definition       | 28300     symbol definitions
// Import/Module Resolution Error           | 13517     project structure,
// Syntax Error                             | 5467      -
// Member Access/Usage Error (Field/Method/Visibility) | 13387  references, definition information
// Type Mismatch/Compatibility Error        | 4388      implementation/type information
// Constructor Call Error                   | 1670      definition information
// Unhandled Exception                      | 179       
// ----------------------------------------------------
// Total                                    | 66908     
// ... existing code ...
enum DiagnosticCategory {
    REDECLARATION,
    IMPORT_MODULE_RESOLUTION,
    SYNTAX_ERROR,
    MEMBER_ACCESS_USAGE,
    TYPE_MISMATCH,
    CONSTRUCTOR_CALL,
    UNHANDLED_EXCEPTION,
    UNKNOWN
}

export async function collectRelatedInfo(
	testCodeUri: vscode.Uri, 
	focalMethodDoc: vscode.TextDocument,
	groupedDiagnostics: Map<string, vscode.Diagnostic[]>, 
	languageId: string, 
	srcPath: string = ""): Promise<string> {
	const contextBuilder = new DiagnosticContextCollector(testCodeUri, languageId, srcPath, focalMethodDoc);
	return await contextBuilder.collectContextForDiagnostics(groupedDiagnostics, focalMethodDoc);
}

class DiagnosticContextCollector {
	private languageId: string;
	private srcPath: string;
	private uri: vscode.Uri;
	private focalDoc: vscode.TextDocument;

	constructor(uri: vscode.Uri, languageId: string, srcPath: string, focalDoc: vscode.TextDocument) {
		this.languageId = languageId;
		this.srcPath = srcPath;
		this.uri = uri;
		this.focalDoc = focalDoc;
	}

	private classifyDiagnostic(diagnostic: vscode.Diagnostic): DiagnosticCategory {
		const msgText = diagnostic.message.toLowerCase();

		// Check for Constructor Call Error first (special case)
		if ((msgText.includes("constructor") && msgText.includes("is undefined")) ||
			msgText.includes("cannot instantiate the type")) {
			return DiagnosticCategory.CONSTRUCTOR_CALL;
		}

		// Redeclaration/Duplicate Definition
		const redeclarationKeywords = [
			"redeclared in this block", "other declaration of", "already declared",
			"is already defined", "field and method with the same name", "duplicate field name"
		];
		if (redeclarationKeywords.some(keyword => msgText.includes(keyword))) {
			return DiagnosticCategory.REDECLARATION;
		}

		// Import/Module Resolution Error
		const importKeywords = [
			"import", "could not be resolved", "no required module provides package",
			"expected module name", "does not match the expected package",
			"use of package", "module",
			"cannot be resolved to a type", "is not defined", "undefined:", "cannot be resolved",
			"cannot find symbol", "missing type", "lambda expression refers to the missing type",
			"is not a type",
			"must be defined in its own file", "declared package", "should be declared in a file named"
		];
		if (importKeywords.some(keyword => msgText.includes(keyword))) {
			// Special case: if "could not be resolved" but no "import" or "module"
			if (msgText.includes("could not be resolved") && 
				!msgText.includes("import") && 
				!msgText.includes("module")) {
				// Skip this case - it might be a different type of resolution error
			} else {
				return DiagnosticCategory.IMPORT_MODULE_RESOLUTION;
			}
		}

		// Syntax Error
		const syntaxKeywords = [
			"syntax error", "misplaced construct", "expected", "unexpected token",
			"was not closed", "insert \"", "delete this token", "invalid compilationunit",
			"unexpected indentation", "unindent not expected", "invalid character constant",
			"statements must be separated", "no new variables on left side of :=",
			"positional argument cannot appear after keyword arguments", "unterminated",
			"illegal character", "await allowed only within async function", "expecting \"}\"",
			"invalid escape sequence", "not properly closed by a double-quote",
			"missing ',' in composite literal", "enum classes must not be local"
		];
		if (syntaxKeywords.some(keyword => msgText.includes(keyword))) {
			return DiagnosticCategory.SYNTAX_ERROR;
		}

		// Member Access/Usage Error
		const memberAccessKeywords = [
			"unknown field", "has no field or method", "is undefined for the type",
			"is not visible", "not a field", "no field or method",
			"undefined (type", "private access in", "cannot refer to unexported field",
			"cannot override the final method", "illegal enclosing instance specification",
			"cannot subclass the final class", "cannot invoke .* on the array type",
			"error() string"
		];
		if (memberAccessKeywords.some(keyword => msgText.includes(keyword))) {
			return DiagnosticCategory.MEMBER_ACCESS_USAGE;
		}

		// Type Mismatch/Compatibility Error
		const typeMismatchKeywords = [
			"cannot use", "is not applicable for the arguments", "type mismatch",
			"incompatible with", "cannot convert", "cannot assign", "bound mismatch",
			"invalid operation:", "incompatible types", "must be a functional interface",
			"invalid composite literal type", "cannot cast from", "assignment mismatch",
			"too many arguments in call", "not enough arguments in call",
			"no value) used as value", "(type) is not an expression",
			"first argument to append must be a slice", "no suitable method found",
			"argument mismatch", "cannot be parameterized with arguments",
			"return type .* is not compatible with", "cannot be converted to",
			"invalid argument", "cannot infer type arguments"
		];
		if (typeMismatchKeywords.some(keyword => msgText.includes(keyword))) {
			return DiagnosticCategory.TYPE_MISMATCH;
		}

		// Unhandled Exception
		const exceptionKeywords = [
			"unhandled exception type", "unreachable code", 
			"unreachable catch block", "unreported exception",
			"must be caught or declared to be thrown"
		];
		if (exceptionKeywords.some(keyword => msgText.includes(keyword))) {
			return DiagnosticCategory.UNHANDLED_EXCEPTION;
		}

		// If no category matched, return UNKNOWN
		return DiagnosticCategory.UNKNOWN;
	}

	private getGoalofContext(diagnosticCategory: DiagnosticCategory): string {
		switch (diagnosticCategory) {
			case DiagnosticCategory.IMPORT_MODULE_RESOLUTION:
				return "think about the import statement and the module resolution error and find out from project structure";
			case DiagnosticCategory.REDECLARATION:
				return "find out redeclared symbol and locate it so that generator do not have to redeclare it and directly use it";
			case DiagnosticCategory.MEMBER_ACCESS_USAGE:
				return "find out the symbol that is accessed and locate it so that generator do not have to access it and directly use it";
			case DiagnosticCategory.TYPE_MISMATCH:
				return "find out the symbol that is used and locate it so that generator do not have to use it and directly use it";
			case DiagnosticCategory.SYNTAX_ERROR:
				return "find out the symbol that is used and locate it so that generator do not have to use it and directly use it";
			default:
				return "find out the symbol that is used and locate it so that generator do not have to use it and directly use it";
		}
	}


	groupedDiagnosticToString(message: any, diagList: vscode.Diagnostic[], document: vscode.TextDocument): string[] {
		const result: string[] = [];
		// result.push(`\nMessage: "${message}"`);
		result.push(`Number of occurrences: ${diagList.length}`);
		// result.push('Locations:');
		// diagList.forEach((diag, index) => {
		// 	result.push(`  ${index + 1}. Line ${diag.range.start.line + 1}, ${getLinesTexts(diag.range.start.line, diag.range.end.line, document)}`);
		// });
		// result.push('------------------------------');
		return result;
	}

	// groupedDiagnosticsToString(groupedDiagnostics: Map<string, vscode.Diagnostic[]>, document: vscode.TextDocument): string[] {
	// 	const result: string[] = [];
	// 	console.log('Grouped Diagnostics by Message:');
	// 	console.log('==============================');
	// 	for (const [message, diagList] of groupedDiagnostics) {
	// 		result.push(...this.groupedDiagnosticToString(message, diagList, document));
	// 	}
	// 	return result;
	// }
	// collect context for each diagnostic
	static getImportAndPackageStatement(document: vscode.TextDocument, languageId: string): string {
		let result = "";
		const relativeFileName = fpath.relative(getConfigInstance().workspace, document.uri.fsPath);
		result += `File Name: ${relativeFileName}\n`;
		const packageStatement = getPackageStatement(document, languageId);
		if (packageStatement) {
			result += packageStatement.join('\n').trim();
		}
		const importStatement = getImportStatement(document, languageId, null);
		if (importStatement) {
			result += importStatement.trim();
		}
		return result;
	}

	private async collectConstructorCallInformation(): Promise<string> {
		const testCodeFileName = fpath.basename(this.uri.fsPath);
		const testCodeSavedPath = fpath.dirname(this.uri.fsPath);
		let info = "\n=== Test Code Information ===\n";
		info += `Test Code File Name: ${testCodeFileName}\n`;
		info += `Test Code Saved Path: ${testCodeSavedPath}\n`;

		const apiInfo = await this.collectAPIInformation(this.focalDoc);
		if (apiInfo) {
			info += "\n=== Focal Document Information ===\n";
			info += apiInfo;
		}
		return info;
	}
	
	async collectContextForDiagnostics(groupedDiagnostics: Map<string, vscode.Diagnostic[]>, focalMethodDoc?: vscode.TextDocument): Promise<string> {
		const context: string[] = [];
		const collectedInfo = new Set<string>(); // Track what we've already collected
		const processedTokens = new Map<string, string>(); // Cache token results
		const firstDiagnostics = Array.from(groupedDiagnostics.values())
		.map(diagnosticArray => diagnosticArray[0])
		.filter(diagnostic => diagnostic !== undefined);

		// Collect project structure only once if needed
		context.push("=== Diagnostic Information ===");
		let hasImportDiagnostic = firstDiagnostics.some(d => 
			this.classifyDiagnostic(d) === DiagnosticCategory.IMPORT_MODULE_RESOLUTION
		);
		if (hasImportDiagnostic) {
			const structureInfo = await this.collectProjectStructure();
			const importAndPackageStatement = DiagnosticContextCollector.getImportAndPackageStatement(this.focalDoc, this.languageId);
			if (structureInfo) {
				context.push("\n" + this.getGoalofContext(DiagnosticCategory.IMPORT_MODULE_RESOLUTION) + "\n");
				context.push("\n=== Project Structure ===");
				context.push(structureInfo);
				if (importAndPackageStatement) {
					context.push("\n=== Import and Package Statement of Code File that this is testing===");
					context.push(importAndPackageStatement);
					context.push("\n");
				}
			}
		}
		
		for (const [message, diagList] of groupedDiagnostics) {
			const category = this.classifyDiagnostic(diagList[0]);
			
			// Add diagnostic information
			// context.push(`Message: ${diagnostic.message}`);
			// context.push(`Severity: ${vscode.DiagnosticSeverity[diagnostic.severity]}`);
			// context.push(`Type: ${DiagnosticCategory[category]}`);
			context.push("Diagnostic Group: " + message);
			context.push(...this.groupedDiagnosticToString(message, diagList, focalMethodDoc!));
			let contextAdded = false;
			switch (category) {
				case DiagnosticCategory.REDECLARATION:
					// find out redeclared symbol and locate it so that model do not have to redeclare it and directly use it
					if (focalMethodDoc && !collectedInfo.has('scope')) {
						const scopeInfo = await this.collectScopeInformation(focalMethodDoc);
						if (scopeInfo) {
							context.push("\n" + this.getGoalofContext(category) + "\n");
							context.push("\n=== Current Scope Information ===");
							context.push(scopeInfo);
							collectedInfo.add('scope');
							contextAdded = true;
						}
					}
					break;

				case DiagnosticCategory.CONSTRUCTOR_CALL:
					if (!collectedInfo.has('constructor')) {
						const constructorInfo = await this.collectConstructorCallInformation();
						if (constructorInfo) {
							context.push(constructorInfo);
							collectedInfo.add('constructor');
							contextAdded = true;
						}
					}

				case DiagnosticCategory.SYNTAX_ERROR:
				case DiagnosticCategory.MEMBER_ACCESS_USAGE:
				case DiagnosticCategory.TYPE_MISMATCH:
					const tokens = await this.locateTokenFromDiagnostics(diagList[0]);
					const tokenKey = tokens.map(t => t.id).join(',');
					
					if (category === DiagnosticCategory.MEMBER_ACCESS_USAGE) {
						if (!processedTokens.has(`refs_${tokenKey}`)) {
							const refsInfo = await this.getRefsOfDiagnostic(tokens);
							if (refsInfo) {
								context.push("\n" + this.getGoalofContext(category) + "\n");
								context.push("\n=== Reference Information ===");
								context.push(refsInfo);
								processedTokens.set(`refs_${tokenKey}`, refsInfo);
								contextAdded = true;
							}
						} else {
							// context.push("\n=== Reference Information ===");
							// context.push(processedTokens.get(`refs_${tokenKey}`)!);
						}

						if (!processedTokens.has(`def_${tokenKey}`)) {
							const defInfo = await this.getDefsOfDiagnostic(tokens);
							if (defInfo) {
								context.push("\n" + this.getGoalofContext(category) + "\n");
								context.push("\n=== Definition Information ===");
								context.push(defInfo);
								processedTokens.set(`def_${tokenKey}`, defInfo);
								contextAdded = true;
							}
						} else {
							// context.push("\n=== Reference Information ===");
							// context.push(processedTokens.get(`refs_${tokenKey}`)!);
						}
					} else {
						// if (!processedTokens.has(`type_${tokenKey}`)) {
						// 	const typeInfo = await this.getTypeAndImplementationInfo(tokens);
						// 	if (typeInfo) {
						// 		context.push("\n" + this.getGoalofContext(category) + "\n");
						// 		context.push("\n=== Type Information ===");
						// 		context.push(typeInfo);
						// 		processedTokens.set(`type_${tokenKey}`, typeInfo);
						// 		contextAdded = true;
						// 	}
						// } else {
						// 	// context.push("\n=== Type Information ===");
						// 	// context.push(processedTokens.get(`type_${tokenKey}`)!);
						// }
					}
					break;
	
				default:
					break;
			}
	
			context.push("\n" + "=".repeat(80) + "\n");
		}
	
		return context.join('\n');
	}

	async getRelatedInfo(diagnostic: vscode.Diagnostic): Promise<string> {
		let relatedInfo = '';
		if (diagnostic.relatedInformation){
			for (const info of diagnostic.relatedInformation) {
				relatedInfo += `${info.message} from ${fpath.relative(this.uri.fsPath, info.location.uri.fsPath)}\n`;
			}
		}
		return relatedInfo;
	}
	

	async getTypeAndImplementationInfo(decodedTokens: DecodedToken[]): Promise<string> {
		let relatedInfo = '';
		const doc = await vscode.workspace.openTextDocument(this.uri);
		for (const token of decodedTokens) {
			const typeInfoSymbolOrLocOrNull = await getTypeInfo(doc.uri, new vscode.Position(token.line, token.startChar));
			if (typeInfoSymbolOrLocOrNull) {
				const typeInfoSymbolOrLoc = typeInfoSymbolOrLocOrNull as vscode.Definition | vscode.Location;
				const defSymbolDoc = await vscode.workspace.openTextDocument(typeInfoSymbolOrLocOrNull.uri);
				console.log('defSymbolDoc', defSymbolDoc);
				console.log('typeInfoSymbolOrLocOrNull', typeInfoSymbolOrLocOrNull);
				const typeInfoSymbol = await getSymbolByLocation(defSymbolDoc, typeInfoSymbolOrLocOrNull.range!.start);
				if (typeInfoSymbol) {
					const typeInfoString = defSymbolDoc.getText(typeInfoSymbol.range);
					relatedInfo += `${typeInfoString}\n`;
				}

			}
		}
		return relatedInfo;		
	}

	async getDefsOfDiagnostic(decodedTokens: DecodedToken[]): Promise<string> {
		let relatedInfo = '';
		for (const token of decodedTokens) {
			if (token.definition[0] && token.definition[0].uri) {
				const defSymbolDoc = await vscode.workspace.openTextDocument(token.definition[0].uri);
				if (!token.defSymbol) {
					if (token.defSymbol === null) {
						token.defSymbol = await getSymbolByLocation(defSymbolDoc, token.definition[0].range!.start);
					}
				}
				if (token.defSymbol) {
					if (!isInWorkspace(token.definition[0].uri)) {
						relatedInfo += `${token.defSymbol.name} from ${fpath.basename(token.definition[0].uri.fsPath)}\n`;
						relatedInfo += `${defSymbolDoc.getText(token.defSymbol.range)}\n`;
					}
				}
			}
		}
		return relatedInfo;
	}

	async getRefsOfDiagnostic(decodedTokens: DecodedToken[]): Promise<string> {
		let relatedInfo = '';
		for (const token of decodedTokens) {
			if (token.definition[0] && token.definition[0].range) {
				const defSymbolDoc = await vscode.workspace.openTextDocument(token.definition[0].uri);
				const referenceInfo = await getReferenceInfo(defSymbolDoc, token.definition[0].range, 40, false);
				if (referenceInfo) {
					relatedInfo += `Example of ${token.word}\n`;
					relatedInfo += `${referenceInfo}\n`;
				}
			}
		}
		return relatedInfo;
	}
		
	async locateTokenFromDiagnostics(diagnostic: vscode.Diagnostic): Promise<DecodedToken[]> {
		const document = await vscode.workspace.openTextDocument(this.uri);
		const decodedTokens = await getDecodedTokensFromLine(document, diagnostic.range.start.line);
		await retrieveDefs(document, decodedTokens);
		return decodedTokens;
	}


	private async collectScopeInformation(document: vscode.TextDocument): Promise<string> {
		try {
			// Get document symbols to understand scope
			const symbols = await getAllSymbols(document.uri);

			if (!symbols || symbols.length === 0) {
				return "";
			}

			const scopeInfo: string[] = [];
			scopeInfo.push("Declared symbols in current file:");
			
			for (const symbol of symbols) {
				scopeInfo.push(`- ${symbol.name} (${vscode.SymbolKind[symbol.kind]})`);
				
				// Include children (class members, function parameters, etc.)
				if (symbol.children && symbol.children.length > 0) {
					for (const child of symbol.children) {
						scopeInfo.push(`  └─ ${child.name} (${vscode.SymbolKind[child.kind]})`);
					}
				}
			}

			return scopeInfo.join('\n');
		} catch (error) {
			console.warn('Failed to collect scope information:', error);
			return "";
		}
	}

	// private async collectImportInformation(document?: vscode.TextDocument): Promise<string> {
	// 	if (!document) return "";

	// 	try {
	// 		const text = document.getText();
	// 		const importInfo: string[] = [];
			
	// 		// Extract import statements based on language
	// 		const imports = this.extractImports(text, this.languageId);
	// 		if (imports.length > 0) {
	// 			importInfo.push("Current imports:");
	// 			imports.forEach(imp => importInfo.push(`- ${imp}`));
	// 		}

	// 		// Get available packages/modules in workspace
	// 		const availableModules = await this.getAvailableModules();
	// 		if (availableModules.length > 0) {
	// 			importInfo.push("\nAvailable modules in workspace:");
	// 			availableModules.forEach(mod => importInfo.push(`- ${mod}`));
	// 		}

	// 		return importInfo.join('\n');
	// 	} catch (error) {
	// 		console.warn('Failed to collect import information:', error);
	// 		return "";
	// 	}
	// }

	// private async getAvailableModules(): Promise<string[]> {
	// 	try {
	// 		if (!vscode.workspace.workspaceFolders) {
	// 			return [];
	// 		}

	// 		const modules: string[] = [];
	// 		const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			
	// 		// Find source files that could be imported
	// 		const sourceFiles = await vscode.workspace.findFiles(
	// 			this.getSourceFilePattern(this.languageId),
	// 			'**/node_modules/**'
	// 		);

	// 		for (const file of sourceFiles.slice(0, 20)) { // Limit to avoid too much output
	// 			const relativePath = vscode.workspace.asRelativePath(file);
	// 			modules.push(relativePath);
	// 		}

	// 		return modules;
	// 	} catch (error) {
	// 		console.warn('Failed to get available modules:', error);
	// 		return [];
	// 	}
	// }

	private getSourceFilePattern(): string {
		switch (this.languageId) {
			case 'python':
				return '**/*.py';
			case 'typescript':
			case 'javascript':
				return '**/*.{ts,tsx,js,jsx}';
			case 'java':
				return '**/*.java';
			case 'cpp':
				return '**/*.{cpp,hpp,h,cc}';
			case 'go':
				return '**/*.go';
			default:
				return '**/*.*';  // Default to all files if language is unknown
		}
	}
	private isSourceFile(filename: string): boolean {
		const extensions = {
			'python': ['.py'],
			'typescript': ['.ts', '.tsx'],
			'javascript': ['.js', '.jsx'],
			'java': ['.java'],
			'cpp': ['.cpp', '.hpp', '.h', '.cc'],
			'go': ['.go']
		};
	
		const validExtensions = extensions[this.languageId as keyof typeof extensions] || [];
		return validExtensions.some(ext => filename.endsWith(ext));
	}
	private getExcludePattern(): string {
		const commonExcludes = [
			'**/node_modules/**',
			'**/lsprag-workspace/**',
			'**/lsprag-tests/**',
			'**/__pycache__/**',
			'**/build/**',
			'**/dist/**',
			'**/.git/**',
			'**/tests/**',
			'**/test/**',
		];
	
		// Add language-specific excludes
		switch (this.languageId) {
			case 'python':
				commonExcludes.push('**/*.pyc');
				break;
			case 'java':
				commonExcludes.push('**/target/**');
				commonExcludes.push('**/*.class');
				break;
			// Add more language-specific excludes as needed
		}
	
		return `{${commonExcludes.join(',')}}`;
	}
	async collectProjectStructure(): Promise<string> {
		try {
			console.log('this.srcPath', this.srcPath);
			if (!this.srcPath) {
				return "";
			}
	
			const structure: string[] = [`Project structure:`];
			const focalMethodPath = this.focalDoc.uri.fsPath;
			console.log('Focal method path:', focalMethodPath);
			// Get file pattern based on language
			const filePattern = this.getSourceFilePattern();
			const excludePattern = this.getExcludePattern();
	
			// Get source files in the workspace starting from srcPath
			const files = await vscode.workspace.findFiles(
				new vscode.RelativePattern(this.srcPath, filePattern),
				excludePattern
			);
	
			// Create a tree structure using a Map to maintain order
			const fileTree = new Map<string, Set<string>>();
			fileTree.set('', new Set<string>());  // Root directory
			for (const file of files) {
				// Get path relative to srcPath
				const fullPath = file.fsPath;
				const relativePath = fullPath.substring(this.srcPath.length + 1);
				const parts = relativePath.split('/').filter(p => p !== '');
				
				// Add each directory level and its contents
				let currentPath = '';
				for (let i = 0; i < parts.length; i++) {
					const part = parts[i];
					const parentPath = currentPath;
					currentPath = currentPath ? `${currentPath}/${part}` : part;
					
					// Only process directories and source files
					if (i < parts.length - 1 || this.isSourceFile(part)) {
						// Add to parent's children
						const parentChildren = fileTree.get(parentPath) || new Set<string>();
						parentChildren.add(part);
						fileTree.set(parentPath, parentChildren);
						
						// Create entry for current path if it's a directory
						if (i < parts.length - 1) {
							if (!fileTree.has(currentPath)) {
								fileTree.set(currentPath, new Set<string>());
							}
						}
					}
				}
			}
	
			// Convert tree to string representation
			const processedPaths = new Set<string>();
			
			const buildTree = (path: string, prefix: string = ''): void => {
				if (processedPaths.has(path)) {
					return;
				}
				processedPaths.add(path);
				
				const children = fileTree.get(path);
				if (!children) {
					return;
				}
				
				const items = Array.from(children).sort((a, b) => {
					// Directories come first
					const aIsDir = fileTree.has(path ? `${path}/${a}` : a);
					const bIsDir = fileTree.has(path ? `${path}/${b}` : b);
					if (aIsDir && !bIsDir) {
						return -1;
					}
					if (!aIsDir && bIsDir) {
						return 1;
					}
					return a.localeCompare(b);
				});
	
				for (let i = 0; i < items.length; i++) {
					const item = items[i];
					const isLast = i === items.length - 1;
					const isDir = fileTree.has(path ? `${path}/${item}` : item);
					
					// Add directory indicator for folders
					const currentFullPath = path ? path + '/' + item : item;
					console.log('currentFullPath', currentFullPath);
					const focalMethodRelativePath = fpath.relative(this.srcPath as string, focalMethodPath);
					console.log('focalMethodRelativePath', focalMethodRelativePath);
					const isFocalFile = currentFullPath === focalMethodRelativePath;
					
					// Add directory indicator for folders and mark focal method
					let displayName = isDir ? `${item}/` : item;
					if (isFocalFile) {
						displayName += ' [FOCAL METHOD Resides]';
					}
					
					structure.push(prefix + (isLast ? '└── ' : '├── ') + displayName);
					
					const newPath = path ? `${path}/${item}` : item;
					if (fileTree.has(newPath)) {
						buildTree(newPath, prefix + (isLast ? '    ' : '│   '));
					}
				}
			};
	
			buildTree('');
			console.log("structure",structure.join('\n'));
			return structure.join('\n');
		} catch (error) {
			console.warn('Failed to collect project structure:', error);
			return "";
		}
	}

	private async collectAPIInformation(document: vscode.TextDocument): Promise<string> {
		if (!document) {
			return "";
		}

		try {
			const apiInfo: string[] = [];
			
			// Get function/method definitions
			const symbols = await getAllSymbols(document.uri);


			if (symbols) {
				const functions = symbols.filter(s => s.kind === vscode.SymbolKind.Function || s.kind === vscode.SymbolKind.Method);
				
				if (functions.length > 0) {
					apiInfo.push("Available functions/methods:");
					for (const func of functions) {
						// Get function signature from document text
						const range = func.range;
						const functionText = document.getText(range).split('\n')[0]; // Get first line (signature)
						apiInfo.push(`- ${functionText.trim()}`);
					}
				}

				// Get constructors specifically
				const constructors = symbols.flatMap(s => 
					s.children?.filter(c => c.kind === vscode.SymbolKind.Constructor) || []
				);

				if (constructors.length > 0) {
					apiInfo.push("\nConstructors:");
					constructors.forEach(ctor => {
						const ctorText = document.getText(ctor.range).split('\n')[0];
						apiInfo.push(`- ${ctorText.trim()}`);
					});
				}
			}

			return apiInfo.join('\n');
		} catch (error) {
			console.warn('Failed to collect API information:', error);
			return "";
		}
	}
}