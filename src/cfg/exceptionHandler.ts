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

// Factory for creating language-specific extractors
export class ExceptionExtractorFactory {
    static createExtractor(language: string): ExceptionTypeExtractor {
        switch (language.toLowerCase()) {
            case 'python':
                return new PythonExceptionExtractor();
            case 'java':
                return new JavaExceptionExtractor();
            case 'cpp':
            case 'c++':
                return new CPPExceptionExtractor();
            default:
                throw new Error(`Unsupported language: ${language}`);
        }
    }
}