/**
 * CFG-based prompt builder for experiment runners.
 *
 * NOTE: Do not modify `src/experiment/prompts/templates.ts` for CFG logic.
 * We reuse the shared unit test template generator (same one used by the VSCode extension)
 * and only build additional CFG-derived "conditions to cover" strings here.
 */

import { createCFGBuilder } from '../../cfg/builderFactory';
import { PathCollector } from '../../cfg/path';
import { SupportedLanguage } from '../../ast';
import { getConfigInstance } from '../../config';
import { getUnitTestTemplate } from '../../prompts/unitTestTemplateManager';
import { conditionToPrompt } from '../../prompts/conditionPrompt';
import { Task } from '../core/types';
import { generateSystemPrompt } from './templates';

function isCfgSupportedLanguage(languageId: string): languageId is SupportedLanguage {
    return languageId === 'python' || languageId === 'java' || languageId === 'go';
}

function countTokens(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

function truncateContextString(context: string, maxTokens: number): string {
    if (maxTokens <= 0) {
        return "";
    }

    const words = context.split(/\s+/);
    if (words.length <= maxTokens) {
        return context;
    }

    return words.slice(0, maxTokens).join(' ') + '...';
}

async function buildConditionPrompts(sourceCode: string, languageId: string): Promise<string[]> {
    if (!isCfgSupportedLanguage(languageId)) {
        return [];
    }

    try {
        const builder = createCFGBuilder(languageId as SupportedLanguage);
        const cfg = await builder.buildFromCode(sourceCode);

        const pathCollector = new PathCollector(languageId);
        pathCollector.collect(cfg.entry);
        const conditionAnalyses = pathCollector.getUniqueConditions();
        return conditionAnalyses.map(conditionToPrompt);
    } catch (error) {
        console.warn(`[CFG] Failed to build CFG for prompt: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

function generatePrompt(template: string, sourceCode: string, context: string): string {
    return `Source Code:
${sourceCode}

Context:
${context}

Template:
${template}`;
}

/**
 * Build unit test generation prompt using CFG-derived conditions.
 *
 * This mirrors the LSPRAG CFG strategy pattern:
 * `LanguageTemplateManager.getUnitTestTemplate(..., conditionAnalyses.map(conditionToPrompt))`
 */
export async function buildTestPromptWithCFG(task: Task, languageId: string, model?: string): Promise<string> {
    // Derive a reasonable test file name stem from task path
    let fileName = task.relativeDocumentPath;
    if (fileName.includes('.')) {
        fileName = fileName.split('.')[0];
    }
    if (fileName.includes('/')) {
        fileName = fileName.split('/').pop() || fileName;
    }

    const conditionPrompts = await buildConditionPrompts(task.sourceCode, languageId);
    const template = getUnitTestTemplate(
        languageId,
        fileName,
        '',
        task.importString,
        conditionPrompts
    );

    // Optional context support with token-aware truncation
    let context = task.context ?? '';
    if (context) {
        const maxTokens = model ? getConfigInstance().getMaxTokensForModel(model) : getConfigInstance().maxTokens;
        const tempPrompt = generatePrompt(template, task.sourceCode, '');
        const systemTokens = countTokens(generateSystemPrompt());
        const availableTokensForContext = maxTokens - countTokens(tempPrompt) - systemTokens;
        if (countTokens(context) > availableTokensForContext) {
            context = truncateContextString(context, availableTokensForContext);
        }
    }

    return generatePrompt(template, task.sourceCode, context);
}
