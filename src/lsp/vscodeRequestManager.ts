import * as vscode from 'vscode';
import { activate } from './helper';
import { LSPCache } from './types';

export class VscodeRequestManager {
  private static cache: LSPCache = {
    documentSymbols: new Map(),
    workspaceSymbols: new Map(),
    definitions: new Map(),
    references: new Map(),
    hover: new Map(),
    semanticTokens: new Map(),
    semanticTokensLegend: new Map(),
    semanticTokensRange: new Map(),
    semanticTokensLegendRange: new Map(),
    codeActions: new Map(),
    typeDefinition: new Map()
  };
  static async documentSymbols(uri: vscode.Uri, retries = 10, delayMs = 500): Promise<vscode.DocumentSymbol[]> {
    const uriString = uri.toString();
  
    // Check cache first
    if (VscodeRequestManager.cache.documentSymbols.has(uriString)) {
      return VscodeRequestManager.cache.documentSymbols.get(uriString)!;
    }
  
    let symbols: vscode.DocumentSymbol[] = [];
    await activate(uri);
    for (let i = 0; i < retries; i++) {
      const res = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );
      const newSymbols = res ?? [];
  
      if (newSymbols && newSymbols.length) {
        console.log(`found ${newSymbols.length} symbols for ${uri.path}`);
        symbols = newSymbols;
        break;
      }
      console.log(`waiting for symbols... ${i + 1}th attempt`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  
    // Cache the result
    VscodeRequestManager.cache.documentSymbols.set(uriString, symbols);
    return symbols;
  }
  // static async documentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
  //   const uriString = uri.toString();

  //   // Check cache first
  //   if (VscodeRequestManager.cache.documentSymbols.has(uriString)) {
  //     return VscodeRequestManager.cache.documentSymbols.get(uriString)!;
  //   }
  //   await activate(uri);
  //   const res = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
  //     'vscode.executeDocumentSymbolProvider',
  //     uri
  //   );
  //   const symbols = res ?? [];

  //   // Cache the result
  //   VscodeRequestManager.cache.documentSymbols.set(uriString, symbols);
  //   return symbols;
  // }

  static async workspaceSymbols(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
    const uriString = uri.toString();

    // Check cache first
    if (VscodeRequestManager.cache.workspaceSymbols.has(uriString)) {
      return VscodeRequestManager.cache.workspaceSymbols.get(uriString)!;
    }

    const res = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      uri
    );
    const symbols = res ?? [];

    // Cache the result
    VscodeRequestManager.cache.workspaceSymbols.set(uriString, symbols);
    return symbols;
  }

  static async definitions(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
    const uriString = uri.toString();
    const positionKey = `${position.line}:${position.character}`;

    // Check cache first
    if (VscodeRequestManager.cache.definitions.has(uriString)) {
      const uriCache = VscodeRequestManager.cache.definitions.get(uriString)!;
      if (uriCache.has(positionKey)) {
        return uriCache.get(positionKey)!;
      }
    }

    const res = await vscode.commands.executeCommand<(vscode.Location[])>(
      'vscode.executeDefinitionProvider',
      uri,
      position
    );
    const definitions = res ?? [];

    // Cache the result
    if (!VscodeRequestManager.cache.definitions.has(uriString)) {
      VscodeRequestManager.cache.definitions.set(uriString, new Map());
    }
    VscodeRequestManager.cache.definitions.get(uriString)!.set(positionKey, definitions);
    return definitions;
  }

  static async references(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
    const uriString = uri.toString();
    const positionKey = `${position.line}:${position.character}`;

    // Check cache first
    if (VscodeRequestManager.cache.references.has(uriString)) {
      const uriCache = VscodeRequestManager.cache.references.get(uriString)!;
      if (uriCache.has(positionKey)) {
        return uriCache.get(positionKey)!;
      }
    }

    const res = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      uri,
      position
    );
    const references = res ?? [];

