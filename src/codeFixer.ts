// // codeFixer.ts
// import * as vscode from 'vscode';
// import { organizeAndExtractDiagnostics, getDiagnosticsForUri } from './diagnostic';
// import { constructAIPrompt } from './promptBuilder';
// import { invokeLLM } from './generate';
// import { writeCodeToTempFile, updateOriginalFile } from './fileHandler';

// const MAX_ROUNDS = 5;

// export async function fixDiagnostics(uri: vscode.Uri, method: string): Promise<void> {
//     let round = 0;
//     let diagnostics: vscode.Diagnostic[] = getDiagnosticsForUri(uri);

//     while (round < MAX_ROUNDS && diagnostics.length > 0) {
//         round++;
//         console.log(`\n--- Round ${round} ---`);

//         // Step 1: Organize and extract diagnostics
//         const diagnosticPrompts = organizeAndExtractDiagnostics(diagnostics);
//         console.log('Constructed Diagnostic Prompts:', diagnosticPrompts);

//         // Step 2: Construct AI prompt
//         const aiPrompt = constructAIPrompt(diagnosticPrompts);
//         console.log('AI Prompt:', aiPrompt);

//         // Step 3: Get AI response
//         let aiResponse: string;
//         try {
//             aiResponse = await invokeLLM(method, aiPrompt);
//             console.log('AI Response:', aiResponse);
//         } catch (error) {
//             console.error('Failed to get response from LLM:', error);
//             break;
//         }

//         // Step 4: Write AI-generated code to a temporary file
//         const tempFilePath = writeCodeToTempFile(aiResponse);
//         console.log(`AI-generated code written to temporary file: ${tempFilePath}`);

//         // Step 5: Read the generated code (assuming it's intended to fix the original file)
//         const generatedCode = fs.readFileSync(tempFilePath, 'utf-8');

//         // Step 6: Update the original file with the generated code
//         try {
//             await updateOriginalFile(uri, generatedCode);
//             console.log('Original file updated with AI-generated code.');
//         } catch (error) {
//             console.error('Failed to update the original file:', error);
//             break;
//         }

//         // Step 7: Retrieve updated diagnostics
//         diagnostics = getDiagnosticsForUri(uri);
//         console.log(`Remaining Diagnostics after Round ${round}:`, diagnostics.length);
//     }

//     if (diagnostics.length === 0) {
//         console.log('All diagnostics have been resolved.');
//     } else {
//         console.log(`Reached the maximum of ${MAX_ROUNDS} rounds with ${diagnostics.length} diagnostics remaining.`);
//     }
// }
