// diagnostic.ts
import * as vscode from 'vscode';

export enum DiagnosticSeverity {
    Error = 1,
    Warning,
    Information,
    Hint
}

export enum DiagnosticTag {
    Unnecessary = 1,
    Deprecated
}

export function organizeAndExtractDiagnostics(diagnostics: vscode.Diagnostic[]): string[] {
    // Sort diagnostics by severity (Error > Warning > Information > Hint)
    const sortedDiagnostics = diagnostics.sort((a, b) => a.severity - b.severity);

    // Extract relevant information for each diagnostic to create prompts
    const prompts: string[] = sortedDiagnostics.map((diag, index) => {
        return `Diagnostic ${index + 1}:
Severity: ${DiagnosticSeverity[diag.severity]}
Message: ${diag.message}
Range: Line ${diag.range.start.line}, Character ${diag.range.start.character} to Line ${diag.range.end.line}, Character ${diag.range.end.character}
Source: ${diag.source || 'Unknown'}
${diag.code ? `Code: ${typeof diag.code === 'object' ? diag.code.value : diag.code}` : ''}
`;
    });

    return prompts;
}

export function getDiagnosticsForUri(uri: vscode.Uri): vscode.Diagnostic[] {
    const vscodeDiagnostics = vscode.languages.getDiagnostics(uri);
    // Map VSCode Diagnostic to your Diagnostic class if needed
    const diagnostics = vscodeDiagnostics.map(vsDiag => {
        const diag = new vscode.Diagnostic(vsDiag.range, vsDiag.message, vsDiag.severity);
        diag.source = vsDiag.source;
        diag.code = vsDiag.code;
        // Add more mappings if necessary
        return diag;
    });
    return diagnostics;
}
// const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY'; // Replace with your OpenAI API key
// const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// interface OpenAIChatRequest {
//     model: string;
//     messages: { role: string; content: string }[];
//     max_tokens?: number;
//     temperature?: number;
// }

// interface OpenAIChatResponse {
//     choices: { message: { role: string; content: string } }[];
// }

// export async function getLLMResponse(prompt: string): Promise<string> {
//     const requestPayload: OpenAIChatRequest = {
//         model: 'gpt-4',
//         messages: [
//             { role: 'system', content: 'You are a helpful assistant that fixes code based on provided diagnostics.' },
//             { role: 'user', content: prompt }
//         ],
//         max_tokens: 1500,
//         temperature: 0.2
//     };

//     try {
//         const response = await axios.post<OpenAIChatResponse>(OPENAI_API_URL, requestPayload, {
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${OPENAI_API_KEY}`
//             }
//         });

//         const aiMessage = response.data.choices[0].message.content;
//         return aiMessage;
//     } catch (error) {
//         console.error('Error communicating with LLM:', error);
//         throw new Error('LLM communication failed');
//     }
// }

