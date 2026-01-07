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

---

### Example 2: Empty/None Sentinel Mismatch

**Error Type:** Constant / Sentinel Redefinition Mismatch → Empty Value

**Triggering Test:**
```python
# ❌ Wrong: redefines EMPTY locally
EMPTY = None

def test_handles_empty():
    result = process_data(EMPTY)
    assert result == {"status": EMPTY}
```

**Focal Method:**
```python
# module_under_test.py
EMPTY = object()  # unique sentinel object

def process_data(value):
    if value is EMPTY:
        return {"status": EMPTY}
    return {"status": "filled"}
```

**Failure Reason:** The test uses `None` as `EMPTY`, but the implementation uses a unique sentinel object. Identity check (`is`) fails because they're different objects.

---

### Example 3: Default Value Constant Redefinition

**Error Type:** Constant / Sentinel Redefinition Mismatch → Default Constant

**Triggering Test:**
```python
# ❌ Wrong: redefines DEFAULT locally
DEFAULT = -1

def test_uses_default():
    result = compute_value()
    assert result == DEFAULT
```

**Focal Method:**
```python
# module_under_test.py
DEFAULT = 0  # actual default value

def compute_value():
    return DEFAULT
```

**Failure Reason:** The test expects `-1` but the implementation returns `0` (the actual module constant).

## Retrieval & Matching Hints

Keywords and phrases to identify this error category:

- "not imported from original definition"
- "redefined in test"
- "uses module global constant"
- "sentinel value mismatch"
- "placeholder constant differs"
- "stack/node/state contains unexpected fixed value"
- Tuple/list mismatch where only sentinel field differs
- Identity comparison (`is`) failures for constants

## Fix Strategies

1. **Import the constant from the implementation module:**
   ```python
   from module_under_test import CONST
   ```

2. **Avoid redefining sentinels; compare behavior rather than exact sentinel representation**

3. **If needed, patch the module constant where it is looked up** (patch the module under test, not the test namespace)

4. **If the sentinel is meant to be unique, enforce identity checks consistently** (`is CONST_impl`)

## Canonical Labeling

- **Category:** `ConstantRedefinitionMismatch`
- **Subtype:** `SentinelValueMismatch` | `EmptyValueMismatch` | `DefaultConstantMismatch`
- **FailureMode:** `TestConstant ≠ ImplementationConstant`
