import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getAllSymbols, getSymbolByLocation } from '../../lsp/symbol';
import { getDecodedTokensFromLine, getDecodedTokensFromSymbol } from '../../lsp/token';
import { DecodedToken } from '../../lsp/types';
import { VscodeRequestManager } from '../../lsp/vscodeRequestManager';

export type MockTargetKind = 'expression' | 'stringTarget';
type TargetParseMode = 'stringOnly' | 'autoStringOrExpr' | 'exprOnly';

type InternalParsedCallArgument = {
	text: string;
	trimmedText: string;
	trimmedStartOffset: number;
	key?: string;
	valueText?: string;
	valueStartOffset?: number;
};

type InternalParsedCallSite = {
	callee: string;
	calleeStartOffset: number;
	args: InternalParsedCallArgument[];
};

export type MockIdentifierArgument = {
	trimmedText: string;
	trimmedStartOffset: number;
	trimmedLine: number; // 1-based
	trimmedCharacter: number; // 1-based
	key?: string;
	valueText?: string;
	valueStartOffset?: number;
	valueLine?: number; // 1-based
	valueCharacter?: number; // 1-based
};

export type MockIdentifierToken = {
	mockFunction: string;
	rawCallee: string;
	line: number; // 1-based
	character: number; // 1-based
	fromLspDefinitionPath: boolean;
	arguments: MockIdentifierArgument[];
};

export type MockedVariable = {
	mockFunction: string;
	targetKind: MockTargetKind;
	targetText: string;
	targetOffset: number;
	line: number; // 1-based
	character: number; // 1-based
};

export type CanonicalMockedVariable = {
	targetKind: MockTargetKind;
	targetText: string;
	targetOffset: number;
	line: number; // 1-based
	character: number; // 1-based
	mockFunctions: string[];
	occurrences: MockedVariable[];
};

type ResolvedMockDefinition = {
	name: string;
	kind: string | null;
	loc: string;
	snippet: string | null;
	notes: string[];
};

type MockedDefinitionSummaryEntry = {
	mockFunction: string;
	targetKind: MockTargetKind;
	targetText: string;
	testLoc: string;
	definition: ResolvedMockDefinition | null;
};

type PythonAssignment = {
	lhs: string;
	rhsExpr: string;
	rhsHead: string | null;
	rhsHeadCharacter: number | null; // 0-based within assignment line
	line: number; // 1-based
};

type PythonMockBindings = {
	importBindings: Map<string, string>;
	assignmentHistory: Map<string, PythonAssignment[]>;
};

export type CollectMockedDefinitionsParams = {
	languageId: string;
	draftTestCode: string;
	testPath: string;
};

const MOCK_RESOLVE_LOG_PREFIX = '[MOCK_RESOLVE]';
const MOCK_CONSTRUCTOR_APIS = new Set([
	'mock',
	'magicmock',
	'asyncmock',
	'noncallablemock',
	'noncallablemagicmock'
]);
const LOOKUP_KEYWORD_BLOCK = new Set(['True', 'False', 'None', 'null', 'undefined']);

const PY_TRAILING_COMMENT_RE = /\s+#.*$/;
const PY_FROM_IMPORT_RE = /^from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+(.+)$/;
const PY_IMPORT_RE = /^import\s+(.+)$/;
const PY_FROM_IMPORT_ALIAS_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/;
const PY_IMPORT_ALIAS_RE = /^([A-Za-z_][A-Za-z0-9_.]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/;
const PY_SIMPLE_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PY_ASSIGNMENT_RE = /^\s*(?:self\.)?([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=]+)?=\s*(.+)$/;
const PY_RHS_HEAD_RE = /^([A-Za-z_][A-Za-z0-9_.]*)/;

function logMockResolve(message: string, payload?: unknown): void {
	if (payload === undefined) {
		console.log(`${MOCK_RESOLVE_LOG_PREFIX} ${message}`);
		return;
	}
	try {
		console.log(`${MOCK_RESOLVE_LOG_PREFIX} ${message}`, JSON.stringify(payload));
	} catch {
		console.log(`${MOCK_RESOLVE_LOG_PREFIX} ${message}`, payload);
	}
}

function isNameChar(ch: string): boolean {
	return /[A-Za-z0-9_.]/.test(ch);
}

function buildLineStartOffsets(text: string): number[] {
	const starts: number[] = [0];
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === '\n') {
			starts.push(i + 1);
		}
	}
	return starts;
}

function offsetToPosition(lineStarts: number[], offset: number): vscode.Position {
	const safeOffset = Math.max(0, offset);
	let lo = 0;
	let hi = lineStarts.length - 1;
	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2);
		const midVal = lineStarts[mid];
		if (midVal === safeOffset) {
			return new vscode.Position(mid, 0);
		}
		if (midVal < safeOffset) {
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	const line = Math.max(0, hi);
	const character = safeOffset - lineStarts[line];
	return new vscode.Position(line, Math.max(0, character));
}

function readCalleeAtOpenParen(code: string, openParenIdx: number): { callee: string; start: number } | null {
	let i = openParenIdx - 1;
	while (i >= 0 && /\s/.test(code[i])) {
		i -= 1;
	}
	if (i < 0) {
		return null;
	}
	const end = i + 1;
	while (i >= 0 && isNameChar(code[i])) {
		i -= 1;
	}
	const start = i + 1;
	if (start >= end) {
		return null;
	}
	const callee = code.slice(start, end).trim();
	if (!callee || !/[A-Za-z_]/.test(callee[0])) {
		return null;
	}
	return { callee, start };
}

function findTopLevelAssignmentIdx(text: string): number {
	let square = 0;
	let curly = 0;
	let paren = 0;
	let quote: "'" | '"' | null = null;
	let tripleQuote = false;
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		if (quote) {
			if (ch === '\\') {
				i += 1;
				continue;
			}
			if (tripleQuote) {
				if (text.slice(i, i + 3) === quote.repeat(3)) {
					quote = null;
					tripleQuote = false;
					i += 2;
				}
				continue;
			}
			if (ch === quote) {
				quote = null;
			}
			continue;
		}
		if (ch === '#') {
			break;
		}
		if (ch === '\'' || ch === '"') {
			quote = ch;
			if (text.slice(i, i + 3) === ch.repeat(3)) {
				tripleQuote = true;
				i += 2;
			}
			continue;
		}
		if (ch === '(') {
			paren += 1;
			continue;
		}
		if (ch === ')') {
			paren = Math.max(0, paren - 1);
			continue;
		}
		if (ch === '[') {
			square += 1;
			continue;
		}
		if (ch === ']') {
			square = Math.max(0, square - 1);
			continue;
		}
		if (ch === '{') {
			curly += 1;
			continue;
		}
		if (ch === '}') {
			curly = Math.max(0, curly - 1);
			continue;
		}
		if (ch !== '=' || paren !== 0 || square !== 0 || curly !== 0) {
			continue;
		}
		const prev = i > 0 ? text[i - 1] : '';
		const next = i + 1 < text.length ? text[i + 1] : '';
		if (prev === '=' || next === '=' || prev === '!' || prev === '<' || prev === '>' || prev === ':') {
			continue;
		}
		return i;
	}
	return -1;
}

function parsePythonKeywordArg(arg: InternalParsedCallArgument): InternalParsedCallArgument {
	const eq = findTopLevelAssignmentIdx(arg.trimmedText);
	if (eq < 0) {
		return arg;
	}
	const key = arg.trimmedText.slice(0, eq).trim();
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
		return arg;
	}
	const valueRaw = arg.trimmedText.slice(eq + 1);
	const leadingWs = valueRaw.match(/^\s*/)?.[0].length ?? 0;
	return {
		...arg,
		key,
		valueText: valueRaw.trim(),
		valueStartOffset: arg.trimmedStartOffset + eq + 1 + leadingWs
	};
}

