#!/bin/bash

# Check if the required parameters are provided
if [ -z "$1" ]; then
    echo "Error: Target project path is missing."
    echo "Usage: $0 <target_project_path> <test_dir1> [test_dir2 ...]"
    exit 1
fi

if [ -z "$2" ]; then
    echo "Error: At least one test directory is required."
    echo "Usage: $0 <target_project_path> <test_dir1> [test_dir2 ...]"
    exit 1
fi

# Input parameters
TARGET_PROJECT_PATH=$1
shift  # Remove the first argument (target project path)

# Get all test directories
TEST_DIRS=("$@")

# Initialize counters
total_valid_files_count=0
total_files_count=0

# Set total files count based on project type
# if [[ "$TARGET_PROJECT_PATH" == *cli ]]; then
#     total_files_count=150
# elif [[ "$TARGET_PROJECT_PATH" == *csv ]]; then
#     total_files_count=74
# fi
total_files_count=0
# Process each test directory
for test_dir in "${TEST_DIRS[@]}"; do
    # Get the corresponding output directory name
    dir_name=$(basename "$test_dir")
    output_dir="${dir_name}-compiled"
    
    echo "Processing $test_dir"
    echo "============================"
    
    # Initialize counters for this directory
    valid_files_count=0
    
    # Iterate through each .java file in the test directory
    for java_file in $(find "$test_dir" -type f -name "*.java"); do
        # Get the corresponding .class file name
        base_name=$(basename "$java_file" .java)
        class_files=$(find "$output_dir" -type f -name "${base_name}*.class" | wc -l)
        total_files_count=$((total_files_count + 1))
        # Count the .java file if it has corresponding .class files
        if [ "$class_files" -gt 0 ]; then
            valid_files_count=$((valid_files_count + 1))
            total_valid_files_count=$((total_valid_files_count + 1))
        fi
    done
    
    # Calculate the pass rate for this directory
    percentage=$(echo "$valid_files_count $total_files_count" | awk '{ printf "%.2f\n", ($1 / $2) * 100 }')
    
    # Echo the result for this directory
    echo "Total .java files: $total_files_count"
    echo "Files with corresponding .class files: $valid_files_count"
    echo "Pass rate: $percentage%"
    echo "============================"
done

# Calculate and display overall pass rate
overall_percentage=$(echo "$total_valid_files_count $total_files_count" | awk '{ printf "%.2f\n", ($1 / $2) * 100 }')

echo "Overall Results"
echo "============================"
echo "Total .java files: $total_files_count"
echo "Total files with corresponding .class files: $total_valid_files_count"
echo "Overall pass rate: $overall_percentage%"
echo "============================"