import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
	FixType,
	ProjectConfigName,
	PromptType,
	getConfigInstance,
	getProjectPythonExe,
	getProjectPythonPath
} from '../../config';
import { saveToIntermediate } from '../../fileHandler';
import { DiagnosticReport } from '../../fix';
import { invokeLLM, isSkipLLMModeEnabled } from '../../invokeLLM';
import { ExpLogger, LLMLogs } from '../../log';
import { constructSourceCodeWithRelatedInfo, parseCode } from '../../lsp/utils';
import { ChatMessage } from '../../prompts/ChatMessage';
import { detectRedefinedAssertions, prettyPrintDefTree, RedefinedSymbol } from '../../ut_runner/analysis/assertion_detector';
import { LLMFixWorkflow } from '../../ut_runner/analysis/llm_fix_workflow';
import { makeExecutor } from '../../ut_runner/executor';
import { buildEnv } from '../../ut_runner/runner';
import { LSPRAGTestGenerator } from './lsprag';
import { collectMockedObjectDefinitionsSummary } from './mock';
export { extractMockTargetsFromTestCode } from './mock';

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
	location?: number;
	line_num?: number;
	task_key?: string;
	taskKey?: string;
};

function normalizePathLike(p: string): string {
	return (p || '').replace(/\\/g, '/');
}

function normalizeTaskKey(value?: string): string {
	return normalizePathLike(value || '').replace(/^\.\//, '');
}

type ParsedTaskKey = {
	relPath: string;
	symbol: string;
	line?: number;
	dup?: string;
};

function parseTaskKey(taskKey?: string): ParsedTaskKey | null {
	const normalized = normalizeTaskKey(taskKey);
	if (!normalized) {
		return null;
	}
	const parts = normalized.split('::');
	if (parts.length < 3) {
		return null;
	}
	const line = Number.parseInt(parts[2] || '', 10);
	return {
		relPath: parts[0] || '',
		symbol: parts[1] || '',
		line: Number.isFinite(line) ? line : undefined,
		dup: parts.length > 3 ? parts.slice(3).join('::') : ''
	};
}

export function resolveTestFileNameFromTestFileMap(params: {
	dirForReuse: string;
	symbolName: string;
	sourceFile?: string; // absolute path (we match via endsWith against mapping's relative file_name)
	testFileMapPath: string;
	taskKey?: string;
	usedMappingKeys?: Set<string>;
}): string | null {
	if (!params.dirForReuse || !params.symbolName) {
		return null;
	}

	// cachedDir might be the experiment root OR a subdir like "initial"/"final".
	const mappingDirs = [params.dirForReuse, path.dirname(params.dirForReuse)];
	const sourceNorm = params.sourceFile ? normalizePathLike(params.sourceFile) : '';
	const raw = fs.readFileSync(params.testFileMapPath, 'utf8');
	const obj = JSON.parse(raw) as Record<string, TestFileMapEntry>;
	// for (const d of mappingDirs) {
	// 	try {
	// 		const mappingPath = path.join(d, 'test_file_map.json');
	// 		if (!fs.existsSync(mappingPath) || !fs.statSync(mappingPath).isFile()) {
	// 			continue;
	// 		}

	// 		const raw = fs.readFileSync(mappingPath, 'utf8');
	// 		const obj = JSON.parse(raw) as Record<string, TestFileMapEntry>;
	if (!obj || typeof obj !== 'object') {
		return null;
	}

	const requestedTaskKey = normalizeTaskKey(params.taskKey);
	const sourceMatchedKeys: string[] = [];
	const symbolMatchedKeys: string[] = [];
	for (const [key, entry] of Object.entries(obj)) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		if (entry.symbol_name !== params.symbolName) {
			continue;
		}
		symbolMatchedKeys.push(key);

		// Prefer a mapping that matches the source file path (absolute vs relative).
		const mappedFile = entry.file_name ? normalizePathLike(entry.file_name) : '';
		if (!sourceNorm || !mappedFile || sourceNorm.endsWith(mappedFile)) {
			sourceMatchedKeys.push(key);
		}
	}

	const candidateKeys = sourceMatchedKeys.length > 0 ? sourceMatchedKeys : symbolMatchedKeys;
	if (candidateKeys.length === 0) {
		return null;
	}

	if (requestedTaskKey) {
		const exact = candidateKeys.find((key) => {
			const entry = obj[key];
			const entryTaskKey = normalizeTaskKey(entry?.task_key || entry?.taskKey);
			return entryTaskKey === requestedTaskKey && !params.usedMappingKeys?.has(key);
		});
		if (exact) {
			return exact;
		}

		// Relaxed task-key match across runs with different path prefixes
		// (e.g. "experiments/projects/sanic/sanic/headers.py" vs "sanic/headers.py").
		const requestedParsed = parseTaskKey(requestedTaskKey);
		if (requestedParsed && requestedParsed.symbol && Number.isFinite(requestedParsed.line)) {
			const relaxed = candidateKeys.filter((key) => {
				if (params.usedMappingKeys?.has(key)) {
					return false;
				}
				const entry = obj[key];
				if (!entry || typeof entry !== 'object') {
					return false;
				}
				const entryTaskKey = normalizeTaskKey(entry?.task_key || entry?.taskKey);
				const entryParsed = parseTaskKey(entryTaskKey);
				const entryRelPath = normalizePathLike(entry?.file_name || entryParsed?.relPath || '');
				const entrySymbol = entry?.symbol_name || entryParsed?.symbol || '';
				const entryLineRaw = entryParsed?.line ?? Number(entry?.line_num ?? entry?.location);
				const entryLine = Number.isFinite(entryLineRaw) ? Number(entryLineRaw) : undefined;

				if (entrySymbol !== requestedParsed.symbol) {
					return false;
				}
				if (!Number.isFinite(entryLine) || entryLine !== requestedParsed.line) {
					return false;
				}
				const pathCompatible =
					(!!requestedParsed.relPath && !!entryRelPath &&
						(requestedParsed.relPath.endsWith(entryRelPath) || entryRelPath.endsWith(requestedParsed.relPath))) ||
					(!!sourceNorm && !!entryRelPath && sourceNorm.endsWith(entryRelPath));
				if (!pathCompatible) {
					return false;
				}
				if (requestedParsed.dup) {
					return (entryParsed?.dup || '') === requestedParsed.dup;
				}
				return true;
			});
			if (relaxed.length === 1) {
				return relaxed[0];
			}
			if (relaxed.length > 1) {
				return null;
			}
		}

		const candidatesWithTaskKey = candidateKeys.filter((key) => {
			const entry = obj[key];
			const entryTaskKey = normalizeTaskKey(entry?.task_key || entry?.taskKey);
			return !!entryTaskKey;
		});
		// When task keys are available but none matches, fail closed instead of
		// silently picking another overload/duplicate symbol.
		if (candidatesWithTaskKey.length > 0) {
			return null;
		}
		// Backward-compatibility for legacy maps without task_key/taskKey:
		// allow fallback only when there is exactly one candidate.
		if (candidateKeys.length !== 1) {
			return null;
		}
	}

	const firstUnused = candidateKeys.find((key) => !params.usedMappingKeys?.has(key));
	return firstUnused ?? candidateKeys[0];
}

