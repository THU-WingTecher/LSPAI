
// Interface for language-specific exception handling
export interface ExceptionTypeExtractor {
    extractExceptionType(nodeText: string): string;
}
// Python implementation


export class PythonExceptionExtractor implements ExceptionTypeExtractor {
    extractExceptionType(nodeText: string): string {
        const match = nodeText.trim().match(/except\s+([a-zA-Z0-9_]+):/);
        return match ? match[1] : 'Exception';
    }
}
// Java implementation

export class JavaExceptionExtractor implements ExceptionTypeExtractor {
    extractExceptionType(nodeText: string): string {
        const match = nodeText.trim().match(/catch\s*\(\s*([a-zA-Z0-9_]+)[\s&*]?/);
        return match ? match[1] : 'Exception';
    }
}
// CPP implementation

export class CPPExceptionExtractor implements ExceptionTypeExtractor {
    extractExceptionType(nodeText: string): string {
        if (nodeText.includes('catch (...)')) {
            return 'Exception';
        }
        const match = nodeText.trim().match(/catch\s*\(\s*(?:std::)?([a-zA-Z0-9_]+)[\s&*]?/);
        return match ? match[1] : 'Exception';
    }
}

// Go implementation

export class GoExceptionExtractor implements ExceptionTypeExtractor {
    extractExceptionType(nodeText: string): string {
        const match = nodeText.trim().match(/catch\s*\(\s*([a-zA-Z0-9_]+)[\s&*]?/);
        return match ? match[1] : 'error';
    }
}
// Factory for creating language-specific extractors

export class ExceptionExtractorFactory {
    static createExtractor(language: string): ExceptionTypeExtractor {
        switch (language.toLowerCase()) {
            case 'python':
                return new PythonExceptionExtractor();
            case 'java':
                return new JavaExceptionExtractor();
            case 'go':
                return new GoExceptionExtractor();
            case 'cpp':
            case 'c++':
                return new CPPExceptionExtractor();
            default:
                throw new Error(`Unsupported language: ${language}`);
        }
    }
}

// Interface for language-specific loop header extraction

export interface LoopHeaderExtractor {
    extractLoopHeader(node: any): string;
}

export class PythonLoopHeaderExtractor implements LoopHeaderExtractor {
    extractLoopHeader(node: any): string {
        const text = node.text;
        const colonIdx = text.indexOf(':');
        if (colonIdx !== -1) {
            return text.slice(0, colonIdx + 1);
        }
        return text.split('\n')[0];
    }
}

// Java implementation
export class JavaLoopHeaderExtractor implements LoopHeaderExtractor {
    extractLoopHeader(node: { text: string }): string {
        const text = node.text;
        const braceIdx = text.indexOf('{');
        if (braceIdx !== -1) {
            return text.slice(0, braceIdx).trim() + ' {';
        }
        // fallback: first line
        return text.split('\n')[0].trim();
    }
}

// C++ implementation
export class CPPLoopHeaderExtractor implements LoopHeaderExtractor {
    extractLoopHeader(node: { text: string }): string {
        const text = node.text;
        const braceIdx = text.indexOf('{');
        if (braceIdx !== -1) {
            return text.slice(0, braceIdx).trim() + ' {';
        }
        // fallback: first line
        return text.split('\n')[0].trim();
    }
}

// Go implementation
export class GoLoopHeaderExtractor implements LoopHeaderExtractor {
    extractLoopHeader(node: { text: string }): string {
        const text = node.text;
        const braceIdx = text.indexOf('{');
        if (braceIdx !== -1) {
            return text.slice(0, braceIdx).trim() + ' {';
        }
        // fallback: first line
        return text.split('\n')[0].trim();
    }
}

export class LoopHeaderExtractorFactory {
    static createExtractor(language: string): LoopHeaderExtractor {
        switch (language.toLowerCase()) {
            case 'python':
                return new PythonLoopHeaderExtractor();
            case 'java':
                return new JavaLoopHeaderExtractor();
            case 'cpp':
            case 'c++':
                return new CPPLoopHeaderExtractor();
            case 'go':
                return new GoLoopHeaderExtractor();
            default:
                throw new Error(`Unsupported language: ${language}`);
        }
    }
}