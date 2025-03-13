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
OUTPUT_DIR="${TEST_DIR}-compiled"  # Default value if not provided

# Initialize counters
valid_files_count=0
total_files_count=0

if [[ "$TARGET_PROJECT_PATH" == *cli ]]; then
    total_files_count=207
fi
if [[ "$TARGET_PROJECT_PATH" == *csv ]]; then
    total_files_count=140
fi

total_files_count=0
# Iterate through each .java file in the TEST_DIR
for java_file in $(find "$TEST_DIR" -type f -name "*.java"); do
    # Get the corresponding .class file name
    base_name=$(basename "$java_file" .java)
    class_files=$(find "$OUTPUT_DIR" -type f -name "${base_name}*.class" | wc -l)
    
    # Count the .java file if it has corresponding .class files
    if [ "$class_files" -gt 0 ]; then
        valid_files_count=$((valid_files_count + 1))
    fi

    total_files_count=$((total_files_count + 1))
done

# If there are no Java files, avoid division by zero
if [ "$total_files_count" -eq 0 ]; then
    echo "No .java files found in the target directory."
    exit 1
fi

# Calculate the pass rate
percentage=$(echo "$valid_files_count $total_files_count" | awk '{ printf "%.2f\n", ($1 / $2) * 100 }')

# Echo the result
echo "Pass rate for $TEST_DIR"
echo "Total .java files: $total_files_count"
echo "Files with corresponding .class files: $valid_files_count"
echo "Pass rate: $percentage%"