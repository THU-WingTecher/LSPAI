#!/bin/bash
set -x
#!/bin/bash

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
# Copy go.mod and go.sum files into TEST_DIR
if [ ! -f "$TARGET_PROJECT_PATH/go.mod" ]; then
    echo "Error: go.mod file not found in target project path."
    exit 1
fi

if [ ! -f "$TARGET_PROJECT_PATH/go.sum" ]; then
    echo "Error: go.sum file not found in target project path."
    exit 1
fi

cp "$TARGET_PROJECT_PATH/go.mod" "$TEST_DIR/"
cp "$TARGET_PROJECT_PATH/go.sum" "$TEST_DIR/"

# Copy all source code files except test files to the current directory
# find "$TARGET_PROJECT_PATH" -type f -name "*.go" ! -name "*_test.go" ! -path "*/results*" | while read -r src; do
#     # Create the target directory structure in the current directory
#     dest="$TEST_DIR/${src#$TARGET_PROJECT_PATH/}" # Remove TARGET_PROJECT_PATH prefix
#     mkdir -p "$(dirname "$dest")"         # Create target directory
#     cp "$src" "$dest"                    # Copy the source file
#     echo "Copied: $src --> $dest"
# done


mkdir -p "$REPORT_DIR"
# Navigate to target project path
cd "$TEST_DIR" || exit 1
# Run the Go command and capture the error log
error_log=$(go test ./... -v 2>&1)

python3 /vscode-llm-ut/go_clean.py "$error_log"
echo "Re Running Test Files"
go test -failfast=false -cover ./... -coverprofile="${REPORT_DIR}/coverage.out"
go tool cover -html="${REPORT_DIR}/coverage.out" -o ${REPORT_DIR}/coverage_report.html
# Extract the total number of statements and covered statements from the coverage.out
# total_statements=$(grep -oP '^\S+' "${REPORT_DIR}/coverage.out" | wc -l)
# covered_statements=$(grep -oP '^\S+ \d+' "${REPORT_DIR}/coverage.out" | wc -l)

# # Calculate coverage percentage
# coverage_percentage=$(go tool cover -func="${REPORT_DIR}/coverage.out" | grep total | awk '{print $3}')

# # Print the results
# echo "Total Statements: $total_statements"
# echo "Covered Statements: $covered_statements"
# echo "Coverage: $coverage_percentage"
