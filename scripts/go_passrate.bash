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

count_test_files_and_compute_rate() {
    local orig_dir="$1"
    local clean_dir="$2"
    
    # Count test files in the original directory
    local orig_count=$(find "$orig_dir" -type f -name "*_test.go" | wc -l)
    
    # Count test files in the clean directory
    local clean_count=$(find "$clean_dir" -type f -name "*_test.go" | wc -l)
    
    # Calculate the valid rate as a percentage
    local valid_rate=0
    if [ "$orig_count" -gt 0 ]; then
        # Multiply by 100 first to preserve some precision before division
        valid_rate=$((clean_count * 100 / orig_count))
    fi
    
    # Print the results
    echo "Original test files: $orig_count"
    echo "Valid test files (in clean dir): $clean_count"
    echo "Valid rate: ${valid_rate}%"
    
    # Store the results in variables for later use
    TEST_FILES_ORIG_COUNT=$orig_count
    TEST_FILES_CLEAN_COUNT=$clean_count
    TEST_FILES_VALID_RATE=$valid_rate
    
    # Optionally return the valid rate as the function's return code
    if [ "$clean_count" -eq 0 ] && [ "$orig_count" -gt 0 ]; then
        return 1  # Error: no valid test files
    fi
    return 0
}


# Input parameters
TARGET_PROJECT_PATH=$1
TEST_DIR=$2
REPORT_DIR=${3:-"${TEST_DIR}-report"}  # Default value if not provided
CLEAN_DIR=${4:-"${TEST_DIR}-clean"}  # Default value if not provided

go mod tidy

echo "Computing test file validity rate..."
count_test_files_and_compute_rate "$TEST_DIR" "$CLEAN_DIR"
echo "------------------------"

# Store the test file stats in the report file
{
    echo "Test File Statistics"
    echo "-------------------"
    echo "Original test files: $TEST_FILES_ORIG_COUNT"
    echo "Valid test files: $TEST_FILES_CLEAN_COUNT"
    echo "Valid rate: ${TEST_FILES_VALID_RATE}%"
    echo ""
} > "${REPORT_DIR}/test_valid_rate.txt"
