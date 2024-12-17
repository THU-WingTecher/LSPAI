export function constructDiagnosticPrompt(diagnosticPrompts: string[]): string {
    return `
You are an AI assistant that helps developers fix code issues.

Here are the diagnostics that need to be addressed:

${diagnosticPrompts.join('\n')}

Please provide the necessary code fixes for the above issues.
`;
}