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
        return node.children.find(child => child.type === 'binary_expression')?.text || 
                node.children.find(child => child.type === 'selector_expression')?.text ||
                node.children.find(child => child.type === 'comparison_expression')?.text ||
                node.children.find(child => child.type === 'range_clause')?.text ||
                node.children.find(child => child.type === 'identifier')?.text ||
                node.children.find(child => child.type === 'unary_expression')?.text ||
                node.children.find(child => child.type === 'for_clause')?.text ||
                node.children.find(child => child.type === 'call_expression')?.text ||
                // (node as any).conditionNode?.text ||
                "unknown";
    }

    protected processForStatement(node: Parser.SyntaxNode, current: CFGNode, bodyType: string): CFGNode {
        // Create loop node first
        const processedNodes : CFGNode[] = [];
        // Create condition node
        // const comparison = node.children.find(child => child.type === comparisonType)!;
        const conditionText = this.getConditionText(node);
        const forHeader = this.loopHeaderExtractor.extractLoopHeader(node);
        const forStatementNode = this.createNode(CFGNodeType.STATEMENT, {
            ...node,
            text: forHeader
        } as Parser.SyntaxNode);
        const previousLoopNode = this.currentLoopNode;
        const exitNode = this.createNode(CFGNodeType.EXIT_MERGED, node);
        const loopNode = this.createNode(CFGNodeType.LOOP, node);
        this.currentLoopNode = {
            node: loopNode,
            breakNodes: [],
            continueNodes: [],
            exitMergedNode: exitNode
        };

        if (conditionText) {
            const whileConditionNode = this.createNode(CFGNodeType.CONDITION, node);
            this.connect(current, whileConditionNode);
            whileConditionNode.condition = conditionText;
            this.checkConditionText(whileConditionNode, node);
            whileConditionNode.trueBlock = forStatementNode;
            whileConditionNode.falseBlock = this.currentLoopNode.exitMergedNode;
            this.connect(whileConditionNode, this.currentLoopNode.exitMergedNode);
        } else {
            this.connect(current, forStatementNode);
        }
        this.connect(forStatementNode, loopNode);


        // const whileStatementNode = this.createNode(CFGNodeType.STATEMENT, {
        //     ...node,
        //     text: this.loopHeaderExtractor.extractLoopHeader(node)
        // } as Parser.SyntaxNode);
        // this.connect(current, whileStatementNode);

        // this.connect(whileStatementNode, loopNode);
        
        // Process main body (true block)
        const body = node.children.find(child => child.type === bodyType);
        let lastNode = loopNode;
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