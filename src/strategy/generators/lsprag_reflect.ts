import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfigInstance } from '../../config';
import { invokeLLM } from '../../invokeLLM';
import { ExpLogger, LLMLogs } from '../../log';
import { constructSourceCodeWithRelatedInfo, parseCode } from '../../lsp/utils';
import { ChatMessage } from '../../prompts/ChatMessage';
import { detectRedefinedAssertions, prettyPrintDefTree, RedefinedSymbol } from '../../ut_runner/analysis/assertion_detector';
import { LLMFixWorkflow } from '../../ut_runner/analysis/llm_fix_workflow';
import { LSPRAGTestGenerator } from './lsprag';
import { PromptType } from '../../config';

function getTestFileExtension(languageId: string): string {
	switch (languageId) {
		case 'python':
			return '.py';
		case 'java':
			return '.java';
		case 'go':
			return '.go';
		case 'cpp':
		case 'c':
		case 'c++':
			return '.cpp';
		default:
			return '.txt';
	}
}
 
type TestFileMapEntry = {
	project_name?: string;
	file_name?: string;
	symbol_name?: string;
};

function normalizePathLike(p: string): string {
	return (p || '').replace(/\\/g, '/');
}

export function resolveTestFileNameFromTestFileMap(params: {
	dirForReuse: string;
	symbolName: string;
	sourceFile?: string; // absolute path (we match via endsWith against mapping's relative file_name)
}): string | null {
	if (!params.dirForReuse || !params.symbolName) {
		return null;
	}

	// cachedDir might be the experiment root OR a subdir like "initial"/"final".
	const mappingDirs = [params.dirForReuse, path.dirname(params.dirForReuse)];
	const sourceNorm = params.sourceFile ? normalizePathLike(params.sourceFile) : '';

	for (const d of mappingDirs) {
		try {
			const mappingPath = path.join(d, 'test_file_map.json');
			if (!fs.existsSync(mappingPath) || !fs.statSync(mappingPath).isFile()) {
				continue;
			}

			const raw = fs.readFileSync(mappingPath, 'utf8');
			const obj = JSON.parse(raw) as Record<string, TestFileMapEntry>;
			if (!obj || typeof obj !== 'object') {
				continue;
			}

			let fallbackKey: string | null = null;
			for (const [key, entry] of Object.entries(obj)) {
				if (!entry || typeof entry !== 'object') {
					continue;
				}
				if (entry.symbol_name !== params.symbolName) {
					continue;
				}

				// Prefer a mapping that matches the source file path (absolute vs relative).
				const mappedFile = entry.file_name ? normalizePathLike(entry.file_name) : '';
				if (sourceNorm && mappedFile && sourceNorm.endsWith(mappedFile)) {
					return key;
				}

				if (!fallbackKey) {
					fallbackKey = key;
				}
			}
			if (fallbackKey) {
				return fallbackKey;
			}
		} catch {
			// ignore
		}
	}

	return null;
}

export function resolveCachedDraftTestPath(cachedDir: string, fileName: string): string | null {
	if (!cachedDir || !fileName) {
		return null;
	}

	// Accept both:
	// - cachedDir pointing directly at a directory with the test file
	// - cachedDir pointing at an experiment root (containing initial/final)
	// - cachedDir pointing at an experiment stage dir like ".../initial" or ".../final"
	const root = (() => {
		const bn = path.basename(cachedDir);
		if (bn === 'initial' || bn === 'final') {
			return path.dirname(cachedDir);
		}
		return cachedDir;
	})();
	const candidateDirs = Array.from(new Set([
		cachedDir,
		root,
		path.join(root, 'final')
	]));

	for (const dir of candidateDirs) {
		try {
			const p = path.join(dir, fileName);
			if (fs.existsSync(p) && fs.statSync(p).isFile()) {
				return p;
			}
		} catch {
			// ignore
		}
	}
	return null;
}

