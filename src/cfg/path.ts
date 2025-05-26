import { CFGNode, CFGNodeType } from './types';
import { ExceptionExtractorFactory, ExceptionTypeExtractor } from "./languageAgnostic";
import { removeComments } from '../utils';
import { collapseTextChangeRangesAcrossMultipleVersions } from 'typescript/lib/typescript';
import { ContextTerm } from '../agents/contextSelector';

interface PathSegment {
    code: string;
    condition?: string;
}

export interface PathResult {
    code: string;
    path: string;
    simple: string;
}

export interface ConditionAnalysis {
    condition: string;
    depth: number;        // How deeply nested this condition is
    dependencies: Set<string>; // Variables/functions this condition depends on
    complexity: number;   // Complexity score based on operators and nesting
    minimumPathToCondition: PathResult[];
}

export class Path {
    private segments: PathSegment[] = [];
    private visitedLoops: Map<string, number> = new Map(); // Track loop iterations
    get length() {
        return this.segments.length;
    }
    get condition() {
        return this.segments.map(s => s.condition).filter(c => c);
    }
    addSegment(code: string, condition?: string) {
        // if condition is wrapped in parentheses, remove them
        // also should work for !((condition))
        // if condition is wrapped in parentheses, remove them
        if (condition && condition.includes("((") && condition.includes("))")) {
            condition = condition.replace("((", "(").replace("))", ")");
        }

        this.segments.push({ code, condition });
    }

    addVisitedNode(node: CFGNode) {
        this.visitedLoops.set(node.id, (this.visitedLoops.get(node.id) || 0) + 1);
    }

    getVisitedLoops(): Map<string, number> {
        return this.visitedLoops;
    }

    clone(): Path {
        const newPath = new Path();
        newPath.segments = [...this.segments];
        newPath.visitedLoops = new Map(this.visitedLoops);
        return newPath;
    }

    toResult(): PathResult {
        return {
            code: this.segments.map(s => s.code).filter(c => c).join('\n'),
            path: "where (\n\t" + this.segments.map(s => s.condition).filter(c => c).join('\n\t') + "\n)",
            simple: this.segments.map(s => s.condition).filter(c => c).join(' && ')
        };
    }
}

export class PathCollector {
    private paths: Path[] = [];
    private visitedLoops: Map<string, number> = new Map(); // Track loop iterations
    private MAX_LOOP_ITERATIONS = 2; // Limit loop traversal
    private exceptionExtractor: ExceptionTypeExtractor;
    private conditionAnalysis: Map<string, ConditionAnalysis> = new Map();

    constructor(private readonly language: string) {
        this.exceptionExtractor = ExceptionExtractorFactory.createExtractor(language);
    }

    collect(cfg: CFGNode): PathResult[] {
        this.paths = [];
        this.traverse(cfg, new Path());
        return this. paths.map(p => p.toResult());
    }

    getPaths(): Path[] {
        return this.paths;
    }

    setMaxLoopIterations(maxLoopIterations: number) {
        this.MAX_LOOP_ITERATIONS = maxLoopIterations;
    }
    // Modify getUniqueConditions to return analyzed conditions
    // getUniqueConditions(): ConditionAnalysis[] {
    //     const uniqueConditions = new Set<string>();
    //     const conditionAnalyses: ConditionAnalysis[] = [];

    //     for (const path of this.paths) {
    //         for (const condition of path.condition) {
    //             if (condition && !uniqueConditions.has(condition)) {
    //                 uniqueConditions.add(condition);
    //                 // Analyze the condition with its depth in the path
    //                 const analysis = this.analyzeCondition(condition, this.getConditionDepth(path, condition));
    //                 conditionAnalyses.push(analysis);
    //             }
    //         }
    //     }

    //     // Sort conditions by complexity and depth
    //     return conditionAnalyses.sort((a, b) => {
    //         // First sort by complexity
    //         if (a.complexity !== b.complexity) {
    //             return a.complexity - b.complexity;
    //         }
    //         // Then by depth
    //         return a.depth - b.depth;
    //     });
    // }

    private findMinimumPath(paths: PathResult[]): PathResult[] {
        if (paths.length === 0) {
            return [];
        }

        // Score each path based on:
        // 1. Number of conditions (fewer is better)
        // 2. Length of code (shorter is better)
        // 3. Complexity of conditions
        return paths.sort((a, b) => {
            const aConditions = a.path.split('\n\t').length;
            const bConditions = b.path.split('\n\t').length;
            
            // First prioritize number of conditions
            if (aConditions !== bConditions) {
                return aConditions - bConditions;
            }

            // Then prioritize code length
            const aCodeLength = a.code.split('\n').length;
            const bCodeLength = b.code.split('\n').length;
            
            return aCodeLength - bCodeLength;
        }).slice(0, 1); // Return only the best path
    }

