/**
 * OpenCode Test Generator (independent of VSCode/LSPRAG)
 * Generates unit tests using OpenCode SDK
 * 
 * This is a drop-in replacement for baselineTestGenerator.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { OpencodeManager } from './opencodeManager';
import { BaselineTask, BaselineTestResult } from './baselineTypes';
import { buildTestPrompt, detectLanguage, generateSystemPrompt } from './baselineTemplateBuilder';
import { extractCleanCode } from './codeExtractor';
import { generateTestFileName, FileNameParams } from './fileNameGenerator';

/**
 * Generate a single unit test using OpenCode
 */
export async function generateTest(
    task: BaselineTask,
    opencodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    sharedClient?: any
): Promise<BaselineTestResult> {
    const startTime = Date.now();
    
    try {
        console.log(`#### Generating test for ${task.symbolName}`);

        // Create a unique OpenCode manager for this task
        const sessionId = require('crypto').randomUUID();
        const opencodeManager = new OpencodeManager({
            sessionId,
            outputDir: opencodeOutputDir,
            projectDir: projectDir,
            model: model,
            sharedClient: sharedClient
        } as any);
        console.log(`   Session ID: ${sessionId}`);

        // Detect language
        const languageId = detectLanguage(task.relativeDocumentPath);
        console.log(`   Language: ${languageId}`);

        const systemPrompt = generateSystemPrompt();
        const prompt = buildTestPrompt(task, languageId);
        console.log(`   Prompt length: ${prompt.length} chars`);

        // Run through OpenCode
        const outputName = `${task.symbolName}_${Date.now()}`;
        const response = await opencodeManager.runPrompt(systemPrompt + "\n\n" + prompt, outputName);
        console.log(`   Response length: ${response.length} chars`);
        console.log(`   Response: ${response}`);

        // Extract code
        const { code, isValid, warnings } = extractCleanCode(
            response,
            languageId,
            task.symbolName
        );

        if (!code) {
            return {
                taskName: task.symbolName,
                success: false,
                error: 'Failed to extract code from OpenCode response',
                warnings,
                executionTimeMs: Date.now() - startTime
            };
        }

        // Generate test file name using shared logic
        const fileNameParams: FileNameParams = {
            sourceFileName: path.basename(task.relativeDocumentPath),
            symbolName: task.symbolName,
            languageId: languageId,
            packageString: '', // Could extract from task if needed
            relativeFilePath: task.relativeDocumentPath
        };
        const testFileName = generateTestFileName(fileNameParams);
        const outputPath = path.join(opencodeManager.getCodesDir(), testFileName);

        // Save test code
        await fs.promises.writeFile(outputPath, code, 'utf8');
        console.log(`   Saved to: ${outputPath}`);

        return {
            taskName: task.symbolName,
            success: true,
            testCode: code,
            outputFilePath: outputPath,
            warnings: isValid ? [] : warnings,
            executionTimeMs: Date.now() - startTime
        };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`#### Error generating test for ${task.symbolName}:`, errorMsg);

        return {
            taskName: task.symbolName,
            success: false,
            error: errorMsg,
            executionTimeMs: Date.now() - startTime
        };
    }
}

/**
 * Generate tests in batch (sequential)
 */
export async function generateTestsSequential(
    tasks: BaselineTask[],
    opencodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    onProgress?: (completed: number, total: number, taskName: string) => void,
    sharedClient?: any
): Promise<BaselineTestResult[]> {
    const results: BaselineTestResult[] = [];
    const total = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const result = await generateTest(task, opencodeOutputDir, projectDir, outputDir, model, sharedClient);
        results.push(result);

        if (onProgress) {
            onProgress(i + 1, total, task.symbolName);
        }

        console.log(`#### Progress: ${i + 1}/${total} - ${task.symbolName} - ${result.success ? 'SUCCESS' : 'FAILED'}`);
    }

    return results;
}

/**
 * Generate tests in batch (parallel)
 */
export async function generateTestsParallel(
    tasks: BaselineTask[],
    opencodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    concurrency: number = 4,
    onProgress?: (completed: number, total: number, taskName: string) => void,
    sharedClient?: any
): Promise<BaselineTestResult[]> {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(concurrency);
    const total = tasks.length;
    let completed = 0;

    const taskPromises = tasks.map(task =>
        limit(async () => {
            const result = await generateTest(task, opencodeOutputDir, projectDir, outputDir, model, sharedClient);
            
            completed++;
            if (onProgress) {
                onProgress(completed, total, task.symbolName);
            }

            console.log(`#### Progress: ${completed}/${total} - ${task.symbolName} - ${result.success ? 'SUCCESS' : 'FAILED'}`);

            return result;
        })
    );

    return await Promise.all(taskPromises);
}

