# Error Category: Wrong Mock Instance

## Definition

A **Wrong Mock Instance** error occurs when:

- The test intends to mock/stub dependency D so the focal method uses D_mock
- But the focal method actually calls D_real (or a different instance), because the mock is applied to the wrong symbol, wrong import path, wrong object instance, or wrong timing
- The assertion fails due to unexpected real behavior

### Abstract Failure Pattern

```
Test applies mock to          → D_mock (intended target)
Focal method actually uses    → D_real / D_other (different binding)
---------------------------------------------------------------
Observed behavior             → Unexpected calls/returns
Result                        → Assertion failure

```

## Core Characteristics

- Mocking is present, but not effective
- Often shows up as:
    - “expected mock to be called but was not called”
    - real network/file/db call happens during test
    - returned values don’t match mocked return values

## Typical Signals

- Logs show real dependency executed (HTTP request, filesystem write, DB call)
- Mock assertions fail:
- call count 0 when expected > 0
- called with different args because a different function was patched


## Root Cause

The mock is attached to the wrong object/binding or applied at the wrong time, so the focal method does not use the mocked dependency instance.

## Fix Strategies

1. Patch the usage site (where the dependency is looked up in the focal method’s module)
2. Apply mock before importing/constructing the object that captures the dependency
3. Inject dependencies (DI) instead of instantiating inside the method
4. Verify mock effectiveness early (assert the mock is in place before calling focal method)

## Example

### Example 1: Patching the Wrong Namespace

#### Error Type: Wrong Mock Instance → Wrong Patch Target

#### Triggering Test:

```python
from unittest.mock import patch
from pkg.module_under_test import fetch_user

@patch("pkg.http.get")   # ❌ patches wrong place
def test_fetch_user(mock_get):
    mock_get.return_value.json.return_value = {"id": 1}
    assert fetch_user(1) == {"id": 1}
```

**Focal Method:**
```python
# pkg/module_under_test.py
from pkg.http import get

def fetch_user(uid):
    return get(f"/users/{uid}").json()   # uses local binding "get"

```

**Failure Reason**: The test patches `pkg.http.get`, but fetch_user uses get imported into `pkg.module_under_test.` The mock doesn’t affect the bound symbol, so the real get runs.