function resolveExistingInCandidateDirs(candidateDirs: string[], fileName: string): string | null {
	for (const dir of candidateDirs) {
		try {
			const p = path.join(dir, fileName);
			if (fs.existsSync(p) && fs.statSync(p).isFile()) {
				return p;
			}
			const base = path.basename(fileName);
			if (base !== fileName) {
				const pBase = path.join(dir, base);
				if (fs.existsSync(pBase) && fs.statSync(pBase).isFile()) {
					return pBase;
				}
			}
		} catch {
			// ignore
		}
	}
	return null;
}

function normalizeDraftFileNameForFallback(name: string): string {
	return path
		.basename(name || '')
		.replace(/_(\d{4})(?=(?:_test\.[^.]+$|Test\.[^.]+$|\.[^.]+$))/, '_####');
}

function getMapMatchingKeys(params: {
	mapObject: Record<string, TestFileMapEntry>;
	fileName: string;
	taskKey?: string;
}): string[] {
	const keys = Object.keys(params.mapObject);
	const fileBase = path.basename(params.fileName);
	const normalizedTarget = normalizeDraftFileNameForFallback(params.fileName);
	const requestedTaskKey = normalizeTaskKey(params.taskKey);
	const requestedParsed = parseTaskKey(requestedTaskKey);

	const keyExact = keys.filter((k) => path.basename(k) === fileBase);
	if (keyExact.length > 0) {
		return keyExact;
	}

	if (requestedTaskKey) {
		const exactTask = keys.filter((k) => {
			const entry = params.mapObject[k];
			const entryTaskKey = normalizeTaskKey(entry?.task_key || entry?.taskKey);
			return entryTaskKey === requestedTaskKey;
		});
		if (exactTask.length > 0) {
			return exactTask;
		}

		if (requestedParsed && requestedParsed.symbol && Number.isFinite(requestedParsed.line)) {
			const relaxedTask = keys.filter((k) => {
				const entry = params.mapObject[k];
				if (!entry || typeof entry !== 'object') {
					return false;
				}
				const entryTaskKey = normalizeTaskKey(entry?.task_key || entry?.taskKey);
				const entryParsed = parseTaskKey(entryTaskKey);
				const entryRelPath = normalizePathLike(entry?.file_name || entryParsed?.relPath || '');
				const entrySymbol = entry?.symbol_name || entryParsed?.symbol || '';
				const entryLineRaw = entryParsed?.line ?? Number(entry?.line_num ?? entry?.location);
				const entryLine = Number.isFinite(entryLineRaw) ? Number(entryLineRaw) : undefined;

				if (entrySymbol !== requestedParsed.symbol) {
					return false;
				}
				if (!Number.isFinite(entryLine) || entryLine !== requestedParsed.line) {
					return false;
				}
				if (!requestedParsed.relPath || !entryRelPath) {
					return false;
				}
				const pathCompatible =
					requestedParsed.relPath.endsWith(entryRelPath) || entryRelPath.endsWith(requestedParsed.relPath);
				if (!pathCompatible) {
					return false;
				}
				if (requestedParsed.dup) {
					return (entryParsed?.dup || '') === requestedParsed.dup;
				}
				return true;
			});
			if (relaxedTask.length > 0) {
				return relaxedTask;
			}
		}
	}

	return keys.filter((k) => normalizeDraftFileNameForFallback(k) === normalizedTarget);
}

