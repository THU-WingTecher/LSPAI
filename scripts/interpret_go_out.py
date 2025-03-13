#!/usr/bin/env python3

import sys

def analyze_coverage(file_path):
    total_statements = 0
    covered_statements = 0

    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()

        if not lines:
            print(f"The file {file_path} is empty.")
            return

        # The first line is the mode (e.g., "mode: set"), skip it
        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue  # Skip empty lines

            # Split the line into parts
            # Format: package/file.go:start_line.start_col,end_line.end_col num_statements count
            parts = line.split()
            if len(parts) != 3:
                print(f"Skipping malformed line: {line}")
                continue

            _, num_statements_str, count_str = parts

            try:
                num_statements = int(num_statements_str)
                count = int(count_str)
            except ValueError:
                print(f"Skipping line with invalid numbers: {line}")
                continue

            total_statements += num_statements
            if count > 0:
                covered_statements += num_statements

        if total_statements == 0:
            coverage_percentage = 0.0
        else:
            coverage_percentage = (covered_statements / total_statements) * 100

        print(f"Total Statements: {total_statements}")
        print(f"Covered Statements: {covered_statements}")
        print(f"Coverage Percentage: {coverage_percentage:.2f}%")

    except FileNotFoundError:
        print(f"Error: The file {file_path} does not exist.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 analyze_coverage.py <path_to_coverage.out>")
        sys.exit(1)

    coverage_file = sys.argv[1]
    analyze_coverage(coverage_file)

if __name__ == "__main__":
    main()
