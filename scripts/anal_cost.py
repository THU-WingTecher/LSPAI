import json
import argparse
import os
from typing import List, Dict, Any
from pathlib import Path
from collections import defaultdict
import re

def load_json(file_path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"The file '{file_path}' does not exist.")

    with open(file_path, 'r', encoding='utf-8') as file:
        try:
            data = json.load(file)
            if not isinstance(data, list):
                raise ValueError("JSON data is not a list.")
            return data
        except json.JSONDecodeError as e:
            raise ValueError(f"Error decoding JSON: {e}")

def print_prompts_and_results(data: List[Dict[str, Any]], file_name: str):
    print(f"\n=== Prompts and Results for '{file_name}' ===\n")
    for idx, entry in enumerate(data, 1):
        llm_info = entry.get('llmInfo')
        if llm_info:
            prompt = llm_info.get('prompt', '').strip()
            result = llm_info.get('result', '').strip()
            print(f"--- Entry {idx} ---")
            print("Prompt:")
            print(prompt if prompt else "No prompt available.")
            print("\nResult:")
            print(result if result else "No result available.")
            print("\n")

def print_time_used(data: List[Dict[str, Any]], file_name: str) -> int:
    print(f"\n=== Time Used for Each Step in '{file_name}' ===\n")
    print(f"{'Process':<30} {'Time (ms)':>10}")
    print("-" * 42)
    total_time = 0
    for entry in data:
        process = entry.get('process', 'Unknown Process')
        time_str = entry.get('time', '0')
        if process in ["fixDiagnostics","gatherContext"] :  ## redundant
            continue 
        try:
            time_ms = int(time_str)
        except ValueError:
            time_ms = 0
        total_time += time_ms
        print(f"{process:<30} {time_ms:>10}")
    print("-" * 42)
    print(f"{'Total':<30} {total_time:>10}\n")
    return total_time

def print_token_usage(data: List[Dict[str, Any]], file_name: str) -> Dict[str, Any]:
    print(f"\n=== Token Usage for '{file_name}' ===\n")
    print(f"{'Process':<30} {'Tokens Used':>12}")
    print("-" * 44)
    total_tokens = 0
    fixwithllm_tokens = 0
    fixwithllm_count = 0
    for entry in data:
        process = entry.get('process', 'Unknown Process')
        llm_info = entry.get('llmInfo')
        tokens = llm_info.get('tokenUsage', 0) if llm_info else 0
        if tokens is "":
            tokens = 0
        total_tokens += tokens

        if process.startswith("FixWithLLM"):
            fixwithllm_tokens += tokens
            fixwithllm_count += 1
            display_process = "FixWithLLM"
        else:
            display_process = process

        print(f"{display_process:<30} {tokens:>12}")
    print("-" * 44)
    print(f"{'Total Tokens':<30} {total_tokens:>12}")
    if fixwithllm_count > 0:
        print(f"{'FixWithLLM Total Tokens':<30} {fixwithllm_tokens:>12}")
        print(f"{'FixWithLLM Count':<30} {fixwithllm_count:>12}")
    print("\n")
    return {
        "total_tokens": total_tokens,
        "fixwithllm_tokens": fixwithllm_tokens,
        "fixwithllm_count": fixwithllm_count
    }

def parse_code(response: str) -> str:
    regex = r'```(?:\w+)?(?:~~)?\s*([\s\S]*?)\s*```'
    match = re.search(regex, response)
    if match:
        return match.group(1).strip()
    print("No code block found in the response!")
    return response

def save_code_to_from_log(file_path, folder_path, suffix_for_folder="NOFIX"):
    original_folder_path = folder_path.name
    file_name = Path(file_path).name
    try:
        data = load_json(file_path)
    except (FileNotFoundError, ValueError) as e:
        print(f"Error processing '{file_name}': {e}")
        return

    firstGeneratedData = None
    code_path = data[0]['fileName']
    print(f"Code file: {code_path}")
    if suffix_for_folder == "NOFIX":
        for entry in data:
            if entry.get('process') == 'invokeLLM':
                firstGeneratedData = entry
                break

        if firstGeneratedData:
            code = firstGeneratedData['llmInfo']['result']
            code = parse_code(code)
            naive_directory = Path(code_path).as_posix().replace(
                original_folder_path, f"{suffix_for_folder}_{original_folder_path}"
            )
            naive_dir = Path(naive_directory).parent
            # print(f"Code saved to: {naive_directory}")
            # os.makedirs(naive_dir, exist_ok=True)
            # with open(naive_directory, 'w') as file:
            #     file.write(code)
    elif suffix_for_folder == "Final":
        last_llm_data = None
        for entry in data:
            if entry.get('llmInfo') is not None :
                last_llm_data = entry

        if last_llm_data:
            code = last_llm_data['llmInfo']['result']
            code = parse_code(code)
            final_directory = Path(code_path).as_posix().replace(
                original_folder_path, f"{suffix_for_folder}_{original_folder_path}"
            )
            # final_dir = Path(final_directory).parent
            # print(f"Code saved to: {final_directory}")
            # os.makedirs(final_dir, exist_ok=True)
            # with open(final_directory, 'w') as file:
            #     file.write(code)

