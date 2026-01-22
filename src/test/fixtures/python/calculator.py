"""Calculator module that uses math_utils functions."""

import random as _random
from math_utils import add, multiply, calculate_sum

def logger(func):
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__} with args: {args}, kwargs: {kwargs}")
        return func(*args, **kwargs)
    return wrapper

class Calculator:
    """A simple calculator class."""
    
    def __init__(self):
        self.result = 0
    
    def compute(self, operation: str, a: int, b: int) -> int:
        """Perform a computation using math_utils functions."""
        if operation == "add":
            self.result = add(a, b)
        elif operation == "multiply":
            self.result = multiply(a, b)
        return self.result
    
    def sum_list(self, numbers: list[int]) -> int:
        """Sum a list of numbers."""
        return calculate_sum(numbers)


RANDOM_OFFSET: int = 3

def math_random(a: int, b: int) -> int:
    """Return a pseudo-random number in [a, b] with a fixed offset.

    This function intentionally calls into both stdlib and local helpers so LSP-based
    analysis (definition tree + invoked signature extraction) has useful targets.
    """
    return add(_random.randint(a, b), RANDOM_OFFSET)

