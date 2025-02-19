#!/bin/bash
# set -x
#!/bin/bash
# overall statements : 588(go test -cover -coverprofile=cov.out, /LSPAI/experiments/logrus# python3 /LSPAI/interpret_go_out.py cov.out)
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
# find "$TARGET_PROJECT_PATH" -type f -name "*.go" ! -name "*_test.go" ! -path "*/results*" ! -path "*/tests*" | while read -r src; do
#     # Create the target directory structure in the current directory
#     dest="$TEST_DIR/${src#$TARGET_PROJECT_PATH/}" # Remove TARGET_PROJECT_PATH prefix
#     mkdir -p "$(dirname "$dest")"         # Create target directory
#     cp "$src" "$dest"                    # Copy the source file
#     echo "Copied: $src --> $dest"
# done


mkdir -p "$REPORT_DIR"
# Navigate to target project path
cd "$TEST_DIR" || exit 1
go mod tidy
# Run the Go command and capture the error log
# error_log=$(go test ./... -v 2>&1)

# python3 /LSPAI/go_clean.py "$error_log"
# echo "Re Running Test Files"
COVERAGE_REPORT=${REPORT_DIR}/coverage.out
echo "" > $COVERAGE_REPORT

if [[ "$TARGET_PROJECT_PATH" == *cobra ]]; then
    go test ./... \
        -coverpkg=github.com/spf13/cobra,github.com/spf13/cobra/doc \
        -coverprofile=${COVERAGE_REPORT} \
        -covermode=atomic || true
    exit 0
fi

if [[ "$TARGET_PROJECT_PATH" == *logrus ]]; then

# go test ./... github.com/sirupsen/logrus     -cover     -coverprofile=coverage.out     -covermode=atomic || true

    find -name '*_test.go' | while read -r TEST_FILE; do
        # Get the directory of the test file
        DIR=$(dirname "$TEST_FILE")
        # Run the test with coverage
        echo "Running coverage of $TEST_FILE"
        # go test ./... -coverprofile=${REPORT_DIR}/coverage.out -run $TEST_FILE > test_output.log 2>&1
        go test -coverprofile=${REPORT_DIR}/coverage.out -run $TEST_FILE > test_output.log 2>&1
        cat ${REPORT_DIR}/coverage.out
        # Check if coverage.out was generated
        if [ -f ${REPORT_DIR}/coverage.out ]; then
            COVERAGE=$(go tool cover -func=${REPORT_DIR}/coverage.out | tail -n 1)

        fi
    done
    python3 /LSPAI/experiments/scripts/interpret_go_out.py ${REPORT_DIR}/coverage.out

fi

# cat coverage.out
# # go test ./... -failfast=false -v -cover -coverprofile="${REPORT_DIR}/coverage.out"
# # go tool cover -html="${REPORT_DIR}/coverage.out" -o ${REPORT_DIR}/coverage_report.html
# python3 /LSPAI/experiments/scripts/interpret_go_out.py coverage.out

# Extract the total number of statements and covered statements from the coverage.out
# total_statements=$(grep -oP '^\S+' "${REPORT_DIR}/coverage.out" | wc -l)
# covered_statements=$(grep -oP '^\S+ \d+' "${REPORT_DIR}/coverage.out" | wc -l)

# # Calculate coverage percentage
# coverage_percentage=$(go tool cover -func="${REPORT_DIR}/coverage.out" | grep total | awk '{print $3}')

# # Print the results
# echo "Total Statements: $total_statements"
# echo "Covered Statements: $covered_statements"
# echo "Coverage: $coverage_percentage"
