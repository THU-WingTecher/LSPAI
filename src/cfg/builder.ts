import Parser = require('tree-sitter');
import { v4 as uuidv4 } from 'uuid';
import { ASTParser, SupportedLanguage } from '../ast';
import { CFGNode, CFGNodeType, ControlFlowGraph } from './types';
import { LoopHeaderExtractor, LoopHeaderExtractorFactory } from './languageAgnostic';
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
    protected loopHeaderExtractor: LoopHeaderExtractor;
    constructor(language: SupportedLanguage) {
        this.nodes = new Map();
        this.language = language;
        this.loopHeaderExtractor = LoopHeaderExtractorFactory.createExtractor(language);
    }

    protected createNode(type: CFGNodeType, astNode: Parser.SyntaxNode): CFGNode {
        const node: CFGNode = {
            id: uuidv4(),
            text: astNode.text,
            type,
            astNode,
            successors: [],
            predecessors: [],
        };

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
            const isMergeNode = node.type === CFGNodeType.MERGED;
            const isExitMergedNode = node.type === CFGNodeType.EXIT_MERGED;
            // Skip if already visited and not a merged node
            if (visited.has(node.id) && !isMergeNode && !isExitMergedNode) {
                console.log(`${depth}[Cycle] -> ${node.type}`);
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
                nodeInfo += ` [Statement: ${pruneText(node.astNode.text)}]`;
                const isMergeNode = node.predecessors.length > 1;
                if (isMergeNode) {
                    console.log(`${depth}Node: MERGED`);
                } else {
                    // console.log('statement', node.astNode.text);
                    console.log(nodeInfo);
                }
            }
            
    
            // Print connections
            // if (node.predecessors.length > 0) {
            //     console.log(`${depth}├── Predecessors: ${node.predecessors.map(p => p.type).join(', ')}`);
            // }
    
            // Handle special cases for condition nodes
            if (node.type === CFGNodeType.CONDITION) {
                console.log(nodeInfo);
                if (node.trueBlock) {
                    console.log(`${depth}├── True Branch: ${pruneText(node.trueBlock.type)}`);
                    traverse(node.trueBlock, depth + '│   ');
                }
                if (node.falseBlock) {
                    console.log(`${depth}├── False Branch: ${pruneText(node.falseBlock.type)}`);
                    traverse(node.falseBlock, depth + '│   ');
                }
                return;
            }
    
            // Traverse successors
            node.successors.forEach((successor, index) => {
                const isLast = index === node.successors.length - 1;
                // if node.type is block we do not add depth
                if (successor.type === CFGNodeType.BLOCK) {
                    traverse(successor, depth);
                } else if (successor.type === CFGNodeType.EXIT) {
                    return;
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