// codeFixer.ts
import * as vscode from 'vscode';
import { getDiagnosticsForFilePath, DiagnosticsToString } from './diagnostic';
import * as fs from 'fs';
import { constructDiagnosticPrompt } from './promptBuilder';
import { invokeLLM } from './generate';
import { writeCodeToTempFile, updateOriginalFile } from './fileHandler';
import {ChatMessage, Prompt} from "./promptBuilder";
import {parseCode} from "./utils";
const MAX_ROUNDS = 5;

export async function fixDiagnostics(filePath: string, method: string, unit_test: string, method_sig: string, class_name: string, testcode: string): Promise<void> {
    let round = 0;
    let diagnostics = await getDiagnosticsForFilePath(filePath);

    while (round < MAX_ROUNDS && diagnostics.length > 0) {
        round++;
        console.log(`\n--- Round ${round} ---`);

        const diagnosticMessages = await DiagnosticsToString(vscode.Uri.file(filePath), diagnostics);
        const diagnosticPrompts = constructDiagnosticPrompt(unit_test, diagnosticMessages.join('\n'), method_sig, class_name, testcode)
        console.log('Constructed Diagnostic Prompts:', diagnosticPrompts);
        const chatMessages: ChatMessage[] = [
            { role: "system", content: "" },
            { role: "user", content: diagnosticPrompts }
        ];
    
        const promptObj: Prompt = { messages: chatMessages };
        let aiResponse: string;
        try {
            aiResponse = await invokeLLM(method, promptObj.messages);
            console.log('AI Response:', aiResponse);
        } catch (error) {
            console.error('Failed to get response from LLM:', error);
            break;
        }

        // Step 4: Write AI-generated code to a temporary file
        const testCode = parseCode(aiResponse);
        console.log('Generated Final test code:', testCode);
        const tempFilePath = writeCodeToTempFile(testCode);
        console.log(`AI-generated code written to temporary file: ${tempFilePath}`);

        // Step 5: Read the generated code (assuming it's intended to fix the original file)
        const generatedCode = fs.readFileSync(tempFilePath, 'utf-8');

        // Step 6: Update the original file with the generated code
        try {
            await updateOriginalFile(filePath, generatedCode);
            console.log('Original file updated with AI-generated code.');
        } catch (error) {
            console.error('Failed to update the original file:', error);
            break;
        }

        // Step 7: Retrieve updated diagnostics
        diagnostics = await getDiagnosticsForFilePath(filePath);
        console.log(`Remaining Diagnostics after Round ${round}:`, diagnostics.length);
    }

    if (diagnostics.length === 0) {
        console.log('All diagnostics have been resolved.');
    } else {
        console.log(`Reached the maximum of ${MAX_ROUNDS} rounds with ${diagnostics.length} diagnostics remaining.`);
    }
}