# def save_final_code_to_directory(file_path, folder_path, suffix_for_folder="NOFIX"):
#     original_folder_path = folder_path.name
#     file_name = Path(file_path).name
#     try:
#         data = load_json(file_path)
#     except (FileNotFoundError, ValueError) as e:
#         print(f"Error processing '{file_name}': {e}")
#         return

#     firstGeneratedData = None
#     code_path = data[0]['fileName']
#     print(f"Code file: {code_path}")
#     for entry in data:
#         if entry.get('process') == 'invokeLLM':
#             firstGeneratedData = entry
#             break

#     if firstGeneratedData:
#         code = firstGeneratedData['llmInfo']['result']
#         code = parse_code(code)
#         naive_directory = Path(code_path).as_posix().replace(
#             original_folder_path, f"{suffix_for_folder}_{original_folder_path}"
#         )
#         naive_dir = Path(naive_directory).parent
#         print(f"Code saved to: {naive_directory}")
#         os.makedirs(naive_dir, exist_ok=True)
#         with open(naive_directory, 'w') as file:
#             file.write(code)

def analyze_json_file(file_path: str) -> Dict[str, Any]:
    """
    Analyze a single JSON file and print the required information.
    Return a dict with:
      - time
      - total_tokens
      - fixwithllm_tokens
      - fixwithllm_count
      - fixwithllm_time
      - process_time_info
      - process_token_info
    """
    file_name = Path(file_path).name
    try:
        data = load_json(file_path)
    except (FileNotFoundError, ValueError) as e:
        print(f"Error processing '{file_name}': {e}")
        return {
            "time": 0,
            "total_tokens": 0,
            "fixwithllm_tokens": 0,
            "fixwithllm_count": 0,
            "fixwithllm_time": 0,
            "process_time_info": {},
            "process_token_info": {},
        }

    print_prompts_and_results(data, file_name)
    total_time = print_time_used(data, file_name)
    token_stats = print_token_usage(data, file_name)

    # Track total fix time for this file
    fixwithllm_time = 0

    # Track times per process
    process_time_info = {}
    for entry in data:
        process = entry.get('process', 'Unknown Process')
        time_str = entry.get('time', '0')
        try:
            time_ms = int(time_str)
        except ValueError:
            time_ms = 0

        # Accumulate total FixWithLLM time
        if process.startswith("FixWithLLM"):
            fixwithllm_time += time_ms

        process_time_info[process] = process_time_info.get(process, 0) + time_ms

    # Track tokens per process
    process_token_info = {}
    for entry in data:
        process = entry.get('process', 'Unknown Process')
        llm_info = entry.get('llmInfo')
        tokens = llm_info.get('tokenUsage', 0) if llm_info else 0
        if tokens is "":
            tokens = 0
        process_token_info[process] = process_token_info.get(process, 0) + tokens

    return {
        "time": total_time,
        "total_tokens": token_stats["total_tokens"],
        "fixwithllm_tokens": token_stats["fixwithllm_tokens"],
        "fixwithllm_count": token_stats["fixwithllm_count"],
        "fixwithllm_time": fixwithllm_time,  # <-- NEW
        "process_time_info": process_time_info,
        "process_token_info": process_token_info,
    }