function truncateText(input: string, maxChars: number): string {
	if (!input) {
		return '';
	}
	if (input.length <= maxChars) {
		return input;
	}
	return input.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function truncateLines(input: string, maxLines: number, maxChars: number): string {
	if (!input) {
		return '';
	}
	const lines = input.replace(/\r\n/g, '\n').split('\n');
	const kept = lines.slice(0, Math.max(0, maxLines)).join('\n');
	return truncateText(kept, maxChars);
}

function formatInvokedFunctionSignatures(signatures: string[]): string {
	if (!signatures.length) {
		return '(none detected)';
	}
	return signatures.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');
}
 
function formatRedefinedSymbolsSummary(redefined: RedefinedSymbol[]): string {
	if (!redefined.length) {
		return '(none detected)';
	}
	// We include richer context than just file/loc, so keep this list short.
	const max = 12;
	return redefined.slice(0, max).map((sym, idx) => {
		const parts: string[] = [];
		parts.push(`${idx + 1}. ${sym.name}${sym.symbolKind ? ` (${sym.symbolKind})` : ''}`);
		if (sym.sourceLoc || sym.sourceFile) {
			parts.push(`   - source: ${sym.sourceLoc ?? sym.sourceFile ?? 'unknown'}`);
		}
		if (sym.sourceHoverText) {
			parts.push(`   - signature: ${truncateLines(sym.sourceHoverText, 6, 600)}`);
		}
		if (sym.sourceTrailingContext) {
			parts.push('   - source context:');
			parts.push(truncateLines(sym.sourceTrailingContext, 24, 1800));
		} else if (sym.sourceImplementation) {
			parts.push('   - source implementation:');
			parts.push(truncateLines(sym.sourceImplementation, 24, 1800));
		}
		if (sym.testLoc) {
			parts.push(`   - test: ${sym.testLoc}`);
		}
		return parts.join('\n');
	}).join('\n\n');
}
 
export function naiveReflectionPrompt(params: {
	languageId: string;
	sourceFile: string;
	focalSymbolName: string;
	focalMethodSource: string;
	draftTestCode: string;
	definitionTreePretty: string;
	redefinedSymbolsSummary: string;
	invokedFunctionSignatures: string[];
}): ChatMessage[] {
	const system = [
		'You are an expert unit test engineer.',
		'You will be given a draft unit test generated for a focal method.',
		'Your task is to improve assertion correctness and reduce false-positive assertions.',
		// '',
		// 'Critical rules:',
		// '- Use the provided focal method source as the ONLY ground-truth about behavior.',
		// '- Do NOT assert specific literal values unless they are directly implied by the focal method source (e.g., constants in code) or by the test inputs you construct.',
		// '- If an exact expected value is not provable from the provided evidence, replace brittle assertions with stable invariants (e.g., type/shape, non-null, length, idempotency, monotonicity, exception/no-exception).',
		// '- Do NOT redefine constants/functions/classes that already exist in the project; instead, import/reuse the source definitions.',
		// '- Keep test intent and structure as-is when possible; only adjust what is needed to make assertions correct.',
		// '- Prefer assertions that are directly implied by the focal method behavior and inputs/outputs.',
		// '- Return ONLY the final complete test code wrapped in a single triple-backtick code block.'
	].join('\n');
 
	const user = [
		`Language: ${params.languageId}`,
		`Source file: ${params.sourceFile}`,
		`Focal symbol: ${params.focalSymbolName}`,
		'',
		'### Focal method source (ground truth)',
		'```',
		params.focalMethodSource || '(unavailable)',
		'```',
		'',
		'### Draft test code',
		'```',
		params.draftTestCode,
		'```',
		// '',
		// '### Definition tree (from the focal symbol)',
		// params.definitionTreePretty || '(unavailable)',
		// '',
		// '### Symbols that appear redefined in the draft test but exist in the source dependency tree',
		// params.redefinedSymbolsSummary || '(unavailable)',
		// '',
		// '### Invoked function signatures (functions called by the focal symbol)',
		// formatInvokedFunctionSignatures(params.invokedFunctionSignatures)
	].join('\n');
 
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: user }
	];
}

export function buildAssertionReflectionPrompt(params: {
	languageId: string;
	sourceFile: string;
	focalSymbolName: string;
	focalMethodSource: string;
	draftTestCode: string;
	definitionTreePretty: string;
	redefinedSymbolsSummary: string;
	invokedFunctionSignatures: string[];
}): ChatMessage[] {
	const system = [
		'You are an expert unit test engineer.',
		'You will be given a draft unit test generated for a focal method, plus extra static-analysis context.',
		'Your task is to improve assertion correctness and reduce false-positive assertions.',
		'',
		'Critical rules:',
		'- Use the provided focal method source as the ONLY ground-truth about behavior.',
		'- Do NOT assert specific literal values unless they are directly implied by the focal method source (e.g., constants in code) or by the test inputs you construct.',
		'- If an exact expected value is not provable from the provided evidence, replace brittle assertions with stable invariants (e.g., type/shape, non-null, length, idempotency, monotonicity, exception/no-exception).',
		'- Do NOT redefine constants/functions/classes that already exist in the project; instead, import/reuse the source definitions.',
		'- Keep test intent and structure as-is when possible; only adjust what is needed to make assertions correct.',
		'- Prefer assertions that are directly implied by the focal method behavior and inputs/outputs.',
		'- Checkout whether given test code is satisfied the given path coverage requirements, if not, adjust the test code to satisfy the requirements.',
		'- Return ONLY the final complete test code wrapped in a single triple-backtick code block.'
	].join('\n');
 
	const user = [
		`Language: ${params.languageId}`,
		`Source file: ${params.sourceFile}`,
		`Focal symbol: ${params.focalSymbolName}`,
		'',
		'### Focal method source (ground truth)',
		'```',
		params.focalMethodSource || '(unavailable)',
		'```',
		'',
		'### Draft test code with test prefix path coverage requirements',
		'```',
		params.draftTestCode,
		'```',
		'',
		'### Definition tree (from the focal symbol)',
		params.definitionTreePretty || '(unavailable)',
		'',
		'### Symbols that appear redefined in the draft test but exist in the source dependency tree',
		params.redefinedSymbolsSummary || '(unavailable)',
		'',
		'### Invoked function signatures (functions called by the focal symbol)',
		formatInvokedFunctionSignatures(params.invokedFunctionSignatures)
	].join('\n');
 
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: user }
	];
}
 
