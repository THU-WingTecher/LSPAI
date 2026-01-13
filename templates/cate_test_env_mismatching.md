# Error Category: Test Environment Unsatisfied

## Definition

A **Test Environment Unsatisfied** error occurs when:

- The test assumes an external environment condition (E_expected) holds
- But the actual environment condition at runtime is (E_actual)
- E_expected is not satisfied, producing failures (including assertion failures) unrelated to the focal logic

### Abstract Failure Pattern

```
Test assumes environment has  → E_expected (paths, OS, deps, versions, locale)
Actual environment is         → E_actual
---------------------------------------------------------------
Execution outcome             → Different behavior / exception / mismatch
Result                        → Assertion failure
```

## Core Characteristics

- Root cause is outside the focal method’s functional logic
- Often manifests as:
    - file path / permissions / temporary directory issues
    - missing dependency or optional feature not installed
    - version-specific behavior differences
    - OS/locale/timezone differences
- Can be flaky across machines/CI runners

## Typical Signals

- Error changes across environments (local vs CI, Linux vs macOS, py3.10 vs py3.12)
- Failures involve:
    - filesystem paths (/tmp, C:\...)
    - permissions, sandboxing, container restrictions
    - locale/timezone/encoding
    - dependency import errors or feature flags
    - nondeterministic ordering due to platform differences


## Root Cause

The test depends on environmental assumptions (filesystem, dependencies, versions, locale/time) that do not hold in the current execution environment.

## Fix Strategies

1. Make environment dependencies explicit (pin versions, declare extras, lockfiles)
2. Use robust temp directory utilities and avoid hard-coded paths
3. Normalize locale/timezone/encoding in the test (set env vars or fixtures)
4. Skip/xfail tests when required capabilities are missing (with clear reasons)
5. Use hermetic test environments (containers, venvs) in CI

## Example

### Example 1: Temp Path Assumption Breaks

#### Error Type: Test Environment Unsatisfied → Filesystem/Temp Directory

#### Triggering Test:

```python
def test_writes_cache_file():
    cache_path = "/tmp/app_cache.json"   # assumes /tmp exists & writable
    write_cache(cache_path, {"a": 1})
    assert open(cache_path).read() == '{"a": 1}'

```

**Focal Method:**
```python
def write_cache(path, obj):
    with open(path, "w") as f:
        f.write('{"a": 1}')
```

**Failure Reason**: In some sandboxes/Windows runners, /tmp may not exist or is not writable, causing different behavior (exception) or missing file, leading to assertion failures.