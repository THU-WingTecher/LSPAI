#!/bin/bash
# set -x

# Check if the required parameters are provided
if [ -z "$1" ]; then
    echo "Error: Target project path is missing."
    echo "Usage: $0 <target_project_path> <test_save_dir> [report_dir] [timeout_seconds]"
    exit 1
fi

if [ -z "$2" ]; then
    echo "Error: Test file save path is missing."
    echo "Usage: $0 <target_project_path> <test_save_dir> [report_dir] [timeout_seconds]"
    exit 1
fi

# Input parameters
TARGET_PROJECT_PATH=${1}
TEST_DIR="${2}"
REPORT_DIR=${3:-"${TEST_DIR}-report"}  # Default value if not provided
TIMEOUT_SECONDS=${4:-3}  # Default timeout of 3 seconds if not provided

# Clean and create report directory
rm -rf "$REPORT_DIR"
mkdir -p "$REPORT_DIR"

# Per-file logs and assertion summary
LOGS_DIR="$REPORT_DIR/logs"
mkdir -p "$LOGS_DIR"
ASSERTION_ERRORS_LOG="$REPORT_DIR/assertion_errors.log"
: > "$ASSERTION_ERRORS_LOG"

# Create a file to store hanging test files
HANGING_TESTS_FILE="$REPORT_DIR/hanging_tests.txt"
touch "$HANGING_TESTS_FILE"

# Navigate to target project path
cd "$TARGET_PROJECT_PATH" || exit 1
export PYTHONPATH="$TARGET_PROJECT_PATH:$TARGET_PROJECT_PATH/src":"$TARGET_PROJECT_PATH/src/black":"$TARGET_PROJECT_PATH/crawl4ai"
export HANGING_TESTS_FILE
export TIMEOUT_SECONDS

# Create a temporary directory for parallel coverage data
TEMP_COVERAGE_DIR="$REPORT_DIR/temp_coverage"
mkdir -p "$TEMP_COVERAGE_DIR"
export TEMP_COVERAGE_DIR

# Function to run a single test file and handle its coverage
run_test_file() {
    local test_file=$1
    local test_name=$(basename "$test_file")
    local temp_coverage_file="$TEMP_COVERAGE_DIR/${test_name}.coverage"
    local per_file_log="$LOGS_DIR/${test_name%.py}.log"

    : > "$per_file_log"
    echo "Running test file: $test_name (timeout: ${TIMEOUT_SECONDS}s)" >> "$per_file_log"

    # Run the test with timeout and coverage (send all output to per-file log)
    timeout "$TIMEOUT_SECONDS" python3 -m coverage run --data-file="$temp_coverage_file" -m pytest -vv --tb=long "$test_file" >> "$per_file_log" 2>&1
    local exit_code=$?

    # Handle timeout
    if [ $exit_code -eq 124 ]; then
        echo "⚠ Hanging: $test_name (timed out after ${TIMEOUT_SECONDS}s)" >> "$per_file_log"
        echo "$test_file" >> "$HANGING_TESTS_FILE"
        rm -f "$temp_coverage_file"
        echo "124:$temp_coverage_file"
        return
    fi

    # Return the exit code and coverage file path (only line printed to stdout)
    echo "$exit_code:$temp_coverage_file"
}

export -f run_test_file

# Find all test files
test_files=($(find "$TEST_DIR" -type f -name "*_test.py"))
total_files=${#test_files[@]}
passed_files=0
failed_files=0
skipped_files=0
hanging_files=0

echo "Found $total_files test files"
echo "Running tests in parallel with ${TIMEOUT_SECONDS}s timeout..."

# Run tests in parallel using GNU parallel
# Use 75% of available CPU cores
num_cores=$(nproc)
parallel_jobs=$((num_cores * 3 / 4))
echo "Using $parallel_jobs parallel jobs"

# Run tests in parallel and collect results
for result in $(printf '%s\n' "${test_files[@]}" | parallel -j "$parallel_jobs" run_test_file); do
    IFS=':' read -r exit_code coverage_file <<< "$result"
    test_file=$(basename "$coverage_file" .coverage)
    
    case $exit_code in
        0)
            echo "✓ Passed: $test_file"
            ((passed_files++))
            ;;
        1)
            echo "✗ Failed (Assertion): $test_file"
            ((failed_files++))
            echo "$test_file (Assertion Error)" >> "$REPORT_DIR/failed_tests.log"

            # Extract assertion details into a single summary file
            log_path="$LOGS_DIR/${test_file%.py}.log"
            if [ -f "$log_path" ]; then
                fail_section=$(awk 'BEGIN{flag=0} /=+ FAILURES =+/{flag=1; next} /=+ short test summary info =+/{flag=0} flag' "$log_path")
                {
                    echo "===== $test_file ====="
                    if [ -n "$fail_section" ]; then
                        echo "$fail_section"
                    else
                        grep -n -E "AssertionError| assert " -C 3 "$log_path" || echo "(no AssertionError context found; see full log)"
                    fi
                    echo
                } >> "$ASSERTION_ERRORS_LOG"
            fi
            ;;
        124)
            echo "⚠ Hanging: $test_file (timed out)"
            ((hanging_files++))
            # Already logged to HANGING_TESTS_FILE in run_test_file
            ;;
        2|3|4)
            echo "⚠ Skipped (Error): $test_file (Exit code: $exit_code)"
            ((skipped_files++))
            echo "$test_file (Exit code: $exit_code)" >> "$REPORT_DIR/skipped_tests.log"
            # Remove coverage file for skipped tests
            rm -f "$coverage_file"
            ;;
        *)
            echo "⚠ Skipped (Unknown): $test_file (Exit code: $exit_code)"
            ((skipped_files++))
            echo "$test_file (Unknown exit code: $exit_code)" >> "$REPORT_DIR/skipped_tests.log"
            # Remove coverage file for skipped tests
            rm -f "$coverage_file"
            ;;
    esac
