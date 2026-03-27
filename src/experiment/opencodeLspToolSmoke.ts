/**
 * OpenCode LSP Tool smoke test.
 *
 * Verifies:
 * 1) an LSP-related tool is invoked by opencode
 * 2) returned symbol data matches expectations
 *
 * Run after compile:
 *   source /LSPRAG/.env.sh
 *   node out/experiment/opencodeLspToolSmoke.js
 */

import * as cp from 'child_process';
import * as path from 'path';

interface ToolUseEvent {
    tool: string;
    outputText: string;
}

interface RunResult {
    exitCode: number;
    toolCalls: ToolUseEvent[];
    finalText: string;
    stderr: string;
}

const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode';
const MODEL = process.env.OPENCODE_LSP_TEST_MODEL || 'deepseek/deepseek-chat';
const PROJECT_DIR = process.env.OPENCODE_LSP_TEST_DIR || path.join('/LSPRAG', 'src', 'test', 'fixtures', 'python');
const TARGET_FILE = process.env.OPENCODE_LSP_TEST_FILE || 'calculator.py';
const EXPECTED_SYMBOL = process.env.OPENCODE_LSP_EXPECTED_SYMBOL || 'compute';
const MARKER = 'LSP_TOOL_OK';

function isLspToolName(toolName: string): boolean {
    return toolName === 'lsp' || toolName.startsWith('lsprag_lsp_');
}

async function runPrompt(prompt: string): Promise<RunResult> {
    return await new Promise((resolve, reject) => {
        const env: Record<string, string> = {
            ...(process.env as Record<string, string>),
            OPENCODE_EXPERIMENTAL_LSP_TOOL: process.env.OPENCODE_EXPERIMENTAL_LSP_TOOL || 'true'
        };

        // Avoid stale remote session settings from local shell setup.
        delete env.OPENCODE_BASE_URL;
        delete env.OPENCODE_SERVER_PASSWORD;

        const args = [
            'run',
            '--model', MODEL,
            '--format', 'json',
            '--dir', PROJECT_DIR,
            prompt
        ];

        const proc = cp.spawn(OPENCODE_BIN, args, { env, timeout: 120_000 });
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', chunk => {
            stdout += chunk.toString();
        });
        proc.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        proc.on('error', reject);
        proc.on('close', code => {
            const toolCalls: ToolUseEvent[] = [];
            let finalText = '';

            for (const line of stdout.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed) {
                    continue;
                }

                let parsed: any;
                try {
                    parsed = JSON.parse(trimmed);
                } catch {
                    continue;
                }

                if (parsed.type === 'tool_use') {
                    const toolName = String(parsed.part?.tool || '');
                    const rawOutput = parsed.part?.state?.output;
                    const outputText = typeof rawOutput === 'string'
                        ? rawOutput
                        : JSON.stringify(rawOutput ?? '');
                    if (toolName) {
                        toolCalls.push({ tool: toolName, outputText });
                    }
                }

                if (parsed.type === 'text') {
                    finalText += String(parsed.part?.text || '');
                }
            }

            resolve({
                exitCode: code ?? 1,
                toolCalls,
                finalText,
                stderr
            });
        });
    });
}

function assertOrThrow(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

async function main(): Promise<void> {
    console.log('=== OpenCode LSP Tool Smoke Test ===');
    console.log(`opencode binary: ${OPENCODE_BIN}`);
    console.log(`project dir: ${PROJECT_DIR}`);
    console.log(`target file: ${TARGET_FILE}`);
    console.log(`model: ${MODEL}`);

    const prompt = [
        `Analyze ${TARGET_FILE}.`,
        'Call an LSP-related tool to fetch document symbols.',
        'Prefer lsprag_lsp_document_symbols if available; otherwise use the built-in lsp tool.',
        `After tool use, answer exactly: ${MARKER}.`
    ].join(' ');

    const result = await runPrompt(prompt);
    console.log(`exit code: ${result.exitCode}`);
    console.log(`tool calls: ${result.toolCalls.map(call => call.tool).join(', ') || '(none)'}`);

    const lspCalls = result.toolCalls.filter(call => isLspToolName(call.tool));
    assertOrThrow(result.exitCode === 0, `opencode exited with ${result.exitCode}. stderr: ${result.stderr.slice(0, 500)}`);
    assertOrThrow(lspCalls.length > 0, `Expected at least one LSP-related tool call, got: ${result.toolCalls.map(call => call.tool).join(', ')}`);

    const mergedOutput = lspCalls.map(call => call.outputText).join('\n');
    assertOrThrow(
        mergedOutput.toLowerCase().includes(EXPECTED_SYMBOL.toLowerCase()),
        `Expected tool output to contain symbol "${EXPECTED_SYMBOL}", got: ${mergedOutput.slice(0, 800)}`
    );
    assertOrThrow(
        result.finalText.includes(MARKER),
        `Expected final response marker "${MARKER}", got: ${result.finalText.slice(0, 300)}`
    );

    console.log('language server initiated: PASS');
    console.log('response validation: PASS');
    console.log('Smoke test passed.');
}

main().catch(error => {
    console.error(`Smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
