import Parser = require('tree-sitter');
import { v4 as uuidv4 } from 'uuid';
import { ASTParser, SupportedLanguage } from '../ast';
import { CFGNode, CFGNodeType, ControlFlowGraph } from './types';

function pruneText(nodeText: string): string {
    if (nodeText.includes('\n')) {
        return nodeText.split('\n')[0]+' ...';
    }
    return nodeText;
}
export class CFGBuilder {
    private ast!: Parser.Tree;
    private nodes: Map<string, CFGNode>;
    private language: SupportedLanguage;

    constructor(language: SupportedLanguage) {
        this.nodes = new Map();
        this.language = language;
    }

    protected createNode(type: CFGNodeType, astNode: Parser.SyntaxNode): CFGNode {
        const node: CFGNode = {
            id: uuidv4(),
            type,
            astNode,
            successors: [],
            predecessors: [],
        };
        // Clean up the AST node text based on node type
        // if (type === CFGNodeType.CONDITION) {
        //     // For condition nodes, only store the condition part
        //     const conditionNode = astNode.children.find(child => 
        //         child.type === 'comparison_operator' || 
        //         child.type === 'binary_operator');
        //     if (conditionNode) {
        //         (node as any).conditionNode = conditionNode;
        //     }
        // } else if (type === CFGNodeType.STATEMENT) {
        //     // For statement nodes, remove any control structure syntax
        //     if (astNode.type === 'block') {
        //         // Only take the actual statements from the block
        //         const statements = astNode.children
        //             .filter(child => child.type !== 'if' && 
        //                             child.type !== 'else' && 
        //                             child.type !== ':');
        //         node.astNode = statements[0]; // Take the first actual statement
        //     }
        // }

        this.nodes.set(node.id, node);
        return node;
    }

    protected connect(from: CFGNode, to: CFGNode): void {
        if (!from.successors.includes(to)) {
            from.successors.push(to);
        }
        if (!to.predecessors.includes(from)) {
            to.predecessors.push(from);
        }
    }

    public printCFGGraph(entry: CFGNode, indent: string = ''): void {
        // Keep track of visited nodes to handle cycles
        const visited = new Set<string>();
    
        function traverse(node: CFGNode, depth: string = ''): void {
            if (visited.has(node.id)) {
                // console.log(`${depth}[Cycle] -> ${node.type}`);
                return;
            }
    
            visited.add(node.id);
            let nodeInfo = `${depth}Node: ${node.type}`;
            // Print current node information
            // const isBlockNode = node.astNode.type === 'block';

            // Add condition text if it exists
            if (node.type === CFGNodeType.CONDITION) {
                const conditionText = node.astNode.childForFieldName('condition')?.text;
                if (conditionText) {
                    nodeInfo += ` [Condition: ${pruneText(conditionText)}]`;
                }
            }
            
            // Add loop condition if it exists
            if (node.type === CFGNodeType.LOOP) {
                if (node.astNode.type === 'while_statement') {
                    const conditionText = node.astNode.childForFieldName('condition')?.text;
                    nodeInfo += ` [While Condition: ${conditionText}]`;
                } else if (node.astNode.type === 'for_statement') {
                    const iterableText = node.astNode.childForFieldName('iterable')?.text;
                    nodeInfo += ` [For Loop: ${iterableText}]`;
                }
            }
    
            // Add statement text if it's a statement node
            if (node.type === CFGNodeType.STATEMENT) {
                const isMergeNode = node.predecessors.length > 1;
                if (isMergeNode) {
                    return;
                }
                // console.log('statement', node.astNode.text);
                nodeInfo += ` [Statement: ${pruneText(node.astNode.text)}]`;
            }
    
            console.log(nodeInfo);
    
            // Print connections
            // if (node.predecessors.length > 0) {
            //     console.log(`${depth}├── Predecessors: ${node.predecessors.map(p => p.type).join(', ')}`);
            // }
    
            // Handle special cases for condition nodes
            if (node.type === CFGNodeType.CONDITION) {
                if (node.trueBlock) {
                    console.log(`${depth}├── True Branch: ${pruneText(node.trueBlock.type)}`);
                    traverse(node.trueBlock, depth + '│   ');
                }
                if (node.falseBlock) {
                    console.log(`${depth}├── False Branch: ${pruneText(node.falseBlock.type)}`);
                    traverse(node.falseBlock, depth + '│   ');
                }
            }
    
            // Traverse successors
            node.successors.forEach((successor, index) => {
                const isLast = index === node.successors.length - 1;
                // if node.type is block we do not add depth
                if (successor.type === CFGNodeType.BLOCK) {
                    traverse(successor, depth);
                } else {
                    const prefix = isLast ? '└── ' : '├── ';
                    // console.log(`${depth}${prefix}Successor: ${successor.type}`);
                    traverse(successor, depth + (isLast ? '    ' : '│   '));
                }
            });
        }
    
        traverse(entry);
    }

    public async buildFromCode(sourceCode: string): Promise<ControlFlowGraph> {
        const parser = ASTParser.getInstance();
        await parser.setLanguage(this.language);
        this.ast = parser.parse(sourceCode);
        
        const entry = this.createNode(CFGNodeType.ENTRY, this.ast.rootNode);
        const exit = this.createNode(CFGNodeType.EXIT, this.ast.rootNode);
        
        const graph: ControlFlowGraph = {
            entry,
            exit,
            nodes: this.nodes,
            language: this.language
        };

        // Start building the CFG from the root node
        const lastNode = this.processNode(this.ast.rootNode, entry);
        if (lastNode) {
            this.connect(lastNode, exit);
        }

        return graph;
    }

    protected processNode(node: Parser.SyntaxNode, current: CFGNode): CFGNode | null {
        // This is the base method that will be overridden by language-specific implementations
        // For now, we'll just create a basic flow
        const newNode = this.createNode(CFGNodeType.STATEMENT, node);
        this.connect(current, newNode);
        return newNode;
    }
} 