done

# Build unified pytest output from per-file logs (stable order)
: > "$REPORT_DIR/pytest_output.log"
for tf in "${test_files[@]}"; do
    tn=$(basename "$tf")
    lp="$LOGS_DIR/${tn%.py}.log"
    if [ -f "$lp" ]; then
        echo "===== $tn =====" >> "$REPORT_DIR/pytest_output.log"
        cat "$lp" >> "$REPORT_DIR/pytest_output.log"
        echo >> "$REPORT_DIR/pytest_output.log"
    fi
done

echo "Test execution completed"
echo "-------------------"
echo "Files: $passed_files passed, $failed_files failed (assertions), $skipped_files skipped (errors), $hanging_files hanging (timeout)"
echo "Failed tests (assertions) logged in: $REPORT_DIR/failed_tests.log"
echo "Skipped tests (errors) logged in: $REPORT_DIR/skipped_tests.log"
echo "Hanging tests logged in: $HANGING_TESTS_FILE"
echo "Full test output in: $REPORT_DIR/pytest_output.log"

# Combine all coverage data files
echo "Combining coverage data..."
COVERAGE_FILE="$REPORT_DIR/.coverage" python3 -m coverage combine "$TEMP_COVERAGE_DIR"/*.coverage

# Generate coverage report based on project type
echo "Generating coverage report..."
if [[ "$TARGET_PROJECT_PATH" == *crawl4ai ]]; then
    TOTAL=377
    python3 -m coverage report --data-file="$REPORT_DIR/.coverage" --include="$TARGET_PROJECT_PATH/crawl4ai/*"
elif [[ "$TARGET_PROJECT_PATH" == *black ]]; then
    TOTAL=440
    python3 -m coverage report --data-file="$REPORT_DIR/.coverage" --include="$TARGET_PROJECT_PATH/src/*"
elif [[ "$TARGET_PROJECT_PATH" == *tornado ]]; then
    python3 -m coverage report --data-file="$REPORT_DIR/.coverage" --include="$TARGET_PROJECT_PATH/tornado/*"
fi

# Clean up temporary coverage files
rm -rf "$TEMP_COVERAGE_DIR"

# Save a summary of the results
{
    echo "Failed tests (assertions) logged in: $REPORT_DIR/failed_tests.log"
    echo "Skipped tests (errors) logged in: $REPORT_DIR/skipped_tests.log"
    echo "Hanging tests logged in: $HANGING_TESTS_FILE"
    echo "Full test output in: $REPORT_DIR/pytest_output.log"
    echo "Assertion errors (with tracebacks) in: $ASSERTION_ERRORS_LOG"
    echo "Coverage Collection Summary"
    echo "========================="
    echo "Total test files: $total_files"
    echo "Passed files: $passed_files"
    echo "Failed files (assertions): $failed_files"
    echo "Skipped files (errors): $skipped_files"
    echo "Hanging files (timeout): $hanging_files"
    echo "Coverage data file: $REPORT_DIR/.coverage"
    echo "Failed tests log: $REPORT_DIR/failed_tests.log"
    echo "Skipped tests log: $REPORT_DIR/skipped_tests.log"
    echo "Hanging tests log: $HANGING_TESTS_FILE"
    echo "Full test output: $REPORT_DIR/pytest_output.log"
} > "$REPORT_DIR/summary.txt"

echo "Coverage collection completed. Summary saved to $REPORT_DIR/summary.txt"
echo "PassRate ((passed files + failed files)/ total files): $((passed_files + failed_files))/$total_files"