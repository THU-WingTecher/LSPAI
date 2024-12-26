#!/bin/bash
set -x

# Check if the required parameters are provided
if [ -z "$1" ]; then
    echo "Error: Target project path is missing."
    echo "Usage: $0 <target_project_path> <test_save_dir> [report_dir]"
    exit 1
fi

if [ -z "$2" ]; then
    echo "Error: Test file save path is missing."
    echo "Usage: $0 <target_project_path> <test_save_dir> [report_dir]"
    exit 1
fi

# Input parameters
TARGET_PROJECT_PATH=$1
TEST_DIR=$2
REPORT_DIR=${3:-"${TEST_DIR}-report"}  # Default value if not provided

# Navigate to target project path
cd "$TARGET_PROJECT_PATH" || exit 1

# Find all Go test files
TEST_FILES=$(find $TEST_DIR -name "*_test.go" | tr '\n' ' ')
OUTPUT_DIR="${TEST_DIR}-compiled"  # Default value if not provided
COVERAGE_FILE="coverage.out"  # Name of the coverage file to store results

# Step 1: Compile and run the test files
echo "Running Command: go test -coverprofile=$COVERAGE_FILE $TEST_FILES"
echo "Compiling and running test files..."

# Create the output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"
mkdir -p "$REPORT_DIR"

# Use go test to compile and run the tests
go test -coverprofile="$COVERAGE_FILE" $TEST_FILES

# Step 2: Generate the coverage report (optional)
echo "Generating coverage report..."

# Generate an HTML coverage report using go tool cover
go tool cover -html="$COVERAGE_FILE" -o "$REPORT_DIR/coverage.html"

echo "Coverage report generated at $REPORT_DIR/coverage.html"