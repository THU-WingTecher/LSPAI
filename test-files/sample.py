"""
Sample Python file for testing MCP server
"""

def greet(name: str) -> str:
    """Greet someone by name."""
    return f"Hello, {name}!"


def calculate_sum(a: int, b: int) -> int:
    """Calculate the sum of two numbers."""
    return a + b


class Calculator:
    """A simple calculator class."""
    
    def __init__(self):
        self.result = 0
    
    def add(self, value: int) -> int:
        """Add a value to the result."""
        self.result += value
        return self.result
    
    def subtract(self, value: int) -> int:
        """Subtract a value from the result."""
        self.result -= value
        return self.result
    
    def reset(self) -> None:
        """Reset the calculator."""
        self.result = 0


def main():
    """Main function to test the calculator."""
    calc = Calculator()
    calc.add(10)
    calc.add(5)
    print(f"Result: {calc.result}")
    
    message = greet("World")
    print(message)
    
    total = calculate_sum(10, 20)
    print(f"Sum: {total}")


if __name__ == "__main__":
    main()



