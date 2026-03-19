"""Fixture for callsite-conditioned invoked context extraction."""


def normalize_alpha(seed: int) -> int:
    return max(seed, 1)


def normalize_beta(seed: int) -> int:
    return max(seed, 0)


def compute_alpha(value: int) -> int:
    if value < 0:
        return 0
    normalized = normalize_alpha(value)
    return normalized * 2


def compute_beta(value: int) -> int:
    normalized = normalize_beta(value)
    return normalized * 3


def render_value(raw: int) -> int:
    if raw % 2 == 0:
        return compute_alpha(raw)
    return compute_beta(raw)
