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
                return this.processWhileStatement(node, current, "comparison_operator", "block");

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

    protected processIfStatement(
        node: Parser.SyntaxNode,
        current: CFGNode,
        consequenceField: string,
        elseClauseType: string
    ): CFGNode {
        const conditionNode = this.createNode(CFGNodeType.CONDITION, node);
        let currentConditionNode = conditionNode;
        conditionNode.condition = this.getConditionText(node);
        this.checkConditionText(conditionNode, node);
        this.connect(current, conditionNode);
        const mergeNode = this.createNode(CFGNodeType.MERGED, node);
        // Process consequence (then branch)
        const consequence = node.childForFieldName(consequenceField);
        if (consequence) {
            const consequenceNode = this.createNode(CFGNodeType.BLOCK, consequence);
            conditionNode.trueBlock = consequenceNode;
            this.connect(conditionNode, consequenceNode);
            this.processBlockAndConnectToMerge(consequenceNode, mergeNode);

        }
        
        const elifNodes = node.children.filter(child => child.type === "elif_clause");
        for (const elifNode of elifNodes) {
            const elifConditionNode = this.createNode(CFGNodeType.CONDITION, elifNode);
            elifConditionNode.condition = this.getConditionText(elifNode);
            this.checkConditionText(elifConditionNode, node);
            this.connect(currentConditionNode, elifConditionNode);
            currentConditionNode.falseBlock = elifConditionNode;
            currentConditionNode = elifConditionNode;

            const elifBody = elifNode.childForFieldName(consequenceField);
            if (elifBody) {
                const elifBodyNode = this.createNode(CFGNodeType.BLOCK, elifBody);
                elifConditionNode.trueBlock = elifBodyNode;
                this.connect(elifConditionNode, elifBodyNode);
                this.processBlockAndConnectToMerge(elifBodyNode, mergeNode);
            }

        }

        const else_clause = node.children.find(child => child.type === elseClauseType);
        if (else_clause) {
            const else_clauseNode = this.createNode(CFGNodeType.BLOCK, else_clause);
            currentConditionNode.falseBlock = else_clauseNode;
            this.connect(currentConditionNode, else_clauseNode);
            this.processBlockAndConnectToMerge(else_clauseNode, mergeNode);


        } else {
            currentConditionNode.falseBlock = mergeNode;
            this.connect(currentConditionNode, mergeNode);
        }
    
        return mergeNode;
    }
}