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
mkdir -p "$REPORT_DIR"
# Navigate to target project path
cd "$TARGET_PROJECT_PATH" || exit 1
export PYTHONPATH="$TARGET_PROJECT_PATH/src":"$TARGET_PROJECT_PATH/src/black":"$TARGET_PROJECT_PATH/crawl4ai"
# which python3
python3 -m coverage run --data-file="$REPORT_DIR/.coverage" -m pytest --continue-on-collection-errors $TEST_DIR
if [[ "$TARGET_PROJECT_PATH" == *crawl4ai ]]; then
    TOTAL=377
    python3 -m coverage report --data-file="$REPORT_DIR/.coverage" --include="$TARGET_PROJECT_PATH/crawl4ai/*"
fi
if [[ "$TARGET_PROJECT_PATH" == *black ]]; then
    TOTAL=140
    python3 -m coverage report --data-file="$REPORT_DIR/.coverage" --include="$TARGET_PROJECT_PATH/src/*"
fi
