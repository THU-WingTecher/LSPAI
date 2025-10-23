/**
 * File Name Generator (VSCode-independent)
 * Extracted core logic from fileHandler.ts::genFileNameWithGivenSymbol without VSCode dependencies
 * 
 * This module contains the SINGLE SOURCE OF TRUTH for file name generation logic.
 * Both VSCode-dependent code (fileHandler.ts) and baseline experiments use this.
 */

import * as path from 'path';

/**
 * Parameters for generating file name (VSCode-independent version)
 */
export interface FileNameParams {
    sourceFileName: string;      // e.g., "utils.py"
    symbolName: string;          // e.g., "add_numbers"
    languageId: string;          // e.g., "python"
    packageString?: string;      // For Java: "package com.example;"
    relativeFilePath?: string;   // For Go: relative path from project root
}

/**
 * Generate core file name WITHOUT test suffix and extension
 * This is the CORE LOGIC extracted from genFileNameWithGivenSymbol
 * 
 * Returns: base name like "utils_add_numbers" or "com/example/Utils_add_numbers"
 */
export function generateFileNameCore(params: FileNameParams): string {
    const { sourceFileName, symbolName, languageId, packageString, relativeFilePath } = params;
    
    // Remove extension from source file name
    const fileNameWithoutExt = sourceFileName.replace(/\.\w+$/, '');
    
    // Generate base name following original genFileNameWithGivenSymbol logic
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
 * This builds on generateFileNameCore
 */
export function generateTestFileName(params: FileNameParams): string {
    // Use core logic to get base name
    const baseName = generateFileNameCore(params);
    
    // add random number to the base name
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
 * (Similar to getUniqueFileName in fileHandler.ts)
 */
export function generateUniqueTestFileName(params: FileNameParams): string {
    const baseFileName = generateTestFileName(params);
    
    // Extract base name and extension
    const ext = path.extname(baseFileName);
    const nameWithoutExt = baseFileName.substring(0, baseFileName.length - ext.length);
    
    // Generate random number
    const randomNum = Math.floor(Math.random() * 9000) + 1000;
    
    // Return unique name
    return `${nameWithoutExt}_${randomNum}${ext}`;
}

/**
 * Extract file name parameters from BaselineTask
 */
export function extractFileNameParamsFromTask(task: {
    relativeDocumentPath: string;
    symbolName: string;
}): { sourceFileName: string; languageId: string } {
    const sourceFileName = path.basename(task.relativeDocumentPath);
    const ext = path.extname(task.relativeDocumentPath).toLowerCase();
    
    const langMap: { [key: string]: string } = {
        '.py': 'python',
        '.java': 'java',
        '.go': 'go',
        '.cpp': 'cpp',
        '.cc': 'cpp',
        '.cxx': 'cpp',
        '.c++': 'cpp',
        '.ts': 'typescript',
        '.js': 'javascript'
    };
    
    const languageId = langMap[ext] || 'unknown';
    
    return { sourceFileName, languageId };
}

