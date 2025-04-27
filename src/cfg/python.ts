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

            // case 'continue_statement':
            //     if (this.currentLoopNode) {
            //         const continueNode = this.createNode(CFGNodeType.CONTINUE, node);
            //         continueNode.isLoopContinue = true;
            //         continueNode.isLoopBackEdge = true;
            //         this.connect(current, continueNode);
            //         this.connect(continueNode, this.currentLoopNode);
            //         return continueNode;
            //     }
            //     return current;
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
            // case 'break_statement':
            //     if (this.currentLoopNode) {
            //         const breakNode = this.createNode(CFGNodeType.BREAK, node);
            //         breakNode.isLoopBreak = true;
            //         this.connect(current, breakNode);
            //         // Exit node connection will be handled in loop processing
            //         return breakNode;
            //     }
            //     return current;

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
        }
    
        // Create merge node
        const mergeNode = this.createNode(CFGNodeType.MERGED, node);
        if (consequenceEnd !== conditionNode) {
            this.connect(consequenceEnd, mergeNode);
        }
        if (else_clauseEnd !== conditionNode) {
            this.connect(else_clauseEnd, mergeNode);
        }
    
        return mergeNode;
    }

    private finalizeLoop(currentLoopNode: LoopContext, previousLoopNode: LoopContext | null, lastNode: CFGNode, whileConditionNode: CFGNode): CFGNode {
        // Create exit merge node
        
        // at the end of the loop, connect to exit merged
        whileConditionNode.falseBlock = currentLoopNode.exitMergedNode;
        this.connect(whileConditionNode, currentLoopNode.exitMergedNode);
        
        this.currentLoopNode = previousLoopNode;

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
        if (lastNode !== whileConditionNode && !lastNode.isLoopBreak && !lastNode.isLoopContinue) {
            this.connect(lastNode, currentLoopNode.exitMergedNode);
        }
    
        // // Connect condition's false branch to exit
        // whileConditionNode.falseBlock = exitNode;
        // this.connect(whileConditionNode, exitNode);
    
        return currentLoopNode.exitMergedNode;
    }

    // private processWhileStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {

    //     const loopNode = this.createNode(CFGNodeType.LOOP, node);
    //     this.connect(current, loopNode);

    //     const comparisonNode = node.children.find(child => child.type === 'comparison_operator');
    //     if (comparisonNode) {
    //         const conditionNode = this.createNode(CFGNodeType.CONDITION, comparisonNode);
    //         this.connect(current, conditionNode);
    //         console.log("While condition:", comparisonNode.text);
    //     }
    //     // Process main body
    //     const body = node.children.find(child => child.type === 'block');
    //     let bodyEnd = loopNode;
    //     if (body) {
    //         const bodyNode = this.createNode(CFGNodeType.STATEMENT, body);
    //         this.connect(loopNode, bodyNode);
            
    //         // Process each statement in the body block
    //         let lastNode = bodyNode;
    //         for (const child of body.children) {
    //             const processed = this.processNode(child, lastNode);
    //             if (processed) {
    //                 lastNode = processed;
    //             }
    //         }
    //         bodyEnd = lastNode;
    //         this.connect(bodyEnd, loopNode); // Connect back to loop condition
    //     }
    
    //     // Create exit node for the loop
    //     const exitNode = this.createNode(CFGNodeType.STATEMENT, node);
    //     this.connect(loopNode, exitNode);
    
    //     return exitNode;
    // }
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
            // Connect body's end back to loop node
            // this.connect(lastNode, loopNode);
        }

        this.finalizeLoop(this.currentLoopNode, previousLoopNode, lastNode, whileConditionNode);
        // Connect back edges to loop node
        // processedNodes.forEach(node => {
        //     if (node.isLoopBackEdge || node.isLoopContinue) {
        //         this.connect(node, loopNode);
        //     }
        //     if (node.isLoopBreak) {
        //         this.connect(node, exitNode);
        //     }
        // });
        
        // if (lastNode !== whileConditionNode && !lastNode.isLoopBreak && !lastNode.isLoopContinue) {
        //     this.connect(lastNode, exitNode);
        // }

        return exitNode;
    }
    // private processWhileStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
    //     // Create loop node first
    //     const loopNode = this.createNode(CFGNodeType.LOOP, node);
    //     this.connect(current, loopNode);
        
    //     // Create condition node
    //     const whileConditionNode = this.createNode(CFGNodeType.CONDITION, loopNode.astNode);
    //     this.connect(loopNode, whileConditionNode);
    
    //     // Process main body (true block)
    //     const body = node.children.find(child => child.type === 'block');
    //     let lastNode = whileConditionNode;
    //     if (body) {
    //         const bodyNode = this.createNode(CFGNodeType.BLOCK, body);
    //         // Connect condition to body as true block
    //         whileConditionNode.trueBlock = bodyNode;
    //         this.connect(whileConditionNode, bodyNode);
            
    //         // Process each statement in the body block
    //         lastNode = bodyNode;
    //         for (const child of body.children) {
    //             // Handle break and continue statements
    //             if (child.type === 'continue_statement') {
    //                 const continueNode = this.createNode(CFGNodeType.STATEMENT, child);
    //                 continueNode.isLoopContinue = true;
    //                 continueNode.isLoopBackEdge = true;
    //                 this.connect(lastNode, continueNode);
    //                 this.connect(continueNode, loopNode);
    //                 continue;
    //             }
    //             if (child.type === 'break_statement') {
    //                 const breakNode = this.createNode(CFGNodeType.STATEMENT, child);
    //                 breakNode.isLoopBreak = true;
    //                 this.connect(lastNode, breakNode);
    //                 lastNode = breakNode;
    //                 break;
    //             }
    
    //             const processed = this.processNode(child, lastNode);
    //             if (processed) {
    //                 lastNode = processed;
    //                 // If not a break statement, connect back to loop
    //                 if (child.type !== 'break_statement') {
    //                     processed.isLoopBackEdge = true;
    //                     this.connect(processed, loopNode);
    //                 }
    //             }
    //         }
    //     }
    
    //     const exitNode = this.createNode(CFGNodeType.EXIT_MERGED, node);
    //     if (lastNode !== whileConditionNode) {
    //         this.connect(lastNode, exitNode);
    //     }
    
    //     // Connect condition to exit node as false block
    //     whileConditionNode.falseBlock = exitNode;
    //     this.connect(whileConditionNode, exitNode);
    
    //     return exitNode;
    // }
    
    private processForStatement(node: Parser.SyntaxNode, current: CFGNode): CFGNode {
        // Similar to while statement but with initialization
        const loopNode = this.createNode(CFGNodeType.LOOP, node);
        this.connect(current, loopNode);

        const body = node.childForFieldName('body');
        let lastNode = loopNode;
        if (body) {
            const bodyNode = this.createNode(CFGNodeType.STATEMENT, body);
            this.connect(loopNode, bodyNode);
            const bodyEnd = this.processNode(body, bodyNode) || bodyNode;
            // this.connect(bodyEnd, loopNode);
            lastNode = bodyEnd;
        }

        const exitNode = this.createNode(CFGNodeType.STATEMENT, node);
        this.connect(lastNode, exitNode);

        return exitNode;
    }
} 