# import os
# import sys
# import re

# error_log = sys.argv[1]
# error_file_pattern = re.compile(r'^(\.*/?[\w/]+\.go):', re.MULTILINE)

# print(error_log)
# # Read file paths from stdin
# problematic_files = [line.strip()[:-1] for line in error_log if line.strip()]
# error_files = set(error_file_pattern.findall(error_log))
# print('error_files', error_files)
# print(os.getcwd())
# # Normalize file paths and remove them
# for file_path in error_files:
#     try:
#         if os.path.exists(file_path):
#             os.remove(file_path)
#             print(f"Removed: {file_path}")
#         else:
#             print(f"File not found: {file_path}")
#     except Exception as e:
#         print(f"Error removing {file_path}: {e}")
import os
import sys
import re

    # stack_trace_pattern = re.compile(r'(?:panic|failed|FAIL).*?\n(?:.*?\n)*?.*?(_test\.go:\d+)', re.MULTILINE)

def parse_error_log(error_log):
    # Pattern to match test file paths in stack traces
    pattern_list = [
        re.compile(r'^(\.*/?[\w/]+\.go):', re.MULTILINE),
        # Looks for _test.go files in stack traces and error messages
        re.compile(r'(?:^|\s)((?:[./\w-]+/)*[.\w-]+_test\.go)(?::\d+)?', re.MULTILINE),
        # Pattern to specifically match panic/failure locations
        re.compile(r'((?:[./\w-]+/)*[.\w-]+_test_\d+\.go)', re.MULTILINE)
    ]

    problematic_files = set()
    
    # Find all test files mentioned in the log
    # Find all test files mentioned in the log
    for pattern in pattern_list:
        test_files = pattern.findall(error_log)
        # Combine both findings
        for file in test_files:
            if '_test.go' in file or '_test_' in file:  # Changed condition to catch both patterns
                problematic_files.add(file)
    
    print("[DEBUG] Found problematic test files:", problematic_files)
    return problematic_files

    # Find all test files mentioned in the log
    test_files = test_file_pattern.findall(error_log)
    # Combine both findings
    for file in test_files:
        if '_test.go' in file:
            problematic_files.add(file)
    
    # Find specific failure points in stack traces
    stack_traces = stack_trace_pattern.findall(error_log)
    
    print("[DEBUG] Found problematic test files:", problematic_files)
    return problematic_files

def remove_problematic_files(files):
    for file_path in files:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"[INFO] Removed: {file_path}")
            else:
                print(f"[WARN] File not found: {file_path}")
        except Exception as e:
            print(f"[ERROR] Error removing {file_path}: {e}")

def main():
    if len(sys.argv) != 2:
        print("Usage: python go_clean.py error_log")
        sys.exit(1)
        
    error_log = sys.argv[1]

    print("[INFO] Analyzing error log for problematic test files...")
    problematic_files = parse_error_log(error_log)
    
    if problematic_files:
        print(f"[INFO] Found {len(problematic_files)} problematic test files")
        remove_problematic_files(problematic_files)
    else:
        print("[WARN] No problematic test files identified")

if __name__ == "__main__":
    main()