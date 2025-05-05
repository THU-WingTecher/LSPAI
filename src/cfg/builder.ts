import Parser = require('tree-sitter');
import { v4 as uuidv4 } from 'uuid';
import { ASTParser, SupportedLanguage } from '../ast';
import { CFGNode, CFGNodeType, ControlFlowGraph, LoopContext } from './types';
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
    protected currentLoopNode: LoopContext | null = null;  // Track current loop context

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

    protected processBlock(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        let lastNode = current;
        for (const child of node.children) {
            const processed = this.processNode(child, lastNode);
            if (processed) {
                lastNode = processed;
            }
        }
        return lastNode;
    }

    protected processExpressionStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        const statementNode = this.createNode(CFGNodeType.STATEMENT, node);
        this.connect(current, statementNode);
        return statementNode;
    }

    protected processContinueStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        if (this.currentLoopNode) {
            const continueNode = this.createNode(CFGNodeType.CONTINUE, node);
            continueNode.isLoopContinue = true;
            continueNode.isLoopBackEdge = true;
            this.connect(current, continueNode);
            this.currentLoopNode.continueNodes.push(continueNode);
            return continueNode;
        }
        return current;
    }

    protected processBreakStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        if (this.currentLoopNode) {
            const breakNode = this.createNode(CFGNodeType.BREAK, node);
            breakNode.isLoopBreak = true;
            this.connect(current, breakNode);
            // Add to loop's break nodes
            this.currentLoopNode.breakNodes.push(breakNode);
            return breakNode;
        }
        return current;
    }

    protected processReturnStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        const returnNode = this.createNode(CFGNodeType.RETURN, node);
        this.connect(current, returnNode);
        return returnNode;
    }


    protected processForStatement(node: Parser.SyntaxNode, current: CFGNode, bodyType: string): CFGNode {
        // Create loop node first

        const forHeader = this.loopHeaderExtractor.extractLoopHeader(node);
        
        const processedNodes: CFGNode[] = [];
        const loopNode = this.createNode(CFGNodeType.LOOP, node);
        const forStatementNode = this.createNode(CFGNodeType.STATEMENT, {
            ...node,
            text: forHeader
        } as Parser.SyntaxNode);
        this.connect(current, forStatementNode);
        this.connect(forStatementNode, loopNode);

        // Process main body
        // const body = node.childForFieldName(bodyType);
        const body = node.childForFieldName(bodyType);
        let lastNode = loopNode;
    
        // Save previous loop context and set current one
        const previousLoopNode = this.currentLoopNode;
        const exitNode = this.createNode(CFGNodeType.EXIT_MERGED, node);
        this.currentLoopNode = {
            node: loopNode,
            breakNodes: [],
            continueNodes: [],
            exitMergedNode: exitNode
        };

        if (body) {
            const bodyNode = this.createNode(CFGNodeType.BLOCK, body);
            // Connect loop directly to body
            this.connect(loopNode, bodyNode);
            
            // Process each statement in the body block
            lastNode = bodyNode;
            for (const child of body.children) {
                const processed = this.processNode(child, lastNode);
                if (processed) {
                    lastNode = processed;
                    processedNodes.push(processed);
                }
            }


        }
        this.finalizeLoop(this.currentLoopNode, lastNode, loopNode);
        this.currentLoopNode = previousLoopNode;

        return exitNode;
    }

    protected getConditionText(node: Parser.SyntaxNode): string {
        return node.childForFieldName('condition')?.text || (node as any).conditionNode.text || "";
    }

    protected processIfStatement(
        node: Parser.SyntaxNode,
        current: CFGNode,
        consequenceField: string,
        elseClauseType: string
    ): CFGNode {
        const conditionNode = this.createNode(CFGNodeType.CONDITION, node);
        conditionNode.condition = this.getConditionText(node);
        this.connect(current, conditionNode);
    
        // Process consequence (then branch)
        const consequence = node.childForFieldName(consequenceField);
        let consequenceEnd = conditionNode;
        if (consequence) {
            const consequenceNode = this.createNode(CFGNodeType.BLOCK, consequence);
            conditionNode.trueBlock = consequenceNode;
            this.connect(conditionNode, consequenceNode);
    
            let lastNode = consequenceNode;
            for (const child of consequence.children) {
                const processed = this.processNode(child, lastNode);
                if (processed) {
                    lastNode = processed;
                }
            }
            consequenceEnd = lastNode;
        }
    
        // Process alternative (else branch)
        const else_clause = node.children.find(child => child.type === elseClauseType);
        let else_clauseEnd = conditionNode;
    
        // Create merge node
        const mergeNode = this.createNode(CFGNodeType.MERGED, node);
    
        if (else_clause) {
            const else_clauseNode = this.createNode(CFGNodeType.BLOCK, else_clause);
            conditionNode.falseBlock = else_clauseNode;
            this.connect(conditionNode, else_clauseNode);
    
            let lastNode = else_clauseNode;
            for (const child of else_clause.children) {
                const processed = this.processNode(child, lastNode);
                if (processed) {
                    lastNode = processed;
                }
            }
            else_clauseEnd = lastNode;
        } else {
            conditionNode.falseBlock = mergeNode;
            this.connect(conditionNode, mergeNode);
        }
    
        if (consequenceEnd !== conditionNode) {
            this.connect(consequenceEnd, mergeNode);
        }
        if (else_clauseEnd !== conditionNode && else_clause) {
            this.connect(else_clauseEnd, mergeNode);
        }
    
        return mergeNode;
    }
    
    protected processWhileStatement(node: Parser.SyntaxNode, current: CFGNode, comparisonType: string, bodyType: string): CFGNode {
        // Create loop node first
        const processedNodes : CFGNode[] = [];
        // Create condition node
        // const comparison = node.children.find(child => child.type === comparisonType)!;
        const whileConditionNode = this.createNode(CFGNodeType.CONDITION, node);
        whileConditionNode.condition = this.getConditionText(node);
        this.connect(current, whileConditionNode);

        const loopNode = this.createNode(CFGNodeType.LOOP, node);
        const whileStatementNode = this.createNode(CFGNodeType.STATEMENT, {
            ...node,
            text: this.loopHeaderExtractor.extractLoopHeader(node)
        } as Parser.SyntaxNode);
        // this.connect(current, whileStatementNode);
        whileConditionNode.trueBlock = whileStatementNode;
        // this.connect(whileConditionNode, whileStatementNode);
        this.connect(whileStatementNode, loopNode);
        
        // Process main body (true block)
        const body = node.children.find(child => child.type === bodyType);
        let lastNode = loopNode;
    
        // Save previous loop context and set current one
        const previousLoopNode = this.currentLoopNode;
        const exitNode = this.createNode(CFGNodeType.EXIT_MERGED, node);
        this.currentLoopNode = {
            node: loopNode,
            breakNodes: [],
            continueNodes: [],
            exitMergedNode: exitNode
        };

        if (body) {
            const bodyNode = this.createNode(CFGNodeType.BLOCK, body);
            // Connect condition to body as true block
            // whileConditionNode.trueBlock = bodyNode;
            this.connect(loopNode, bodyNode);
            
            // Process each statement in the body block
            lastNode = bodyNode;
            for (const child of body.children) {
                const processed = this.processNode(child, lastNode);
                if (processed) {
                    lastNode = processed;
                    processedNodes.push(processed);
                }
            }

        }

        // at the end of the loop, connect to exit merged
        whileConditionNode.falseBlock = this.currentLoopNode.exitMergedNode;
        this.connect(whileConditionNode, this.currentLoopNode.exitMergedNode);
        this.finalizeLoop(this.currentLoopNode, lastNode, loopNode);
        this.currentLoopNode = previousLoopNode;


        return exitNode;
    }
    
    protected processTryStatement(node: Parser.SyntaxNode, current: CFGNode, bodyType: string, exceptClauseType: string, elseClauseType: string, finallyClauseType: string): CFGNode {
        // Create try block node
        const body = node.children.find(child => child.type === bodyType);
        if (!body) {
            throw new Error('Try block not found');
        }
        const tryNode = this.createNode(CFGNodeType.TRY, body);
        this.connect(current, tryNode);
    
        // Process try block
        let lastTryNode = tryNode;
        for (const child of body.children) {
            const processed = this.processNode(child, lastTryNode);
            if (processed) {
                lastTryNode = processed;
            }
        }
        const tryEndNode = this.createNode(CFGNodeType.TRY_ENDED, node);
        this.connect(lastTryNode, tryEndNode);
        // Create merge node for the end of try-except
        const mergeNode = this.createNode(CFGNodeType.MERGED, node);
    
        // Process except handlers
        const handlers = node.children.filter(child => child.type === exceptClauseType);
        for (const handler of handlers) {
            const handlerNode = this.createNode(CFGNodeType.CATCH, handler);
            // Connect try block to handler
            this.connect(tryEndNode, handlerNode);
    
            // Process handler body
            let lastHandlerNode = handlerNode;
            const handlerBody = handler.children.find(child => child.type === 'block')
            if (handlerBody) {
                for (const child of handlerBody.children) {
                    const processed = this.processNode(child, lastHandlerNode);
                    if (processed) {
                        lastHandlerNode = processed;
                    }
                }
            }
            // Connect handler to merge node
            this.connect(lastHandlerNode, mergeNode);
        }
    
        // Process else clause if it exists
        const elseClause = node.children.find(child => child.type === elseClauseType);
        if (elseClause) {
            const elseNode = this.createNode(CFGNodeType.ELSE, elseClause);
            this.connect(tryEndNode, elseNode);
    
            let lastElseNode = elseNode;
            for (const child of elseClause.children) {
                const processed = this.processNode(child, lastElseNode);
                if (processed) {
                    lastElseNode = processed;
                }
            }
            this.connect(lastElseNode, mergeNode);
        } else {
            // If no else clause, connect try block directly to merge node
            this.connect(tryEndNode, mergeNode);
        }
    
        // Process finally clause if it exists
        const finallyClause = node.children.find(child => child.type === finallyClauseType);
        if (finallyClause) {
            const finallyNode = this.createNode(CFGNodeType.FINALLY, finallyClause);
            this.connect(mergeNode, finallyNode);
    
            let lastFinallyNode = finallyNode;
            for (const child of finallyClause.children) {
                const processed = this.processNode(child, lastFinallyNode);
                if (processed) {
                    lastFinallyNode = processed;
                }
            }
            return lastFinallyNode;
        }
    
        return mergeNode;
    }
    protected finalizeLoop(currentLoopNode: LoopContext, lastNode: CFGNode, loopStartNode: CFGNode): CFGNode {

        // Connect nodes based on their type
        if (currentLoopNode.breakNodes.length > 0) {
            currentLoopNode.breakNodes.forEach(node => {
                this.connect(node, currentLoopNode.exitMergedNode);
            });
        }
        if (currentLoopNode.continueNodes.length > 0) {
            currentLoopNode.continueNodes.forEach(node => {
                this.connect(node, currentLoopNode.node);
            });
        }
        // Connect last node to exit if it's not a break or continue
        if (lastNode !== loopStartNode && !lastNode.isLoopBreak && !lastNode.isLoopContinue) {
            this.connect(lastNode, currentLoopNode.exitMergedNode);
        }
    
        return currentLoopNode.exitMergedNode;
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
                const conditionText = node.condition;
                if (conditionText) {
                    nodeInfo += ` [Condition: ${pruneText(conditionText)}]`;
                }
            }
            
            // Add loop condition if it exists
            if (node.type === CFGNodeType.LOOP) {
                if (node.astNode.type === 'while_statement') {
                    const conditionText = node.condition;
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