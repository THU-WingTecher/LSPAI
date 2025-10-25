/**
 * File Name Generator (VSCode-independent)
 * Single source of truth for test file name generation
 */

import * as path from 'path';
import { FileNameParams } from '../core/types';

export { FileNameParams };

/**
 * Generate core file name WITHOUT test suffix and extension
 * Returns: base name like "utils_add_numbers" or "com/example/Utils_add_numbers"
 */
export function generateFileNameCore(params: FileNameParams): string {
    const { sourceFileName, symbolName, languageId, packageString, relativeFilePath } = params;
    
    // Remove extension from source file name
    const fileNameWithoutExt = sourceFileName.replace(/\.\w+$/, '');
    
    // Generate base name
    if (languageId === 'java') {
        // Java: use package path structure
        const finalName = `${fileNameWithoutExt}_${symbolName}`;
        if (packageString) {
            const packageFolder = packageString
                .replace(";", "")
                .split(' ')[1]
                .replace(/\./g, '/');
            return `${packageFolder}/${finalName}`;
        } else {
            return finalName;
        }
    } else if (languageId === 'go') {
        // Go: use relative path and capitalize function name
        const capitalizedSymbol = symbolName.charAt(0).toUpperCase() + symbolName.slice(1);
        if (relativeFilePath) {
            const relPathWithoutExt = relativeFilePath.replace(".go", "");
            return `${relPathWithoutExt}_${capitalizedSymbol}`;
        } else {
            return `${fileNameWithoutExt}_${capitalizedSymbol}`;
        }
    } else {
        // Python, C++, etc.: simple format
        return `${fileNameWithoutExt}_${symbolName}`;
    }
}

/**
 * Generate COMPLETE test file name WITH test suffix and extension
 */
export function generateTestFileName(params: FileNameParams): string {
    // Use core logic to get base name
    const baseName = generateFileNameCore(params);
    
    // Add random number to the base name
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    const baseNameWithRandom = `${baseName}_${randomNum}`;
    
    // Add test suffix and file extension
    return addTestSuffix(baseNameWithRandom, params.languageId);
}

/**
 * Add test suffix based on language conventions
 */
function addTestSuffix(baseName: string, languageId: string): string {
    const suffix = getLanguageSuffix(languageId);
    
    switch (languageId) {
        case 'go':
            return `${baseName}_test.${suffix}`;
        case 'java':
            return `${baseName}Test.${suffix}`;
        default:
            // Python, C++, etc.
            return `${baseName}_test.${suffix}`;
    }
}

/**
 * Get file extension for language
 */
function getLanguageSuffix(languageId: string): string {
    const suffixMap: { [key: string]: string } = {
        'python': 'py',
        'java': 'java',
        'go': 'go',
        'cpp': 'cpp',
        'c++': 'cpp',
        'typescript': 'ts',
        'javascript': 'js'
    };
    return suffixMap[languageId.toLowerCase()] || languageId;
}

/**
 * Generate unique file name with random number
 */
export function generateUniqueTestFileName(params: FileNameParams): string {
    const baseFileName = generateTestFileName(params);
    
    // Extract base name and extension
    const ext = path.extname(baseFileName);
    const nameWithoutExt = baseFileName.substring(0, baseFileName.length - ext.length);
    
    // Generate random number
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    
    return `${nameWithoutExt}_${randomNum}${ext}`;
}

