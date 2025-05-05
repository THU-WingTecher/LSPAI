import Parser = require('tree-sitter');
import { CFGBuilder } from './builder';
import { CFGNode, CFGNodeType, LoopContext } from './types';

export class PythonCFGBuilder extends CFGBuilder {

    protected processNode(node: Parser.SyntaxNode, current: CFGNode): CFGNode | null {
        
        switch (node.type) {
            case 'module':
            case 'block':
            case 'function_definition':  // Add this case
                // Process each child in sequence
                return this.processBlock(node, current);

            case 'if_statement':
                // Python: consequence field is 'consequence', else clause type is 'else_clause'
                return this.processIfStatement(node, current, 'consequence', 'else_clause');

            case 'while_statement':
                // Python: body field is 'block'
                return this.processWhileStatement(node, current, "block");

            case 'for_statement':
                return this.processForStatement(node, current, "body");

            case 'continue_statement':
                return this.processContinueStatement(node, current);

            case 'break_statement':
                return this.processBreakStatement(node, current);

            case 'return_statement':
                return this.processReturnStatement(node, current);

            case 'expression_statement':
                return this.processExpressionStatement(node, current);

            case 'try_statement':
                return this.processTryStatement(node, current, 'block', 'except_clause', 'else_clause', 'finally_clause');
                
            default:
                // Log unhandled node types
                console.log(`Skipping unhandled node type: ${node.type}`);
                return current;
        }
    }

}