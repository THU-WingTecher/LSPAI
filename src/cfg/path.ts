import { CFGNode, CFGNodeType } from './types';
import { ExceptionExtractorFactory, ExceptionTypeExtractor } from './exceptionHandler';
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
    private visitedLoops: Map<string, number> = new Map(); // Track loop iterations
    private MAX_LOOP_ITERATIONS = 2; // Limit loop traversal
    private exceptionExtractor: ExceptionTypeExtractor;

    constructor(private readonly language: string) {
        this.exceptionExtractor = ExceptionExtractorFactory.createExtractor(language);
    }

    collect(cfg: CFGNode): PathResult[] {
        this.paths = [];
        this.traverse(cfg, new Path());
        return this. paths.map(p => p.toResult());
    }

    setMaxLoopIterations(maxLoopIterations: number) {
        this.MAX_LOOP_ITERATIONS = maxLoopIterations;
    }

    private findLoopExit(node: CFGNode): CFGNode | null {
        // Find the nearest loop's exit node by traversing up
        for (const successor of node.successors) {
            if (successor.type === CFGNodeType.EXIT_MERGED) {
                return successor;
            }
        }
        throw new Error('No exit merged node found');
    }

    private findLoopNode(node: CFGNode): CFGNode | null {
        // Find the nearest loop node by traversing up
        for (const successor of node.successors) {
            if (successor.type === CFGNodeType.LOOP) {
                return successor;
            }
        }
        throw new Error('No loop node found');

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
                    const conditionText = node.astNode.childForFieldName('condition')?.text || "";
                    truePath.addSegment("", conditionText);
                    this.traverse(node.trueBlock, truePath);
                }
    
                // Handle false branch
                if (node.falseBlock) {
                    const falsePath = currentPath.clone();
                    const conditionText = node.astNode.childForFieldName('condition')?.text || "";
                    falsePath.addSegment("", `!(${conditionText})`);
                    this.traverse(node.falseBlock, falsePath);
                }

                // Handle successors after if/else block (merge point)
                if (node.successors.length > 0 && node.successors[0].type !== CFGNodeType.BLOCK) {
                    const newPath = currentPath.clone();
                    this.traverse(node.successors[0], newPath);
                }
                break;

            case CFGNodeType.LOOP:
                const loopCount = this.visitedLoops.get(node.id) || 0;
                if (loopCount >= this.MAX_LOOP_ITERATIONS) {
                    // Skip further loop iterations
                    if (node.falseBlock) {
                        this.traverse(node.falseBlock, currentPath.clone());
                    }
                    return;
                }
                this.visitedLoops.set(node.id, loopCount + 1);
                
                // Process loop body
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], currentPath);
                }
                break;

            case CFGNodeType.EXIT_MERGED:
            case CFGNodeType.MERGED:
            case CFGNodeType.BLOCK:
                // Only add statement text if it's not a block or merge node
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], currentPath);
                }
                break;

            case CFGNodeType.BREAK:
                // Add the condition that led to the break
                const breakPath = currentPath.clone();

                const exitNode = this.findLoopExit(node);
                if (exitNode) {
                    this.traverse(exitNode, breakPath);
                } else {
                    this.paths.push(breakPath);
                }
                break;

            case CFGNodeType.CONTINUE:
                // Add the condition that led to the continue
                const continuePath = currentPath.clone();

                const loopNode = this.findLoopNode(node);
                if (loopNode) {
                    this.traverse(loopNode, continuePath);
                } else {
                    this.paths.push(continuePath);
                }
                break;

            case CFGNodeType.TRY_ENDED:
                // Try merged node means that the try block has ended
                // and the exception has been handled
                currentPath.addSegment("TRY_END", "");
                if (node.successors.length > 0) {
                    for (const successor of node.successors) {
                        this.traverse(successor, currentPath.clone());
                    }
                }
                // this.paths.push(currentPath);
                break;

            case CFGNodeType.TRY:
                // Try block starts here - traverse into the try block
                // current Path mark that TRY region ahs started
                currentPath.addSegment("TRY_START", "");
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], currentPath.clone());
                }
                // current Path mark that TRY region has ended
                
                break;
            // case CFGNodeType.TRY:
            //     // Create a new path for try block
            //     const tryPath = currentPath.clone();
            //     tryPath.addSegment("TRY_START", "");
            
            //     // Store all paths generated from try block
            //     const tryPaths: Path[] = [];
                
            //     if (node.successors.length > 0) {
            //         // Create temporary collector for try block
            //         const tempCollector = new PathCollector(this.language);
            //         tempCollector.traverse(node.successors[0], tryPath);
                    
            //         // Get all paths from try block and add TRY_END to each
            //         const tryBlockPaths = tempCollector.paths;
            //         for (const path of tryBlockPaths) {
            //             path.addSegment("TRY_END", "");
            //             tryPaths.push(path);
            //         }
            //     }
            
            //     // Add all try paths to main paths collection
            //     this.paths.push(...tryPaths);
            //     break;

            case CFGNodeType.CATCH:
                const catchPath = currentPath.clone();
                const exceptionType = this.exceptionExtractor.extractExceptionType(node.astNode.text);
                catchPath.addSegment("", `throws ${exceptionType}`);
                
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], catchPath);
                }
                break;
    
            case CFGNodeType.ELSE:
                // Else block means try succeeded (no exception)
                const elsePath = currentPath.clone();
                elsePath.addSegment("", "no_exception");
                
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], elsePath);
                }
                break;
    
            case CFGNodeType.FINALLY:
                // Finally block is executed in all cases
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], currentPath);
                }
                break;
        
            case CFGNodeType.STATEMENT:
                currentPath.addSegment(node.astNode.text);
                if (node.successors.length > 0) {
                    // Normal statement processing
                    for (const successor of node.successors) {
                        // Skip back edges if we've reached max iterations
                        if (successor.type === CFGNodeType.LOOP) {
                            const loopCount = this.visitedLoops.get(successor.id) || 0;
                            if (loopCount >= this.MAX_LOOP_ITERATIONS) {
                                // For loop exit, create a path that represents normal execution
                                const normalPath = currentPath.clone();
                                if (successor.falseBlock) {
                                    this.traverse(successor.falseBlock, normalPath);
                                }
                                continue;
                            }
                        }
                        this.traverse(successor, currentPath.clone());
                    }
                } else {
                    this.paths.push(currentPath);
                }
                break;
        }
    }
}