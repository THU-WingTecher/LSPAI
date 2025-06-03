import * as vscode from 'vscode';

export function getCommentSyntax(languageId: string): { start: string, end: string } {
    switch (languageId.toLowerCase()) {
        case 'python':
            return { start: '# ', end: '' };
        case 'javascript':
        case 'typescript':
        case 'java':
        case 'cpp':
        case 'c':
        case 'csharp':
            return { start: '// ', end: '' };
        case 'html':
        case 'xml':
            return { start: '<!-- ', end: ' -->' };
        case 'css':
            return { start: '/* ', end: ' */' };
        case 'ruby':
            return { start: '# ', end: '' };
        case 'go':
            return { start: '// ', end: '' };
        case 'rust':
            return { start: '// ', end: '' };
        case 'php':
            return { start: '// ', end: '' };
        case 'lua':
            return { start: '-- ', end: '' };
        case 'sql':
            return { start: '-- ', end: '' };
        default:
            return { start: '// ', end: '' }; // Default to C-style comments
    }
}

export function wrapWithComment(text: string, languageId: string): string {
    const { start, end } = getCommentSyntax(languageId);
    return `${start}${text}${end}`;
} 