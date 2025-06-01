import * as vscode from 'vscode';
// Summary Statistics:
// ================================================================================
// Category                                 | Frequency 
// ----------------------------------------------------
// Redeclaration/Duplicate Definition       | 28300     
// Import/Module Resolution Error           | 13517     
// Syntax Error                             | 5467      
// Member Access/Usage Error (Field/Method/Visibility) | 13387     
// Type Mismatch/Compatibility Error        | 4388      
// Constructor Call Error                   | 1670      
// Unhandled Exception                      | 179       
// ----------------------------------------------------
// Total                                    | 66908     
// ... existing code ...

export async function collectRelatedInfo(diagnostics: vscode.Diagnostic[], languageId: string, document?: vscode.TextDocument, srcPath: string = ""): Promise<string> {
	const contextBuilder = new DiagnosticContextCollector(languageId, srcPath);
	return await contextBuilder.collectContextForDiagnostics(diagnostics, document);
}

class DiagnosticContextCollector {
	private languageId: string;
	private srcPath: string;

	constructor(languageId: string, srcPath: string) {
		this.languageId = languageId;
		this.srcPath = srcPath;
	}

	async collectContextForDiagnostics(diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): Promise<string> {
		const context: string[] = [];
		
		// 1. Collect symbols in current scope (for redeclaration errors)
		if (document) {
			const scopeInfo = await this.collectScopeInformation(document);
			if (scopeInfo) {
				context.push("=== Current Scope Information ===");
				context.push(scopeInfo);
			}
		}

		// 2. Collect import and module information
		const importInfo = await this.collectImportInformation(document);
		if (importInfo) {
			context.push("=== Import and Module Information ===");
			context.push(importInfo);
		}

		// 3. Collect type and class definitions
		const typeInfo = await this.collectTypeInformation(document, diagnostics);
		if (typeInfo) {
			context.push("=== Type and Class Information ===");
			context.push(typeInfo);
		}

		// 4. Collect project structure
		const structureInfo = await this.collectProjectStructure();
		if (structureInfo) {
			context.push("=== Project Structure ===");
			context.push(structureInfo);
		}

		// 5. Collect method signatures and available APIs
		const apiInfo = await this.collectAPIInformation(document, diagnostics);
		if (apiInfo) {
			context.push("=== API and Method Information ===");
			context.push(apiInfo);
		}

		return context.join('\n\n');
	}

	private async collectScopeInformation(document: vscode.TextDocument): Promise<string> {
		try {
			// Get document symbols to understand scope
			const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
				'vscode.executeDocumentSymbolProvider',
				document.uri
			);

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

	private async collectImportInformation(document?: vscode.TextDocument): Promise<string> {
		if (!document) return "";

		try {
			const text = document.getText();
			const importInfo: string[] = [];
			
			// Extract import statements based on language
			const imports = this.extractImports(text, this.languageId);
			if (imports.length > 0) {
				importInfo.push("Current imports:");
				imports.forEach(imp => importInfo.push(`- ${imp}`));
			}

			// Get available packages/modules in workspace
			const availableModules = await this.getAvailableModules();
			if (availableModules.length > 0) {
				importInfo.push("\nAvailable modules in workspace:");
				availableModules.forEach(mod => importInfo.push(`- ${mod}`));
			}

			return importInfo.join('\n');
		} catch (error) {
			console.warn('Failed to collect import information:', error);
			return "";
		}
	}

	private extractImports(text: string, languageId: string): string[] {
		const imports: string[] = [];
		const lines = text.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			
			switch (languageId) {
				case 'python':
					if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
						imports.push(trimmed);
					}
					break;
				case 'java':
					if (trimmed.startsWith('import ')) {
						imports.push(trimmed);
					}
					break;
				case 'go':
					if (trimmed.startsWith('import ') || (trimmed.includes('import') && trimmed.includes('"'))) {
						imports.push(trimmed);
					}
					break;
				case 'cpp':
					if (trimmed.startsWith('#include')) {
						imports.push(trimmed);
					}
					break;
			}
		}

