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
ROOT_TEST_DIR=$2
Model="gpt-4o-mini"
LOG_DIR="${ROOT_TEST_DIR}/logs"
LOG_TEST1="${LOG_DIR}/naive_${Model}"
LOG_TEST2="${LOG_DIR}/${Model}"
TEST_DIR_NAME1="naive_${Model}"
TEST_DIR_NAME2="${Model}"

python3 analyze.py $LOG_TEST1 > ${LOG_TEST1}_summary.txt
echo "Summary of ${LOG_TEST1} is saved in ${LOG_TEST1}_summary.txt"
python3 analyze.py $LOG_TEST2 > ${LOG_TEST2}_summary.txt
echo "Summary of ${LOG_TEST2} is saved in ${LOG_TEST2}_summary.txt"

# bash java_coverage.bash $TARGET_PROJECT_PATH "${ROOT_TEST_DIR}/realNaive_${TEST_DIR_NAME1}"
# bash java_coverage.bash $TARGET_PROJECT_PATH "${ROOT_TEST_DIR}/Final_${TEST_DIR_NAME1}"
# bash java_coverage.bash $TARGET_PROJECT_PATH "${ROOT_TEST_DIR}/realNaive_${TEST_DIR_NAME2}"
# bash java_coverage.bash $TARGET_PROJECT_PATH "${ROOT_TEST_DIR}/Final_${TEST_DIR_NAME2}"