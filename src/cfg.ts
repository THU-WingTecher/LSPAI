// cfg.ts
import * as vscode from 'vscode';
import { DecodedToken } from './token';
import { getDecodedTokensFromRange, retrieveDef } from './token';

interface CFGNode {
    id: string;
    token: DecodedToken;
    type: 'statement' | 'condition' | 'loop' | 'function';
}

interface CFGEdge {
    from: string;
    to: string;
    type: 'sequential' | 'conditional-true' | 'conditional-false' | 'loop-back';
}

export class ControlFlowAnalyzer {
    private nodes: Map<string, CFGNode> = new Map();
    private edges: CFGEdge[] = [];
    private paths: string[][] = [];

    constructor(private document: vscode.TextDocument) {}

    private async isLanguageServerReady(): Promise<boolean> {
        try {
            // Try to get language client status
            const languageClient = await vscode.commands.executeCommand<any>(
                'vscode.executeImplementationProvider',
                this.document.uri,
                new vscode.Position(0, 0)
            );

            // Check if we have a language server for this document type
            const hasLanguageServer = vscode.languages.getLanguages().then(languages => 
                languages.includes(this.document.languageId)
            );

            // Wait a bit for server to be ready if it exists
            if (await hasLanguageServer) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Language server not ready:', error);
            return false;
        }
    }

    async analyze(range: vscode.Range): Promise<void> {
        // Check if language server is ready
        // if (!await this.isLanguageServerReady()) {
        //     throw new Error(`Language server not initialized for ${this.document.languageId}`);
        // }

        // Get semantic tokens for the range
        const tokens = await getDecodedTokensFromRange(
            this.document,
            range.start,
            range.end
        );
        const skipDefinition = true;
        await retrieveDef(this.document, tokens, skipDefinition);
        console.log('document == \n', this.document.getText());
        console.log('tokens', tokens.map(token => `${token.word}::${token.modifiers[0] || ''}::${token.type}`));

        // Build CFG from tokens
        await this.buildCFG(tokens);
        
        // Find all execution paths
        this.findExecutionPaths();
    }

    private async buildCFG(tokens: DecodedToken[]): Promise<void> {
        let currentNodeId = '';
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Create node based on token type
            const node = this.createNode(token);
            this.nodes.set(node.id, node);
            
            if (currentNodeId) {
                // Add edge from previous node
                if (this.isControlFlowToken(token)) {
                    // Handle control flow structures
                    await this.handleControlFlow(token, currentNodeId, tokens.slice(i));
                } else {
                    // Sequential flow
                    this.edges.push({
                        from: currentNodeId,
                        to: node.id,
                        type: 'sequential'
                    });
                }
            }
            
            currentNodeId = node.id;
        }
    }

    private createNode(token: DecodedToken): CFGNode {
        return {
            id: `node_${token.line}_${token.startChar}`,
            token: token,
            type: this.getNodeType(token)
        };
    }

    private getNodeType(token: DecodedToken): 'statement' | 'condition' | 'loop' | 'function' {
        // Determine node type based on token type and modifiers
        if (token.type === 'keyword' && 
            (token.word === 'if' || token.word === 'else' || token.word === 'switch')) {
            return 'condition';
        }
        if (token.type === 'keyword' && 
            (token.word === 'for' || token.word === 'while' || token.word === 'do')) {
            return 'loop';
        }
        if (token.type === 'function') {
            return 'function';
        }
        return 'statement';
    }

    private isControlFlowToken(token: DecodedToken): boolean {
        const controlFlowKeywords = ['if', 'else', 'for', 'while', 'do', 'switch'];
        return token.type === 'keyword' && controlFlowKeywords.includes(token.word);
    }

    private async handleControlFlow(
        token: DecodedToken, 
        currentNodeId: string, 
        remainingTokens: DecodedToken[]
    ): Promise<void> {
        switch (token.word) {
            case 'if':
                await this.handleIfStatement(token, currentNodeId, remainingTokens);
                break;
            case 'for':
            case 'while':
                await this.handleLoop(token, currentNodeId, remainingTokens);
                break;
            // Add more control flow handlers as needed
        }
    }

    private async handleIfStatement(
        token: DecodedToken,
        currentNodeId: string,
        remainingTokens: DecodedToken[]
    ): Promise<void> {
        // Find the matching else block if it exists
        const blockInfo = await this.findBlockBoundaries(token);
        if (!blockInfo) return;

        const { thenBlock, elseBlock } = blockInfo;

        // Add edges for both branches
        if (thenBlock) {
            this.edges.push({
                from: currentNodeId,
                to: thenBlock.id,
                type: 'conditional-true'
            });
        }

        if (elseBlock) {
            this.edges.push({
                from: currentNodeId,
                to: elseBlock.id,
                type: 'conditional-false'
            });
        }
    }

    private async handleLoop(
        token: DecodedToken,
        currentNodeId: string,
        remainingTokens: DecodedToken[]
    ): Promise<void> {
        const blockInfo = await this.findBlockBoundaries(token);
        if (!blockInfo) return;

        const { thenBlock } = blockInfo;

        if (thenBlock) {
            // Add edge into loop
            this.edges.push({
                from: currentNodeId,
                to: thenBlock.id,
                type: 'conditional-true'
            });

            // Add loop-back edge
            this.edges.push({
                from: thenBlock.id,
                to: currentNodeId,
                type: 'loop-back'
            });
        }
    }

    private async findBlockBoundaries(token: DecodedToken): Promise<{
        thenBlock?: CFGNode;
        elseBlock?: CFGNode;
    }> {
        // Use document.getText() and parsing to find block boundaries
        // This is a simplified version - you'll need to implement proper block detection
        const line = this.document.lineAt(token.line);
        const text = line.text;

        // Find opening brace
        const openBraceIndex = text.indexOf('{', token.startChar);
        if (openBraceIndex === -1) return {};

        // Create node for block start
        const blockNode = this.createNode({
            ...token,
            startChar: openBraceIndex,
            length: 1,
            word: '{'
        });

        return { thenBlock: blockNode };
    }

    private findExecutionPaths(
        startNode: string = this.getEntryNode(),
        currentPath: string[] = []
    ): void {
        currentPath.push(startNode);

        const outgoingEdges = this.edges.filter(edge => edge.from === startNode);
        
        if (outgoingEdges.length === 0) {
            // Reached end of path
            this.paths.push([...currentPath]);
        } else {
            // Continue DFS for each outgoing edge
            for (const edge of outgoingEdges) {
                if (!currentPath.includes(edge.to) || this.isLoopEdge(edge)) {
                    this.findExecutionPaths(edge.to, [...currentPath]);
                }
            }
        }
    }

    private getEntryNode(): string {
        return Array.from(this.nodes.keys())[0];
    }

    private isLoopEdge(edge: CFGEdge): boolean {
        return edge.type === 'loop-back';
    }

    public getCFG() {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: this.edges,
            paths: this.paths
        };
    }
}

// Usage in your extension:
export async function analyzeCFG(document: vscode.TextDocument, range: vscode.Range) {
    const analyzer = new ControlFlowAnalyzer(document);
    await analyzer.analyze(range);
    return analyzer.getCFG();
}