function parsePythonCallArguments(code: string, openParenIdx: number): { args: InternalParsedCallArgument[]; closeParenIdx: number } | null {
	let paren = 1;
	let square = 0;
	let curly = 0;
	let quote: "'" | '"' | null = null;
	let tripleQuote = false;
	let argStart = openParenIdx + 1;
	const rawArgs: Array<{ start: number; end: number }> = [];

	for (let i = openParenIdx + 1; i < code.length; i += 1) {
		const ch = code[i];
		if (quote) {
			if (ch === '\\') {
				i += 1;
				continue;
			}
			if (tripleQuote) {
				if (code.slice(i, i + 3) === quote.repeat(3)) {
					quote = null;
					tripleQuote = false;
					i += 2;
				}
				continue;
			}
			if (ch === quote) {
				quote = null;
			}
			continue;
		}
		if (ch === '#') {
			while (i + 1 < code.length && code[i + 1] !== '\n') {
				i += 1;
			}
			continue;
		}
		if (ch === '\'' || ch === '"') {
			quote = ch;
			if (code.slice(i, i + 3) === ch.repeat(3)) {
				tripleQuote = true;
				i += 2;
			}
			continue;
		}
		if (ch === '(') {
			paren += 1;
			continue;
		}
		if (ch === ')') {
			paren -= 1;
			if (paren === 0) {
				rawArgs.push({ start: argStart, end: i });
				const args = rawArgs
					.map(raw => {
						const text = code.slice(raw.start, raw.end);
						const leadingWs = text.match(/^\s*/)?.[0].length ?? 0;
						return {
							text,
							trimmedText: text.trim(),
							trimmedStartOffset: raw.start + leadingWs
						};
					})
					.filter(a => a.trimmedText.length > 0)
					.map(a => parsePythonKeywordArg(a));
				return { args, closeParenIdx: i };
			}
			continue;
		}
		if (ch === '[') {
			square += 1;
			continue;
		}
		if (ch === ']') {
			square = Math.max(0, square - 1);
			continue;
		}
		if (ch === '{') {
			curly += 1;
			continue;
		}
		if (ch === '}') {
			curly = Math.max(0, curly - 1);
			continue;
		}
		if (ch === ',' && paren === 1 && square === 0 && curly === 0) {
			rawArgs.push({ start: argStart, end: i });
			argStart = i + 1;
		}
	}
	return null;
}

function parsePythonCallSites(code: string): InternalParsedCallSite[] {
	const out: InternalParsedCallSite[] = [];
	for (let i = 0; i < code.length; i += 1) {
		if (code[i] !== '(') {
			continue;
		}
		const callee = readCalleeAtOpenParen(code, i);
		if (!callee) {
			continue;
		}
		const args = parsePythonCallArguments(code, i);
		if (!args) {
			continue;
		}
		out.push({
			callee: callee.callee,
			calleeStartOffset: callee.start,
			args: args.args
		});
		i = args.closeParenIdx;
	}
	return out;
}

function shouldTrackMockCall(callee: string): boolean {
	const lower = callee.toLowerCase();
	if (lower === 'patch' || lower.endsWith('.patch')) {
		return true;
	}
	if (lower.includes('patch.object') || lower.includes('patch.multiple') || lower.includes('patch.dict')) {
		return true;
	}
	if (lower.includes('monkeypatch.setattr') || lower.includes('monkeypatch.delattr') || lower.includes('monkeypatch.setitem')) {
		return true;
	}
	const leaf = lower.split('.').pop() || '';
	return leaf === 'create_autospec' || MOCK_CONSTRUCTOR_APIS.has(leaf);
}

function isMockRelatedDefinitionPath(fsPath: string): boolean {
	const p = fsPath.replace(/\\/g, '/').toLowerCase();
	if (!p) {
		return false;
	}
	if (p.includes('/unittest/mock.py') || p.includes('/unittest/mock.pyi')) {
		return true;
	}
	if (p.includes('/site-packages/mock') || p.includes('/dist-packages/mock')) {
		return true;
	}
	if (p.includes('/pytest_mock/') || p.includes('/pytest-mock/')) {
		return true;
	}
	const base = path.basename(p);
	return base === 'mock.py' || base === 'mock.pyi';
}

function canonicalMockApiName(name: string): string | null {
	const lower = name.toLowerCase();
	if (lower === 'patch' || lower === '_patch') {
		return 'patch';
	}
	if (lower === 'create_autospec') {
		return 'create_autospec';
	}
	if (MOCK_CONSTRUCTOR_APIS.has(lower)) {
		return lower;
	}
	return null;
}

function inferMockCalleeFromSuffix(callCallee: string): string | null {
	const lower = callCallee.toLowerCase();
	if (lower.endsWith('.object')) {
		return 'patch.object';
	}
	if (lower.endsWith('.multiple')) {
		return 'patch.multiple';
	}
	if (lower.endsWith('.dict')) {
		return 'patch.dict';
	}
	if (lower.endsWith('.setattr')) {
		return 'monkeypatch.setattr';
	}
	if (lower.endsWith('.delattr')) {
		return 'monkeypatch.delattr';
	}
	if (lower.endsWith('.setitem')) {
		return 'monkeypatch.setitem';
	}
	return null;
}

function mapResolvedApiToEffectiveCallee(callCallee: string, baseApi: string | null): string | null {
	if (!baseApi) {
		return null;
	}
	const lower = callCallee.toLowerCase();
	if (baseApi === 'patch') {
		if (lower.endsWith('.object')) {
			return 'patch.object';
		}
		if (lower.endsWith('.multiple')) {
			return 'patch.multiple';
		}
		if (lower.endsWith('.dict')) {
			return 'patch.dict';
		}
		return 'patch';
	}
	if (baseApi === 'create_autospec') {
		return lower === 'create_autospec' || lower.endsWith('.create_autospec') ? 'create_autospec' : null;
	}
	if (MOCK_CONSTRUCTOR_APIS.has(baseApi)) {
		return lower === baseApi || lower.endsWith(`.${baseApi}`) ? baseApi : null;
	}
	return baseApi;
}

function getCalleeTokens(call: InternalParsedCallSite): Array<{ token: string; absoluteOffset: number }> {
	const out: Array<{ token: string; absoluteOffset: number }> = [];
	const tokenRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
	let m: RegExpExecArray | null;
	while ((m = tokenRegex.exec(call.callee)) !== null) {
		out.push({ token: m[0], absoluteOffset: call.calleeStartOffset + m.index });
	}
	return out;
}

async function resolveMockApiByLsp(
	testDoc: vscode.TextDocument,
	sourceCode: string,
	call: InternalParsedCallSite,
	cache: Map<string, vscode.Location[]>
): Promise<{ baseApi: string | null; fromMockFile: boolean }> {
	const lineStarts = buildLineStartOffsets(sourceCode);
	const calleeTokens = getCalleeTokens(call).reverse();
	let fromMockFile = false;
	for (const token of calleeTokens) {
		const pos = offsetToPosition(lineStarts, token.absoluteOffset);
		const key = `${pos.line}:${pos.character}`;
		let defs = cache.get(key);
		if (!defs) {
			defs = await VscodeRequestManager.definitions(testDoc.uri, pos);
			cache.set(key, defs);
		}
		for (const def of defs) {
			if (!isMockRelatedDefinitionPath(def.uri.fsPath)) {
				continue;
			}
			fromMockFile = true;
			let resolvedName = token.token;
			try {
				const defDoc = await vscode.workspace.openTextDocument(def.uri);
				const defSymbol = await getSymbolByLocation(defDoc, def.range.start);
				if (defSymbol?.name) {
					resolvedName = defSymbol.name;
				}
			} catch {
				// best effort fallback
			}
			const canonical = canonicalMockApiName(resolvedName);
			if (canonical) {
				return { baseApi: canonical, fromMockFile: true };
			}
		}
	}
	return { baseApi: null, fromMockFile };
}

