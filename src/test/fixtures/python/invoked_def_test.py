"""Fixture for invoked symbol definition extraction."""

DEFAULT_MULTIPLIER: int = 2


class ScaleHelper:
    def __init__(self, factor: int = DEFAULT_MULTIPLIER) -> None:
        self.factor = factor

    def scale(self, value: int) -> int:
        return value * self.factor


def add_offset(value: int, offset: int) -> int:
    return value + offset


def compute_total(base: int) -> int:
    helper = ScaleHelper()
    scaled = helper.scale(base)
    return add_offset(scaled, DEFAULT_MULTIPLIER)
