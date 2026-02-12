import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildAssertionReflectionPrompt, extractMockTargetsFromTestCode } from '../../../strategy/generators/lsprag_reflect';
import {
	canonicalizeMockedVariablesForLookup,
	collectMockedObjectDefinitionsSummary,
	mockArgumentIdentifier,
	mockIdentifier
} from '../../../strategy/generators/mock';

const REAL_WORLD_TEST_DIR = '/LSPRAG/experiments/projects/thefuck/lsprag-workspace/20260209_114223/thefuck/lsprag-cfg-deepseek/deepseek-chat/results/final';
const REAL_WORLD_DEEPSEEK_DIR = '/LSPRAG/experiments/projects/thefuck/lsprag-workspace/20260209_114223/thefuck/lsprag-deepseek/deepseek-chat/results/final';
const REAL_WORLD_TYPES_STDOUT_FILE = path.join(REAL_WORLD_DEEPSEEK_DIR, 'types_stdout_1413_test.py');
const REAL_WORLD_GENERIC_INFO_FILE = path.join(REAL_WORLD_DEEPSEEK_DIR, 'generic_info_3994_test.py');
const TMP_MOCK_ASSIGNMENT_CASE_DIR = '/LSPRAG/.tmp/reflect_mock_targets';

function collectPythonTestFiles(rootDir: string): string[] {
	const out: string[] = [];
	const stack: string[] = [rootDir];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(abs);
				continue;
			}
			if (entry.isFile() && abs.endsWith('_test.py')) {
				out.push(abs);
			}
		}
	}
	return out.sort();
}

