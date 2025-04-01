#!/usr/bin/env python3

import sys

def analyze_coverage(file_path):
    # Dictionary to store coverage info: {line_info: was_covered}
    coverage_map = {}

    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()

        if not lines:
            print(f"The file {file_path} is empty.")
            return

        # Skip the mode line
        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if len(parts) != 3:
                print(f"Skipping malformed line: {line}")
                continue

            line_info, num_statements_str, count_str = parts

            try:
                count = int(count_str)
                # If this line was ever covered (count > 0), mark it as covered
                if line_info in coverage_map:
                    coverage_map[line_info] = coverage_map[line_info] or (count > 0)
                else:
                    coverage_map[line_info] = (count > 0)
            except ValueError:
                print(f"Skipping line with invalid numbers: {line}")
                continue

        # Calculate final coverage
        total_statements = len(coverage_map)
        covered_statements = sum(1 for covered in coverage_map.values() if covered)

        if total_statements == 0:
            coverage_percentage = 0.0
        else:
            coverage_percentage = (covered_statements / total_statements) * 100

        print(f"Total Statements: {total_statements}")
        print(f"Covered Statements: {covered_statements}")
        print(f"Coverage Percentage: {coverage_percentage:.2f}%")

        # Optionally write deduplicated coverage file
        with open(file_path + '.dedup', 'w') as f:
            f.write("mode: atomic\n")
            for line_info, covered in coverage_map.items():
                f.write(f"{line_info} 1 {1 if covered else 0}\n")

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