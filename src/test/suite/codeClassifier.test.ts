// import * as vscode from 'vscode';
// import { CodeClassifier, CodeComplexity, ControlFlowPattern } from '../../codeClassifier';
// import assert from 'assert';

// suite('Code Classifier Test Suite', () => {
//     let classifier: CodeClassifier;
//     let document: vscode.TextDocument;

//     suiteSetup(async () => {
//         // Create a test document
//         const content = `
//             // Simple linear function
//             function simpleFunction() {
//                 const a = 1;
//                 const b = 2;
//                 return a + b;
//             }

//             // Function with branching
//             function branchingFunction(x: number) {
//                 if (x > 0) {
//                     return "positive";
//                 } else {
//                     return "negative";
//                 }
//             }

//             // Function with loops
//             function loopingFunction(n: number) {
//                 let sum = 0;
//                 for (let i = 0; i < n; i++) {
//                     sum += i;
//                 }
//                 return sum;
//             }

//             // Complex nested function
//             function complexFunction(matrix: number[][]) {
//                 let result = 0;
//                 for (let i = 0; i < matrix.length; i++) {
//                     for (let j = 0; j < matrix[i].length; j++) {
//                         if (matrix[i][j] > 0) {
//                             result += matrix[i][j];
//                         } else if (matrix[i][j] < 0) {
//                             result -= matrix[i][j];
//                         }
//                     }
//                 }
//                 return result;
//             }
//         `;

//         document = await vscode.workspace.openTextDocument({
//             content,
//             language: 'typescript'
//         });
//         classifier = new CodeClassifier(document);
//     });

//     test('should classify simple linear function correctly', async () => {
//         const range = new vscode.Range(
//             new vscode.Position(2, 0),
//             new vscode.Position(6, 1)
//         );

//         const classification = await classifier.classify(range);

//         assert.strictEqual(classification.complexity, CodeComplexity.SIMPLE);
//         assert.deepStrictEqual(classification.patterns, [ControlFlowPattern.LINEAR]);
//         assert.strictEqual(classification.metrics.cyclomaticComplexity, 1);
//         assert.strictEqual(classification.metrics.nestingDepth, 0);
//         assert.strictEqual(classification.metrics.branchCount, 0);
//         assert.strictEqual(classification.metrics.loopCount, 0);
//     });

//     test('should classify branching function correctly', async () => {
//         const range = new vscode.Range(
//             new vscode.Position(9, 0),
//             new vscode.Position(15, 1)
//         );

//         const classification = await classifier.classify(range);

//         assert.strictEqual(classification.complexity, CodeComplexity.MODERATE);
//         assert.deepStrictEqual(classification.patterns, [ControlFlowPattern.BRANCHING]);
//         assert.strictEqual(classification.metrics.cyclomaticComplexity, 2);
//         assert.strictEqual(classification.metrics.nestingDepth, 1);
//         assert.strictEqual(classification.metrics.branchCount, 1);
//         assert.strictEqual(classification.metrics.loopCount, 0);
//     });

//     test('should classify looping function correctly', async () => {
//         const range = new vscode.Range(
//             new vscode.Position(18, 0),
//             new vscode.Position(23, 1)
//         );

//         const classification = await classifier.classify(range);

//         assert.strictEqual(classification.complexity, CodeComplexity.MODERATE);
//         assert.deepStrictEqual(classification.patterns, [ControlFlowPattern.LOOPING]);
//         assert.strictEqual(classification.metrics.cyclomaticComplexity, 2);
//         assert.strictEqual(classification.metrics.nestingDepth, 1);
//         assert.strictEqual(classification.metrics.branchCount, 0);
//         assert.strictEqual(classification.metrics.loopCount, 1);
//     });

//     test('should classify complex nested function correctly', async () => {
//         const range = new vscode.Range(
//             new vscode.Position(26, 0),
//             new vscode.Position(37, 1)
//         );

//         const classification = await classifier.classify(range);

//         assert.strictEqual(classification.complexity, CodeComplexity.COMPLEX);
//         assert.deepStrictEqual(
//             classification.patterns.sort(),
//             [
//                 ControlFlowPattern.LOOPING,
//                 ControlFlowPattern.BRANCHING,
//                 ControlFlowPattern.NESTED
//             ].sort()
//         );
//         assert.ok(classification.metrics.cyclomaticComplexity > 5);
//         assert.ok(classification.metrics.nestingDepth > 2);
//         assert.ok(classification.metrics.branchCount > 1);
//         assert.ok(classification.metrics.loopCount > 1);
//     });

//     test('should handle empty function correctly', async () => {
//         const emptyContent = `
//             function emptyFunction() {
//             }
//         `;
//         const emptyDoc = await vscode.workspace.openTextDocument({
//             content: emptyContent,
//             language: 'typescript'
//         });
//         const emptyClassifier = new CodeClassifier(emptyDoc);

//         const range = new vscode.Range(
//             new vscode.Position(1, 0),
//             new vscode.Position(2, 1)
//         );

//         const classification = await emptyClassifier.classify(range);

//         assert.strictEqual(classification.complexity, CodeComplexity.SIMPLE);
//         assert.deepStrictEqual(classification.patterns, [ControlFlowPattern.LINEAR]);
//         assert.strictEqual(classification.metrics.cyclomaticComplexity, 1);
//         assert.strictEqual(classification.metrics.nestingDepth, 0);
//         assert.strictEqual(classification.metrics.branchCount, 0);
//         assert.strictEqual(classification.metrics.loopCount, 0);
//     });

//     test('should handle single line function correctly', async () => {
//         const singleLineContent = `
//             function singleLine(x: number) { return x * 2; }
//         `;
//         const singleLineDoc = await vscode.workspace.openTextDocument({
//             content: singleLineContent,
//             language: 'typescript'
//         });
//         const singleLineClassifier = new CodeClassifier(singleLineDoc);

//         const range = new vscode.Range(
//             new vscode.Position(1, 0),
//             new vscode.Position(1, 40)
//         );

//         const classification = await singleLineClassifier.classify(range);

//         assert.strictEqual(classification.complexity, CodeComplexity.SIMPLE);
//         assert.deepStrictEqual(classification.patterns, [ControlFlowPattern.LINEAR]);
//         assert.strictEqual(classification.metrics.cyclomaticComplexity, 1);
//         assert.strictEqual(classification.metrics.nestingDepth, 0);
//         assert.strictEqual(classification.metrics.branchCount, 0);
//         assert.strictEqual(classification.metrics.loopCount, 0);
//     });
// });