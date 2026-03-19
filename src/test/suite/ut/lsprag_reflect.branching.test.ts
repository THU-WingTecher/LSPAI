import * as assert from 'assert';
import { compactInvokedFunctionContext, shouldUseCallsiteConditionedInvokedContext } from '../../../strategy/generators/lsprag_reflect';

suite('UT - LSPRAG reflect branching gate', () => {
  test('enables callsite-conditioned context for Python if/else methods', () => {
    const source = [
      'def render_value(raw: int) -> int:',
      '    if raw % 2 == 0:',
      '        return compute_alpha(raw)',
      '    return compute_beta(raw)'
    ].join('\n');

    assert.strictEqual(shouldUseCallsiteConditionedInvokedContext(source), true);
  });

  test('enables callsite-conditioned context for brace-prefixed else-if branches', () => {
    const source = [
      'int renderValue(int raw) {',
      '    if (raw < 0) {',
      '        return 0;',
      '    } else if (raw % 2 == 0) {',
      '        return computeAlpha(raw);',
      '    }',
      '    return computeBeta(raw);',
      '}'
    ].join('\n');

    assert.strictEqual(shouldUseCallsiteConditionedInvokedContext(source), true);
  });

  test('keeps direct retrieval for straight-line helpers', () => {
    const source = [
      'def normalize_seed(seed: int) -> int:',
      '    return max(seed, 1)'
    ].join('\n');

    assert.strictEqual(shouldUseCallsiteConditionedInvokedContext(source), false);
  });

  test('packs invoked context by relevance and token budget', () => {
    const packed = compactInvokedFunctionContext([
      '[class] Helper (helper.py:1)\nclass Helper:\n    pass',
      '[method] compute_beta (beta.py:10)\ndef compute_beta(raw):\n    return raw * 3',
      '[decision] focal_branch_conditions (render.py:20)\nif raw % 2 == 0:\nreturn compute_alpha(raw)',
      '[method] compute_alpha (alpha.py:5)\ndef compute_alpha(raw):\n    if raw < 0:\n        return 0\n    return raw * 2'
    ], {
      maxEntries: 10,
      maxEntryLines: 40,
      maxEntryChars: 4000,
      maxTotalChars: 20000,
      maxTotalTokens: 20
    });

    assert.ok(packed.length > 0, 'expected at least one packed entry');
    assert.ok(packed[0].startsWith('[decision]'), `expected decision entry first, got: ${packed[0]}`);
    assert.ok(packed.some((entry) => entry.includes('compute_alpha')), 'expected callable entry to be retained');
    const combined = packed.join('\n');
    const approxTokens = combined.split(/\s+/).filter(Boolean).length;
    assert.ok(approxTokens <= 24, `expected packed context to stay near the configured token budget, got ${approxTokens}`);
  });
});
