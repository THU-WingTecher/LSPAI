/**
 * OpenCode Test Generator
 */

import * as fs from 'fs';
import * as path from 'path';
import { OpencodeManager } from '../runners/opencodeManager';
import { Task, TestResult, PromptTemplate } from '../core/types';
import { buildTestPrompt, detectLanguage, generateSystemPrompt } from '../prompts/templates';
import { buildTestPromptWithCFG } from '../prompts/cfgPrompt';
import { extractCleanCode } from '../utils/codeExtractor';
import { generateTestFileName } from '../utils/fileNameGenerator';
import { FileNameParams } from '../core/types';
import { buildTaskKey, formatTaskLabel } from '../utils/taskKey';
import { runWithRetries } from '../utils/retry';

/**
 * Generate a single unit test using OpenCode
 */
export async function generateTest(
    task: Task,
    opencodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    provider: string,
    sharedClient?: any,
    existingTestFileName?: string,
    promptTemplate: PromptTemplate = 'cfg'
): Promise<TestResult> {
    const startTime = Date.now();
    const taskKey = task.taskKey ?? buildTaskKey(task);


    try {
        console.log(`#### Generating test for ${task.symbolName}`);

        // Create a unique OpenCode manager for this task
        const sessionId = require('crypto').randomUUID();
        const opencodeManager = new OpencodeManager({
            sessionId,
            outputDir: opencodeOutputDir,
            projectDir: projectDir,
            model: model,
            provider: provider,
            sharedClient: sharedClient
        } as any);
        const languageId = detectLanguage(task.relativeDocumentPath);
        // Generate test file name
        const fileNameParams: FileNameParams = {
            sourceFileName: path.basename(task.relativeDocumentPath),
            symbolName: task.symbolName,
            languageId: languageId,
            packageString: '',
            relativeFilePath: task.relativeDocumentPath
        };
        const testFileName = existingTestFileName || generateTestFileName(fileNameParams);
        if (existingTestFileName) {
            console.log(`   Reusing test file name: ${existingTestFileName}`);
        }

        console.log(`   Session ID: ${sessionId}`);

        // Detect language
        console.log(`   Language: ${languageId}`);

        const systemPrompt = generateSystemPrompt();
        const prompt = promptTemplate === 'cfg'
            ? await buildTestPromptWithCFG(task, languageId, model)
            : buildTestPrompt(task, languageId);
        const fullPrompt = systemPrompt + "\n\n" + prompt;
        console.log(`   Prompt body length: ${prompt.length} chars`);
        console.log(`   Full prompt length: ${fullPrompt.length} chars`);
        console.log(fullPrompt)
        // Run through OpenCode

        const logfileName = `${testFileName}.log`;
        const response = await opencodeManager.runPrompt(fullPrompt, logfileName);
        console.log(`   Response length: ${response.length} chars`);
        // console.log(`   Response: ${response}`);

        // Extract code
        const { code, isValid, warnings } = extractCleanCode(
            response,
            languageId,
            task.symbolName
        );

        if (!code) {
            console.log(`#### Failed extracting code for ${task.symbolName}: ${warnings.join(' | ') || 'empty response content'}`);
            return {
                taskName: task.symbolName,
                taskKey,
                success: false,
                error: 'Failed to extract code from OpenCode response',
                warnings,
                executionTimeMs: Date.now() - startTime
            };
        }

        // Save test code
        const outputPath = path.join(opencodeManager.getCodesDir(), testFileName);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, code, 'utf8');
        console.log(`   Saved to: ${outputPath}`);

        return {
            taskName: task.symbolName,
            taskKey,
            success: true,
            testCode: code,
            outputFilePath: outputPath,
            warnings: isValid ? [] : warnings,
            executionTimeMs: Date.now() - startTime
        };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`#### Error generating test for ${task.symbolName}: ${errorMsg}`);
        console.error(`#### Error generating test for ${task.symbolName}:`, errorMsg);

        return {
            taskName: task.symbolName,
            taskKey,
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
    tasks: Task[],
    opencodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    provider: string,
    maxRetries: number = 0,
    onProgress?: (completed: number, total: number, taskName: string) => void,
    sharedClient?: any,
    existingFileNames?: Map<string, string>,
    promptTemplate: PromptTemplate = 'cfg'
): Promise<TestResult[]> {
    const results: TestResult[] = [];
    const total = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const taskLabel = formatTaskLabel(task);
        const taskKey = task.taskKey ?? buildTaskKey(task);
        const existingTestFileName = existingFileNames?.get(taskKey);
        const result = await runWithRetries(taskLabel, maxRetries, () =>
            generateTest(
                task,
                opencodeOutputDir,
                projectDir,
                outputDir,
                model,
                provider,
                sharedClient,
                existingTestFileName,
                promptTemplate
            )
        );
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
    tasks: Task[],
    opencodeOutputDir: string,
    projectDir: string,
    outputDir: string,
    model: string,
    provider: string,
    concurrency: number = 4,
    maxRetries: number = 0,
    onProgress?: (completed: number, total: number, taskName: string) => void,
    sharedClient?: any,
    existingFileNames?: Map<string, string>,
    promptTemplate: PromptTemplate = 'cfg'
): Promise<TestResult[]> {
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(concurrency);
    const total = tasks.length;
    let completed = 0;

    const taskPromises = tasks.map(task =>
        limit(async () => {
            const taskLabel = formatTaskLabel(task);
            const taskKey = task.taskKey ?? buildTaskKey(task);
            const existingTestFileName = existingFileNames?.get(taskKey);
            const result = await runWithRetries(taskLabel, maxRetries, () =>
                generateTest(
                    task,
                    opencodeOutputDir,
                    projectDir,
                    outputDir,
                    model,
                    provider,
                    sharedClient,
                    existingTestFileName,
                    promptTemplate
                )
            );
            
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
