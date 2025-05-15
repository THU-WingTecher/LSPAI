#!/bin/bash
# set -x

# Check if the required parameters are provided
if [ -z "$1" ]; then
    echo "Error: Target project path is missing."
    echo "Usage: $0 <target_project_path> <test_save_dir> [report_dir]"
    exit 1
fi

if [ -z "$2" ]; then
    echo "Error: At least one test directory is required."
    echo "Usage: $0 <target_project_path> <test_dir1> [test_dir2 ...] [report_dir]"
    exit 1
fi

# Input parameters
TARGET_PROJECT_PATH=$1
shift  # Remove the first argument (target project path)

# Get all test directories (all arguments except the last one if it's a report dir)
TEST_DIRS=()
while [ $# -gt 1 ]; do
    TEST_DIRS+=("$1")
    shift
done

# The last argument is either a test directory or report directory
if [ $# -eq 1 ]; then
    if [[ "$1" == *"-report" ]]; then
        REPORT_DIR="$1"
    else
        TEST_DIRS+=("$1")
        # Create default report directory name from all test directories
        REPORT_DIR=$(printf "%s" "${TEST_DIRS[@]}" | tr ' ' '-')"-report"
    fi
else
    # Create default report directory name from all test directories
    REPORT_DIR=$(printf "%s" "${TEST_DIRS[@]}" | tr ' ' '-')"-report"
fi

# Navigate to target project path
cd "$TARGET_PROJECT_PATH" || exit 1

TARGET_DIR_DEPENDENCIES=$(find target/dependency/ -name "*.jar" | tr '\n' ':')
LIB_DIR="/LSPAI/scripts/lib"
LSPAI_DEPENDENCY_LIBS=$(find $LIB_DIR -name "*.jar" | tr '\n' ':')
DEPENDENCY_LIBS=$LSPAI_DEPENDENCY_LIBS:$TARGET_DIR_DEPENDENCIES
COMPILED_SOURCE="target/classes"
# CLASSPATH=$COMPILED_SOURCE:$TEST_DIR:$DEPENDENCY_LIBS
CLASSPATH=$COMPILED_SOURCE
for dir in "${TEST_DIRS[@]}"; do
    CLASSPATH=$CLASSPATH:$dir
done
# TEST_FILES=$(find $TEST_DIR -name "*.java" | tr '\n' ' ')
# Find all test files from all test directories
TEST_FILES=""
for dir in "${TEST_DIRS[@]}"; do
    TEST_FILES="$TEST_FILES $(find $dir -name "*.java" | tr '\n' ' ')"
done
# OUTPUT_DIR="${TEST_DIR}-compiled"  # Default value if not provided
OUTPUT_DIRS=()
for dir in "${TEST_DIRS[@]}"; do
    dir_name=$(basename "$dir")
    output_dir="${dir_name}-compiled"
    OUTPUT_DIRS+=("$output_dir")
    # Create and clean output directory
    rm -rf "$output_dir"
    mkdir -p "$output_dir"
done
JACOCO_AGENT_PATH="$LIB_DIR/jacocoagent.jar"  # Path to jacocoagent.jar
JACOCO_CLI_PATH="$LIB_DIR/jacococli.jar"  # Path to jacocoagent.jar
JUNIT_CONSOLE_PATH="$LIB_DIR/junit-platform-console-standalone-1.8.2.jar"  # Path to jacocoagent.jar

# JACOCO_AGENT_PATH="/LSPAI/experiments/scripts/lib/org.jacoco.agent-0.8.11-runtime.jar"  # Path to jacocoagent.jar
# JACOCO_CLI_PATH="/LSPAI/experiments/scripts/lib/org.jacoco.cli-0.8.11.jar"  # Path to jacocoagent.jar
COVERAGE_FILE="${REPORT_DIR}/coverage.exec"  # Name of the coverage file to store results
# > "$COVERAGE_FILE"

# Step 1: Compile the test files in parallel
echo "Running Command : javac -cp $CLASSPATH $TEST_FILES"
echo "Compiling test files in parallel with GNU parallel..."

# Create the output directory if it doesn't exist, or clear it if it does
rm -rf "$OUTPUT_DIR"
rm -rf "$REPORT_DIR"
mkdir -p "$OUTPUT_DIR"
mkdir -p "$REPORT_DIR"

# Use GNU parallel to compile the files in parallel
# echo "$TEST_FILES" | tr ' ' '\n' | parallel -j 64 javac -cp "$CLASSPATH:$DEPENDENCY_LIBS" -d "$OUTPUT_DIR" {}
for i in "${!TEST_DIRS[@]}"; do
    test_dir="${TEST_DIRS[$i]}"
    output_dir="${OUTPUT_DIRS[$i]}"
    test_files=$(find "$test_dir" -name "*.java" | tr '\n' ' ')
    
    echo "Compiling test files from $test_dir to $output_dir"
    echo "$test_files" | tr ' ' '\n' | parallel -j 64 javac -cp "$CLASSPATH:$DEPENDENCY_LIBS" -d "$output_dir" {}
done
# echo "Compilation completed for all files."

# Step 2: Prepare for coverage measurement using JaCoCo agent
echo "Starting coverage measurement with JaCoCo..."

# PROJECTCP="$COMPILED_SOURCE:$DEPENDENCY_LIBS:$OUTPUT_DIR"
PROJECTCP="$COMPILED_SOURCE:$DEPENDENCY_LIBS"
for dir in "${OUTPUT_DIRS[@]}"; do
    PROJECTCP="$PROJECTCP:$dir"
done
# EXCLUDES_PATTERN="*Test*"  # Exclude test classes based on naming pattern ,excludes="$EXCLUDES_PATTERN" \

java -javaagent:"$JACOCO_AGENT_PATH=destfile=$COVERAGE_FILE" \
     -cp "$PROJECTCP" \
     -jar "$JUNIT_CONSOLE_PATH" \
     --include-classname=.* \
     --class-path "$PROJECTCP" \
     --scan-classpath "$(printf "%s:" "${OUTPUT_DIRS[@]}")"
    #  --scan-classpath "$OUTPUT_DIR" 

echo "Finished running tests for all classes."

# Step 3: Generate the coverage report (optional)
echo "Generating coverage report..."

# Add debug information
echo "Coverage file size: $(ls -lh "$COVERAGE_FILE" | awk '{print $5}')"
echo "Number of class files in target: $(find "$COMPILED_SOURCE" -name "*.class" | wc -l)"
echo "Number of test files: $(find "$OUTPUT_DIR" -name "*.class" | wc -l)"

# Use the JaCoCo CLI tool to generate the report
java -jar $JACOCO_CLI_PATH report $COVERAGE_FILE --classfiles $COMPILED_SOURCE --html $REPORT_DIR

JacocoInterpretScript="/LSPAI/scripts/interpret_jacoco.py"
PassRateScript="/LSPAI/scripts/new_java_passrate.bash "
echo "Printing final result" 
python3 $JacocoInterpretScript "${REPORT_DIR}/index.html"

echo "Printing valid rate"
bash $PassRateScript $TARGET_PROJECT_PATH $1