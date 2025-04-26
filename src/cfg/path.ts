import { CFGNode, CFGNodeType, CustomSyntaxNode } from './types';

interface PathSegment {
    code: string;
    condition?: string;
}

export interface PathResult {
    code: string;
    path: string;
}

export class Path {
    private segments: PathSegment[] = [];

    addSegment(code: string, condition?: string) {
        this.segments.push({ code, condition });
    }

    clone(): Path {
        const newPath = new Path();
        newPath.segments = [...this.segments];
        return newPath;
    }

    toResult(): PathResult {
        return {
            code: this.segments.map(s => s.code).filter(c => c).join('\n'),
            path: this.segments.map(s => s.condition).filter(c => c).join(' && ')
        };
    }
}

export class PathCollector {
    private paths: Path[] = [];

    collect(cfg: CFGNode): PathResult[] {
        this.paths = [];
        this.traverse(cfg, new Path());
        return this. paths.map(p => p.toResult());
    }

    private traverse(node: CFGNode, currentPath: Path) {
        if (!node) return;
        console.log('traverse', node.type, 'currentPath', node.astNode.text);
        console.log("next successors", node.successors.map(s => ({ type: s.type, text: s.astNode.text })));
        console.log("previous predecessors", node.predecessors.map(p => ({ type: p.type, text: p.astNode.text })));
        // console.log('overallPath', this.paths.map(p => p.toResult().code));
        // console.log('overallPath', this.paths.map(p => p.toResult().path));
        switch (node.type) {
            case CFGNodeType.ENTRY:
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], currentPath);
                }
                break;
    
            case CFGNodeType.EXIT:
                this.paths.push(currentPath);
                break;
    
            case CFGNodeType.CONDITION:
                // Handle true branch
                if (node.trueBlock) {
                    const truePath = currentPath.clone();
                    // Only add the condition text, not the entire if statement text
                    truePath.addSegment(
                        "",  // No code for condition node
                        node.astNode.childForFieldName('condition')?.text || ""
                    );
                    this.traverse(node.trueBlock, truePath);
                }
    
                // Handle false branch
                if (node.falseBlock) {
                    const falsePath = currentPath.clone();
                    falsePath.addSegment(
                        "",  // No code for condition node
                        `!(${node.astNode.childForFieldName('condition')?.text || ""})`
                    );
                    this.traverse(node.falseBlock, falsePath);
                }

                // Handle successors after if/else block (merge point)
                if (node.successors.length > 0 && node.successors[0].type !== CFGNodeType.BLOCK) {
                    const newPath = currentPath.clone();
                    this.traverse(node.successors[0], newPath);
                }
                break;
    
            case CFGNodeType.LOOP:
                const loopPath = currentPath.clone();
                // Only add the loop condition, not the entire loop statement
                if ((node as any).conditionNode) {
                    loopPath.addSegment("", node.astNode.childForFieldName('condition')?.text);
                }
                
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], loopPath);
                }
                break;
                
            case CFGNodeType.EXIT_MERGED:
                this.paths.push(currentPath);
                break;
            case CFGNodeType.MERGED:
            case CFGNodeType.BLOCK:
                // Only add statement text if it's not a block or merge node
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], currentPath);

                }
                break;

            case CFGNodeType.STATEMENT:
                // Only add statement text if it's not a block or merge node

                currentPath.addSegment(node.astNode.text);
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], currentPath);
                } else {
                    this.paths.push(currentPath);
                }
                break;
        }
    }
}