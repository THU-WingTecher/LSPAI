import os
import sys
import re

error_log = sys.argv[1]
error_file_pattern = re.compile(r'^(\.*/?[\w/]+\.go):', re.MULTILINE)

print(error_log)
# Read file paths from stdin
problematic_files = [line.strip()[:-1] for line in error_log if line.strip()]
error_files = set(error_file_pattern.findall(error_log))
print('error_files', error_files)
print(os.getcwd())
# Normalize file paths and remove them
for file_path in error_files:
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"Removed: {file_path}")
        else:
            print(f"File not found: {file_path}")
    except Exception as e:
        print(f"Error removing {file_path}: {e}")