# Error Category: Default Value Mismatch

## Definition

A **Default Value Mismatch** error occurs when:

- A unit test implicitly assumes a default value for a parameter (`P_expected`)
- The implementation omits that parameter and therefore relies on a library/API/runtime default (`P_default`)
- `P_expected ≠ P_default`, causing a deterministic assertion failure

### Abstract Failure Pattern

```
Test expectation uses        → P_expected
Implementation executes with → P_default
---------------------------------------
Result                       → Assertion failure
```

## Core Characteristics

- The test encodes an unstated default assumption
- The focal method does not explicitly pass a critical parameter
- The real default value is defined outside the focal method
- Output differences are systematic and repeatable
- The failure disappears if the parameter is explicitly specified

## Typical Signals

Assertion differences in:
- Formatting width / indentation
- Numeric precision / rounding
- Encoding / normalization
- Timezone / locale
- Ordering / sorting

Other indicators:
- Helper or library calls without explicit arguments
- API documentation mentions a non-trivial default value

## Root Cause

The test assumes a default value that differs from the actual default used by the library or runtime.

## Fix Strategies

1. Explicitly pass the parameter in the implementation
2. Align test expectations with the documented default behavior
3. Centralize defaults in shared configuration
4. Parameterize tests instead of hard-coding assumed defaults

## Error Instances

### Instance 1: Formatting Width Default Mismatch

**Error Type:** Default Value Mismatch → Formatting

**Triggering Test:**
```python
def test_formatting_assumes_width():
    x = "\tfoo"
    expected = "    foo"   # assumes width = 4
    assert format_fn(x) == expected
```

**Focal Method:**
```python
def format_fn(x):
    return helper_format(x)   # width not specified
```

**Hidden Default:** `helper_format(..., width=8)`

**Failure Reason:** The test assumes `width = 4`, but the helper function uses the default `width = 8`.