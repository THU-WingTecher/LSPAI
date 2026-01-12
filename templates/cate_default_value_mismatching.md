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

---

### Instance 2: Numeric Precision Default Mismatch

**Error Type:** Default Value Mismatch → Precision

**Triggering Test:**
```python
def test_rounding_precision():
    expected = 1.23          # assumes precision = 2
    assert compute(1.2345) == expected
```

**Focal Method:**
```python
def compute(x):
    return round(x)          # precision not specified
```

**Hidden Default:** `round(x, ndigits=0)`

**Failure Reason:** The test assumes two decimal places, but `round()` defaults to integer rounding.

---

### Instance 3: Timezone Default Mismatch

**Error Type:** Default Value Mismatch → Timezone

**Triggering Test:**
```python
def test_timestamp_utc():
    expected = "2024-01-01T00:00:00Z"
    assert format_time(ts) == expected
```

**Focal Method:**
```python
def format_time(ts):
    return ts.isoformat()    # timezone not specified
```

**Hidden Default:** `isoformat()` uses local or naive timezone

**Failure Reason:** The test assumes UTC, but the implementation formats a non-UTC datetime.

---

### Instance 4: Encoding / Normalization Default Mismatch

**Error Type:** Default Value Mismatch → Encoding

**Triggering Test:**
```python
def test_unicode_normalization():
    expected = "é"
    assert normalize("e\u0301") == expected
```

**Focal Method:**
```python
def normalize(s):
    return unicodedata.normalize(s)   # normalization form omitted
```

**Hidden Default:** `normalize(s, form=<implementation default>)`

**Failure Reason:** The test assumes a specific normalization form, but the function relies on the default.

## Retrieval & Matching Hints

Keywords and phrases to identify this error category:

- omitted argument
- default parameter
- implicit assumption
- library default differs
- configuration mismatch
- systematic formatting / precision / timezone differences

## Canonical Labeling

- **Category:** `DefaultValueMismatch`
- **Subtype:** `OmittedArgumentUsesLibraryDefault`
- **FailureMode:** `ExpectedDefault ≠ ActualDefault`
