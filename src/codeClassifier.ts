// import * as vscode from 'vscode';
// import { ControlFlowAnalyzer, analyzeCFG } from './cfg';
// import { DecodedToken } from './token';

// export enum CodeComplexity {
//     SIMPLE = 'simple',
//     MODERATE = 'moderate',
//     COMPLEX = 'complex'
// }

// export enum ControlFlowPattern {
//     LINEAR = 'linear',
//     BRANCHING = 'branching',
//     LOOPING = 'looping',
//     NESTED = 'nested'
// }

// interface CodeClassification {
//     complexity: CodeComplexity;
//     patterns: ControlFlowPattern[];
//     metrics: {
//         cyclomaticComplexity: number;
//         nestingDepth: number;
//         branchCount: number;
//         loopCount: number;
//     };
// }

// export class CodeClassifier {
//     private analyzer: ControlFlowAnalyzer;

//     constructor(document: vscode.TextDocument) {
//         this.analyzer = new ControlFlowAnalyzer(document);
//     }

//     async classify(range: vscode.Range): Promise<CodeClassification> {
//         // Get the CFG for the code
//         await this.analyzer.analyze(range);
//         const cfg = this.analyzer.getCFG();

//         // Calculate metrics
//         const metrics = this.calculateMetrics(cfg);
        
//         // Determine complexity
//         const complexity = this.determineComplexity(metrics);
        
//         // Identify control flow patterns
//         const patterns = this.identifyPatterns(cfg);

//         return {
//             complexity,
//             patterns,
//             metrics
//         };
//     }

//     private calculateMetrics(cfg: any): { cyclomaticComplexity: number; nestingDepth: number; branchCount: number; loopCount: number } {
//         // Calculate cyclomatic complexity (E - N + 2P)
//         const edges = cfg.edges.length;
//         const nodes = cfg.nodes.length;
//         const connectedComponents = 1; // Assuming single connected component
//         const cyclomaticComplexity = edges - nodes + 2 * connectedComponents;

//         // Calculate nesting depth
//         let nestingDepth = 0;
//         let currentDepth = 0;
//         for (const edge of cfg.edges) {
//             if (edge.type === 'conditional-true' || edge.type === 'conditional-false') {
//                 currentDepth++;
//                 nestingDepth = Math.max(nestingDepth, currentDepth);
//             } else if (edge.type === 'sequential') {
//                 currentDepth = 0;
//             }
//         }

//         // Count branches and loops
//         let branchCount = 0;
//         let loopCount = 0;
//         for (const node of cfg.nodes) {
//             if (node.type === 'condition') {
//                 branchCount++;
//             } else if (node.type === 'loop') {
//                 loopCount++;
//             }
//         }

//         return {
//             cyclomaticComplexity,
//             nestingDepth,
//             branchCount,
//             loopCount
//         };
//     }

//     private determineComplexity(metrics: { cyclomaticComplexity: number; nestingDepth: number; branchCount: number; loopCount: number }): CodeComplexity {
//         const { cyclomaticComplexity, nestingDepth, branchCount, loopCount } = metrics;

//         // Simple classification based on metrics
//         if (cyclomaticComplexity <= 5 && nestingDepth <= 2 && branchCount <= 2 && loopCount <= 1) {
//             return CodeComplexity.SIMPLE;
//         } else if (cyclomaticComplexity <= 10 && nestingDepth <= 3 && branchCount <= 4 && loopCount <= 2) {
//             return CodeComplexity.MODERATE;
//         } else {
//             return CodeComplexity.COMPLEX;
//         }
//     }

//     private identifyPatterns(cfg: any): ControlFlowPattern[] {
//         const patterns: ControlFlowPattern[] = [];
//         const { nodes, edges } = cfg;

//         // Check for linear flow
//         const isLinear = edges.every((edge: any) => edge.type === 'sequential');
//         if (isLinear) {
//             patterns.push(ControlFlowPattern.LINEAR);
//         }

//         // Check for branching
//         const hasBranches = nodes.some((node: any) => node.type === 'condition');
//         if (hasBranches) {
//             patterns.push(ControlFlowPattern.BRANCHING);
//         }

//         // Check for looping
//         const hasLoops = nodes.some((node: any) => node.type === 'loop');
//         if (hasLoops) {
//             patterns.push(ControlFlowPattern.LOOPING);
//         }

//         // Check for nested structures
//         const hasNested = edges.some((edge: any) => 
//             (edge.type === 'conditional-true' || edge.type === 'conditional-false') &&
//             edges.some((e: any) => e.from === edge.to && (e.type === 'conditional-true' || e.type === 'conditional-false'))
//         );
//         if (hasNested) {
//             patterns.push(ControlFlowPattern.NESTED);
//         }

//         return patterns;
//     }
// }

// // Usage example:
// export async function classifyCode(document: vscode.TextDocument, range: vscode.Range): Promise<CodeClassification> {
//     const classifier = new CodeClassifier(document);
//     return await classifier.classify(range);
// }