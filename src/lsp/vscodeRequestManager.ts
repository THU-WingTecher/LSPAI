import * as vscode from 'vscode';

export class VscodeRequestManager {
  static async documentSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
    const res = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
    return res ?? [];
  }

  static async workspaceSymbols(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
    const res = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      uri
    );
    return res ?? [];
  }

  static async definitions(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
    const res = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
      'vscode.executeDefinitionProvider',
      uri,
      position
    );
    if (!res) {
      return [];
    }
    return res.map((item: any) => {
      if ('targetUri' in item && item.targetUri && item.targetRange) {
        return new vscode.Location(item.targetUri, item.targetRange);
      }
      return item as vscode.Location;
    });
  }

  static async references(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
    const res = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      uri,
      position
    );
    return res ?? [];
  }

  static async hover(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Hover[]> {
    const res = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      uri,
      position
    );
    return res ?? [];
  }

  static async semanticTokens(uri: vscode.Uri): Promise<vscode.SemanticTokens | undefined> {
    return await vscode.commands.executeCommand<vscode.SemanticTokens>(
      'vscode.provideDocumentSemanticTokens',
      uri
    );
  }

  static async semanticTokensLegend(uri: vscode.Uri): Promise<vscode.SemanticTokensLegend> {
    return await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      'vscode.provideDocumentSemanticTokensLegend',
      uri
    );
  }

  static async semanticTokensRange(uri: vscode.Uri, range: vscode.Range): Promise<vscode.SemanticTokens | undefined> {
    return await vscode.commands.executeCommand<vscode.SemanticTokens>(
      'vscode.provideDocumentRangeSemanticTokens',
      uri,
      range
    );
  }

  static async semanticTokensLegendRange(uri: vscode.Uri, range: vscode.Range): Promise<vscode.SemanticTokensLegend> {
    return await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      'vscode.provideDocumentRangeSemanticTokensLegend',
      uri,
      range
    );
  }

  static async codeActions(uri: vscode.Uri, range: vscode.Range): Promise<vscode.CodeAction[]> {
    const res = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      uri,
      range
    );
    return res ?? [];
  }

  static async typeDefinition(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Definition | vscode.Location | null> {
    const res = await vscode.commands.executeCommand<vscode.Definition | vscode.Location | null>(
      'vscode.executeTypeDefinitionProvider',
      uri,
      position
    );
    return res ?? null;
  }

  static async closeActiveEditor() {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }
}