#!/usr/bin/env python3

import os
import sys
import subprocess
import json
import tempfile
import multiprocessing
from concurrent.futures import ProcessPoolExecutor, as_completed

def discover_test_files(test_dir):
    """
    Returns a list of test-file paths. 
    Adjust the pattern as desired (e.g. test_*.py).
    """
    test_files = []
    for root, dirs, files in os.walk(test_dir):
        for file_name in files:
            if file_name.endswith("_test.py"):
                test_files.append(os.path.join(root, file_name))
    return test_files

def run_pytest(project_path, file_path):
    """
    Runs pytest on a single test file with JSON output, 
    returning a dict with 'errors' and 'failures'.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        # File to store the JSON report
        report_json = os.path.join(tmp_dir, "report.json")
        
        # Run pytest with JSON reporting
        cmd = [
            "pytest",
            file_path,
            "--maxfail=1",           # stop on first fail/error within that file
            "--json-report",         # enable JSON plugin
            f"--json-report-file={report_json}",
            "--disable-warnings",
        ]
        env = os.environ.copy()
        env["PYTHONPATH"] = f"{project_path}:{project_path}/src:{project_path}/src/black:{project_path}/crawl4ai"
        
        # We don’t rely on returncode alone, because any test fail or error => returncode=1
        result = subprocess.run(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            cwd=project_path,  # Set working directory
            env=env        # Set environment variables
        )
        print(f"\nTest file: {file_path}")
        print("stdout:", result.stdout.decode())
        print("stderr:", result.stderr.decode())
        if "Error" in result.stdout.decode():
            return {"errors": 1, "failures": 0}
        if result.stderr:
            return {"errors": 1, "failures": 0}
        # Now parse the JSON report
        if not os.path.exists(report_json):
            # If it didn't produce a JSON, something big went wrong (treat as error).
            return {"errors": 1, "failures": 0}
        
        with open(report_json, "r", encoding="utf-8") as f:
            data = json.load(f)
            # The JSON includes "summary": {"passed", "failed", "errors", "skipped"}
            summary = data.get("summary", {})
            return {
                "errors": summary.get("errors", 0),
                "failures": summary.get("failed", 0)
            }

def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <project_path> <test_directory> ")
        sys.exit(1)
    
    project_path = sys.argv[1]
    test_dir = sys.argv[2]
    if not os.path.isdir(test_dir):
        print(f"Error: {test_dir} is not a directory.")
        sys.exit(1)
    
    test_files = discover_test_files(test_dir)
    total_tests = len(test_files)
    if total_tests == 0:
        print("No test files discovered.")
        return
    
    passed_files_count = 0
    completed_count = 0

    max_workers = multiprocessing.cpu_count()
    print(f"Running tests using {max_workers} cores")
    
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        # Submit all test files to the process pool
        future_to_file = {
            executor.submit(run_pytest, project_path, tfile): tfile 
            for tfile in test_files
        }
        
        # Process results as they complete
        for future in as_completed(future_to_file):
            tfile = future_to_file[future]
            try:
                results = future.result()
                completed_count += 1
                if results["errors"] == 0:
                    passed_files_count += 1
                print(f"##### Test file: {tfile}, current pass rate: {passed_files_count / completed_count * 100:.2f}% ({completed_count}/{total_tests}) #####")
            except Exception as e:
                print(f"Test file {tfile} generated an exception: {e}")
    
    pass_rate = (passed_files_count / total_tests) * 100
    print(f"\nFinal Results:")
    print(f"Total test files: {total_tests}")
    print(f"Files without runtime/compilation errors: {passed_files_count}")
    print(f"Pass Rate (per-file basis): {pass_rate:.2f}%")
    # for i, tfile in enumerate(test_files):
    #     results = run_pytest(project_path, tfile)
    #     # Our rule: if "errors" == 0 => the file is “okay.” 
    #     # (failures via assertion are allowed and do NOT count as an error)
    #     if results["errors"] == 0:
    #         passed_files_count += 1
    #     print(f"##### Test file: {tfile}, current pass rate: {passed_files_count / (i + 1) * 100:.2f}% ##### ")
    
    # pass_rate = (passed_files_count / total_tests) * 100
    # print(f"Total test files: {total_tests}")
    # print(f"Files without runtime/compilation errors: {passed_files_count}")
    # print(f"Pass Rate (per-file basis): {pass_rate:.2f}%")

if __name__ == "__main__":
    main()