function unquotePythonStringLiteral(raw: string): string | null {
	const trimmed = raw.trim();
	const match = trimmed.match(/^(?:[rRuUbBfF]{0,2})?(['"])([\s\S]*)\1$/);
	if (!match) {
		return null;
	}
	if (trimmed.length >= 6) {
		const quote = match[1];
		if (trimmed.includes(quote.repeat(3))) {
			return null;
		}
	}
	return match[2].replace(/\\(['"\\])/g, '$1');
}

function resolveMockTargetValue(
	text: string,
	offset: number,
	parseMode: TargetParseMode
): { targetKind: MockTargetKind; targetText: string; targetOffset: number } | null {
	const trimmed = text.trim();
	if (!trimmed || trimmed.startsWith('*')) {
		return null;
	}
	const str = unquotePythonStringLiteral(trimmed);
	if (parseMode === 'stringOnly') {
		if (str !== null) {
			return { targetKind: 'stringTarget', targetText: str, targetOffset: offset };
		}
		return { targetKind: 'expression', targetText: trimmed, targetOffset: offset };
	}
	if (parseMode === 'autoStringOrExpr' && str !== null) {
		return { targetKind: 'stringTarget', targetText: str, targetOffset: offset };
	}
	return { targetKind: 'expression', targetText: trimmed, targetOffset: offset };
}

function selectTargetsFromMockCall(
	callee: string,
	args: MockIdentifierArgument[]
): Array<{ mode: TargetParseMode; text: string; offset: number; line: number; character: number }> {
	const lower = callee.toLowerCase();
	const targets: Array<{ mode: TargetParseMode; text: string; offset: number; line: number; character: number }> = [];
	const pushFromArg = (arg: MockIdentifierArgument | undefined, mode: TargetParseMode) => {
		if (!arg) {
			return;
		}
		if (arg.key && arg.valueText !== undefined && arg.valueStartOffset !== undefined && arg.valueLine !== undefined && arg.valueCharacter !== undefined) {
			targets.push({
				mode,
				text: arg.valueText,
				offset: arg.valueStartOffset,
				line: arg.valueLine,
				character: arg.valueCharacter
			});
			return;
		}
		targets.push({
			mode,
			text: arg.trimmedText,
			offset: arg.trimmedStartOffset,
			line: arg.trimmedLine,
			character: arg.trimmedCharacter
		});
	};

	const firstPositional = args.find(a => !a.key);
	if (lower === 'patch' || lower.endsWith('.patch')) {
		pushFromArg(firstPositional, 'stringOnly');
		pushFromArg(args.find(a => a.key === 'target'), 'stringOnly');
		return targets;
	}
	if (lower.includes('patch.object')) {
		pushFromArg(firstPositional, 'exprOnly');
		pushFromArg(args.find(a => a.key === 'target'), 'exprOnly');
		return targets;
	}
	if (lower.includes('patch.multiple') || lower.includes('patch.dict')) {
		pushFromArg(firstPositional, 'autoStringOrExpr');
		pushFromArg(args.find(a => a.key === 'target'), 'autoStringOrExpr');
		return targets;
	}
	if (lower.includes('monkeypatch.setattr') || lower.includes('monkeypatch.delattr')) {
		pushFromArg(firstPositional, 'autoStringOrExpr');
		return targets;
	}
	if (lower.includes('monkeypatch.setitem')) {
		pushFromArg(firstPositional, 'exprOnly');
		return targets;
	}
	const leaf = lower.split('.').pop() || '';
	if (leaf === 'create_autospec') {
		pushFromArg(firstPositional, 'exprOnly');
		pushFromArg(args.find(a => a.key === 'spec'), 'exprOnly');
		return targets;
	}
	if (MOCK_CONSTRUCTOR_APIS.has(leaf)) {
		pushFromArg(firstPositional, 'exprOnly');
		for (const key of ['spec', 'spec_set', 'wraps', 'autospec']) {
			pushFromArg(args.find(a => a.key === key), 'exprOnly');
		}
		return targets;
	}
	return targets;
}

export async function mockIdentifier(params: {
	sourceCode: string;
	documentPath: string;
	languageId: string;
}): Promise<MockIdentifierToken[]> {
	if (!params.sourceCode || params.languageId.toLowerCase() !== 'python') {
		return [];
	}
	const lineStarts = buildLineStartOffsets(params.sourceCode);
	const callSites = parsePythonCallSites(params.sourceCode);
	let doc: vscode.TextDocument | null = null;
	try {
		doc = await vscode.workspace.openTextDocument(vscode.Uri.file(params.documentPath));
	} catch {
		doc = null;
	}

	const out: MockIdentifierToken[] = [];
	const seen = new Set<string>();
	const defCache = new Map<string, vscode.Location[]>();

	for (const call of callSites) {
		let effectiveCallee: string | null = null;
		let fromLspDefinitionPath = false;

		if (shouldTrackMockCall(call.callee)) {
			effectiveCallee = call.callee;
		} else if (doc) {
			const lsp = await resolveMockApiByLsp(doc, params.sourceCode, call, defCache);
			if (!lsp.fromMockFile) {
				continue;
			}
			const inferredCallee = mapResolvedApiToEffectiveCallee(call.callee, lsp.baseApi)
				|| inferMockCalleeFromSuffix(call.callee);
			if (!inferredCallee) {
				continue;
			}
			effectiveCallee = inferredCallee;
			fromLspDefinitionPath = true;
		} else {
			continue;
		}

		const calleePos = offsetToPosition(lineStarts, call.calleeStartOffset);
		const args: MockIdentifierArgument[] = call.args.map(arg => {
			const trimmedPos = offsetToPosition(lineStarts, arg.trimmedStartOffset);
			const valuePos = arg.valueStartOffset !== undefined ? offsetToPosition(lineStarts, arg.valueStartOffset) : undefined;
			return {
				trimmedText: arg.trimmedText,
				trimmedStartOffset: arg.trimmedStartOffset,
				trimmedLine: trimmedPos.line + 1,
				trimmedCharacter: trimmedPos.character + 1,
				key: arg.key,
				valueText: arg.valueText,
				valueStartOffset: arg.valueStartOffset,
				valueLine: valuePos ? valuePos.line + 1 : undefined,
				valueCharacter: valuePos ? valuePos.character + 1 : undefined
			};
		});

		const key = `${effectiveCallee}|${calleePos.line}|${calleePos.character}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push({
			mockFunction: effectiveCallee,
			rawCallee: call.callee,
			line: calleePos.line + 1,
			character: calleePos.character + 1,
			fromLspDefinitionPath,
			arguments: args
		});
	}

	return out.sort((a, b) => (a.line - b.line) || (a.character - b.character));
}

export function mockArgumentIdentifier(tokens: MockIdentifierToken[]): MockedVariable[] {
	const out: MockedVariable[] = [];
	const seen = new Set<string>();
	for (const token of tokens) {
		const rawTargets = selectTargetsFromMockCall(token.mockFunction, token.arguments);
		for (const raw of rawTargets) {
			const normalized = resolveMockTargetValue(raw.text, raw.offset, raw.mode);
			if (!normalized) {
				continue;
			}
			const trimmedTarget = normalized.targetText.trim();
			if (!trimmedTarget) {
				continue;
			}
			const key = `${token.mockFunction}|${normalized.targetKind}|${trimmedTarget}|${raw.line}|${raw.character}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			out.push({
				mockFunction: token.mockFunction,
				targetKind: normalized.targetKind,
				targetText: trimmedTarget,
				targetOffset: normalized.targetOffset,
				line: raw.line,
				character: raw.character
			});
		}
	}
	return out.sort((a, b) => (a.line - b.line) || (a.character - b.character));
}

/**
 * Lexical-only mock-target extractor.
 * This intentionally avoids LSP/IO so it can be used in lightweight prompt tests.
 */
export function extractMockTargetsFromTestCode(code: string, languageId: string): MockedVariable[] {
	if (!code || languageId.toLowerCase() !== 'python') {
		return [];
	}
	const lineStarts = buildLineStartOffsets(code);
	const out: MockedVariable[] = [];
	const seen = new Set<string>();

	for (const call of parsePythonCallSites(code)) {
		if (!shouldTrackMockCall(call.callee)) {
			continue;
		}
		const args: MockIdentifierArgument[] = call.args.map(arg => {
			const trimmedPos = offsetToPosition(lineStarts, arg.trimmedStartOffset);
			const valuePos = arg.valueStartOffset !== undefined ? offsetToPosition(lineStarts, arg.valueStartOffset) : undefined;
			return {
				trimmedText: arg.trimmedText,
				trimmedStartOffset: arg.trimmedStartOffset,
				trimmedLine: trimmedPos.line + 1,
				trimmedCharacter: trimmedPos.character + 1,
				key: arg.key,
				valueText: arg.valueText,
				valueStartOffset: arg.valueStartOffset,
				valueLine: valuePos ? valuePos.line + 1 : undefined,
				valueCharacter: valuePos ? valuePos.character + 1 : undefined
			};
		});

		const rawTargets = selectTargetsFromMockCall(call.callee, args);
		for (const raw of rawTargets) {
			const normalized = resolveMockTargetValue(raw.text, raw.offset, raw.mode);
			if (!normalized) {
				continue;
			}
			const targetText = normalized.targetText.trim();
			if (!targetText) {
				continue;
			}
			const key = `${call.callee}|${normalized.targetKind}|${targetText}|${raw.line}|${raw.character}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			out.push({
				mockFunction: call.callee,
				targetKind: normalized.targetKind,
				targetText,
				targetOffset: normalized.targetOffset,
				line: raw.line,
				character: raw.character
			});
		}
	}

	return out.sort((a, b) => (a.line - b.line) || (a.character - b.character));
}

/**
 * Canonicalize mocked variables for downstream definition lookup.
 * Multiple mock calls frequently point to the same underlying symbol.
 */
export function canonicalizeMockedVariablesForLookup(targets: MockedVariable[]): CanonicalMockedVariable[] {
	const grouped = new Map<string, CanonicalMockedVariable>();

	for (const target of targets) {
		const key = `${target.targetKind}|${target.targetText.trim()}`;
		const existing = grouped.get(key);
		if (!existing) {
			grouped.set(key, {
				targetKind: target.targetKind,
				targetText: target.targetText.trim(),
				targetOffset: target.targetOffset,
				line: target.line,
				character: target.character,
				mockFunctions: [target.mockFunction],
				occurrences: [target]
			});
			continue;
		}

		existing.occurrences.push(target);
		if (!existing.mockFunctions.includes(target.mockFunction)) {
			existing.mockFunctions.push(target.mockFunction);
		}
		if (target.line < existing.line || (target.line === existing.line && target.character < existing.character)) {
			existing.targetOffset = target.targetOffset;
			existing.line = target.line;
			existing.character = target.character;
		}
	}

	return Array.from(grouped.values()).sort((a, b) => (a.line - b.line) || (a.character - b.character));
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
	return truncateText(lines.slice(0, Math.max(0, maxLines)).join('\n'), maxChars);
}

function symbolKindToString(kind: vscode.SymbolKind): string | null {
	const label = (vscode.SymbolKind as unknown as Record<number, string>)[kind];
	return label ?? null;
}

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toWorkspaceRelativePath(filePath: string): string {
	const folders = vscode.workspace.workspaceFolders || [];
	const roots = folders.map(f => f.uri.fsPath).sort((a, b) => b.length - a.length);
	for (const root of roots) {
		if (filePath === root || filePath.startsWith(root + path.sep)) {
			return path.relative(root, filePath);
		}
	}
	return filePath;
}

function extractLookupToken(expr: string): { token: string; relativeOffset: number } | null {
	const idRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
	let last: { token: string; relativeOffset: number } | null = null;
	let m: RegExpExecArray | null;
	while ((m = idRegex.exec(expr)) !== null) {
		last = { token: m[0], relativeOffset: m.index };
	}
	if (!last) {
		return null;
	}
	return LOOKUP_KEYWORD_BLOCK.has(last.token) ? null : last;
}

function extractRootLookupToken(expr: string): { token: string; relativeOffset: number } | null {
	const idRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
	const first = idRegex.exec(expr);
	if (!first) {
		return null;
	}
	if (LOOKUP_KEYWORD_BLOCK.has(first[0])) {
		return null;
	}
	return { token: first[0], relativeOffset: first.index };
}

// Parse `from pkg.mod import Name as Alias, Other` into alias -> fully-qualified path entries.
function parsePythonFromImportBindings(trimmedLine: string): Array<[string, string]> | null {
	const fromImportMatch = trimmedLine.match(PY_FROM_IMPORT_RE);
	if (!fromImportMatch) {
		return null;
	}
	const moduleName = fromImportMatch[1];
	const names = fromImportMatch[2].replace(/[()]/g, '').split(',');
	const bindings: Array<[string, string]> = [];

	for (const part of names) {
		const item = part.trim();
		if (!item || item === '*') {
			continue;
		}
		const asMatch = item.match(PY_FROM_IMPORT_ALIAS_RE);
		if (asMatch) {
			bindings.push([asMatch[2], `${moduleName}.${asMatch[1]}`]);
			continue;
		}
		const base = item.match(PY_SIMPLE_IDENTIFIER_RE);
		if (base) {
			bindings.push([base[0], `${moduleName}.${base[0]}`]);
		}
	}

	return bindings;
}

// Parse `import pkg.mod as alias, other.mod` into alias/root -> fully-qualified path entries.
function parsePythonImportBindings(trimmedLine: string): Array<[string, string]> | null {
	const importMatch = trimmedLine.match(PY_IMPORT_RE);
	if (!importMatch) {
		return null;
	}
	const modules = importMatch[1].split(',');
	const bindings: Array<[string, string]> = [];

	for (const part of modules) {
		const item = part.trim();
		if (!item) {
			continue;
		}
		const asMatch = item.match(PY_IMPORT_ALIAS_RE);
		if (asMatch) {
			bindings.push([asMatch[2], asMatch[1]]);
			continue;
		}
		const root = item.split('.')[0];
		if (root) {
			bindings.push([root, item]);
		}
	}

	return bindings;
}

// Parse simple single-line assignments used for local data-flow (`x = Foo()` / `self.x = Foo()`).
function parsePythonAssignment(rawLineNoComment: string, lineNumber: number): PythonAssignment | null {
	const assignMatch = rawLineNoComment.match(PY_ASSIGNMENT_RE);
	if (!assignMatch) {
		return null;
	}
	const lhs = assignMatch[1];
	const rhsExpr = assignMatch[2].trim();
	const rhsHeadMatch = rhsExpr.match(PY_RHS_HEAD_RE);
	const rhsHead = rhsHeadMatch ? rhsHeadMatch[1] : null;
	const rhsExprStart = rawLineNoComment.indexOf(rhsExpr);
	const rhsHeadCharacter = rhsHead && rhsExprStart >= 0 ? rhsExprStart + (rhsHeadMatch?.index ?? 0) : null;

	return {
		lhs,
		rhsExpr,
		rhsHead,
		rhsHeadCharacter,
		line: lineNumber
	};
}

function appendImportBindings(target: Map<string, string>, bindings: Array<[string, string]>): void {
	for (const [alias, importPath] of bindings) {
		target.set(alias, importPath);
	}
}

function appendAssignmentHistory(history: Map<string, PythonAssignment[]>, assignment: PythonAssignment): void {
	const existing = history.get(assignment.lhs) || [];
	existing.push(assignment);
	history.set(assignment.lhs, existing);
}

function collectPythonMockBindings(code: string): PythonMockBindings {
	const importBindings = new Map<string, string>();
	const assignmentHistory = new Map<string, PythonAssignment[]>();
	const lines = code.replace(/\r\n/g, '\n').split('\n');

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
		const rawLine = lines[lineIdx];
		const lineNoComment = rawLine.replace(PY_TRAILING_COMMENT_RE, '');
		const trimmedLine = lineNoComment.trim();
		if (!trimmedLine) {
			continue;
		}

		const fromImportBindings = parsePythonFromImportBindings(trimmedLine);
		if (fromImportBindings) {
			appendImportBindings(importBindings, fromImportBindings);
			continue;
		}

		const importLineBindings = parsePythonImportBindings(trimmedLine);
		if (importLineBindings) {
			appendImportBindings(importBindings, importLineBindings);
			continue;
		}

		const assignment = parsePythonAssignment(lineNoComment, lineIdx + 1);
		if (!assignment) {
			continue;
		}
		appendAssignmentHistory(assignmentHistory, assignment);
	}

	return { importBindings, assignmentHistory };
}

function expandWithImportBindings(expr: string, bindings: Map<string, string>): string {
	if (!expr) {
		return expr;
	}
	const parts = expr.split('.');
	const first = parts[0];
	const binding = bindings.get(first);
	if (!binding) {
		return expr;
	}
	const rest = parts.slice(1).join('.');
	return rest ? `${binding}.${rest}` : binding;
}

function isSimpleIdentifierToken(token: string): boolean {
	return PY_SIMPLE_IDENTIFIER_RE.test(token);
}

function findNearestAssignment(bindings: PythonMockBindings, token: string, beforeLine: number): PythonAssignment | null {
	const history = bindings.assignmentHistory.get(token);
	if (!history || !history.length) {
		return null;
	}
	for (let i = history.length - 1; i >= 0; i -= 1) {
		if (history[i].line <= beforeLine) {
			return history[i];
		}
	}
	return null;
}

function formatDataFlowNote(trace: string[], step: string): string {
	const chain = [...trace, step];
	if (chain.length === 1) {
		return `resolved from data-flow assignment \`${chain[0]}\``;
	}
	return `resolved via data-flow chain ${chain.map(s => `\`${s}\``).join(' -> ')}`;
}

function formatImportFlowNote(trace: string[], token: string, importedPath: string): string {
	if (!trace.length) {
		return `resolved from import binding \`${token} -> ${importedPath}\``;
	}
	return `resolved via data-flow chain ${trace.map(s => `\`${s}\``).join(' -> ')} with import binding \`${token} -> ${importedPath}\``;
}

function withExtraNote(defs: ResolvedMockDefinition[], note: string): ResolvedMockDefinition[] {
	return defs.map(def => ({ ...def, notes: Array.from(new Set([...(def.notes || []), note])) }));
}

function dedupeResolvedDefinitions(defs: ResolvedMockDefinition[]): ResolvedMockDefinition[] {
	const out = new Map<string, ResolvedMockDefinition>();
	for (const def of defs) {
		const key = `${def.loc}|${def.name}`;
		if (!out.has(key)) {
			out.set(key, def);
			continue;
		}
		const prev = out.get(key)!;
		prev.notes = Array.from(new Set([...(prev.notes || []), ...(def.notes || [])]));
		if ((!prev.snippet || prev.snippet.trim().length === 0) && def.snippet) {
			prev.snippet = def.snippet;
		} else if (prev.snippet && def.snippet && def.snippet.length > prev.snippet.length) {
			prev.snippet = def.snippet;
		}
		if (!prev.kind && def.kind) {
			prev.kind = def.kind;
		}
	}
	return Array.from(out.values());
}

function hasFlowOrPathNote(def: ResolvedMockDefinition): boolean {
	return (def.notes || []).some(note =>
		note.includes('data-flow')
		|| note.includes('python import path')
		|| note.includes('import binding')
		|| note.includes('expression path')
	);
}

function definitionPathFromLoc(loc: string): string {
	const at = loc.indexOf('@');
	return at >= 0 ? loc.slice(0, at) : loc;
}

function preferUnderlyingMockObjectDefinitions(
	defs: ResolvedMockDefinition[],
	lookupTokens: Set<string>,
	testDocRelativePath: string
): ResolvedMockDefinition[] {
	if (defs.length <= 1) {
		return defs;
	}
	const preferred = defs.filter(def => {
		if (hasFlowOrPathNote(def)) {
			return true;
		}
		if (!lookupTokens.has(def.name)) {
			return true;
		}
		return definitionPathFromLoc(def.loc) !== testDocRelativePath;
	});
	return preferred.length > 0 ? preferred : defs;
}

async function describeDefinitionLocation(
	definition: vscode.Location,
	fallbackName: string,
	notes: string[] = []
): Promise<ResolvedMockDefinition | null> {
	try {
		const doc = await vscode.workspace.openTextDocument(definition.uri);
		const symbol = await getSymbolByLocation(doc, definition.range.start);
		let name = fallbackName;
		let kind: string | null = null;
		let snippet = '';
		let locStart = definition.range.start;
		const isModuleRootDefinition =
			definition.range.start.line === 0
			&& definition.range.start.character === 0
			&& (
				!symbol
				|| (symbol.selectionRange.start.line === 0 && symbol.selectionRange.start.character === 0)
			);

		if (isModuleRootDefinition) {
			if (symbol?.name) {
				name = symbol.name;
			}
			kind = symbol ? symbolKindToString(symbol.kind) : null;
			locStart = new vscode.Position(0, 0);
			const fullText = doc.getText();
			if (fullText.trim().length > 0) {
				snippet = truncateLines(fullText, 60, 2200);
			}
		} else if (symbol) {
			name = symbol.name;
			kind = symbolKindToString(symbol.kind);
			snippet = doc.getText(symbol.range);
			locStart = symbol.selectionRange.start;
		} else {
			snippet = doc.lineAt(definition.range.start.line).text.trim();
			const isModuleFile =
				definition.range.start.line === 0
				&& definition.range.start.character === 0
				&& doc.lineCount > 1;
			if (isModuleFile) {
				const fullText = doc.getText();
				if (fullText.trim().length > 0) {
					snippet = truncateLines(fullText, 60, 2200);
				}
			}
		}

		const mergedNotes = [...notes];
		if (snippet && /def\s+__setattr__\s*\(/.test(snippet)) {
			mergedNotes.push('definition contains __setattr__; patch.object(instance, ...) can fail to patch attributes safely');
		}

		return {
			name,
			kind,
			loc: `${toWorkspaceRelativePath(definition.uri.fsPath)}@${locStart.line + 1}:${locStart.character}`,
			snippet: snippet ? truncateLines(snippet, 28, 2200) : null,
			notes: Array.from(new Set(mergedNotes))
		};
	} catch {
		return null;
	}
}

async function describeModuleDefinitionLocation(
	uri: vscode.Uri,
	moduleName: string,
	notes: string[] = []
): Promise<ResolvedMockDefinition | null> {
	try {
		const doc = await vscode.workspace.openTextDocument(uri);
		const fullText = doc.getText();
		const snippet = fullText.trim().length > 0 ? truncateLines(fullText, 60, 2200) : null;
		return {
			name: moduleName,
			kind: null,
			loc: `${toWorkspaceRelativePath(uri.fsPath)}@1:0`,
			snippet,
			notes: Array.from(new Set(notes))
		};
	} catch {
		return null;
	}
}

function extractAssignmentRhsLookup(
	lineText: string,
	lhsName: string
): { token: string; character: number; rhsExpr: string } | null {
	const lhsEscaped = escapeRegExp(lhsName);
	const pattern = new RegExp(`^\\s*(?:self\\.)?${lhsEscaped}(?:\\s*:\\s*[^=]+)?\\s*=\\s*(.+)$`);
	const match = lineText.match(pattern);
	if (!match) {
		return null;
	}
	const rhsExpr = (match[1] || '').replace(/\s+#.*$/, '').trim();
	if (!rhsExpr) {
		return null;
	}
	const lookup = extractLookupToken(rhsExpr);
	if (!lookup) {
		return null;
	}
	const rhsStart = lineText.indexOf(rhsExpr);
	if (rhsStart < 0) {
		return null;
	}
	return { token: lookup.token, character: rhsStart + lookup.relativeOffset, rhsExpr };
}

async function resolveViaLspDefinition(
	testDoc: vscode.TextDocument,
	draftCode: string,
	target: MockedVariable,
	lookupOverride?: { token: string; relativeOffset: number }
): Promise<ResolvedMockDefinition[]> {
	if (target.targetKind !== 'expression') {
		return [];
	}
	const lookup = lookupOverride ?? extractLookupToken(target.targetText);
	if (!lookup) {
		return [];
	}

	const lineStarts = buildLineStartOffsets(draftCode);
	const lookupOffset = target.targetOffset + lookup.relativeOffset;
	const lookupPos = offsetToPosition(lineStarts, lookupOffset);
	const defs = await VscodeRequestManager.definitions(testDoc.uri, lookupPos);
	if (!defs.length) {
		return [];
	}

	const resolved: ResolvedMockDefinition[] = [];
	for (const def of defs) {
		const direct = await describeDefinitionLocation(def, lookup.token, [`resolved by LSP from \`${lookup.token}\``]);
		if (direct) {
			resolved.push(direct);
		}

		if (def.uri.toString() !== testDoc.uri.toString()) {
			continue;
		}
		try {
			const lineText = testDoc.lineAt(def.range.start.line).text;
			const rhsLookup = extractAssignmentRhsLookup(lineText, lookup.token);
			if (!rhsLookup) {
				continue;
			}
			const rhsPos = new vscode.Position(def.range.start.line, rhsLookup.character);
			const rhsDefs = await VscodeRequestManager.definitions(testDoc.uri, rhsPos);
			for (const rhsDef of rhsDefs) {
				const rhsResolved = await describeDefinitionLocation(
					rhsDef,
					rhsLookup.token,
					[`resolved from assignment \`${lookup.token} = ${rhsLookup.rhsExpr}\``]
				);
				if (rhsResolved) {
					resolved.push(rhsResolved);
				}
			}
		} catch {
			// best effort
		}
	}
	return dedupeResolvedDefinitions(resolved);
}

function pickNearestAnchorToken(tokens: DecodedToken[], preferredLine: number): DecodedToken | null {
	if (!tokens.length) {
		return null;
	}
	const sameLine = tokens.find(t => t.line === preferredLine);
	if (sameLine) {
		return sameLine;
	}
	return tokens.reduce((best, curr) => {
		const bestDist = Math.abs(best.line - preferredLine);
		const currDist = Math.abs(curr.line - preferredLine);
		return currDist < bestDist ? curr : best;
	}, tokens[0]);
}

function extractIdentifierPositionsFromLine(lineText: string): Array<{ word: string; startChar: number }> {
	const out: Array<{ word: string; startChar: number }> = [];
	const idRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
	let m: RegExpExecArray | null;
	while ((m = idRegex.exec(lineText)) !== null) {
		out.push({ word: m[0], startChar: m.index });
	}
	return out;
}

async function resolveViaCoLocatedTokens(
	testDoc: vscode.TextDocument,
	draftCode: string,
	target: MockedVariable,
	lookup: { token: string; relativeOffset: number }
): Promise<ResolvedMockDefinition[]> {
	const lineStarts = buildLineStartOffsets(draftCode);
	const lookupOffset = target.targetOffset + lookup.relativeOffset;
	const lookupPos = offsetToPosition(lineStarts, lookupOffset);
	logMockResolve('co-located resolver start', {
		targetText: target.targetText,
		lookupToken: lookup.token,
		lookupLine: lookupPos.line + 1,
		lookupCharacter: lookupPos.character + 1
	});

	const defs = await VscodeRequestManager.definitions(testDoc.uri, lookupPos);
	logMockResolve('co-located resolver lookup definitions', {
		lookupToken: lookup.token,
		definitionCount: defs.length
	});
	if (!defs.length) {
		return [];
	}

	const resolved: ResolvedMockDefinition[] = [];
	for (const def of defs) {
		try {
			const defDoc = await vscode.workspace.openTextDocument(def.uri);
			const parentSymbol = await getSymbolByLocation(defDoc, def.range.start);
			if (!parentSymbol) {
				logMockResolve('co-located resolver: parent symbol not found', {
					lookupToken: lookup.token,
					definitionPath: def.uri.fsPath,
					defLine: def.range.start.line + 1
				});
				continue;
			}

			const symbolTokens = await getDecodedTokensFromSymbol(defDoc, parentSymbol);
			const anchors = symbolTokens.filter(t => t.word === lookup.token);
			const anchor = pickNearestAnchorToken(anchors, def.range.start.line);
			const anchorLine = anchor ? anchor.line : def.range.start.line;
			let lineTokens = symbolTokens.filter(t => t.line === anchorLine);
			if (lineTokens.length === 0) {
				lineTokens = await getDecodedTokensFromLine(defDoc, anchorLine);
				logMockResolve('co-located resolver: fallback to line tokens', {
					lookupToken: lookup.token,
					definitionPath: toWorkspaceRelativePath(def.uri.fsPath),
					anchorLine: anchorLine + 1,
					lineTokenWords: lineTokens.map(t => t.word)
				});
			}
			const lineText = defDoc.lineAt(anchorLine).text;
			const lexicalCandidates = extractIdentifierPositionsFromLine(lineText);
			type LineCandidate = { word: string; startChar: number; source: 'semantic' | 'lexical' };
			const mergedCandidates = new Map<string, LineCandidate>();
			for (const t of lineTokens) {
				const key = `${t.word}:${t.startChar}`;
				if (!mergedCandidates.has(key)) {
					mergedCandidates.set(key, { word: t.word, startChar: t.startChar, source: 'semantic' });
				}
			}
			for (const lex of lexicalCandidates) {
				const key = `${lex.word}:${lex.startChar}`;
				if (!mergedCandidates.has(key)) {
					mergedCandidates.set(key, { word: lex.word, startChar: lex.startChar, source: 'lexical' });
				}
			}
			const candidates = Array.from(mergedCandidates.values());
			logMockResolve('co-located resolver: line token scan', {
				lookupToken: lookup.token,
				definitionPath: toWorkspaceRelativePath(def.uri.fsPath),
				parentSymbol: parentSymbol.name,
				anchorLine: anchorLine + 1,
				lineTokenWords: lineTokens.map(t => t.word),
				lexicalTokenWords: lexicalCandidates.map(t => t.word)
			});

			for (const candidate of candidates) {
				if (candidate.word === lookup.token) {
					continue;
				}
				if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate.word)) {
					continue;
				}

				const pos = new vscode.Position(anchorLine, candidate.startChar);
				const tokenDefs = await VscodeRequestManager.definitions(defDoc.uri, pos);
				if (!tokenDefs || tokenDefs.length === 0) {
					continue;
				}

				for (const tokenDef of tokenDefs) {
					const defDesc = await describeDefinitionLocation(tokenDef, candidate.word, [
						`resolved via co-located token \`${candidate.word}\` on line ${anchorLine + 1} for \`${lookup.token}\` (${candidate.source})`
					]);
					if (defDesc) {
						resolved.push(defDesc);
					}
				}
			}
		} catch (error) {
			logMockResolve('co-located resolver error', {
				lookupToken: lookup.token,
				definitionPath: def.uri.fsPath,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	logMockResolve('co-located resolver done', {
		lookupToken: lookup.token,
		resolvedCount: resolved.length
	});
	return dedupeResolvedDefinitions(resolved);
}

function collectAncestorDirs(startPath: string, maxDepth = 24): string[] {
	const out: string[] = [];
	let current = path.resolve(startPath);
	for (let i = 0; i < maxDepth; i += 1) {
		out.push(current);
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return out;
}

async function findPythonModuleCandidateUris(modulePath: string, anchorFilePath?: string): Promise<vscode.Uri[]> {
	const folders = vscode.workspace.workspaceFolders || [];
	const moduleRel = modulePath.replace(/\./g, '/');
	const uris: vscode.Uri[] = [];
	const seen = new Set<string>();
	const addUri = (uri: vscode.Uri) => {
		const key = uri.fsPath;
		if (!seen.has(key)) {
			seen.add(key);
			uris.push(uri);
		}
	};

	const probeRoots = folders.map(f => f.uri.fsPath);
	if (anchorFilePath) {
		const ancestorRoots = collectAncestorDirs(path.dirname(anchorFilePath));
		for (const root of ancestorRoots) {
			if (!probeRoots.includes(root)) {
				probeRoots.push(root);
			}
		}
	}

	for (const root of probeRoots) {
		try {
			const directPy = path.join(root, `${moduleRel}.py`);
			const directInit = path.join(root, moduleRel, '__init__.py');
			if (fs.existsSync(directPy)) {
				addUri(vscode.Uri.file(directPy));
			}
			if (fs.existsSync(directInit)) {
				addUri(vscode.Uri.file(directInit));
			}
		} catch {
			// best effort
		}
	}
	if (uris.length > 0) {
		return uris;
	}

	if (!folders.length) {
		return uris;
	}

	for (const folder of folders) {
		const root = folder.uri.fsPath;
		const foundPy = await vscode.workspace.findFiles(
			new vscode.RelativePattern(root, `**/${moduleRel}.py`),
			'**/{.git,node_modules,venv,.venv,dist,build}/**',
			8
		);
		for (const uri of foundPy) {
			addUri(uri);
		}
		if (uris.length > 0) {
			break;
		}
		const foundInit = await vscode.workspace.findFiles(
			new vscode.RelativePattern(root, `**/${moduleRel}/__init__.py`),
			'**/{.git,node_modules,venv,.venv,dist,build}/**',
			8
		);
		for (const uri of foundInit) {
			addUri(uri);
		}
		if (uris.length > 0) {
			break;
		}
	}

	return uris;
}

async function resolveDefinitionFromPythonPath(dottedPath: string, anchorFilePath?: string): Promise<ResolvedMockDefinition[]> {
	const parts = dottedPath.split('.').filter(Boolean);
	if (parts.length === 0) {
		return [];
	}

	for (let split = parts.length - 1; split >= 1; split -= 1) {
		const modulePath = parts.slice(0, split).join('.');
		const symbolName = parts[split];
		const moduleUris = await findPythonModuleCandidateUris(modulePath, anchorFilePath);
		if (!moduleUris.length) {
			continue;
		}

		const resolved: ResolvedMockDefinition[] = [];
		for (const uri of moduleUris) {
			try {
				const doc = await vscode.workspace.openTextDocument(uri);
				let symbols: vscode.DocumentSymbol[] = [];
				try {
					symbols = await getAllSymbols(uri);
				} catch {
					// Keep going with textual fallback when document symbols are unavailable.
					symbols = [];
				}
				const exact = symbols.find(s => s.name === symbolName);
				if (exact) {
					const def = await describeDefinitionLocation(
						new vscode.Location(uri, exact.selectionRange),
						symbolName,
						[`resolved from python import path \`${dottedPath}\``]
					);
					if (def) {
						resolved.push(def);
					}
					continue;
				}

				const text = doc.getText();
				const linePattern = new RegExp(`^\\s*(?:def|class)\\s+${escapeRegExp(symbolName)}\\b`, 'm');
				const fallback = linePattern.exec(text);
				if (!fallback) {
					continue;
				}
				const lineStarts = buildLineStartOffsets(text);
				const pos = offsetToPosition(lineStarts, fallback.index);
				const line = doc.lineAt(pos.line).text.trim();
				resolved.push({
					name: symbolName,
					kind: null,
					loc: `${toWorkspaceRelativePath(uri.fsPath)}@${pos.line + 1}:${pos.character}`,
					snippet: truncateLines(line, 3, 500),
					notes: [`resolved textually from python path \`${dottedPath}\``]
				});
			} catch {
				// best effort
			}
		}
		if (resolved.length > 0) {
			return dedupeResolvedDefinitions(resolved);
		}
	}

	const moduleUris = await findPythonModuleCandidateUris(dottedPath, anchorFilePath);
	if (!moduleUris.length) {
		return [];
	}
	const moduleName = parts[parts.length - 1] || dottedPath;
	const resolved: ResolvedMockDefinition[] = [];
	for (const uri of moduleUris) {
		const def = await describeModuleDefinitionLocation(
			uri,
			moduleName,
			[`resolved from python module path \`${dottedPath}\``]
		);
		if (def) {
			resolved.push(def);
		}
	}
	return dedupeResolvedDefinitions(resolved);
}

async function resolveAssignmentHeadViaLsp(
	testDoc: vscode.TextDocument,
	assignment: PythonAssignment,
	note: string
): Promise<ResolvedMockDefinition[]> {
	if (!assignment.rhsHead || assignment.rhsHeadCharacter === null) {
		return [];
	}
	try {
		const rhsPos = new vscode.Position(assignment.line - 1, assignment.rhsHeadCharacter);
		const rhsDefs = await VscodeRequestManager.definitions(testDoc.uri, rhsPos);
		const resolved: ResolvedMockDefinition[] = [];
		for (const rhsDef of rhsDefs) {
			const rhsResolved = await describeDefinitionLocation(rhsDef, assignment.rhsHead, [note]);
			if (rhsResolved) {
				resolved.push(rhsResolved);
			}
		}
		return dedupeResolvedDefinitions(resolved);
	} catch {
		return [];
	}
}

async function resolveViaAssignmentDataFlow(
	testDoc: vscode.TextDocument,
	bindings: PythonMockBindings,
	startToken: string,
	startLine: number
): Promise<ResolvedMockDefinition[]> {
	const maxDepth = 8;
	const queue: Array<{ token: string; beforeLine: number; depth: number; trace: string[] }> = [
		{ token: startToken, beforeLine: startLine, depth: 0, trace: [] }
	];
	const visitedState = new Set<string>();
	const seenPath = new Set<string>();
	const resolved: ResolvedMockDefinition[] = [];
	let fallbackAssignment: { assignment: PythonAssignment; note: string } | null = null;

	while (queue.length > 0) {
		const node = queue.shift()!;
		const stateKey = `${node.token}@${node.beforeLine}`;
		if (visitedState.has(stateKey)) {
			continue;
		}
		visitedState.add(stateKey);

		const assignment = findNearestAssignment(bindings, node.token, node.beforeLine);
		if (!assignment) {
			const importedPath = expandWithImportBindings(node.token, bindings.importBindings);
			if (importedPath !== node.token && !seenPath.has(importedPath)) {
				seenPath.add(importedPath);
					const importedResolved = await resolveDefinitionFromPythonPath(importedPath, testDoc.uri.fsPath);
				if (importedResolved.length > 0) {
					resolved.push(...withExtraNote(importedResolved, formatImportFlowNote(node.trace, node.token, importedPath)));
				}
			}
			continue;
		}

		const step = `${assignment.lhs} = ${assignment.rhsExpr}`;
		const note = formatDataFlowNote(node.trace, step);
		if (!fallbackAssignment && node.depth === 0) {
			fallbackAssignment = { assignment, note };
		}
		const lspFromAssignment = await resolveAssignmentHeadViaLsp(testDoc, assignment, note);
		if (lspFromAssignment.length > 0) {
			resolved.push(...lspFromAssignment);
		}

		const rhsHead = assignment.rhsHead;
		if (!rhsHead) {
			continue;
		}

		const expandedHead = expandWithImportBindings(rhsHead, bindings.importBindings);
		if ((expandedHead !== rhsHead || expandedHead.includes('.')) && !seenPath.has(expandedHead)) {
			seenPath.add(expandedHead);
			const fromPath = await resolveDefinitionFromPythonPath(expandedHead, testDoc.uri.fsPath);
			if (fromPath.length > 0) {
				resolved.push(...withExtraNote(fromPath, note));
			}
		}

		if (node.depth >= maxDepth) {
			continue;
		}

		const nextTokens = new Set<string>();
		if (isSimpleIdentifierToken(rhsHead)) {
			nextTokens.add(rhsHead);
		}
		const rhsRoot = extractRootLookupToken(rhsHead);
		if (rhsRoot && isSimpleIdentifierToken(rhsRoot.token)) {
			nextTokens.add(rhsRoot.token);
		}
		for (const nextToken of nextTokens) {
			if (nextToken === node.token) {
				continue;
			}
			queue.push({
				token: nextToken,
				beforeLine: Math.max(0, assignment.line - 1),
				depth: node.depth + 1,
				trace: [...node.trace, step]
			});
		}
	}

	const deduped = dedupeResolvedDefinitions(resolved);
	if (deduped.length > 0) {
		return deduped;
	}
	if (fallbackAssignment) {
		try {
			const lineText = testDoc.lineAt(fallbackAssignment.assignment.line - 1).text;
			const trimmedLine = lineText.trim();
			if (trimmedLine) {
				const lhsIndex = lineText.indexOf(fallbackAssignment.assignment.lhs);
				const character = lhsIndex >= 0 ? lhsIndex : 0;
				return [
					{
						name: fallbackAssignment.assignment.lhs,
						kind: null,
						loc: `${toWorkspaceRelativePath(testDoc.uri.fsPath)}@${fallbackAssignment.assignment.line}:${character}`,
						snippet: truncateLines(trimmedLine, 3, 500),
						notes: [fallbackAssignment.note]
					}
				];
			}
		} catch {
			// best effort
		}
	}
	return deduped;
}

async function resolveMockTargetDefinitions(
	testDoc: vscode.TextDocument,
	draftCode: string,
	target: MockedVariable,
	bindings: PythonMockBindings
): Promise<ResolvedMockDefinition[]> {
	logMockResolve('resolveMockTargetDefinitions start', {
		targetKind: target.targetKind,
		targetText: target.targetText,
		targetLine: target.line,
		targetCharacter: target.character
	});
	if (target.targetKind === 'stringTarget') {
		const fromPath = await resolveDefinitionFromPythonPath(target.targetText, testDoc.uri.fsPath);
		logMockResolve('string target resolution', {
			targetText: target.targetText,
			resolvedCount: fromPath.length
		});
		return fromPath.length > 0 ? withExtraNote(fromPath, `mock target string \`${target.targetText}\``) : [];
	}

	const lastLookup = extractLookupToken(target.targetText);
	const rootLookup = extractRootLookupToken(target.targetText);
	const lookupCandidates = Array.from(
		new Map(
			[lastLookup, rootLookup]
				.filter((v): v is { token: string; relativeOffset: number } => Boolean(v))
				.map(v => [`${v.token}:${v.relativeOffset}`, v])
		).values()
	);
	if (!lookupCandidates.length) {
		logMockResolve('no lookup candidates', { targetText: target.targetText });
		return [];
	}
	logMockResolve('lookup candidates', {
		targetText: target.targetText,
		lookupCandidates: lookupCandidates.map(v => ({ token: v.token, relativeOffset: v.relativeOffset }))
	});

	const lspResolved: ResolvedMockDefinition[] = [];
	for (const lookup of lookupCandidates) {
		const defs = await resolveViaLspDefinition(testDoc, draftCode, target, lookup);
		lspResolved.push(...defs);
	}
	logMockResolve('LSP resolved count', {
		targetText: target.targetText,
		count: lspResolved.length
	});
	const combinedResolved: ResolvedMockDefinition[] = [...lspResolved];

	const coLocatedResolved: ResolvedMockDefinition[] = [];
	for (const lookup of lookupCandidates) {
		const defs = await resolveViaCoLocatedTokens(testDoc, draftCode, target, lookup);
		coLocatedResolved.push(...defs);
	}
	if (coLocatedResolved.length > 0) {
		combinedResolved.push(...coLocatedResolved);
	}
	logMockResolve('co-located resolved count', {
		targetText: target.targetText,
		count: coLocatedResolved.length
	});

	const expressionPathCandidate = target.targetText.trim();
	if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(expressionPathCandidate) && expressionPathCandidate.includes('.')) {
		const fromExprPath = await resolveDefinitionFromPythonPath(expressionPathCandidate, testDoc.uri.fsPath);
		if (fromExprPath.length > 0) {
			combinedResolved.push(...withExtraNote(fromExprPath, `resolved from expression path \`${expressionPathCandidate}\``));
		}
		logMockResolve('expression-path resolved count', {
			targetText: target.targetText,
			expressionPathCandidate,
			count: fromExprPath.length
		});
	}

	const dataFlowResolved: ResolvedMockDefinition[] = [];
	for (const lookup of lookupCandidates) {
		const defs = await resolveViaAssignmentDataFlow(testDoc, bindings, lookup.token, target.line);
		dataFlowResolved.push(...defs);
	}
	if (dataFlowResolved.length > 0) {
		combinedResolved.push(...dataFlowResolved);
	}
	logMockResolve('data-flow resolved count', {
		targetText: target.targetText,
		count: dataFlowResolved.length
	});

	if (combinedResolved.length > 0) {
		const deduped = dedupeResolvedDefinitions(combinedResolved);
		const lookupTokens = new Set(lookupCandidates.map(c => c.token));
		const preferred = preferUnderlyingMockObjectDefinitions(deduped, lookupTokens, toWorkspaceRelativePath(testDoc.uri.fsPath));
		logMockResolve('resolveMockTargetDefinitions done', {
			targetText: target.targetText,
			combinedCount: combinedResolved.length,
			dedupedCount: deduped.length,
			preferredCount: preferred.length,
			preferredNames: preferred.map(p => p.name),
			preferredLocs: preferred.map(p => p.loc)
		});
		return preferred;
	}

	logMockResolve('resolveMockTargetDefinitions done: unresolved', { targetText: target.targetText });
	return [];
}

function formatMockedObjectDefinitionsSummary(entries: MockedDefinitionSummaryEntry[]): string {
	if (!entries.length) {
		return '(none detected)';
	}
	const max = 12;
	const unresolvedEntries = entries.filter(e => !e.definition);
	for (const entry of unresolvedEntries) {
		logMockResolve('unresolved definition of mocked target', {
			mockFunction: entry.mockFunction,
			targetKind: entry.targetKind,
			targetText: entry.targetText,
			testLoc: entry.testLoc
		});
	}

	const resolvedEntries = entries.filter(
		(entry): entry is MockedDefinitionSummaryEntry & { definition: ResolvedMockDefinition } => Boolean(entry.definition)
	);
	const shown = resolvedEntries.slice(0, max).map(entry => {
		const lines: string[] = [
			`   - resolved definition: ${entry.definition.name}${entry.definition.kind ? ` (${entry.definition.kind})` : ''} @ ${entry.definition.loc}`
		];
		if (entry.definition.notes.length > 0) {
			console.log(`Definition following ${entry.definition.notes.join(' | ')}`);
		}
		if (entry.definition.snippet) {
			lines.push('   - definition snippet:');
			lines.push(entry.definition.snippet);
		}
		return lines.join('\n');
	}).join('\n\n');

	const unresolved = unresolvedEntries.length;
	const tail = resolvedEntries.length > max ? `\n\n... ${resolvedEntries.length - max} more mock target definition(s) omitted` : '';
	if (!shown) {
		return `Detected ${entries.length} mock target(s); unresolved ${unresolved}.`;
	}
	return `Detected ${entries.length} mock target(s); unresolved ${unresolved}.\n\n${shown}${tail}`;
}

export async function collectMockedObjectDefinitionsSummary(params: CollectMockedDefinitionsParams): Promise<string> {
	try {
		const testDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(params.testPath));
		const mockTokens = await mockIdentifier({
			sourceCode: params.draftTestCode,
			documentPath: params.testPath,
			languageId: params.languageId
		});
		const targets = mockArgumentIdentifier(mockTokens);
		const canonicalTargets = canonicalizeMockedVariablesForLookup(targets);
		if (!canonicalTargets.length) {
			return '(none detected)';
		}

		const bindings = collectPythonMockBindings(params.draftTestCode);
		const entries: MockedDefinitionSummaryEntry[] = [];

		for (const target of canonicalTargets) {
			const testLoc = Array.from(
				new Set(target.occurrences.map(o => `${path.basename(params.testPath)}@${o.line}:${o.character}`))
			).join(', ');
			const lookupTarget: MockedVariable = {
				mockFunction: target.mockFunctions[0] || '(unknown)',
				targetKind: target.targetKind,
				targetText: target.targetText,
				targetOffset: target.targetOffset,
				line: target.line,
				character: target.character
			};
			const defs = await resolveMockTargetDefinitions(testDoc, params.draftTestCode, lookupTarget, bindings);
			if (!defs.length) {
				entries.push({
					mockFunction: target.mockFunctions.join(' | '),
					targetKind: target.targetKind,
					targetText: target.targetText,
					testLoc,
					definition: null
				});
				continue;
			}
			for (const def of defs) {
				entries.push({
					mockFunction: target.mockFunctions.join(' | '),
					targetKind: target.targetKind,
					targetText: target.targetText,
					testLoc,
					definition: def
				});
			}
		}

		return formatMockedObjectDefinitionsSummary(entries);
	} catch {
		return '(unavailable)';
	}
}
