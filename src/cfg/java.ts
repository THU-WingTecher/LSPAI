import Parser = require('tree-sitter');
import { CFGBuilder } from './builder';
import { CFGNode, CFGNodeType } from './types';

export class JavaCFGBuilder extends CFGBuilder {
    protected processNode(node: Parser.SyntaxNode, current: CFGNode): CFGNode | null {
        switch (node.type) {
            case 'program':
            case 'block':
            case 'method_declaration':
            case 'constructor_declaration':
            case 'class_body':
                // Java: process all children in sequence
                return this.processBlock(node, current);
            case 'formal_parameters':
                return this.processFunctionArgument(node, current);
            case 'if_statement':
                // Java: consequence field is 'consequence', else clause type is 'else'
                // (adjust if your parser uses different names)
                return this.processIfStatement(node, current, 'consequence', 'else');

            case 'while_statement':
                // Java: body field is 'body'
                return this.processWhileStatement(node, current, "parenthesized_expression", "block");
            
            case 'enhanced_for_statement':
            case 'for_statement':
                // Java: body field is 'body'
                return this.processForStatement(node, current, 'block');

            case 'continue_statement':
                return this.processContinueStatement(node, current);

            case 'break_statement':
                return this.processBreakStatement(node, current);

            case 'return_statement':
                return this.processReturnStatement(node, current);

            case '{':
            case '}':
                return current;
                
            case 'integral_type':
            case 'identifier':
            case 'formal_parameters':
            case 'local_variable_declaration':
            case 'expression_statement':
                return this.processExpressionStatement(node, current);
                // return current;

            case 'try_statement':
                // Java: blockType='block', exceptType='catch_clause', elseType='', finallyType='finally_clause'
                // (Java does not have 'else' in try, so pass empty string)
                return this.processTryStatement(node, current, 'block', 'catch_clause', '', 'finally_clause');

            default:
                // Log unhandled node types for debugging
                console.log(`Skipping unhandled node type: ${node.type}`);
                return current;
        }
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
