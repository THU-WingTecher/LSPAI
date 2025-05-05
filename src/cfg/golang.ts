// src/cfg/golang.ts
import Parser = require('tree-sitter');
import { CFGBuilder } from './builder';
import { CFGNode, CFGNodeType } from './types';

export class GolangCFGBuilder extends CFGBuilder {
    protected processNode(node: Parser.SyntaxNode, current: CFGNode): CFGNode | null {
        switch (node.type) {
            case 'source_file':
            case 'block':
            case 'func':
            case 'function_declaration':
            case 'method_declaration':
                // Go: process all children in sequence
                return this.processBlock(node, current);

            case 'if_statement':
                // Go: consequence field is 'consequence', else clause type is 'else'
                return this.processIfStatement(node, current, 'consequence', 'else');

            case 'for_statement':
                // Go: body field is 'body'
                return this.processForStatement(node, current, 'block');

            case 'continue_statement':
                return this.processContinueStatement(node, current);
                
            case '{':
            case '}':
                return current;

            case 'break_statement':
                return this.processBreakStatement(node, current);

            case 'return_statement':
                return this.processReturnStatement(node, current);

            case 'identifier':
            case 'parameter_list':
            case 'type_identifier':
            case 'expression_statement':
            case 'short_var_declaration':
            case 'assignment_statement':
            case 'inc_statement':
            case 'dec_statement':
                return this.processExpressionStatement(node, current);

            // Go does not have try/catch/finally, so skip

            default:
                // Log unhandled node types for debugging
                console.log(`Skipping unhandled node type: ${node.type}`);
                return current;
        }
    }

    protected getConditionText(node: Parser.SyntaxNode): string {
        return node.children.find(child => child.type === 'binary_expression')?.text || "";
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
    
        if (else_clause && else_clause.nextSibling?.type === 'block') {
            const else_clauseNode = this.createNode(CFGNodeType.BLOCK, else_clause.nextSibling);
            conditionNode.falseBlock = else_clauseNode;
            this.connect(conditionNode, else_clauseNode);
    
            let lastNode = else_clauseNode;
            for (const child of else_clause.nextSibling.children) {
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
        if (else_clauseEnd !== conditionNode && else_clause?.nextSibling) {
            this.connect(else_clauseEnd, mergeNode);
        }
    
        return mergeNode;
    }

    protected processForStatement(node: Parser.SyntaxNode, current: CFGNode, bodyType: string): CFGNode {
        // Create loop node first
        const processedNodes : CFGNode[] = [];
        // Create condition node
        // const comparison = node.children.find(child => child.type === comparisonType)!;
        const forHeader = this.loopHeaderExtractor.extractLoopHeader(node);
        const forStatementNode = this.createNode(CFGNodeType.STATEMENT, {
            ...node,
            text: forHeader
        } as Parser.SyntaxNode);
        this.connect(current, forStatementNode);
        const loopNode = this.createNode(CFGNodeType.LOOP, node);
        this.connect(forStatementNode, loopNode);
        const previousLoopNode = this.currentLoopNode;
        const exitNode = this.createNode(CFGNodeType.EXIT_MERGED, node);
        this.currentLoopNode = {
            node: loopNode,
            breakNodes: [],
            continueNodes: [],
            exitMergedNode: exitNode
        };

        const conditionText = this.getConditionText(node);
        if (conditionText) {
            const whileConditionNode = this.createNode(CFGNodeType.CONDITION, node);
            whileConditionNode.condition = conditionText;
            this.connect(current, whileConditionNode);
            whileConditionNode.trueBlock = loopNode;
            whileConditionNode.falseBlock = this.currentLoopNode.exitMergedNode;
            this.connect(whileConditionNode, this.currentLoopNode.exitMergedNode);
        }

        // const whileStatementNode = this.createNode(CFGNodeType.STATEMENT, {
        //     ...node,
        //     text: this.loopHeaderExtractor.extractLoopHeader(node)
        // } as Parser.SyntaxNode);
        // this.connect(current, whileStatementNode);

        // this.connect(whileStatementNode, loopNode);
        
        // Process main body (true block)
        const body = node.children.find(child => child.type === bodyType);
        let lastNode = loopNode;
    
        // Save previous loop context and set current one


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

        this.finalizeLoop(this.currentLoopNode, lastNode, loopNode);
        this.currentLoopNode = previousLoopNode;


        return exitNode;
    }
}