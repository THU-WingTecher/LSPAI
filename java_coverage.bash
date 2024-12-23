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

EVOSUITE_JAR="/vscode-llm-ut/libs/evosuite-master-1.2.1-SNAPSHOT.jar"
EVOSUITE="java -jar $EVOSUITE_JAR"
# Navigate to target project path
cd "$TARGET_PROJECT_PATH" || exit 1

DEPENDENCY_LIBS=$(find /vscode-llm-ut/libs/ -name "*.jar" | tr '\n' ':')
COMPILED_SOURCE="target/classes"
CLASSPATH=$COMPILED_SOURCE:$TEST_DIR
TEST_FILES=$(find $TEST_DIR -name "*.java" | tr '\n' ' ')
OUTPUT_DIR="${TEST_DIR}-compiled"  # Default value if not provided
JACOCO_AGENT_PATH="/vscode-llm-ut/lib/jacocoagent.jar"  # Path to jacocoagent.jar
JACOCO_CLI_PATH="/vscode-llm-ut/lib/jacococli.jar"  # Path to jacocoagent.jar
COVERAGE_FILE="coverage.exec"  # Name of the coverage file to store results
> "$COVERAGE_FILE"

# Step 1: Compile the test files in parallel
echo "Running Command : javac -cp $CLASSPATH $TEST_FILES"
echo "Compiling test files in parallel with GNU parallel..."

# Create the output directory if it doesn't exist, or clear it if it does
mkdir -p "$OUTPUT_DIR"

# Use GNU parallel to compile the files in parallel
echo "$TEST_FILES" | tr ' ' '\n' | parallel -j 64 javac -cp "$CLASSPATH:$DEPENDENCY_LIBS" -d "$OUTPUT_DIR" {}

echo "Compilation completed for all files."

# Step 2: Prepare for coverage measurement using JaCoCo agent
echo "Starting coverage measurement with JaCoCo..."

PROJECTCP="$COMPILED_SOURCE:$DEPENDENCY_LIBS:$OUTPUT_DIR"
EXCLUDES_PATTERN="*Test*"  # Exclude test classes based on naming pattern ,excludes="$EXCLUDES_PATTERN" \

# Find and run tests for all classes in the output directory
find "$OUTPUT_DIR" -name "*.class" ! -name "*_scaffolding*" | \
    sed "s|$OUTPUT_DIR/||; s|/|.|g; s|\.class$||" | sort | uniq | \
    xargs -I {} -P 8 \
    java -javaagent:"$JACOCO_AGENT_PATH"=destfile="$COVERAGE_FILE"\ 
         -cp "$PROJECTCP" \
         org.junit.platform.console.ConsoleLauncher \
         --class-path "$PROJECTCP" \
         --select-class {}

echo "Finished running tests for all classes."

# Step 3: Generate the coverage report (optional)
echo "Generating coverage report..."

# Use the JaCoCo CLI tool to generate the report
java -jar $JACOCO_CLI_PATH report $COVERAGE_FILE --classfiles $OUTPUT_DIR --html $REPORT_DIR

echo "Coverage report generated at $REPORT_DIR"