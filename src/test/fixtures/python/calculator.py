"""Calculator module that uses math_utils functions."""

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