		return imports;
	}

	private async getAvailableModules(): Promise<string[]> {
		try {
			if (!vscode.workspace.workspaceFolders) {
				return [];
			}

			const modules: string[] = [];
			const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			
			// Find source files that could be imported
			const sourceFiles = await vscode.workspace.findFiles(
				this.getSourceFilePattern(this.languageId),
				'**/node_modules/**'
			);

			for (const file of sourceFiles.slice(0, 20)) { // Limit to avoid too much output
				const relativePath = vscode.workspace.asRelativePath(file);
				modules.push(relativePath);
			}

			return modules;
		} catch (error) {
			console.warn('Failed to get available modules:', error);
			return [];
		}
	}

	private getSourceFilePattern(languageId: string): string {
		switch (languageId) {
			case 'python': return '**/*.py';
			case 'java': return '**/*.java';
			case 'go': return '**/*.go';
			case 'cpp': return '**/*.{cpp,hpp,h}';
			default: return '**/*';
		}
	}

	private async collectTypeInformation(document?: vscode.TextDocument, diagnostics?: vscode.Diagnostic[]): Promise<string> {
		if (!document) return "";

		try {
			const typeInfo: string[] = [];
			
			// Get type definitions from document symbols
			const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
				'vscode.executeDocumentSymbolProvider',
				document.uri
			);

			if (symbols) {
				const classes = symbols.filter(s => s.kind === vscode.SymbolKind.Class);
				const interfaces = symbols.filter(s => s.kind === vscode.SymbolKind.Interface);
				const enums = symbols.filter(s => s.kind === vscode.SymbolKind.Enum);

				if (classes.length > 0) {
					typeInfo.push("Classes defined in file:");
					classes.forEach(cls => {
						typeInfo.push(`- ${cls.name}`);
						if (cls.children) {
							const methods = cls.children.filter(c => c.kind === vscode.SymbolKind.Method);
							const fields = cls.children.filter(c => c.kind === vscode.SymbolKind.Field || c.kind === vscode.SymbolKind.Property);
							
							if (methods.length > 0) {
								typeInfo.push(`  Methods: ${methods.map(m => m.name).join(', ')}`);
							}
							if (fields.length > 0) {
								typeInfo.push(`  Fields: ${fields.map(f => f.name).join(', ')}`);
							}
						}
					});
				}

				if (interfaces.length > 0) {
					typeInfo.push("Interfaces:");
					interfaces.forEach(iface => typeInfo.push(`- ${iface.name}`));
				}

				if (enums.length > 0) {
					typeInfo.push("Enums:");
					enums.forEach(enm => typeInfo.push(`- ${enm.name}`));
				}
			}

			return typeInfo.join('\n');
		} catch (error) {
			console.warn('Failed to collect type information:', error);
			return "";
		}
	}

	async collectProjectStructure(): Promise<string> {
		try {
			if (!this.srcPath) {
				return "";
			}
	
			const structure: string[] = [`Project structure starting from ${this.srcPath}:`];
			
			// Get all files in the workspace starting from srcPath
			const files = await vscode.workspace.findFiles(
				new vscode.RelativePattern(this.srcPath, '**/*'),
				'**/node_modules/**'
			);
	
			// Create a tree structure
			const fileTree: { [key: string]: Set<string> } = {};
			
			for (const file of files) {
				const relativePath = vscode.workspace.asRelativePath(file, false);
				const parts = relativePath.split('/');
				let currentPath = '';
				
				for (let i = 0; i < parts.length - 1; i++) {
					const parentPath = currentPath;
					currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
					
					if (!fileTree[parentPath]) {
						fileTree[parentPath] = new Set();
					}
					fileTree[parentPath].add(parts[i]);
					
					if (!fileTree[currentPath]) {
						fileTree[currentPath] = new Set();
					}
				}
				
				// Add the file to its parent directory
				const parentPath = parts.slice(0, -1).join('/');
				if (!fileTree[parentPath]) {
					fileTree[parentPath] = new Set();
				}
				fileTree[parentPath].add(parts[parts.length - 1]);
			}
	
			// Convert tree to string representation
			function buildTree(path: string, prefix: string = ''): void {
				if (!fileTree[path]) return;
				
				const items = Array.from(fileTree[path]).sort();
				for (let i = 0; i < items.length; i++) {
					const item = items[i];
					const isLast = i === items.length - 1;
					const newPrefix = prefix + (isLast ? '└── ' : '├── ');
					structure.push(prefix + (isLast ? '└── ' : '├── ') + item);
					
					const newPath = path ? `${path}/${item}` : item;
					if (fileTree[newPath]) {
						buildTree(newPath, prefix + (isLast ? '    ' : '│   '));
					}
				}
			}
	
			buildTree('');
			return structure.join('\n');
		} catch (error) {
			console.warn('Failed to collect project structure:', error);
			return "";
		}
	}

	private async collectAPIInformation(document?: vscode.TextDocument, diagnostics?: vscode.Diagnostic[]): Promise<string> {
		if (!document) return "";

		try {
			const apiInfo: string[] = [];
			
			// Get function/method definitions
			const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
				'vscode.executeDocumentSymbolProvider',
				document.uri
			);

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