    // Cache the result
    if (!VscodeRequestManager.cache.references.has(uriString)) {
      VscodeRequestManager.cache.references.set(uriString, new Map());
    }
    VscodeRequestManager.cache.references.get(uriString)!.set(positionKey, references);
    return references;
  }

  static async hover(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Hover[]> {
    const uriString = uri.toString();
    const positionKey = `${position.line}:${position.character}`;

    // Check cache first
    if (VscodeRequestManager.cache.hover.has(uriString)) {
      const uriCache = VscodeRequestManager.cache.hover.get(uriString)!;
      if (uriCache.has(positionKey)) {
        return uriCache.get(positionKey)!;
      }
    }

    const res = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      uri,
      position
    );
    const hover = res ?? [];

    // Cache the result
    if (!VscodeRequestManager.cache.hover.has(uriString)) {
      VscodeRequestManager.cache.hover.set(uriString, new Map());
    }
    VscodeRequestManager.cache.hover.get(uriString)!.set(positionKey, hover);
    return hover;
  }

  static async semanticTokens(uri: vscode.Uri): Promise<vscode.SemanticTokens | undefined> {
    const uriString = uri.toString();

    // Check cache first
    if (VscodeRequestManager.cache.semanticTokens.has(uriString)) {
      return VscodeRequestManager.cache.semanticTokens.get(uriString)!;
    }

    await activate(uri);
    const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
      'vscode.provideDocumentSemanticTokens',
      uri
    );

    // Cache the result
    if (tokens) {
      VscodeRequestManager.cache.semanticTokens.set(uriString, tokens);
    }
    return tokens;
  }

  static async semanticTokensLegend(uri: vscode.Uri): Promise<vscode.SemanticTokensLegend> {
    const uriString = uri.toString();

    // Check cache first
    if (VscodeRequestManager.cache.semanticTokensLegend.has(uriString)) {
      return VscodeRequestManager.cache.semanticTokensLegend.get(uriString)!;
    }

    const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      'vscode.provideDocumentSemanticTokensLegend',
      uri
    );

    // Cache the result
    VscodeRequestManager.cache.semanticTokensLegend.set(uriString, legend);
    return legend;
  }

  static async semanticTokensRange(uri: vscode.Uri, range: vscode.Range): Promise<vscode.SemanticTokens | undefined> {
    const uriString = uri.toString();
    const rangeKey = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;

    // Check cache first
    if (VscodeRequestManager.cache.semanticTokensRange.has(uriString)) {
      const uriCache = VscodeRequestManager.cache.semanticTokensRange.get(uriString)!;
      if (uriCache.has(rangeKey)) {
        return uriCache.get(rangeKey)!;
      }
    }

    const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
      'vscode.provideDocumentRangeSemanticTokens',
      uri,
      range
    );

    // Cache the result
    if (!VscodeRequestManager.cache.semanticTokensRange.has(uriString)) {
      VscodeRequestManager.cache.semanticTokensRange.set(uriString, new Map());
    }
    if (tokens) {
      VscodeRequestManager.cache.semanticTokensRange.get(uriString)!.set(rangeKey, tokens);
    }
    return tokens;
  }

  static async semanticTokensLegendRange(uri: vscode.Uri, range: vscode.Range): Promise<vscode.SemanticTokensLegend> {
    const uriString = uri.toString();
    const rangeKey = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;

    // Check cache first
    if (VscodeRequestManager.cache.semanticTokensLegendRange.has(uriString)) {
      const uriCache = VscodeRequestManager.cache.semanticTokensLegendRange.get(uriString)!;
      if (uriCache.has(rangeKey)) {
        return uriCache.get(rangeKey)!;
      }
    }

    const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      'vscode.provideDocumentRangeSemanticTokensLegend',
      uri,
      range
    );

    // Cache the result
    if (!VscodeRequestManager.cache.semanticTokensLegendRange.has(uriString)) {
      VscodeRequestManager.cache.semanticTokensLegendRange.set(uriString, new Map());
    }
    VscodeRequestManager.cache.semanticTokensLegendRange.get(uriString)!.set(rangeKey, legend);
    return legend;
  }

  static async codeActions(uri: vscode.Uri, range: vscode.Range): Promise<vscode.CodeAction[]> {
    const uriString = uri.toString();
    const rangeKey = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;

    // Check cache first
    if (VscodeRequestManager.cache.codeActions.has(uriString)) {
      const uriCache = VscodeRequestManager.cache.codeActions.get(uriString)!;
      if (uriCache.has(rangeKey)) {
        return uriCache.get(rangeKey)!;
      }
    }

    const res = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      uri,
      range
    );
    const codeActions = res ?? [];

    // Cache the result
    if (!VscodeRequestManager.cache.codeActions.has(uriString)) {
      VscodeRequestManager.cache.codeActions.set(uriString, new Map());
    }
    VscodeRequestManager.cache.codeActions.get(uriString)!.set(rangeKey, codeActions);
    return codeActions;
  }

  static async typeDefinition(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Definition | vscode.Location | null> {
    const uriString = uri.toString();
    const positionKey = `${position.line}:${position.character}`;

    // Check cache first
    if (VscodeRequestManager.cache.typeDefinition.has(uriString)) {
      const uriCache = VscodeRequestManager.cache.typeDefinition.get(uriString)!;
      if (uriCache.has(positionKey)) {
        return uriCache.get(positionKey)!;
      }
    }

    const res = await vscode.commands.executeCommand<vscode.Definition | vscode.Location | null>(
      'vscode.executeTypeDefinitionProvider',
      uri,
      position
    );
    const typeDefinition = res ?? null;

    // Cache the result
    if (!VscodeRequestManager.cache.typeDefinition.has(uriString)) {
      VscodeRequestManager.cache.typeDefinition.set(uriString, new Map());
    }
    VscodeRequestManager.cache.typeDefinition.get(uriString)!.set(positionKey, typeDefinition);
    return typeDefinition;
  }

  static async closeActiveEditor() {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }

  // Cache management methods
  static clearCache(): void {
    VscodeRequestManager.cache.documentSymbols.clear();
    VscodeRequestManager.cache.workspaceSymbols.clear();
    VscodeRequestManager.cache.definitions.clear();
    VscodeRequestManager.cache.references.clear();
    VscodeRequestManager.cache.hover.clear();
    VscodeRequestManager.cache.semanticTokens.clear();
    VscodeRequestManager.cache.semanticTokensLegend.clear();
    VscodeRequestManager.cache.semanticTokensRange.clear();
    VscodeRequestManager.cache.semanticTokensLegendRange.clear();
    VscodeRequestManager.cache.codeActions.clear();
    VscodeRequestManager.cache.typeDefinition.clear();
  }

  static clearUriCache(uri: vscode.Uri): void {
    const uriString = uri.toString();
    VscodeRequestManager.cache.documentSymbols.delete(uriString);
    VscodeRequestManager.cache.workspaceSymbols.delete(uriString);
    VscodeRequestManager.cache.definitions.delete(uriString);
    VscodeRequestManager.cache.references.delete(uriString);
    VscodeRequestManager.cache.hover.delete(uriString);
    VscodeRequestManager.cache.semanticTokens.delete(uriString);
    VscodeRequestManager.cache.semanticTokensLegend.delete(uriString);
    VscodeRequestManager.cache.semanticTokensRange.delete(uriString);
    VscodeRequestManager.cache.semanticTokensLegendRange.delete(uriString);
    VscodeRequestManager.cache.codeActions.delete(uriString);
    VscodeRequestManager.cache.typeDefinition.delete(uriString);
  }
}