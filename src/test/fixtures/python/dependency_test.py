"""Test file for dependency signature finding."""

def dependency_one(value: int, extra: int) -> int:
    """First dependency function."""
    return value + extra

def dependency_two(input: int) -> int:
    """Second dependency function."""
    return dependency_one(input, 2)

def target_function(count: int) -> int:
    """Target function that uses dependencies."""
    intermediate = dependency_two(count)
    return dependency_one(intermediate, count)

