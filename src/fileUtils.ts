/**
 * File utility functions that don't require VSCode extension API
 * These can be used in both VSCode extension context and standalone scripts
 */

import * as fs from 'fs';
import * as path from 'path';
import { getConfigInstance } from './config';

const ignoreDirNamesToStartWith = ['node_modules', '.git', '.vscode', 'out', 'dist', 'build', '__pycache__', '.pytest_cache', 'lsprag', 'test', 'lspai'];

/**
 * Recursively finds files in a directory with a specific suffix
 * @param folderPath Root folder to search
 * @param Files Array to store found file paths
 * @param language Programming language (affects filtering logic)
 * @param suffix File extension to match (e.g., 'py', 'go', 'java')
 */
export function findFiles(folderPath: string, Files: string[] = [], language: string, suffix: string) {
    fs.readdirSync(folderPath).forEach(file => {
        const fullPath = path.join(folderPath, file);
        if (fs.statSync(fullPath).isDirectory() && 
            !path.basename(fullPath).startsWith(getConfigInstance().savePath) &&
            !ignoreDirNamesToStartWith.some(ignoreName => path.basename(fullPath).startsWith(ignoreName))) {
            findFiles(fullPath, Files, language, suffix); // Recursively search in subdirectory
        } else if (file.endsWith(`.${suffix}`)) {
            if (language === "go" && file.toLowerCase().includes('test')) {
                // Ignore Go test files when searching for source files
            } else {
                Files.push(fullPath);
            }
        }
    });
}

/**
 * Reads a text file and returns its content as a string
 * @param filePath The path to the text file
 * @returns Promise resolving to the file content
 */
export async function readTxtFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(path.resolve(filePath), 'utf8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(data);
        });
    });
}

/**
 * Saves context terms to a JSON file
 * @param sourceCode Original source code
 * @param terms Array of context terms
 * @param saveFolder Base folder path
 * @param fileName Name of the file being processed
 * @returns The full path of the saved file
 */
export function saveContextTerms(sourceCode: string, terms: any[], saveFolder: string, fileName: string): string {
    const logFolder = path.join(saveFolder, 'context');

    const logFilePath = path.join(logFolder, `${fileName}.json`);
    if (!fs.existsSync(path.dirname(logFilePath))) {
        fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    }
    
    fs.writeFileSync(logFilePath, JSON.stringify(terms, null, 2));
    
    // Also save as readable text format if terms have a toString method
    const contextString = `# Source Code\n${sourceCode}\n\n# Context\n${JSON.stringify(terms, null, 2)}`;
    const contextFilePath = path.join(logFolder, `${fileName}_context_prompt.txt`);
    
    if (!fs.existsSync(path.dirname(contextFilePath))) {
        fs.mkdirSync(path.dirname(contextFilePath), { recursive: true });
    }
    
    fs.writeFileSync(contextFilePath, contextString);
    return logFilePath;
}

// Note: generateTimestampString is defined in fileHandler.ts with VSCode-specific formatting

