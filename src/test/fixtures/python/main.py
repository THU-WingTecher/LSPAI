"""Main entry point that uses calculator."""

from calculator import Calculator

def main():
    """Main function."""
    calc = Calculator()
    result1 = calc.compute("add", 5, 3)
    result2 = calc.compute("multiply", 4, 7)
    result3 = calc.sum_list([1, 2, 3, 4, 5])
    print(f"Add result: {result1}")
    print(f"Multiply result: {result2}")
    print(f"Sum list result: {result3}")

if __name__ == "__main__":
    main()

