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
COMPILED_SOURCE="$TARGET_PROJECT_PATH/target/classes"
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

# Step 2: Checkout whether there exist assertion error 
echo "Starting coverage measurement with JaCoCo..."

# Step 2: Execute tests from compiled directory and remove failing ones
PROJECTCP="$COMPILED_SOURCE:$DEPENDENCY_LIBS:$OUTPUT_DIR"

# Option A: (keep) Run once for coverage + quick overall check (JUnit parallel)
JUNIT_PARALLELISM=${JUNIT_PARALLELISM:-$(nproc)}
echo "JUnit parallelism: $JUNIT_PARALLELISM"
timeout 120 java -javaagent:"$JACOCO_AGENT_PATH=destfile=$COVERAGE_FILE" \
     -Xmx2g \
     -cp "$PROJECTCP" \
     -jar "$JUNIT_CONSOLE_PATH" \
     --class-path "$PROJECTCP" \
     --scan-classpath "$OUTPUT_DIR" \
     --include-classname='.*(Test|Tests|IT)$' \
     --details=summary \
     --reports-dir "$REPORT_DIR/junit" \
     --config=junit.jupiter.execution.parallel.enabled=true \
     --config=junit.jupiter.execution.parallel.mode.default=concurrent \
     --config=junit.jupiter.execution.parallel.mode.classes.default=concurrent \
     --config=junit.jupiter.execution.parallel.config.strategy=fixed \
     --config=junit.jupiter.execution.parallel.config.fixed.parallelism=$JUNIT_PARALLELISM

echo "Finished running tests for all classes."

# Option B: Per-class run to identify failures and prune compiled tests
# PASSING_LIST="${REPORT_DIR}/passing_tests.txt"
# FAILING_LIST="${REPORT_DIR}/failing_tests.txt"
# > "$PASSING_LIST"; > "$FAILING_LIST"

# RUNTIME_CP="$PROJECTCP"
# mapfile -t TEST_CLASSES < <(find "$OUTPUT_DIR" -name "*Test.class" -o -name "*Tests.class" \
#   | sed -e "s#^$OUTPUT_DIR/##" -e 's#/#.#g' -e 's#\.class$##' | sort)

# for tc in "${TEST_CLASSES[@]}"; do
#     if timeout 60 java -Xmx2g -cp "$RUNTIME_CP" -jar "$JUNIT_CONSOLE_PATH" \
#          --select-class "$tc" --class-path "$RUNTIME_CP" >/dev/null 2>&1; then
#         echo "$tc" >> "$PASSING_LIST"
#     else
#         echo "$tc" >> "$FAILING_LIST"
#         rel="${tc//.//}"
#         base="$OUTPUT_DIR/$rel"
#         # Remove top-level class and its inner classes (e.g., $Nested.class, $1.class)
#         rm -f "$base".class "$base"[$][A-Za-z0-9_]*.class
#     fi
# done

# echo "Kept $(wc -l < "$PASSING_LIST") tests; removed $(wc -l < "$FAILING_LIST") failing tests from $OUTPUT_DIR"

# Step 3: Generate the coverage report (optional)
# echo "Generating coverage report..."

# # Add debug information
# echo "Coverage file size: $(ls -lh "$COVERAGE_FILE" | awk '{print $5}')"
# echo "Number of valid class files in target: $(find "$COMPILED_SOURCE" -name "*.class" | wc -l)"
# # echo "Number of test files: $(find "$OUTPUT_DIR" -name "*.class" | wc -l)"

# # Use the JaCoCo CLI tool to generate the report
# java -jar $JACOCO_CLI_PATH report $COVERAGE_FILE --classfiles $COMPILED_SOURCE --html $REPORT_DIR

# JacocoInterpretScript="/LSPRAG/scripts/interpret_jacoco.py"
# PassRateScript="/LSPRAG/scripts/java_passrate.bash "
# echo "Printing final result" 
# python3 $JacocoInterpretScript "${REPORT_DIR}/index.html"

# echo "Printing valid rate"
# bash $PassRateScript $TARGET_PROJECT_PATH $TEST_DIR

# Parse XML reports: 'failure' => assertion failure; 'error' => non-assertion error
ASSERT_METHODS="${REPORT_DIR}/assertion_failures.txt"
NONASSERT_METHODS="${REPORT_DIR}/non_assertion_failures.txt"
ASSERT_CLASSES="${REPORT_DIR}/assertion_failed_classes.txt"
NONASSERT_CLASSES="${REPORT_DIR}/non_assertion_failed_classes.txt"

python3 - <<'PY' "$REPORT_DIR/junit" "$OUTPUT_DIR" "$ASSERT_METHODS" "$NONASSERT_METHODS" "$ASSERT_CLASSES" "$NONASSERT_CLASSES"
import sys, glob, xml.etree.ElementTree as ET, os
reports_dir, out_dir, af_methods, naf_methods, af_classes, naf_classes = sys.argv[1:]
assert_methods, nonassert_methods = [], []
assert_classes, nonassert_classes = set(), set()

for xml_path in glob.glob(os.path.join(reports_dir, "*.xml")):
    try:
        root = ET.parse(xml_path).getroot()
    except Exception:
        continue
    for tc in root.iter("testcase"):
        cname = tc.get("classname", "")
        mname = tc.get("name", "")
        # JUnit XML semantics: <failure> means assertion failure; <error> means unexpected error
        has_failure = any(child.tag == "failure" for child in tc)
        has_error = any(child.tag == "error" for child in tc)
        if has_failure:
            assert_methods.append(f"{cname}#{mname}")
            assert_classes.add(cname.split('$', 1)[0])
        elif has_error:
            nonassert_methods.append(f"{cname}#{mname}")
            nonassert_classes.add(cname.split('$', 1)[0])

