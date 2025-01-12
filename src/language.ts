export function getLanguageSuffix(language: string): string {
    const suffixMap: { [key: string]: string } = {
        'python': 'py',
        'go': 'go',
        'typescript': 'ts',
        'javascript': 'js',
        'java': 'java',
        'csharp': 'cs',
        'ruby': 'rb',
        'php': 'php',
        'cpp': 'cpp',
        'c': 'c',
        'swift': 'swift',
        'kotlin': 'kt',
        'rust': 'rs'
    };
    
    const suffix = suffixMap[language.toLowerCase()];
    if (!suffix) {
        throw new Error(`Unsupported language: ${language}. Please provide a language from the following list: ${Object.keys(suffixMap).join(', ')}`);
    }
    return suffix;
}