function hasExplicitMockCallSignal(code: string): boolean {
	return /\bpatch(?:\.(?:object|dict|multiple))?\s*\(|\b(?:Mock|MagicMock|AsyncMock|create_autospec|NonCallableMock|NonCallableMagicMock)\s*\(|\b(?:monkeypatch|mocker)\.(?:patch(?:\.object)?|setattr|delattr|setitem)\s*\(/.test(code);
}

async function collectSummaryForInlinePythonCase(caseName: string, code: string): Promise<string> {
	fs.mkdirSync(TMP_MOCK_ASSIGNMENT_CASE_DIR, { recursive: true });
	const filePath = path.join(TMP_MOCK_ASSIGNMENT_CASE_DIR, `${caseName}_test.py`);
	fs.writeFileSync(filePath, code, 'utf8');
	try {
		return await collectMockedObjectDefinitionsSummary({
			languageId: 'python',
			draftTestCode: code,
			testPath: filePath
		});
	} finally {
		try {
			fs.unlinkSync(filePath);
		} catch {
			// best effort cleanup
		}
	}
}

function assertSummaryResolvesGenericWithoutUnresolved(summary: string): void {
	assert.notStrictEqual(summary, '(none detected)');
	assert.notStrictEqual(summary, '(unavailable)');
	assert.ok(summary.includes('unresolved 0.'), 'expected no unresolved mock targets in summary');
	assert.ok(summary.includes('thefuck/shells/generic.py'));
	assert.ok(summary.includes('class Generic'));
}

suite('PROMPTS - reflect mock targets', () => {
	test('mockIdentifier returns possible mock functions with locations', async () => {
		const draft = `
with patch.object(settings, '_setup_user_dir') as mock_setup, \\
     patch('thefuck.conf.exception') as mock_exception:
    pass
`;
		const tokens = await mockIdentifier({
			sourceCode: draft,
			documentPath: '/tmp/reflect_mock_targets_case.py',
			languageId: 'python'
		});
		assert.ok(tokens.some(t => t.mockFunction.endsWith('patch.object')));
		assert.ok(tokens.some(t => t.mockFunction.endsWith('patch')));
		assert.ok(tokens.every(t => t.line > 0 && t.character > 0));
	});

	test('mockArgumentIdentifier returns mocked objects from mock tokens', async () => {
		const draft = `
with patch.object(settings, '_setup_user_dir') as mock_setup, \\
     patch('thefuck.conf.exception') as mock_exception:
    m = Mock(spec=Settings)
`;
		const tokens = await mockIdentifier({
			sourceCode: draft,
			documentPath: '/tmp/reflect_mock_targets_case_args.py',
			languageId: 'python'
		});
		const mocked = mockArgumentIdentifier(tokens);
		assert.ok(mocked.some(t => t.mockFunction.endsWith('patch.object') && t.targetText === 'settings'));
		assert.ok(mocked.some(t => t.mockFunction.endsWith('patch') && t.targetText === 'thefuck.conf.exception'));
		assert.ok(mocked.some(t => t.mockFunction.toLowerCase().endsWith('mock') && t.targetText === 'Settings'));
	});

	test('canonicalizeMockedVariablesForLookup removes redundant targets for definition lookup', async () => {
		const draft = `
with patch.object(settings, '_setup_user_dir'), patch.object(settings, '_init_settings_file'):
    pass

with patch('thefuck.conf.exception'), patch('thefuck.conf.exception'):
    pass
`;
		const tokens = await mockIdentifier({
			sourceCode: draft,
			documentPath: '/tmp/reflect_mock_targets_canonicalize.py',
			languageId: 'python'
		});
		const mocked = mockArgumentIdentifier(tokens);
		const canonical = canonicalizeMockedVariablesForLookup(mocked);

		assert.ok(mocked.length > canonical.length, 'expected canonicalization to reduce redundant targets');
		assert.strictEqual(canonical.filter(t => t.targetText === 'settings').length, 1);
		assert.strictEqual(canonical.filter(t => t.targetText === 'thefuck.conf.exception').length, 1);
	});

	test('extracts diverse mock API usages', async () => {
		const draft = `
from unittest.mock import patch, Mock, MagicMock, create_autospec

@patch('pkg.mod.func')
@patch.object(Service, 'run')
def test_decorators():
    with patch.multiple('pkg.mod.Client', fetch=DEFAULT), \\
         patch.dict(os.environ, {'A': '1'}), \\
         patch.dict('pkg.mod.CONF', {'x': 1}), \\
         mocker.patch.object(repo, 'save'):
        monkeypatch.setattr(app.module, 'clock', fake_clock)
        monkeypatch.setattr('pkg.mod.FLAG', True)
        monkeypatch.delattr(repo, 'cache', raising=False)
        monkeypatch.setitem(config_map, 'mode', 'test')
        m = Mock(spec=Settings)
        mm = MagicMock(spec_set=Service, wraps=service_impl)
        auto = create_autospec(Client)
        return m, mm, auto
`;
		const tokens = await mockIdentifier({
			sourceCode: draft,
			documentPath: '/tmp/reflect_mock_targets_diverse.py',
			languageId: 'python'
		});
		const targets = mockArgumentIdentifier(tokens);
		const has = (mockSuffix: string, target: string) =>
			targets.some(t => t.mockFunction.toLowerCase().endsWith(mockSuffix.toLowerCase()) && t.targetText === target);

		assert.ok(has('patch', 'pkg.mod.func'));
		assert.ok(has('patch.object', 'Service'));
		assert.ok(has('patch.multiple', 'pkg.mod.Client'));
		assert.ok(has('patch.dict', 'os.environ'));
		assert.ok(has('patch.dict', 'pkg.mod.CONF'));
		assert.ok(has('mocker.patch.object', 'repo'));
		assert.ok(has('monkeypatch.setattr', 'app.module'));
		assert.ok(has('monkeypatch.setattr', 'pkg.mod.FLAG'));
		assert.ok(has('monkeypatch.delattr', 'repo'));
		assert.ok(has('monkeypatch.setitem', 'config_map'));
		assert.ok(has('mock', 'Settings'));
		assert.ok(has('magicmock', 'Service'));
		assert.ok(has('magicmock', 'service_impl'));
		assert.ok(has('create_autospec', 'Client'));
	});

	test('legacy lexical extractor still returns targets', () => {
		const draft = `with patch.object(settings, 'x') as m: pass`;
		const targets = extractMockTargetsFromTestCode(draft, 'python');
		assert.ok(targets.some(t => t.targetText === 'settings'));
	});

	test('includes mocked-object definitions section in reflection prompt using real-world test dir', async function () {
		this.timeout(90000);
		assert.ok(fs.existsSync(REAL_WORLD_TEST_DIR), `real-world test dir not found: ${REAL_WORLD_TEST_DIR}`);
		const realSourceFile = path.join(REAL_WORLD_TEST_DIR, 'conf_init_5364_test.py');
		assert.ok(fs.existsSync(realSourceFile), `missing sample file: ${realSourceFile}`);
		const realDraftTestCode = fs.readFileSync(realSourceFile, 'utf8');
		const mockedObjectDefinitionsSummary = await collectMockedObjectDefinitionsSummary({
			languageId: 'python',
			draftTestCode: realDraftTestCode,
			testPath: realSourceFile
		});
		assert.notStrictEqual(mockedObjectDefinitionsSummary, '(none detected)');
		assert.notStrictEqual(mockedObjectDefinitionsSummary, '(unavailable)');
		assert.ok(mockedObjectDefinitionsSummary.includes('resolved definition:'), 'missing resolved definition line');
		assert.ok(mockedObjectDefinitionsSummary.includes('definition snippet:'), 'missing definition snippet line');
		assert.ok(!mockedObjectDefinitionsSummary.includes('(unresolved)'), 'unresolved placeholder lines should not appear in prompt summary');
		// assert.ok(
		// 	mockedObjectDefinitionsSummary.includes('Settings') || mockedObjectDefinitionsSummary.includes('thefuck/conf.py'),
		// 	'missing resolved mocked-object type/class definition'
		// );

		const prompt = buildAssertionReflectionPrompt({
			languageId: 'python',
			sourceFile: realSourceFile,
			focalSymbolName: 'foo',
			focalMethodSource: 'def foo(x):\n    return x',
			draftTestCode: realDraftTestCode,
			definitionTreePretty: '(none)',
			redefinedSymbolsSummary: '(none)',
			invokedFunctionSignatures: [],
			mockedObjectDefinitionsSummary
		});
		assert.strictEqual(prompt.length, 2);
		console.log('Generated prompt:\n', prompt[1].content);
		assert.ok(prompt[1].content.includes('### Definitions of objects used in mock-related calls'));
		assert.ok(prompt[1].content.includes(`Source file: ${realSourceFile}`));
		assert.ok(prompt[1].content.includes('resolved definition:'));
		assert.ok(prompt[1].content.includes('definition snippet:'));
	});

	test('verifies mock detection on real-world generated python tests', async () => {
		assert.ok(fs.existsSync(REAL_WORLD_TEST_DIR), `real-world test dir not found: ${REAL_WORLD_TEST_DIR}`);
		const files = collectPythonTestFiles(REAL_WORLD_TEST_DIR);
		assert.ok(files.length > 0, 'no python test files found in real-world corpus');

		let filesWithMockSignal = 0;
		let filesWithDetectedMockTokens = 0;
		let totalMockTokens = 0;
		let totalMockTargets = 0;
		const seenMockApis = new Set<string>();

		for (const filePath of files) {
			const code = fs.readFileSync(filePath, 'utf8');
			const tokens = await mockIdentifier({
				sourceCode: code,
				documentPath: filePath,
				languageId: 'python'
			});
			const mockedTargets = mockArgumentIdentifier(tokens);

			if (hasExplicitMockCallSignal(code)) {
				filesWithMockSignal += 1;
				if (tokens.length > 0) {
					filesWithDetectedMockTokens += 1;
				}
			}

			totalMockTokens += tokens.length;
			totalMockTargets += mockedTargets.length;
			for (const token of tokens) {
				seenMockApis.add(token.mockFunction.toLowerCase());
			}
		}

		assert.ok(filesWithMockSignal > 0, 'real-world corpus contains no explicit mock call signals');
		assert.strictEqual(
			filesWithDetectedMockTokens,
			filesWithMockSignal,
			`mockIdentifier missed explicit mock calls in ${filesWithMockSignal - filesWithDetectedMockTokens} file(s)`
		);
		assert.ok(totalMockTokens > 0, 'mockIdentifier produced zero tokens across real-world corpus');
		assert.ok(totalMockTargets > 0, 'mockArgumentIdentifier produced zero targets across real-world corpus');
		assert.ok(Array.from(seenMockApis).some(api => api.endsWith('patch')), 'expected to detect patch(...) usage in real-world corpus');
		assert.ok(Array.from(seenMockApis).some(api => api.endsWith('patch.object')), 'expected to detect patch.object(...) usage in real-world corpus');
		assert.ok(Array.from(seenMockApis).some(api => api.endsWith('patch.dict')), 'expected to detect patch.dict(...) usage in real-world corpus');
	});

	test('verifies conf_init sample detects problematic mock targets', async () => {
		const filePath = path.join(REAL_WORLD_TEST_DIR, 'conf_init_5364_test.py');
		assert.ok(fs.existsSync(filePath), `missing sample file: ${filePath}`);
		const code = fs.readFileSync(filePath, 'utf8');

		const tokens = await mockIdentifier({
			sourceCode: code,
			documentPath: filePath,
			languageId: 'python'
		});
		const mockedTargets = mockArgumentIdentifier(tokens);
		const canonical = canonicalizeMockedVariablesForLookup(mockedTargets);

		assert.ok(tokens.some(t => t.mockFunction.toLowerCase().includes('patch.object')));
		assert.ok(tokens.some(t => t.mockFunction.toLowerCase() === 'patch'));
		assert.ok(canonical.some(t => t.targetText === 'settings'));
		assert.ok(canonical.some(t => t.targetText === 'thefuck.conf.exception'));
	});

	test('resolves module targets to full file content for logs mock', async function () {
		this.timeout(90000);
		assert.ok(fs.existsSync(REAL_WORLD_TYPES_STDOUT_FILE), `missing sample file: ${REAL_WORLD_TYPES_STDOUT_FILE}`);
		const code = fs.readFileSync(REAL_WORLD_TYPES_STDOUT_FILE, 'utf8');
		const tokens = await mockIdentifier({
			sourceCode: code,
			documentPath: REAL_WORLD_TYPES_STDOUT_FILE,
			languageId: 'python'
		});
		const canonicalTargets = canonicalizeMockedVariablesForLookup(mockArgumentIdentifier(tokens));
		assert.ok(tokens.some(t => t.mockFunction.toLowerCase().includes('patch.object')), 'expected patch.object(...) detection');
		assert.ok(
			!tokens.some(t => t.mockFunction.toLowerCase().includes('assert_called_once_with')),
			'assert helpers on Mock instances should not be classified as mock API calls'
		);
		assert.strictEqual(canonicalTargets.filter(t => t.targetText === 'logs').length, 1, 'expected only one canonical `logs` target');
		assert.ok(
			!canonicalTargets.some(t => t.targetText.includes('stdout') || t.targetText.includes('output')),
			'string arguments from mock assertions should not become mock targets'
		);

		const summary = await collectMockedObjectDefinitionsSummary({
			languageId: 'python',
			draftTestCode: code,
			testPath: REAL_WORLD_TYPES_STDOUT_FILE
		});
		assert.notStrictEqual(summary, '(none detected)');
		assert.notStrictEqual(summary, '(unavailable)');
		assert.ok(summary.includes('Detected 1 mock target(s); unresolved 0.'), 'expected only module target to remain');
		assert.ok(summary.includes('logs.py'), 'expected module file path for logs');
		assert.ok(summary.includes('# -*- encoding: utf-8 -*-'), 'expected module header content for logs target');
		assert.ok(summary.includes('def warn'), 'expected module content for logs target');
		assert.ok(!summary.includes('(unresolved)'), 'logs-only case should not include unresolved mock targets');
	});

	test('traces mock targets through assignment to Generic instances', async function () {
		this.timeout(90000);
		assert.ok(fs.existsSync(REAL_WORLD_GENERIC_INFO_FILE), `missing sample file: ${REAL_WORLD_GENERIC_INFO_FILE}`);
		const code = fs.readFileSync(REAL_WORLD_GENERIC_INFO_FILE, 'utf8');
		const tokens = await mockIdentifier({
			sourceCode: code,
			documentPath: REAL_WORLD_GENERIC_INFO_FILE,
			languageId: 'python'
		});
		const canonicalTargets = canonicalizeMockedVariablesForLookup(mockArgumentIdentifier(tokens));
		assert.ok(canonicalTargets.some(t => t.targetText === 'shell'), 'expected `shell` target from patch.object(shell, ...)');
		assert.ok(canonicalTargets.some(t => t.targetText === 'shell2'), 'expected `shell2` target from patch.object(shell2, ...)');

		const summary = await collectMockedObjectDefinitionsSummary({
			languageId: 'python',
			draftTestCode: code,
			testPath: REAL_WORLD_GENERIC_INFO_FILE
		});
		assert.notStrictEqual(summary, '(none detected)');
		assert.notStrictEqual(summary, '(unavailable)');
		assert.ok(summary.includes('thefuck/shells/generic.py'), 'expected resolution path to Generic module');
		assert.ok(
			summary.includes('class Generic') || summary.includes('shell = Generic()'),
			'expected mock target resolution to trace back to Generic assignment or class'
		);
	});

	test('resolves stdlib patch.object target from type-annotated assignment', async function () {
		this.timeout(90000);
		const code = `
from unittest.mock import patch
from thefuck.shells.generic import Generic

def test_type_annotated_assignment():
    shell: Generic = Generic()
    with patch.object(shell, '_get_version', return_value='5.0.0'):
        shell.info()
`;
		const summary = await collectSummaryForInlinePythonCase('typed_assignment', code);
		assertSummaryResolvesGenericWithoutUnresolved(summary);
	});

	test('resolves stdlib patch.object target from aliased from-import assignment', async function () {
		this.timeout(90000);
		const code = `
from unittest.mock import patch
from thefuck.shells.generic import Generic as GenericShell

def test_from_import_alias_assignment():
    shell = GenericShell()
    with patch.object(shell, '_get_version', return_value='5.0.0'):
        shell.info()
`;
		const summary = await collectSummaryForInlinePythonCase('from_import_alias_assignment', code);
		assertSummaryResolvesGenericWithoutUnresolved(summary);
	});

	test('resolves stdlib patch.object target from module-alias dotted constructor', async function () {
		this.timeout(90000);
		const code = `
from unittest.mock import patch
import thefuck.shells.generic as generic_mod

def test_module_alias_assignment():
    shell = generic_mod.Generic()
    with patch.object(shell, '_get_version', return_value='5.0.0'):
        shell.info()
`;
		const summary = await collectSummaryForInlinePythonCase('module_alias_assignment', code);
		assertSummaryResolvesGenericWithoutUnresolved(summary);
	});

	test('resolves stdlib patch.object target using nearest reassignment in scope', async function () {
		this.timeout(90000);
		const code = `
from unittest.mock import patch
from thefuck.shells.generic import Generic

shell = object()

def test_nearest_reassignment():
    shell = Generic()
    with patch.object(shell, '_get_version', return_value='5.0.0'):
        shell.info()
`;
		const summary = await collectSummaryForInlinePythonCase('nearest_reassignment', code);
		assertSummaryResolvesGenericWithoutUnresolved(summary);
	});

	test('resolves stdlib patch.object target from self attribute assignment', async function () {
		this.timeout(90000);
		const code = `
from unittest.mock import patch
from thefuck.shells.generic import Generic

class Holder:
    def __init__(self):
        self.shell = Generic()

def test_self_attribute_assignment():
    holder = Holder()
    with patch.object(holder.shell, '_get_version', return_value='5.0.0'):
        holder.shell.info()
`;
		const summary = await collectSummaryForInlinePythonCase('self_attribute_assignment', code);
		assertSummaryResolvesGenericWithoutUnresolved(summary);
	});
});
