# Error Category: Test Prefix Precondition Unsatisfied

## Definition

A **Test Prefix Precondition Unsatisfied** error occurs when:

- The test’s setup/prefix code is intended to establish a required precondition (`C_expected`) for the focal method
- But the actual runtime state before invocation is `C_actual`
- `C_expected` is **not** satisfied by `C_actual`, so execution follows an unintended path and the assertion fails


### Abstract Failure Pattern

```
Test setup intends to ensure → C_expected (precondition holds)
Actual runtime state is → C_actual (precondition does not hold)
---------------------------------------
Result                       → Assertion failure
```

## Core Characteristics

- Failure is caused by **incorrect assumptions about control-flow conditions**
- The test “thinks” it is testing branch/path A, but code actually takes branch/path B
- Differences often appear as:
  - wrong return value / wrong error type
  - missing side effects
  - different intermediate state
- Usually deterministic (same input → same wrong path), unless precondition depends on nondeterminism

## Typical Signals

Assertion differences accompanied by:
- Conditionals/guards in focal method (`if`, `match`, early `return`, error handling)
- Assertions about outcomes that only occur in a specific branch
- Test setup that is **insufficient or mis-specified**, e.g.:
  - missing field initialization
  - incorrect input shape/flags
  - wrong config values
  - order-of-operations issues in setup


## Root Cause

The test prefix/setup does **not** actually satisfy the focal method’s branch/path precondition, so the assertion validates the wrong expected behavior.

## Fix Strategies

1. Strengthen setup to explicitly satisfy the required condition (`C_expected`)
2. Add an explicit assertion in setup to validate precondition (guard assertion)
3. Construct inputs to force the intended path (flags, values, object state)
4. If multiple paths are valid, parameterize tests per-path instead of assuming one

## Example

### Example 1: Intended Branch Not Taken

**Error Type:** Test Prefix Precondition Unsatisfied → Branch Assumption

**Triggering Test:**
```python
def test_parses_when_feature_enabled():
    cfg = {"feature_enabled": True}   # intended precondition
    parser = Parser(cfg)

    result = parser.parse("x=y")
    assert result == {"x": "y"}       # expects enabled behavior
```

**Focal Method:**
```python
class Parser:
    def __init__(self, cfg):
        self.cfg = cfg

    def parse(self, s):
        if not self.cfg.get("enabled"):   # checks "enabled", not "feature_enabled"
            return {}                     # fallback branch
        return dict(pair.split("=") for pair in s.split(","))

```

**Failure Reason**: Test sets feature_enabled=True but the code checks enabled. The intended precondition is not met, so the fallback branch executes.