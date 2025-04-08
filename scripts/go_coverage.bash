#!/bin/bash
# set -x

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
export TARGET_PROJECT_PATH
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
total_files=$(find "$TEST_DIR" -type f -name "*_test.go" | wc -l)

if [[ "$TARGET_PROJECT_PATH" == *logrus ]]; then
    echo "Collecting coverage data for logrus..."
    covepackage="github.com/sirupsen/logrus"
    covepackage1="github.com/sirupsen/logrus"
    cycleDetect='/^import[[:space:]]*(/,/)/{/github\.com\/sirupsen\/logrus/d}'
elif [[ "$TARGET_PROJECT_PATH" == *cobra ]]; then
    echo "Collecting coverage data for cobra..."
    covepackage="github.com/spf13/cobra,github.com/spf13/cobra/doc"
    covepackage1="github.com/spf13/cobra"
    cycleDetect='/^import[[:space:]]*(/,/)/{/github\.com\/spf13\/cobra/d}'
else
    echo "Not supported project"
    exit 1
fi

remove_cycle_import() {
    local file="$1"
    # local TARGET_PROJECT_PATH="$2"
    local package_to_remove=""
    local sed_pattern=""
    
    # Determine which package to remove based on the file path
    if [[ "$TARGET_PROJECT_PATH" == *logrus ]]; then
        package_to_remove="github.com/sirupsen/logrus"
        sed_pattern='/^import[[:space:]]*(/,/)/{/github\.com\/sirupsen\/logrus/d}'
    elif [[ "$TARGET_PROJECT_PATH" == *cobra ]]; then
        package_to_remove="github.com/spf13/cobra"
        sed_pattern='/^import[[:space:]]*(/,/)/{/github\.com\/spf13\/cobra/d}'
    else
        echo "ERROR: Unknown project type"
        return 1
    fi
    
    echo "DEBUG: Processing $file for $package_to_remove"
    
    if grep -q "$package_to_remove" "$file"; then
        echo "Found import to remove in: $file"
        cp "$file" "${file}.bak"
        sed -i "$sed_pattern" "$file"
        
        if ! cmp -s "$file" "${file}.bak"; then
            echo "Successfully removed import from: $file"
            echo "Before:"
            cat "${file}.bak"
            echo "After:"
            cat "$file"
        fi
        rm "${file}.bak"
    fi
}

export -f remove_cycle_import


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
            new_name="${filename%.*}_${counter}.${filename##*.}"
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

# Check if CLEAN_DIR exists and has contents before removing
if [ -d "$CLEAN_DIR" ] && [ "$(ls -A "$CLEAN_DIR")" ]; then
    rm -r "$CLEAN_DIR"/*
fi

# Navigate to target project path
export GOPROXY=direct,https://proxy.golang.org
# Optional: disable Go modules checksum database
# export GOSUMDB=off
cp -r $TEST_DIR/* "$CLEAN_DIR/"
cd "$CLEAN_DIR" || exit 1
if [ ! "$(find . -name '*.go')" ]; then
    echo "Error: No Go files found in the test directory"
    exit 1
fi

# Check and fix case-sensitive collisions
# fix_case_sensitive_collisions .
# while [ $? -ne 0 ]; do
#     echo "Fixed some case-sensitive collisions, checking again..."
#     fix_case_sensitive_collisions .
# done

## Cycle Error Auto Fix ##

find . -type f -name '*_test.go' -exec bash -c 'remove_cycle_import "$0"' {} \;
## Cycle Error Auto Fix ##

# Run tests repeatedly until there are no errors
max_attempts=100  # Add a maximum number of attempts to prevent infinite loops
attempt=1
go mod tidy


while true; do
    error_log=$(go test ./... -v 2>&1)
    python3 "$SCRIPT_PATH" "$error_log"
    if [ $? -eq 0 ]; then
        echo "Files were removed"
        deleted=true
        # Do something when files were removed
    else
        echo "No files were removed"
        deleted=false
        # Do something when no files were removed
    fi

    echo "$error_log"
    # Check if error_log is empty or contains no errors
    # if [[ -z "$error_log" ]] || ! echo "$error_log" | grep -q "Error\|panic\|build failed\|setup failed"; then
    if [[ -z "$error_log" ]] || ! echo "$error_log" | grep -q "build failed\|setup failed"; then
        if ! $deleted; then
            echo "Tests passed successfully on attempt $attempt"
            echo "Error log: $error_log"
            break
        fi
    fi
    
    # Check if maximum attempts reached
    if [ $attempt -ge $max_attempts ]; then
        echo "Maximum attempts ($max_attempts) reached. Some tests are still failing."
        break
    fi
    
    echo "Attempt $attempt : still have errored scripts, keep cleaning and retrying..."
    ((attempt++))
    sleep 1  # Add a small delay between attempts
done

go mod tidy


# Create coverage output file with header
echo "mode: atomic" > coverage.tmp

# Initialize counters
passed_files=0
total_funcs=0
passed_funcs=0

# Checking whether /temp directory exist


for testfile in *_test.go; do
    echo "Processing test file: $testfile"
    # Initialize file-level success tracking
    file_all_passed=true
    file_func_count=0
    
    # Extract all test function names from the file
    while read -r funcname; do
        if [ ! -z "$funcname" ]; then
            ((total_funcs++))
            ((file_func_count++))
            echo "Running test function: $funcname"
            # Run single test function and collect coverage
            if go test -cover \
                -coverpkg="$covepackage" \
                -coverprofile=profile.out \
                -covermode=atomic \
                -run="^${funcname}$"; then
                # Test passed
                ((passed_funcs++))
            else
                # Test failed
                file_all_passed=false
            fi

            # Append coverage data if profile was generated
            if [ -f profile.out ]; then
                tail -n +2 profile.out >> coverage.tmp
                rm profile.out
            fi
        fi
    done < <(grep "^func Test" "$testfile" | sed 's/^func \([Test][^ (]*\).*/\1/')
    
    # If all functions in file passed, increment passed_files counter
    if [ "$file_all_passed" = true ] && [ "$file_func_count" -gt 0 ]; then
        ((passed_files++))
    fi
done

mv coverage.tmp "${REPORT_DIR}/coverage.out"

# Calculate success rates
file_success_rate=$(awk "BEGIN {printf \"%.2f\", ($passed_files / $total_files) * 100}")
func_success_rate=$(awk "BEGIN {printf \"%.2f\", ($passed_funcs / $total_funcs) * 100}")

# Print results
echo "Test Results Summary:"
echo "-------------------"
echo "Files: $passed_files/$total_files passed ($file_success_rate%)"
echo "Functions: $passed_funcs/$total_funcs passed ($func_success_rate%)"
echo "-------------------"

echo "-------------------"

echo "Coverage Report: ${REPORT_DIR}/coverage.out"
python3 /LSPAI/scripts/interpret_go_out.py ${REPORT_DIR}/coverage.out
echo "-------------------"