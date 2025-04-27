import Parser = require('tree-sitter');
import { CFGBuilder } from './builder';
import { CFGNode, CFGNodeType, LoopContext } from './types';
import { CodeAction } from 'vscode';
import { sortAndDeduplicateDiagnostics } from 'typescript/lib/typescript';

export class PythonCFGBuilder extends CFGBuilder {
    private currentLoopNode: LoopContext | null = null;  // Track current loop context

    protected processNode(node: Parser.SyntaxNode, current: CFGNode): CFGNode | null {
        
        switch (node.type) {
            case 'module':
            case 'block':
            case 'function_definition':  // Add this case
                // Process each child in sequence
                let lastNode = current;
                for (const child of node.children) {
                    const processed = this.processNode(child, lastNode);
                    if (processed) {
                        lastNode = processed;
                    }
                }
                return lastNode;

            case 'if_statement':
                return this.processIfStatement(node, current);

            case 'while_statement':
                return this.processWhileStatement(node, current);

            case 'for_statement':
                return this.processForStatement(node, current);

            case 'continue_statement':
                if (this.currentLoopNode) {
                    const continueNode = this.createNode(CFGNodeType.CONTINUE, node);
                    continueNode.isLoopContinue = true;
                    continueNode.isLoopBackEdge = true;
                    this.connect(current, continueNode);
                    this.currentLoopNode.continueNodes.push(continueNode);
                    return continueNode;
                }
                return current;

            case 'break_statement':
                if (this.currentLoopNode) {
                    const breakNode = this.createNode(CFGNodeType.BREAK, node);
                    breakNode.isLoopBreak = true;
                    this.connect(current, breakNode);
                    // Add to loop's break nodes
                    this.currentLoopNode.breakNodes.push(breakNode);
                    return breakNode;
                }
                return current;

            case 'return_statement':
            case 'expression_statement':
                const statementNode = this.createNode(CFGNodeType.STATEMENT, node);
                this.connect(current, statementNode);
                return statementNode;

            default:
                // Log unhandled node types
                console.log(`Skipping unhandled node type: ${node.type}`);
                return current;
        }
    }

    private processIfStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        console.log('Processing if statement:', node.type);
        console.log('Children:', node.children.map(c => ({type: c.type, text: c.text})));
    
        const conditionNode = this.createNode(CFGNodeType.CONDITION, node);
        this.connect(current, conditionNode);
    
        // Process consequence (then branch)
        const consequence = node.childForFieldName('consequence');
        let consequenceEnd = conditionNode;
        if (consequence) {
            // console.log('Processing consequence:', consequence.type);
            const consequenceNode = this.createNode(CFGNodeType.BLOCK, consequence);
            conditionNode.trueBlock = consequenceNode;
            this.connect(conditionNode, consequenceNode);
            
            // Process all statements in the consequence block
            let lastNode = consequenceNode;
            for (const child of consequence.children) {
                console.log('Processing consequence child:', child.type);
                const processed = this.processNode(child, lastNode);
                if (processed) {
                    lastNode = processed;
                }
            }
            consequenceEnd = lastNode;
        }
    
        // Process alternative (else branch)
        const else_clause = node.children.find(child => child.type === 'else_clause');
        let else_clauseEnd = conditionNode;
        
        // Create merge node
        const mergeNode = this.createNode(CFGNodeType.MERGED, node);

        if (else_clause) {
            console.log('Processing else_clause:', else_clause.type);
            const else_clauseNode = this.createNode(CFGNodeType.BLOCK, else_clause);
            conditionNode.falseBlock = else_clauseNode;
            this.connect(conditionNode, else_clauseNode);
            
            // Process all statements in the else_clause block
            let lastNode = else_clauseNode;
            for (const child of else_clause.children) {
                console.log('Processing else_clause child:', child.type);
                const processed = this.processNode(child, lastNode);
                if (processed) {
                    lastNode = processed;
                }
            }
            else_clauseEnd = lastNode;
        } else {
            // When no else clause exists, set falseBlock to merge node directly
            conditionNode.falseBlock = mergeNode;
            this.connect(conditionNode, mergeNode);
        }
    
        // Connect true branch end to merge node
        if (consequenceEnd !== conditionNode) {
            this.connect(consequenceEnd, mergeNode);
        }
        // Connect false branch end to merge node (only if there was an else clause)
        if (else_clauseEnd !== conditionNode && else_clause) {
            this.connect(else_clauseEnd, mergeNode);
        }
    
        return mergeNode;
    }

    private finalizeLoop(currentLoopNode: LoopContext, lastNode: CFGNode, loopStartNode: CFGNode): CFGNode {
        // Create exit merge node
        


        // const exitNode = this.createNode(CFGNodeType.EXIT_MERGED, currentLoopNode.node.astNode);
        
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

    private processWhileStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        // Create loop node first
        const processedNodes : CFGNode[] = [];
        const loopNode = this.createNode(CFGNodeType.LOOP, node);
        this.connect(current, loopNode);
        
        // Create condition node
        const whileConditionNode = this.createNode(CFGNodeType.CONDITION, loopNode.astNode);
        this.connect(loopNode, whileConditionNode);

        // Process main body (true block)
        const body = node.children.find(child => child.type === 'block');
        let lastNode = whileConditionNode;
    
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
            whileConditionNode.trueBlock = bodyNode;
            this.connect(whileConditionNode, bodyNode);
            
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
        this.finalizeLoop(this.currentLoopNode, lastNode, whileConditionNode);
        this.currentLoopNode = previousLoopNode;


        return exitNode;
    }
    
    private processForStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        // Create loop node first
        const processedNodes: CFGNode[] = [];
        const loopNode = this.createNode(CFGNodeType.LOOP, node);
        this.connect(current, loopNode);

        // Process main body
        const body = node.childForFieldName('body');
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
}