# count the test files of TEST_DIR
# list overall number of symbols
# cobra = 153, logrus = 140, 5
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

if [[ "$TARGET_PROJECT_PATH" == *cobra ]]; then
    TOTAL=153
fi
if [[ "$TARGET_PROJECT_PATH" == *logrus ]]; then
    TOTAL=140
fi

valid=$(find $TEST_DIR -type f -name "*_test.go" | wc -l)
echo "Total test files: $valid"
if [ "$valid" -eq 0 ]; then
    echo "No test files found in $TEST_DIR."
    exit 1
fi

python3 -c "print('Pass rate:', $valid/$TOTAL*100)"
echo "Pass rate: $passrate"