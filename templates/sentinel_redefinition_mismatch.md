# Error Category: Constant / Sentinel Redefinition Mismatch

## Definition

A **Constant / Sentinel Redefinition Mismatch** occurs when:

- A unit test redefines or mocks a constant (often a sentinel/placeholder/special value) locally
- The focal method uses the original constant from the implementation module
- The test compares results against the test-defined value, causing assertion failures

### Abstract Failure Pattern

```
Implementation uses:  CONST_impl  (from module under test)
Test expects:         CONST_test  (redefined locally)
-----------------------------------------------
Result:               Assertion failure (values differ)
```

## Core Characteristics

- A global constant / sentinel / singleton is involved (e.g., `DUMMY_NODE`, `EMPTY`, `MISSING`, `DEFAULT`, `SENTINEL`)
- The test defines a "fake" constant instead of importing the real one
- The focal method references the module-level constant, not the test's value
- Failure often shows up as:
  - Tuple/list/object mismatch where only the "sentinel field" differs
  - Identity/equality mismatch (`is` vs `==`) for sentinel objects

## Typical Signals

Assertion differences in:
- Tuple/list structures where only sentinel values differ
- Identity comparisons (`is`) failing for sentinel objects
- Object equality mismatches for constants

Other indicators:
- Test file redefines constants locally
- Constants not imported from the original module
- Module-level constants referenced in implementation
- Sentinel/placeholder values differ between test and implementation

## Root Cause

The test uses a locally redefined sentinel constant, but the implementation uses the original module-level sentinel, so the compared structures differ.

## Examples

### Example 1: Sentinel Constant Redefinition

**Error Type:** Constant / Sentinel Redefinition Mismatch → Sentinel Value

**Triggering Test:**
```python
import unittest
from pkg.module_under_test import target_fn   # imports function, not sentinel

# ❌ Wrong: local redefinition (does not affect module_under_test.SENTINEL)
SENTINEL = ("TEST_SENTINEL",)

class TestTargetFn(unittest.TestCase):
    def test_returns_structure_with_sentinel(self):
        expected = ("data", SENTINEL)
        actual = target_fn("input")
        self.assertEqual(actual, expected)
```

**Focal Method:**
```python
# pkg/module_under_test.py
SENTINEL = ("IMPL_SENTINEL",)

def target_fn(x):
    return ("data", SENTINEL)  # uses module_under_test.SENTINEL
```

**Assertion Error:**
```
AssertionError: ... expected (..., SENTINEL_test) != actual (..., SENTINEL_impl)
First differing element: sentinel field
```

**Failure Reason:** The test compares against `SENTINEL` defined in the test file, but `target_fn` uses `module_under_test.SENTINEL`. These are different objects/values, so the structures don't match.
