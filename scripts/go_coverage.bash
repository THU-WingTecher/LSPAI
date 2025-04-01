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

fix_case_sensitive_collisions() {
    local dir="$1"
    local collisions=0
    
    # Create an associative array to store lowercase names
    declare -A filename_map
    
    # First pass: detect collisions
    while IFS= read -r -d '' file; do
        filename=$(basename "$file")
        lowercase_name=$(echo "$filename" | tr '[:upper:]' '[:lower:]')
        
        if [ "${filename_map[$lowercase_name]+_}" ]; then
            echo "Found collision: $filename and ${filename_map[$lowercase_name]}"
            collisions=1
            
            # Rename the current file by adding a numeric suffix
            counter=1
            new_name="${filename%.*}_${counter}${filename##*.}"
            while [ -f "$(dirname "$file")/$new_name" ]; do
                ((counter++))
                new_name="${filename%.*}_${counter}.${filename##*.}"
            done
            
            echo "Renaming $filename to $new_name"
            mv "$file" "$(dirname "$file")/$new_name"
        else
            filename_map[$lowercase_name]=$filename
        fi
    done < <(find "$dir" -type f -name "*_test.go" -print0)
    
    return $collisions
}

# Input parameters
TARGET_PROJECT_PATH=$1
TEST_DIR=$2
REPORT_DIR=${3:-"${TEST_DIR}-report"}  # Default value if not provided
CLEAN_DIR=${4:-"${TEST_DIR}-clean"}  # Default value if not provided
SCRIPT_PATH="/LSPAI/scripts/go_clean.py"
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

# Create report directory
mkdir -p "$REPORT_DIR"

# Create clean directory
mkdir -p "$CLEAN_DIR"
rm -r "$CLEAN_DIR"/*

# Navigate to target project path
export GOPROXY=direct,https://proxy.golang.org
# Optional: disable Go modules checksum database
export GOSUMDB=off
cp -r $TEST_DIR/* "$CLEAN_DIR/"
cd "$CLEAN_DIR" || exit 1
if [ ! "$(find . -name '*.go')" ]; then
    echo "Error: No Go files found in the test directory"
    exit 1
fi

# Check and fix case-sensitive collisions
fix_case_sensitive_collisions .
while [ $? -ne 0 ]; do
    echo "Fixed some case-sensitive collisions, checking again..."
    fix_case_sensitive_collisions .
done

go mod tidy

# Run tests repeatedly until there are no errors
max_attempts=50  # Add a maximum number of attempts to prevent infinite loops
attempt=1

while true; do
    error_log=$(go test ./... -v 2>&1)
    python3 "$SCRIPT_PATH" "$error_log"
    echo "$error_log"
    # Check if error_log is empty or contains no errors
    if [[ -z "$error_log" ]] || ! echo "$error_log" | grep -q "FAIL\|panic\|error"; then
        echo "Tests passed successfully on attempt $attempt"
        break
    fi
    
    # Check if maximum attempts reached
    if [ $attempt -ge $max_attempts ]; then
        echo "Maximum attempts ($max_attempts) reached. Some tests are still failing."
        break
    fi
    
    echo "Attempt $attempt failed, retrying..."
    ((attempt++))
    sleep 1  # Add a small delay between attempts
done
# echo "Re Running Test Files"
# COVERAGE_REPORT=${REPORT_DIR}/coverage.out
# echo "" > $COVERAGE_REPORT

# if [[ "$TARGET_PROJECT_PATH" == *cobra ]]; then
#     go test ./... \
#         -coverpkg=github.com/spf13/cobra,github.com/spf13/cobra/doc \
#         -coverprofile=${COVERAGE_REPORT} \
#         -covermode=atomic || true
#     exit 0
# fi

    # go test -v ./...

# if [[ "$TARGET_PROJECT_PATH" == *logrus ]]; then

#     echo "Collecting coverage data for logrus..."
    
#     # Define coverage output file
#     COVERAGE_FILE="${REPORT_DIR}/coverage.out"
    
#     # Run tests with coverage
#     if go test ./... -cover -coverprofile="${COVERAGE_FILE}" -covermode=atomic; then
#         echo "Coverage data collected successfully"
#     else
#         echo "Warning: Coverage collection completed with some errors"
#     fi
    
#     # Generate HTML report for easier viewing (optional)
#     if [ -f "${COVERAGE_FILE}" ]; then
#         go tool cover -html="${COVERAGE_FILE}" -o "${REPORT_DIR}/coverage.html"
        
#         # Display coverage summary
#         echo "Coverage summary:"
#         go tool cover -func="${COVERAGE_FILE}" | tail -n 1
#     else
#         echo "Error: Coverage file was not generated"
#     fi
# fi

if [[ "$TARGET_PROJECT_PATH" == *logrus ]]; then

    # go test ./... github.com/sirupsen/logrus     -cover     -coverprofile=coverage.out     -covermode=atomic || true

    find -name '*_test.go' | while read -r TEST_FILE; do
        # Get the directory of the test file
        DIR=$(dirname "$TEST_FILE")
        # Run the test with coverage
        echo "Running coverage of $TEST_FILE"
        # go test ./... -coverprofile=${REPORT_DIR}/coverage.out -run $TEST_FILE > test_output.log 2>&1
        go test -covermode=count -coverprofile=${REPORT_DIR}/coverage.out -run $TEST_FILE > test_output.log 2>&1
        cat ${REPORT_DIR}/coverage.out
        # Check if coverage.out was generated
        if [ -f ${REPORT_DIR}/coverage.out ]; then
            COVERAGE=$(go tool cover -func=${REPORT_DIR}/coverage.out | tail -n 1)

        fi
    # done
#     # python3 /LSPAI/experiments/scripts/interpret_go_out.py ${REPORT_DIR}/coverage.out
# fi

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
# Add this function near the start of the script, before the main logic
