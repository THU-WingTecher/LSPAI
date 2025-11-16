"""Math utility functions for testing LSP features."""

def add(a: int, b: int) -> int:
    """Add two numbers."""
    return a + b

def multiply(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b

def calculate_sum(numbers: list[int]) -> int:
    """Calculate sum of a list of numbers."""
    total = 0
    for num in numbers:
        total = add(total, num)
    return total