export class LSPRAGReflectTestGenerator extends LSPRAGTestGenerator {
	private readonly cachedDir?: string;
	private readonly cachedDraftTestCode?: string;

	constructor(
		document: vscode.TextDocument,
		functionSymbol: vscode.DocumentSymbol,
		languageId: string,
		fileName: string,
		logger: ExpLogger,
		progress: vscode.Progress<{ message?: string; increment?: number; }>,
		token: vscode.CancellationToken,
		srcPath: string,
		cachedDir?: string,
		cachedDraftTestCode?: string
	) {
		super(document, functionSymbol, languageId, fileName, logger, progress, token, srcPath);
		this.cachedDir = cachedDir;
		this.cachedDraftTestCode = cachedDraftTestCode;
	}

	async generateTest(): Promise<string> {
		if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - generating initial test code`, 10)) {
			return '';
		}
 
		let initial = '';
		if (this.cachedDraftTestCode && this.cachedDraftTestCode.trim()) {
			initial = this.cachedDraftTestCode;
		}

		if (!initial.trim()) {
			initial = await super.generateTest();
			if (!initial.trim()) {
				return initial;
			}
		}
 
		if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - analyzing draft test for reflection`, 10)) {
			return initial;
		}
 
		const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lsprag-reflect-'));
		const testPath = path.join(tmpRoot, `${this.fileName}_draft${getTestFileExtension(this.languageId)}`);
		try {
			fs.writeFileSync(testPath, initial, 'utf8');
		} catch (e) {
			console.warn('[LSPRAG_REFLECT] Failed to write temp test file, skipping reflection:', e);
			return initial;
		}
 
		const sourceFile = this.document.uri.fsPath;
		const symbolName = this.functionSymbol.name;
 
		let focalMethodSource = '';
		try {
			focalMethodSource = await constructSourceCodeWithRelatedInfo(this.document, this.functionSymbol);
		} catch (e) {
			console.warn('[LSPRAG_REFLECT] Failed to construct focal method source (continuing):', e);
		}

		let definitionTreePretty = '';
		let redefinedSymbolsSummary = '';
		try {
			const detection = await detectRedefinedAssertions(testPath, sourceFile, symbolName);
			definitionTreePretty = prettyPrintDefTree(detection.definitionTree);
			redefinedSymbolsSummary = formatRedefinedSymbolsSummary(detection.redefinedSymbols);
		} catch (e) {
			console.warn('[LSPRAG_REFLECT] Redefined-assertion detection failed (continuing):', e);
		}
 
		let invokedFunctionSignatures: string[] = [];
		try {
			const wfOutDir = path.join(tmpRoot, 'llm-fix-workflow');
			const workflow = new LLMFixWorkflow(path.join(tmpRoot, 'noop.json'), wfOutDir, { language: this.languageId as any });
			invokedFunctionSignatures = await workflow.getInvokedFunctionSignatures({
				source_file: sourceFile,
				symbol_name: symbolName
			});
		} catch (e) {
			console.warn('[LSPRAG_REFLECT] Invoked function signature extraction failed (continuing):', e);
		}
 
		if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - reflecting to improve assertions`, 20)) {
			return initial;
		}
 
		const reflectionStartTime = Date.now();
		const logObj: LLMLogs = { tokenUsage: '', result: '', prompt: '', model: getConfigInstance().model };
		
		let promptObj: ChatMessage[] = [];
		if (getConfigInstance().promptType === PromptType.NAIVE) {
			promptObj = naiveReflectionPrompt({
				languageId: this.languageId,
				sourceFile,
				focalSymbolName: symbolName,
				focalMethodSource,
				draftTestCode: initial,
				definitionTreePretty,
				redefinedSymbolsSummary,
				invokedFunctionSignatures
			});
		} else {
			promptObj = buildAssertionReflectionPrompt({
				languageId: this.languageId,
				sourceFile,
				focalSymbolName: symbolName,
				focalMethodSource,
				draftTestCode: initial,
				definitionTreePretty,
				redefinedSymbolsSummary,
				invokedFunctionSignatures
			});
		}
 
		const reflected = await invokeLLM(promptObj, logObj);
		this.logger.log('reflectAssertions', (Date.now() - reflectionStartTime).toString(), logObj, '');
		return parseCode(reflected);
	}
}


