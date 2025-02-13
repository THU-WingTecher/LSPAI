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

TARGET_DIR_DEPENDENCIES=$(find target/dependency/ -name "*.jar" | tr '\n' ':')
LSPAI_DEPENDENCY_LIBS=$(find /LSPAI/lib/ -name "*.jar" | tr '\n' ':')
DEPENDENCY_LIBS=$LSPAI_DEPENDENCY_LIBS:$TARGET_DIR_DEPENDENCIES
COMPILED_SOURCE="target/classes"
CLASSPATH=$COMPILED_SOURCE:$TEST_DIR:$DEPENDENCY_LIBS
TEST_FILES=$(find $TEST_DIR -name "*.java" | tr '\n' ' ')
OUTPUT_DIR="${TEST_DIR}-compiled"  # Default value if not provided
JACOCO_AGENT_PATH="/LSPAI/lib/jacocoagent.jar"  # Path to jacocoagent.jar
JACOCO_CLI_PATH="/LSPAI/lib/jacococli.jar"  # Path to jacocoagent.jar
COVERAGE_FILE="${REPORT_DIR}/coverage.exec"  # Name of the coverage file to store results
# > "$COVERAGE_FILE"

# Step 1: Compile the test files in parallel
echo "Running Command : javac -cp $CLASSPATH $TEST_FILES"
echo "Compiling test files in parallel with GNU parallel..."

# Create the output directory if it doesn't exist, or clear it if it does
mkdir -p "$OUTPUT_DIR"
mkdir -p "$REPORT_DIR"

# Use GNU parallel to compile the files in parallel
echo "$TEST_FILES" | tr ' ' '\n' | parallel -j 64 javac -cp "$CLASSPATH:$DEPENDENCY_LIBS" -d "$OUTPUT_DIR" {}

echo "Compilation completed for all files."

# Step 2: Prepare for coverage measurement using JaCoCo agent
echo "Starting coverage measurement with JaCoCo..."

PROJECTCP="$COMPILED_SOURCE:$DEPENDENCY_LIBS:$OUTPUT_DIR"
EXCLUDES_PATTERN="*Test*"  # Exclude test classes based on naming pattern ,excludes="$EXCLUDES_PATTERN" \

java -javaagent:"$JACOCO_AGENT_PATH"=destfile="$COVERAGE_FILE" \
     -cp "$PROJECTCP" \
     org.junit.platform.console.ConsoleLauncher \
     --class-path "$PROJECTCP" \
     --scan-classpath "$OUTPUT_DIR"

echo "Finished running tests for all classes."

# Step 3: Generate the coverage report (optional)
echo "Generating coverage report..."

# Use the JaCoCo CLI tool to generate the report
java -jar $JACOCO_CLI_PATH report $COVERAGE_FILE --classfiles $COMPILED_SOURCE --html $REPORT_DIR

# valid_files_count=$(find "$OUTPUT_DIR" -type f -name "*.class" | wc -l)
# total_files_count=$(find "$TEST_DIR" -type f -name "*.java" | wc -l)
# percentage=$(echo "$valid_files_count $total_files_count" | awk '{ printf "%.2f\n", ($1 / $2) * 100 }')

# echo "Coverage report generated at $REPORT_DIR"

# # Echo the result
# echo "Total files: $total_files_count"
# echo ".java files: $valid_files_count"
# echo "Percentage of $REPORT_DIR java files: $percentage%"