    getUniqueConditions(): ConditionAnalysis[] {
        const normalizedConditions = new Map<string, string>();
        const conditionAnalyses: ConditionAnalysis[] = [];

        // First, collect all paths for each condition
        const conditionPaths = new Map<string, PathResult[]>();

        for (const path of this.paths) {
            const pathResult = path.toResult();
            for (const condition of path.condition) {
                if (condition) {
                    const normalized = this.normalizeCondition(condition);
                    if (normalized) {
                        if (!conditionPaths.has(normalized)) {
                            conditionPaths.set(normalized, []);
                        }
                        conditionPaths.get(normalized)!.push(pathResult);
                    }
                }
            }
        }

        // Now process each condition with its paths
        for (const path of this.paths) {
            for (const condition of path.condition) {
                if (condition) {
                    const normalized = this.normalizeCondition(condition);
                    if (normalized) {
                        const analysis = this.analyzeCondition(normalized, this.getConditionDepth(path, condition));
                        if (conditionAnalyses.find(c => c.condition === normalized)) {
                            continue;
                        }

                        // Find the minimum path for this condition
                        const paths = conditionPaths.get(normalized) || [];
                        analysis.minimumPathToCondition = this.findMinimumPath(paths);

                        conditionAnalyses.push(analysis);
                        normalizedConditions.set(normalized, condition);
                    }
                }
            }
        }
        
        return conditionAnalyses.sort((a, b) => {
            if (a.complexity !== b.complexity) {
                return a.complexity - b.complexity;
            }
            return a.depth - b.depth;
        });
    }
    // getUniqueConditions(): ConditionAnalysis[] {
    //     const normalizedConditions = new Map<string, string>();
    //     const conditionAnalyses: ConditionAnalysis[] = [];

    //     for (const path of this.paths) {
    //         for (const condition of path.condition) {
    //             if (condition) {
    //                 // Skip if empty after normalization
    //                 const normalized = this.normalizeCondition(condition);
    //                 // console.log("condition", condition);
    //                 // console.log("normalized", normalized);
    //                 if (normalized) {
    //                     // Store original condition with its normalized form
    //                     const analysis = this.analyzeCondition(normalized, this.getConditionDepth(path, condition));
    //                     if (conditionAnalyses.find(c => c.condition === normalized)) {
    //                         continue;
    //                     }
    //                     conditionAnalyses.push(analysis);
    //                     normalizedConditions.set(normalized, condition);
    //                 }
    //             }
    //         }
    //     }
        
    //     // Convert back to original conditions that have unique normalized forms
    //     // Sort conditions by complexity and depth
    //     return conditionAnalyses.sort((a, b) => {
    //         // First sort by complexity
    //         if (a.complexity !== b.complexity) {
    //             return a.complexity - b.complexity;
    //         }
    //         // Then by depth
    //         return a.depth - b.depth;
    //     });
    // }
    /**
     * Minimizes the set of paths by removing those whose constraints are already covered.
     * @param paths The array of PathResult to minimize.
     * @returns The minimized array of PathResult.
     */
    minimizePaths(paths: PathResult[]): PathResult[] {
        const minConstraints = new Set<string>();
        const minPaths: PathResult[] = [];

        for (const path of paths) {
            // Split constraints by '\n\t' and trim whitespace
            const pathConstraints = path.path
                .split('\n\t')
                .map(c => c.trim())
                .filter(c => c.length > 0);

            // Check if any constraint is new
            const hasNewConstraint = pathConstraints.some(c => !minConstraints.has(c));

            if (hasNewConstraint) {
                // Add all constraints of this path to the set
                for (const c of pathConstraints) {
                    minConstraints.add(c);
                }
                minPaths.push(path);
            }
        }
        return this.prunePaths(minPaths);
    }

    private normalizeCondition(condition: string): string {
        // Remove outer parentheses
        let normalized = condition.trim();
        
        // Handle negated condition: !(A) -> normalize as A but mark as negated
        const isNegated = normalized.startsWith('!(') && normalized.endsWith(')');
        
        if (isNegated) {
            // Remove negation and outer parentheses
            normalized = normalized.substring(2, normalized.length - 1).trim();
            
            // If the normalized condition itself starts with a negation, simplify it
            // !(!(B)) -> B (double negation)
            if (normalized.startsWith('!(') && normalized.endsWith(')')) {
                return this.normalizeCondition(normalized);
            }
            return normalized;
            // Mark this as a negated condition by adding a special prefix
            // We'll use this normalized form for comparison only
            // return `__NEGATED__${normalized}`;
        }
        
        // Remove redundant outer parentheses: (A) -> A
        while (normalized.startsWith('(') && normalized.endsWith(')')) {
            const inner = normalized.substring(1, normalized.length - 1).trim();
            // Check if parentheses are balanced within the inner part
            if (this.hasBalancedParentheses(inner)) {
                normalized = inner;
            } else {
                break; // Parentheses are part of the expression
            }
        }
        
        return normalized;
    }

    private hasBalancedParentheses(expr: string): boolean {
        let count = 0;
        for (const char of expr) {
            if (char === '(') count++;
            if (char === ')') count--;
            if (count < 0) return false; // Closing parenthesis without matching opening
        }
        return count === 0; // All parentheses are matched
    }