def main():
    """
    Modified main to allow analyzing multiple directories and compute
    average fix time/tokens per file.
    """
    final_values = {
        "fix" : 0,
        "gen" : 0,
        "cfg" : 0,
        "def" : 0,
        "ref" : 0,
        "filter": 0,
        "diag": 0,
        "save": 0
    }
    parser = argparse.ArgumentParser(description="Analyze LLM Experiment JSON Files in Directories.")
    parser.add_argument('folders', nargs='+', help="One or more paths to folders containing JSON files.")
    args = parser.parse_args()

    process_times = defaultdict(lambda: {'time': 0, 'count': 0})
    process_tokens = defaultdict(lambda: {'tokens': 0, 'count': 0})

    overall_time = 0
    overall_tokens = 0
    overall_fixwithllm_tokens = 0
    overall_fixwithllm_count = 0

    # NEW: track total fix time (all files) so we can compute average fix time per file
    overall_fixwithllm_time = 0

    file_count = 0

    for folder_arg in args.folders:
        folder_path = Path(folder_arg)
        if not folder_path.is_dir():
            print(f"Error: The path '{folder_path}' is not a valid directory.")
            continue

        json_files = list(folder_path.rglob('*.json'))
        # print(f"#### Number of JSON files: {len(json_files)}, {folder_path}")
        if not json_files:
            print(f"No JSON files found in the directory '{folder_path}'.")
            continue

        for json_file in json_files:
            if json_file.name.endswith("diagnostic_report.json"):
                continue
            print(f"\nProcessing file: {json_file.name}")
            result = analyze_json_file(str(json_file))

            # Optionally save extracted code
            # save_code_to_from_log(str(json_file), folder_path, suffix_for_folder="Final")
            # save_code_to_from_log(str(json_file), folder_path, suffix_for_folder="NOFIX")
            # save_final_code_to_directory(str(json_file), folder_path, suffix_for_folder="Final")

            overall_time += result["time"]
            overall_tokens += result["total_tokens"]
            overall_fixwithllm_tokens += result["fixwithllm_tokens"]
            overall_fixwithllm_count += result["fixwithllm_count"]

            # Accumulate overall FixWithLLM time
            overall_fixwithllm_time += result["fixwithllm_time"]


            file_count += 1

            # Update per-process data
            for proc_name, proc_time in result["process_time_info"].items():
                process_times[proc_name]['time'] += proc_time
                process_times[proc_name]['count'] += 1

            for proc_name, proc_token in result["process_token_info"].items():
                process_tokens[proc_name]['tokens'] += proc_token
                process_tokens[proc_name]['count'] += 1

    if file_count == 0:
        print("No valid JSON files were processed.")
        return

    # ======== Overall Averages (per file) ========
    average_time_per_file = overall_time / file_count
    average_tokens_per_file = overall_tokens / file_count

    # NEW: average fix time/tokens per file
    average_fixwithllm_time_per_file = overall_fixwithllm_time / file_count
    average_fixwithllm_tokens_per_file = overall_fixwithllm_tokens / file_count if file_count else 0

    print("\n=== Overall Statistics (across ALL directories) ===\n")
    print(f"Total Files Processed: {file_count}")
    print(f"Total Time Used (ms): {overall_time}")
    print(f"Total Tokens Used: {overall_tokens}")
    if overall_fixwithllm_count > 0:
        print(f"Total FixWithLLM Tokens Used: {overall_fixwithllm_tokens}")
        print(f"Total FixWithLLM Processes Run: {overall_fixwithllm_count}")
    print(f"Average Time per Function (ms): {average_time_per_file:.2f}")
    print(f"Average Tokens per Function: {average_tokens_per_file:.2f}")

    # Print new averaged fix time/tokens per file
    print(f"Average FixWithLLM Time per Function (ms): {average_fixwithllm_time_per_file:.2f}  -> FIX Time")
    print(f"Average FixWithLLM Tokens per Function: {average_fixwithllm_tokens_per_file:.2f}   -> FIX Token")
    
    # NEW: Calculate average number of fix processes per function
    average_fix_processes_per_function = overall_fixwithllm_count / file_count if file_count else 0
    print(f"Average Fix Processes per Function: {average_fix_processes_per_function:.2f}  -> FIX Processes")
    
    final_values["fix"] = average_fixwithllm_time_per_file
    # ======== Average Time/Token Usage per Process ========
    print("\n=== Average Time and Token Usage per Process ===\n")
    print(f"{'Process':<30} {'Avg Time (ms)':>15} {'Avg Tokens':>15}")
    print("-" * 65)
    # final_values = {
    #     "fix" : 0,
    #     "gen" : 0,
    #     "cfg" : 0,
    #     "def" : 0,
    #     "ref" : 0,
    #     "filter": 0,
    #     "diag": 0,
    #     "save": 0
    # }
    all_processes = sorted(set(list(process_times.keys()) + list(process_tokens.keys())))
    for proc_name in all_processes:
        additional = ""
        time_info = process_times[proc_name]
        token_info = process_tokens[proc_name]
        avg_time = (time_info['time'] / time_info['count']) if time_info['count'] else 0
        avg_tokens = (token_info['tokens'] / token_info['count']) if token_info['count'] else 0
        if proc_name == "gatherContext-1" :
            additional = "  ->  Retrieval(def)"
            final_values['def'] += avg_time 
        elif proc_name == "gatherContext-2" :
            additional = "  ->  Retrieval(ref)"
            final_values['ref'] += avg_time 
        elif proc_name == "getDiagnosticsForFilePath" :
            additional = "  ->  getDiagnostic" 
            final_values['diag'] = avg_time
        elif proc_name == "generateTest" :
            additional = "  ->  Gen" 
            final_values['gen'] += avg_time
        elif proc_name in ["buildCFG", "collectCFGPaths"] :
            final_values['cfg'] += avg_time
        elif proc_name == "getContextTermsFromTokens" :
            final_values['filter'] += avg_time
        elif proc_name == "saveGeneratedCodeToFolder" :
            final_values['save'] += avg_time
        else :
            additional = ""
        print(f"{proc_name:<30} {avg_time:>15.2f} {avg_tokens:>15.2f} {additional}")
    # print the total time and tokens used
    print(f"Average Total Time Used (ms): {overall_time / file_count}")
    print(f"Average Total Tokens Used: {overall_tokens / file_count}")
    print("\nDone.\n")
    print("PASTE BELOW DICTIONARY TO scripts/plot_cost.py")
    print(final_values)
if __name__ == "__main__":
    main()