with open(af_methods, "w") as f: f.write("\n".join(sorted(assert_methods)) + ("\n" if assert_methods else ""))
with open(naf_methods, "w") as f: f.write("\n".join(sorted(nonassert_methods)) + ("\n" if nonassert_methods else ""))

def class_to_classfile(c):
    return os.path.join(out_dir, c.replace(".", "/") + ".class")

with open(af_classes, "w") as f: f.write("\n".join(sorted(class_to_classfile(c) for c in assert_classes)) + ("\n" if assert_classes else ""))
with open(naf_classes, "w") as f: f.write("\n".join(sorted(class_to_classfile(c) for c in nonassert_classes)) + ("\n" if nonassert_classes else ""))
PY

echo "Assertion-failed methods listed in: $ASSERT_METHODS"
echo "Non-assertion failed methods listed in: $NONASSERT_METHODS"
echo "Assertion-failed class files listed in: $ASSERT_CLASSES"
echo "Non-assertion failed class files listed in: $NONASSERT_CLASSES"

# Remove only assertion-failed tests (top-level .class and inner classes)
while IFS= read -r cls; do
  [ -z "$cls" ] && continue
  base="${cls%.class}"
  rm -f "$base".class "$base"\$*.class
done < "$ASSERT_CLASSES"

# Prepare Maven test-classes directory with only legal tests
TEST_CLASSES_DIR="$TARGET_PROJECT_PATH/target/test-classes"
echo "TEST_CLASSES_DIR: $TEST_CLASSES_DIR"
rm -rf "$TEST_CLASSES_DIR"
mkdir -p "$TEST_CLASSES_DIR"

# Build exclusion list from assertion and non-assertion failures
declare -a EXCLUDE_BASES=()
if [ -s "$ASSERT_CLASSES" ]; then
  while IFS= read -r p; do [ -n "$p" ] && EXCLUDE_BASES+=("${p%.class}"); done < "$ASSERT_CLASSES"
fi
if [ -s "$NONASSERT_CLASSES" ]; then
  while IFS= read -r p; do [ -n "$p" ] && EXCLUDE_BASES+=("${p%.class}"); done < "$NONASSERT_CLASSES"
fi

copied_count=0
while IFS= read -r -d '' cf; do
  base="${cf%.class}"
  skip=0
  for ex in "${EXCLUDE_BASES[@]}"; do
    if [[ "$cf" == "$ex.class" || "$cf" == "$ex"\$*.class ]]; then
      skip=1; break
    fi
  done
  if [ $skip -eq 1 ]; then continue; fi
  rel="${cf#"$OUTPUT_DIR/"}"
  mkdir -p "$TEST_CLASSES_DIR/$(dirname "$rel")"
  cp -f "$cf" "$TEST_CLASSES_DIR/$rel"
  copied_count=$((copied_count+1))
done < <(find "$OUTPUT_DIR" -name "*.class" -print0)
echo "Copied $copied_count legal .class files into $TEST_CLASSES_DIR"

# Step 3: Run PIT using tests under the compiled directory
echo "Preparing PIT test includes from $OUTPUT_DIR ..."
mapfile -t PIT_TEST_CLASSES < <(find "$OUTPUT_DIR" -name "*Test.class" -o -name "*Tests.class" -o -name "*IT.class" \
  | sed -e "s#^$OUTPUT_DIR/##" -e 's#/#.#g' -e 's#\.class$##' | sort -u)

if [ ${#PIT_TEST_CLASSES[@]} -eq 0 ]; then
  echo "No compiled tests found for PIT under $OUTPUT_DIR. Skipping PIT."
else
  INCLUDE_TESTS="$(IFS=, ; echo "${PIT_TEST_CLASSES[*]}")"
  PIT_VERSION="${PIT_VERSION:-1.15.8}"
  TARGET_CLASSES_PATTERN="${TARGET_CLASSES_PATTERN:-org.apache.commons.csv.*}"
  PIT_REPORT_DIR="$REPORT_DIR/pit"
  rm -rf "$PIT_REPORT_DIR"
  mkdir -p "$PIT_REPORT_DIR"

  echo "Running PIT for $(echo "$INCLUDE_TESTS" | tr ',' '\n' | wc -l) tests..."
  echo "PIT target tests:"; echo "$INCLUDE_TESTS" | tr ',' '\n' | sed 's/^/  - /'
  PIT_THREADS=${PIT_THREADS:-$(nproc)}
  echo "PIT threads: $PIT_THREADS"
  timeout 900 mvn -T1C org.pitest:pitest-maven:${PIT_VERSION}:mutationCoverage \
      -DtestPlugin=junit5 \
      -Dpitest.junit5PluginVersion=1.2.0 \
      -DadditionalClasspath="$OUTPUT_DIR:$TEST_CLASSES_DIR:$COMPILED_SOURCE:$DEPENDENCY_LIBS:$JUNIT_CONSOLE_PATH" \
      -DtargetClasses="$TARGET_CLASSES_PATTERN" \
      -DtargetTests="$INCLUDE_TESTS" \
      -DreportsDirectory="$PIT_REPORT_DIR" \
      -Dthreads=$PIT_THREADS \
      -Dverbose=true | cat
  rc=$?
  echo "PIT exit code: $rc"
  if [ -f "$PIT_REPORT_DIR/index.html" ]; then
    echo "PIT report: $PIT_REPORT_DIR/index.html"
  else
    echo "PIT report missing at $PIT_REPORT_DIR. Check logs above for configuration issues."
  fi
fi