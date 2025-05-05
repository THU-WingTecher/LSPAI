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

            case 'if_statement':
                // Java: consequence field is 'consequence', else clause type is 'else'
                // (adjust if your parser uses different names)
                return this.processIfStatement(node, current, 'consequence', 'else');

            case 'while_statement':
                // Java: body field is 'body'
                return this.processWhileStatement(node, current, 'body');

            case 'for_statement':
                // Java: body field is 'body'
                return this.processForStatement(node, current, 'body');

            case 'continue_statement':
                return this.processContinueStatement(node, current);

            case 'break_statement':
                return this.processBreakStatement(node, current);

            case 'return_statement':
                return this.processReturnStatement(node, current);

            case 'expression_statement':
                return this.processExpressionStatement(node, current);

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
}