    // Add method to analyze a single condition
    private analyzeCondition(condition: string, depth: number): ConditionAnalysis {
        // Skip if already analyzed
        if (this.conditionAnalysis.has(condition)) {
            return this.conditionAnalysis.get(condition)!;
        }

        // Extract dependencies (variables and function calls)
        const dependencies = new Set<string>();
        // const dependencies = this.extractDependencies(condition);
        // Calculate complexity score
        const complexity = this.calculateComplexity(condition);

        const analysis: ConditionAnalysis = {
            condition,
            depth,
            dependencies,
            complexity,
            minimumPathToCondition: []
        };

        this.conditionAnalysis.set(condition, analysis);
        return analysis;
    }

    // private extractDependencies(condition: string): string[] {
    //     // Remove operators and parentheses
    //     const cleanCondition = condition
    //         .replace(/[()!&|<>=\+\-\*\/%]/g, ' ')
    //         .replace(/\s+/g, ' ')
    //         .trim();

    //     // Split into words and filter out empty strings and numbers
    //     return cleanCondition
    //         .split(' ')
    //         .filter(word => word && !/^\d+$/.test(word));
    // }

    private calculateComplexity(condition: string): number {
        let complexity = 0;
        
        // Count operators
        const operators = condition.match(/[!&|<>=\+\-\*\/%]/g) || [];
        complexity += operators.length;

        // Add weight for nested parentheses
        let maxNesting = 0;
        let currentNesting = 0;
        for (const char of condition) {
            if (char === '(') {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            } else if (char === ')') {
                currentNesting--;
            }
        }
        complexity += maxNesting * 2;

        // Add weight for logical operators
        if (condition.includes('&&') || condition.includes('||')) {
            complexity += 2;
        }

        return complexity;
    }


    // Helper method to get the depth of a condition in a path
    private getConditionDepth(path: Path, targetCondition: string): number {
        let depth = 0;
        for (const condition of path.condition) {
            if (condition === targetCondition) {
                return depth;
            }
            if (condition) {
                depth++;
            }
        }
        return depth;
    }

    // Add method to get conditions organized by their dependencies
    getOrganizedConditions(): Map<string, ConditionAnalysis[]> {
        const organizedConditions = new Map<string, ConditionAnalysis[]>();
        const allConditions = this.getUniqueConditions();

        // Group conditions by their dependencies
        for (const analysis of allConditions) {
            for (const dep of analysis.dependencies) {
                if (!organizedConditions.has(dep)) {
                    organizedConditions.set(dep, []);
                }
                organizedConditions.get(dep)!.push(analysis);
            }
        }

        return organizedConditions;
    }

    private prunePaths(paths: PathResult[]): PathResult[] {
        const MAX_PATHS = 10;
        if (paths.length <= MAX_PATHS) {
            return paths;
        }

        // Calculate mean path length
        const lengths = paths.map(p => p.path.split('\n\t').length);
        const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;

        // Sort by closeness to mean
        const sorted = paths
            .map((p, i) => ({ p, diff: Math.abs(lengths[i] - mean) }))
            .sort((a, b) => a.diff - b.diff)
            .map(obj => obj.p);

        return sorted.slice(0, MAX_PATHS);
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
        // console.log('traverse', node.type, 'currentPath', node.astNode.text);
        // console.log("next successors", node.successors.map(s => ({ type: s.type, text: s.astNode.text })));
        // console.log("previous predecessors", node.predecessors.map(p => ({ type: p.type, text: p.astNode.text })));

        switch (node.type) {
            case CFGNodeType.ENTRY:
                if (node.successors.length > 0) {
                    this.traverse(node.successors[0], currentPath);
                }
                break;

            case CFGNodeType.RETURN:
                // currentPath.addSegment("", node.astNode.text);
                currentPath.addSegment(node.astNode.text, "");
            case CFGNodeType.EXIT:
                if (currentPath.length > 0) {
                    this.paths.push(currentPath);
                }
                break;
    
            case CFGNodeType.CONDITION:
                // Handle true branch
                if (node.trueBlock) {
                    const truePath = currentPath.clone();
                    // Only add the condition text, not the entire if statement text
                    // const conditionText = node.astNode.childForFieldName('condition')?.text || "";
                    const conditionText = node.condition || "";
                    truePath.addSegment("", conditionText);
                    this.traverse(node.trueBlock, truePath);
                }
    
                // Handle false branch
                if (node.falseBlock) {
                    const falsePath = currentPath.clone();
                    // const conditionText = node.astNode.childForFieldName('condition')?.text || "";
                    const conditionText = node.condition || "";
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
                const loopCount = currentPath.getVisitedLoops().get(node.id) || 0;
                if (loopCount >= this.MAX_LOOP_ITERATIONS) {
                    // Skip further loop iterations
                    if (node.falseBlock) {
                        this.traverse(node.falseBlock, currentPath.clone());
                    }
                    return;
                }
                currentPath.addVisitedNode(node);
                // this.visitedLoops.set(node.id, loopCount + 1);
                
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
                            const loopCount = currentPath.getVisitedLoops().get(successor.id) || 0;
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