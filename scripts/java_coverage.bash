#!/bin/bash
# set -x

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
LIB_DIR="/LSPRAG/scripts/lib"
LSPRAG_DEPENDENCY_LIBS=$(find $LIB_DIR -name "*.jar" | tr '\n' ':')
DEPENDENCY_LIBS=$LSPRAG_DEPENDENCY_LIBS:$TARGET_DIR_DEPENDENCIES
COMPILED_SOURCE="target/classes"
CLASSPATH=$COMPILED_SOURCE:$TEST_DIR:$DEPENDENCY_LIBS
echo "DEPENDENCY_LIBS: $DEPENDENCY_LIBS"
TEST_FILES=$(find $TEST_DIR -name "*.java" | tr '\n' ' ')
OUTPUT_DIR="${TEST_DIR}-compiled"  # Default value if not provided
JACOCO_AGENT_PATH="$LIB_DIR/jacocoagent.jar"  # Path to jacocoagent.jar
JACOCO_CLI_PATH="$LIB_DIR/jacococli.jar"  # Path to jacocoagent.jar
JUNIT_CONSOLE_PATH="$LIB_DIR/junit-platform-console-standalone-1.8.2.jar"  # Path to jacocoagent.jar

# JACOCO_AGENT_PATH="/LSPRAG/experiments/scripts/lib/org.jacoco.agent-0.8.11-runtime.jar"  # Path to jacocoagent.jar
# JACOCO_CLI_PATH="/LSPRAG/experiments/scripts/lib/org.jacoco.cli-0.8.11.jar"  # Path to jacocoagent.jar
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
echo "$TEST_FILES" | tr ' ' '\n' | parallel -j 64 javac -cp "$CLASSPATH:$DEPENDENCY_LIBS" -d "$OUTPUT_DIR" {}

# echo "Compilation completed for all files."

# Step 2: Prepare for coverage measurement using JaCoCo agent
echo "Starting coverage measurement with JaCoCo..."

PROJECTCP="$COMPILED_SOURCE:$DEPENDENCY_LIBS:$OUTPUT_DIR"
# EXCLUDES_PATTERN="*Test*"  # Exclude test classes based on naming pattern ,excludes="$EXCLUDES_PATTERN" \

timeout 60 java -javaagent:"$JACOCO_AGENT_PATH=destfile=$COVERAGE_FILE" \
     -Xmx2g \
     -cp "$PROJECTCP" \
     -jar "$JUNIT_CONSOLE_PATH" \
     --include-classname=.* \
     --class-path "$PROJECTCP" \
     --scan-classpath "$OUTPUT_DIR"

echo "Finished running tests for all classes."

# Step 3: Generate the coverage report (optional)
echo "Generating coverage report..."

# Add debug information
echo "Coverage file size: $(ls -lh "$COVERAGE_FILE" | awk '{print $5}')"
echo "Number of valid class files in target: $(find "$COMPILED_SOURCE" -name "*.class" | wc -l)"
# echo "Number of test files: $(find "$OUTPUT_DIR" -name "*.class" | wc -l)"

# Use the JaCoCo CLI tool to generate the report
java -jar $JACOCO_CLI_PATH report $COVERAGE_FILE --classfiles $COMPILED_SOURCE --html $REPORT_DIR

JacocoInterpretScript="/LSPRAG/scripts/interpret_jacoco.py"
PassRateScript="/LSPRAG/scripts/java_passrate.bash "
echo "Printing final result" 
python3 $JacocoInterpretScript "${REPORT_DIR}/index.html"

echo "Printing valid rate"
bash $PassRateScript $TARGET_PROJECT_PATH $TEST_DIR