export function resolveCachedDraftTestPath(
	cachedDir: string,
	fileName: string,
	options?: { taskKey?: string; testFileMapPaths?: string[] }
): string | null {
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

	// 1) Exact path resolution first.
	const exact = resolveExistingInCandidateDirs(candidateDirs, fileName);
	if (exact) {
		return exact;
	}

	// 2) Map-scoped resolution (exact key -> task_key -> normalized key),
	//    scoped per provided test_file_map sources.
	const mapPaths = Array.from(
		new Set((options?.testFileMapPaths || []).filter((p): p is string => typeof p === 'string' && p.length > 0))
	);
	for (const mapPath of mapPaths) {
		try {
			if (!fs.existsSync(mapPath) || !fs.statSync(mapPath).isFile()) {
				continue;
			}
			const raw = fs.readFileSync(mapPath, 'utf8');
			const obj = JSON.parse(raw) as Record<string, TestFileMapEntry>;
			if (!obj || typeof obj !== 'object') {
				continue;
			}
			const matchingKeys = getMapMatchingKeys({
				mapObject: obj,
				fileName,
				taskKey: options?.taskKey
			});
			if (matchingKeys.length === 0) {
				continue;
			}

			const existingMatches = Array.from(
				new Set(
					matchingKeys
						.map((k) => resolveExistingInCandidateDirs(candidateDirs, k))
						.filter((p): p is string => !!p)
				)
			);
			if (existingMatches.length === 1) {
				return existingMatches[0];
			}
			if (existingMatches.length > 1) {
				// Keep deterministic behavior for ambiguous map-scoped matches.
				return existingMatches.sort()[0];
			}
		} catch {
			// ignore
		}
	}

	// 3) Generic normalized fallback (drop 4-digit segment).
	const fallbackKey = normalizeDraftFileNameForFallback(fileName);
	const genericMatches: string[] = [];
	for (const dir of candidateDirs) {
		try {
			if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
				continue;
			}
			const matchesInDir = fs
				.readdirSync(dir, { withFileTypes: true })
				.filter((entry) => entry.isFile())
				.map((entry) => entry.name)
				.filter((name) => normalizeDraftFileNameForFallback(name) === fallbackKey);
			genericMatches.push(...matchesInDir.map((m) => path.join(dir, m)));
		} catch {
			// ignore
		}
	}

	const uniqueGeneric = Array.from(new Set(genericMatches));
	if (uniqueGeneric.length === 1) {
		return uniqueGeneric[0];
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

function hasDetectedContent(input?: string): boolean {
	const value = (input || '').trim();
	return !!value && value.toLowerCase() !== '(none detected)';
}

function formatInvokedFunctionContext(signatures: string[]): string {
	if (!signatures.length) {
		return '(none detected)';
	}
	return signatures
		.map((s, i) => `${i + 1}. ${s.trim().replace(/\n/g, '\n   ')}`)
		.join('\n');
}

function countApproxTokens(text: string): number {
	return (text || '').split(/\s+/).filter(Boolean).length;
}

function truncateTextByApproxTokens(input: string, maxTokens: number): string {
	if (!input || maxTokens <= 0) {
		return '';
	}

	const matches = Array.from(input.matchAll(/\S+\s*/g));
	if (matches.length <= maxTokens) {
		return input;
	}

	const cutoff = matches[maxTokens - 1];
	const endIndex = typeof cutoff.index === 'number' ? cutoff.index + cutoff[0].length : input.length;
	return input.slice(0, endIndex).trimEnd() + '\n...';
}

function getInvokedEntryPriority(entry: string): number {
	const normalized = (entry || '').toLowerCase();
	const header = normalized.split('\n')[0] || '';
	let score = 0;

	if (header.startsWith('[decision]')) {
		return 1000;
	}
	if (header.startsWith('[method]') || header.startsWith('[function]') || header.startsWith('[constructor]')) {
		score += 400;
	} else if (header.startsWith('[class]')) {
		score += 250;
	} else if (header.startsWith('[constant]')) {
		score += 100;
	}

	if (/\bsuper\s*\(|\.suitable\s*\(/.test(normalized)) {
		score += 80;
	}
	if (/(^|\n)\s*(if|elif|else|else if|match|case|switch|catch|except)\b/m.test(normalized)) {
		score += 60;
	}
	if (/(^|\n)\s*return\b/m.test(normalized)) {
		score += 20;
	}
	if (/(^|\n)\s*assert\b/m.test(normalized)) {
		score += 10;
	}

	return score;
}

export function compactInvokedFunctionContext(
	entries: string[],
	options: {
		maxEntries?: number;
		maxEntryLines?: number;
		maxEntryChars?: number;
		maxTotalChars?: number;
		maxTotalTokens?: number;
	} = {}
): string[] {
	const maxEntries = options.maxEntries ?? Number.MAX_SAFE_INTEGER;
	const maxEntryLines = options.maxEntryLines ?? 120;
	const maxEntryChars = options.maxEntryChars ?? 32000;
	const maxTotalChars = options.maxTotalChars ?? 120000;
	const maxTotalTokens = options.maxTotalTokens ?? 8000;
	const compacted: string[] = [];
	const seen = new Set<string>();
	let totalChars = 0;
	let totalTokens = 0;

	const rankedEntries = entries
		.map((entry, index) => ({
			entry,
			index,
			priority: getInvokedEntryPriority(entry),
			tokenCount: countApproxTokens(entry)
		}))
		.sort((a, b) => (
			b.priority - a.priority ||
			a.tokenCount - b.tokenCount ||
			a.index - b.index
		));

	for (const rankedEntry of rankedEntries) {
		const compact = compactInvokedEntry(rankedEntry.entry, maxEntryLines, maxEntryChars);
		if (!compact || seen.has(compact)) {
			continue;
		}
		if (compacted.length >= maxEntries) {
			break;
		}

		const compactTokenCount = countApproxTokens(compact);
		if (totalChars + compact.length > maxTotalChars || totalTokens + compactTokenCount > maxTotalTokens) {
			const remainingCharBudget = maxTotalChars - totalChars;
			const remainingTokenBudget = maxTotalTokens - totalTokens;
			if (compacted.length === 0 && remainingCharBudget > 0 && remainingTokenBudget > 0) {
				const truncatedByChars = truncateText(compact, remainingCharBudget);
				const truncated = truncateTextByApproxTokens(truncatedByChars, remainingTokenBudget);
				if (truncated) {
					compacted.push(truncated);
				}
			}
			break;
		}

		compacted.push(compact);
		seen.add(compact);
		totalChars += compact.length;
		totalTokens += compactTokenCount;
	}

	return compacted;
}

function compactInvokedEntry(entry: string, maxLines: number, maxChars: number): string {
	const normalized = (entry || '').replace(/\r\n/g, '\n').trim();
	if (!normalized) {
		return '';
	}

	const lines = normalized.split('\n');
	const nonEmptyLineCount = lines.filter((line) => line.trim().length > 0).length;
	// Keep full invoked definition when it is already small enough.
	if (nonEmptyLineCount <= maxLines && normalized.length <= maxChars) {
		return normalized;
	}

	const header = lines[0]?.trim() || '';
	const body = lines.slice(1).map((line) => line.trim()).filter(Boolean);
	const signalRegex = /(^@classmethod\b|^def\s+\w+|super\s*\(|\.suitable\s*\(|^assert\b|^return\b)/;
	const signalLines = body.filter((line) => signalRegex.test(line)).slice(0, 6);
	const fallbackLines = signalLines.length > 0 ? signalLines : body.slice(0, 3);
	const compact = [header, ...fallbackLines].filter(Boolean).join('\n');
	return truncateLines(compact, maxLines, maxChars);
}

export function shouldUseCallsiteConditionedInvokedContext(focalMethodSource: string): boolean {
	const normalizedLines = (focalMethodSource || '')
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map((line) => line.trim().replace(/^[\]\[\)\}\{;]+/, '').trim())
		.filter(Boolean)
		.filter((line) => !line.startsWith('#') && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'));

	if (normalizedLines.length === 0) {
		return false;
	}

	if (normalizedLines.some((line) => /\bsuper\s*\(|\.suitable\s*\(/.test(line))) {
		return true;
	}

	return normalizedLines.some((line) => /^(if|elif|else|else\s+if|match|case|switch|catch|except)\b/.test(line));
}

function getInvokedContextTokenBudget(): number {
	return Math.max(2048, Math.min(8000, Math.floor(getConfigInstance().maxTokens * 0.5)));
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
	invokedFunctionContext: string[];
	mockedObjectDefinitionsSummary?: string;
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
		'```'
		// '',
		// '### Definition tree (from the focal symbol)',
		// params.definitionTreePretty || '(unavailable)',
		// '',
		// '### Symbols that appear redefined in the draft test but exist in the source dependency tree',
		// params.redefinedSymbolsSummary || '(unavailable)',
		// '',
		// '### Invoked function signatures (functions called by the focal symbol)',
		// formatInvokedFunctionContext(params.invokedFunctionContext)
		// '',
		// '### Definitions of objects used in mock-related calls',
		// params.mockedObjectDefinitionsSummary || '(none detected)'
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
	redefinedSymbolsSummary?: string;
	invokedFunctionContext: string[];
	mockedObjectDefinitionsSummary?: string;
}): ChatMessage[] {
	const system = [
		'You are an expert unit test engineer.',
		'You will be given a draft unit test generated for a focal method, plus extra static-analysis context.',
		'Your task is to improve assertion correctness and reduce false-positive assertions.',
		"You should wrap the final test code wrap in a triple-backtick code block.",
		'',
		'Critical rules:',
		'- Use the provided focal method source as the ONLY ground-truth about behavior.',
		'- Do NOT assert specific literal values unless they are directly implied by the focal method source (e.g., constants in code) or by the test inputs you construct.',
		'- If an exact expected value is not provable from the provided evidence, replace brittle assertions with stable invariants (e.g., type/shape, non-null, length, idempotency, monotonicity, exception/no-exception).',
		'- Keep test intent and structure as-is when possible; only adjust what is needed to make assertions correct.',
		'- Prefer assertions that are directly implied by the focal method behavior and inputs/outputs.',
		'- If a mock target resolves to a different symbol/scope than intended, revise the mock style or target path (e.g., patch path vs patch.object target) before finalizing assertions.',
		'- Checkout whether given test code is satisfied the given path coverage requirements, if not, adjust the test code to satisfy the requirements.',
	].join('\n');
 
	const userSections = [
		`Language: ${params.languageId}`,
		`Source file: ${params.sourceFile}`,
		`Focal symbol: ${params.focalSymbolName}`,
		'',
		'### Focal method source',
		'```',
		params.focalMethodSource || '(unavailable)',
		'```',
		'',
		'### Draft test code with test prefix path coverage requirements',
		'```',
		params.draftTestCode,
		'```',
		// '',
		// '### Definition tree (from the focal symbol)',
		// params.definitionTreePretty || '(unavailable)'
	];

	const redefinedSymbolsSummary = params.redefinedSymbolsSummary?.trim() || '';
	if (hasDetectedContent(redefinedSymbolsSummary)) {
		userSections.push(
			'',
			'### Symbols that appear redefined in test case.',
			'Do NOT redefine constants/functions/classes that already exist in the project; instead, import/reuse the source definitions.',
			redefinedSymbolsSummary
		);
	}

	const mockedObjectDefinitionsSummary = params.mockedObjectDefinitionsSummary?.trim() || '';
	if (hasDetectedContent(mockedObjectDefinitionsSummary)) {
		userSections.push(
			'',
			'### Definitions of objects used in mock-related calls',
			'Use this to verify each mocked target resolves to the intended object/type in source code.',
			mockedObjectDefinitionsSummary
		);
	}

	userSections.push(
		'',
		'### Invoked symbol definitions',
		formatInvokedFunctionContext(params.invokedFunctionContext)
	);

	const user = userSections.join('\n');
 
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: user }
	];
}

type ExecutionAttemptResult = {
	passed: boolean;
	exitCode: number;
	timeout: boolean;
	logPath: string;
	startedAt: string;
	endedAt: string;
	trace: string;
	isRunnerError: boolean;
	error?: string;
};

function supportsExecutionFix(languageId: string): boolean {
	return languageId === 'python' || languageId === 'go' || languageId === 'java';
}

function normalizeExecutorLanguage(languageId: string): string {
	if (languageId === 'golang') {
		return 'go';
	}
	return languageId;
}

function truncateExecutionTrace(rawTrace: string, maxChars: number = 14000): string {
	const normalized = (rawTrace || '').replace(/\r\n/g, '\n');
	if (!normalized.trim()) {
		return '(no execution trace available)';
	}
	if (normalized.length <= maxChars) {
		return normalized;
	}
	const half = Math.floor(maxChars / 2);
	const head = normalized.slice(0, half);
	const tail = normalized.slice(-half);
	return `${head}\n\n... [execution trace truncated] ...\n\n${tail}`;
}

function readExecutionTraceFromLog(logPath: string): string {
	if (!logPath) {
		return '(log path unavailable)';
	}
	try {
		if (!fs.existsSync(logPath)) {
			return `Log file not found: ${logPath}`;
		}
		return truncateExecutionTrace(fs.readFileSync(logPath, 'utf8'));
	} catch (error) {
		return `Failed to read execution log at ${logPath}: ${String(error)}`;
	}
}

function formatExecutionSummary(result: ExecutionAttemptResult): string {
	return [
		`Exit code: ${result.exitCode}`,
		`Timeout: ${result.timeout ? 'yes' : 'no'}`,
		`Started: ${result.startedAt}`,
		`Ended: ${result.endedAt}`,
		`Log path: ${result.logPath}`,
		result.error ? `Runner error: ${result.error}` : ''
	].filter(Boolean).join('\n');
}

function buildExecutionTraceFixPrompt(params: {
	languageId: string;
	sourceFile: string;
	focalSymbolName: string;
	focalMethodSource: string;
	currentTestCode: string;
	executionSummary: string;
	executionTrace: string;
	previousAttempts: string[];
}): ChatMessage[] {
	const system = [
		'You are an expert software engineer fixing unit tests from execution traces.',
		'You will receive the failing test file and runtime execution trace.',
		'Fix the test so it executes successfully for the focal method behavior.',
		'Preserve test intent unless the trace proves the assertion/usage is wrong.',
		'Return ONLY the complete fixed test file in one triple-backtick code block.'
	].join('\n');

	const previousAttemptsSection = params.previousAttempts.length > 0
		? [
			'',
			'### Previous failed attempts',
			params.previousAttempts.join('\n\n')
		].join('\n')
		: '';

	const user = [
		`Language: ${params.languageId}`,
		`Source file: ${params.sourceFile}`,
		`Focal symbol: ${params.focalSymbolName}`,
		'',
		'### Focal method source',
		'```',
		params.focalMethodSource || '(unavailable)',
		'```',
		'',
		'### Current test code',
		'```',
		params.currentTestCode,
		'```',
		'',
		'### Latest execution summary',
		'```',
		params.executionSummary,
		'```',
		'',
		'### Latest execution trace',
		'```',
		params.executionTrace,
		'```',
		previousAttemptsSection
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
 
		let invokedFunctionContext: string[] = [];
		try {
			const wfOutDir = path.join(tmpRoot, 'llm-fix-workflow');
			const workflow = new LLMFixWorkflow(path.join(tmpRoot, 'noop.json'), wfOutDir, { language: this.languageId as any });
			const shouldUseCallsiteConditioned = shouldUseCallsiteConditionedInvokedContext(focalMethodSource);
			const invokedContextTokenBudget = getInvokedContextTokenBudget();
			invokedFunctionContext = shouldUseCallsiteConditioned
				? await workflow.getInvokedFunctionContextCallsiteConditioned({
					source_file: sourceFile,
					symbol_name: symbolName,
					draft_test_code: initial
				}, 2)
				: await workflow.getInvokedFunctionContext({
					source_file: sourceFile,
					symbol_name: symbolName
				});
			invokedFunctionContext = compactInvokedFunctionContext(invokedFunctionContext, {
				maxEntries: 128,
				maxEntryLines: shouldUseCallsiteConditioned ? 160 : 120,
				maxEntryChars: shouldUseCallsiteConditioned ? 48000 : 32000,
				maxTotalChars: shouldUseCallsiteConditioned ? 160000 : 120000,
				maxTotalTokens: invokedContextTokenBudget
			});
		} catch (e) {
			console.warn('[LSPRAG_REFLECT] Invoked function signature extraction failed (continuing):', e);
		}

		let mockedObjectDefinitionsSummary = '(none detected)';
		try {
			mockedObjectDefinitionsSummary = await collectMockedObjectDefinitionsSummary({
				languageId: this.languageId,
				draftTestCode: initial,
				testPath
			});
		} catch (e) {
			console.warn('[LSPRAG_REFLECT] Mocked-object context extraction failed (continuing):', e);
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
					invokedFunctionContext,
					mockedObjectDefinitionsSummary
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
					invokedFunctionContext,
					mockedObjectDefinitionsSummary
				});
		}

		const shouldSaveReflectPrompts =
			isSkipLLMModeEnabled() ||
			(process.env.LSPRAG_SAVE_REFLECT_PROMPTS || '').toLowerCase() === 'true' ||
			(process.env.TEST_SAVE_REFLECT_PROMPTS || '').toLowerCase() === 'true';
		if (shouldSaveReflectPrompts) {
			try {
				this.logger.savePromptLog({
					timestamp: new Date().toISOString(),
					sourceFile,
					systemPrompt: promptObj[0]?.content || '',
					userPrompt: promptObj[1]?.content || '',
					paths: [],
					finalPrompt: promptObj
						.map((msg, idx) => `### ${msg.role || `message_${idx}`}\n${msg.content || ''}`)
						.join('\n\n')
				});
			} catch (e) {
				console.warn('[LSPRAG_REFLECT] Failed to save reflect prompt log (continuing):', e);
			}
		}
 
		const reflected = await invokeLLM(promptObj, logObj);
		this.logger.log('reflectAssertions', (Date.now() - reflectionStartTime).toString(), logObj, '');
		return parseCode(reflected);
	}

	private getExecutorConfig(logsDir: string, junitDir: string): { language: string; options: any } | null {
		const language = normalizeExecutorLanguage(this.languageId);
		const timeoutSec = Math.max(1, Math.ceil(getConfigInstance().timeoutMs / 1000));

		if (language === 'python') {
			const projectName = getConfigInstance().getProjectName();
			const pythonPath = getProjectPythonPath(projectName as ProjectConfigName);
			const env = buildEnv(pythonPath);
			const pythonExe = getProjectPythonExe(projectName as ProjectConfigName) || process.execPath;
			return {
				language,
				options: {
					pythonExe,
					logsDir,
					junitDir,
					timeout: timeoutSec,
					env
				}
			};
		}

		if (language === 'go' || language === 'java') {
			return {
				language,
				options: {
					logsDir,
					junitDir,
					timeout: timeoutSec,
					env: { ...process.env }
				}
			};
		}

		return null;
	}

	private async executeTestForFix(testFilePath: string, round: number): Promise<ExecutionAttemptResult> {
		const tmpRunDir = fs.mkdtempSync(path.join(os.tmpdir(), `lsprag-reflect-fix-r${round}-`));
		const logsDir = path.join(tmpRunDir, 'logs');
		const junitDir = path.join(tmpRunDir, 'junit');
		const executorConfig = this.getExecutorConfig(logsDir, junitDir);

		if (!executorConfig) {
			return {
				passed: false,
				exitCode: 1,
				timeout: false,
				logPath: '',
				startedAt: '',
				endedAt: '',
				trace: `Execution-based fixing is not supported for language: ${this.languageId}`,
				isRunnerError: true,
				error: `Unsupported language for executor: ${this.languageId}`
			};
		}

		try {
			const executor = makeExecutor(executorConfig.language, executorConfig.options);
			const results = await executor.executeMany(
				[{ path: testFilePath, language: executorConfig.language }],
				1
			);

			if (!results.length) {
				return {
					passed: false,
					exitCode: 1,
					timeout: false,
					logPath: '',
					startedAt: '',
					endedAt: '',
					trace: 'Executor returned no results.',
					isRunnerError: true,
					error: 'No execution results'
				};
			}

			const result = results[0];
			const trace = readExecutionTraceFromLog(result.logPath);
			return {
				passed: result.exitCode === 0 && !result.timeout,
				exitCode: result.exitCode,
				timeout: result.timeout,
				logPath: result.logPath,
				startedAt: result.startedAt,
				endedAt: result.endedAt,
				trace,
				isRunnerError: false
			};
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			return {
				passed: false,
				exitCode: 1,
				timeout: false,
				logPath: '',
				startedAt: '',
				endedAt: '',
				trace: `Executor failed: ${errMsg}`,
				isRunnerError: true,
				error: errMsg
			};
		}
	}

	override async fixTest(testCode: string): Promise<{ finalCode: string; diagnosticReport: DiagnosticReport | null; }> {
		if (getConfigInstance().fixType === FixType.NOFIX) {
			if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - completed`, 50)) {
				return { finalCode: '', diagnosticReport: null };
			}
			return { finalCode: testCode, diagnosticReport: null };
		}

		// Reuse existing FixType as selector:
		// - EXECUTION_TRACE: execution-trace feedback loop
		// - ORIGINAL/FASTEST: diagnostic-based fix loop
		if (getConfigInstance().fixType !== FixType.EXECUTION_TRACE) {
			return super.fixTest(testCode);
		}

		if (!supportsExecutionFix(this.languageId)) {
			return super.fixTest(testCode);
		}

		const fixStartTime = Date.now();
		const model = getConfigInstance().model;
		const maxRounds = getConfigInstance().maxRound;
		const historyRoot = getConfigInstance().historyPath;

		let focalMethodSource = this.document.getText(this.functionSymbol.range);
		try {
			focalMethodSource = await constructSourceCodeWithRelatedInfo(this.document, this.functionSymbol);
		} catch (error) {
			console.warn('[LSPRAG_REFLECT] Failed to build focal method source for execution-based fix:', error);
		}

		const sourceFile = this.document.uri.fsPath;
		const focalSymbolName = this.functionSymbol.name;
		let currentCode = testCode;
		let round = 0;
		let initialFailureCount = 0;
		const roundHistory: DiagnosticReport['roundHistory'] = [];
		const previousAttemptSummaries: string[] = [];

		let curSavePoint = await saveToIntermediate(
			currentCode,
			this.srcPath,
			this.fileName,
			path.join(historyRoot, model, round.toString()),
			this.languageId
		);

		while (round <= maxRounds) {
			if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - executing test (round ${round})`, 10)) {
				break;
			}

			const execStartTime = Date.now();
			const execResult = await this.executeTestForFix(curSavePoint, round);
			this.logger.log(
				`executeGeneratedTest_${round}`,
				(Date.now() - execStartTime).toString(),
				null,
				execResult.error || ''
			);

			// If runner itself is broken, fallback to the existing diagnostic-based loop.
			if (round === 0 && execResult.isRunnerError) {
				console.warn('[LSPRAG_REFLECT] Execution runner failed at bootstrap, falling back to diagnostic fixing.');
				return super.fixTest(testCode);
			}

			if (round === 0) {
				initialFailureCount = execResult.passed ? 0 : 1;
			}

			const executionSummary = formatExecutionSummary(execResult);
			const traceForPrompt = truncateExecutionTrace(execResult.trace);
			const traceForReport = truncateLines(execResult.trace, 120, 6000);
			roundHistory.push({
				round,
				diagnosticsFixed: execResult.passed ? 1 : 0,
				remainingDiagnostics: execResult.passed ? 0 : 1,
				diagnosticMessages: [executionSummary, traceForReport]
			});

			if (execResult.passed) {
				const diagnosticReport: DiagnosticReport = {
					initialDiagnostics: initialFailureCount,
					finalDiagnostics: 0,
					totalRounds: round,
					fixSuccess: true,
					roundHistory
				};
				this.logger.log('fixDiagnostics', (Date.now() - fixStartTime).toString(), null, '');
				return {
					finalCode: currentCode,
					diagnosticReport
				};
			}

			if (round >= maxRounds) {
				break;
			}

			if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - fixing from execution trace (round ${round + 1})`, 10)) {
				break;
			}

			const promptObj = buildExecutionTraceFixPrompt({
				languageId: this.languageId,
				sourceFile,
				focalSymbolName,
				focalMethodSource,
				currentTestCode: currentCode,
				executionSummary,
				executionTrace: traceForPrompt,
				previousAttempts: previousAttemptSummaries
			});

			const fixLogObj: LLMLogs = { tokenUsage: '', result: '', prompt: '', model };
			const llmStartTime = Date.now();
			let aiResponse: string;
			try {
				aiResponse = await invokeLLM(promptObj, fixLogObj);
				this.logger.log(`FixWithExecutionTrace_${round + 1}`, (Date.now() - llmStartTime).toString(), fixLogObj, '');
			} catch (error) {
				console.error('[LSPRAG_REFLECT] Failed to fix test from execution trace:', error);
				this.logger.log(`FixWithExecutionTraceError_${round + 1}`, (Date.now() - llmStartTime).toString(), fixLogObj, String(error));
				break;
			}

			const fixedCode = parseCode(aiResponse);
			if (!fixedCode || !fixedCode.trim()) {
				console.warn('[LSPRAG_REFLECT] LLM returned empty code during execution-trace fixing.');
				break;
			}

			previousAttemptSummaries.push([
				`Round ${round + 1}:`,
				executionSummary,
				'Trace excerpt:',
				traceForReport
			].join('\n'));

			round += 1;
			currentCode = fixedCode;
			const saveStartTime = Date.now();
			try {
				curSavePoint = await saveToIntermediate(
					currentCode,
					this.srcPath,
					this.fileName,
					path.join(historyRoot, model, round.toString()),
					this.languageId
				);
				this.logger.log('saveGeneratedCodeToFolder', (Date.now() - saveStartTime).toString(), null, '');
			} catch (error) {
				console.error('[LSPRAG_REFLECT] Failed to save fixed code for next execution round:', error);
				break;
			}
		}

		const remaining = roundHistory.length > 0
			? roundHistory[roundHistory.length - 1].remainingDiagnostics
			: initialFailureCount;
		const diagnosticReport: DiagnosticReport = {
			initialDiagnostics: initialFailureCount,
			finalDiagnostics: remaining,
			totalRounds: roundHistory.length > 0 ? roundHistory[roundHistory.length - 1].round : 0,
			fixSuccess: remaining === 0,
			roundHistory
		};

		this.logger.log('fixDiagnostics', (Date.now() - fixStartTime).toString(), null, '');
		return {
			finalCode: currentCode,
			diagnosticReport
		};
	}
}
