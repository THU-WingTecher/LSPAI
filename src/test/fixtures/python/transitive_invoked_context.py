"""Fixture for transitive invoked context extraction."""


def normalize_seed(seed: int) -> int:
    return max(seed, 1)


def compute_bucket(value: int) -> int:
    normalized = normalize_seed(value)
    return normalized * 3


def render_score(raw: int) -> int:
    return compute_bucket(raw)
