import json
import argparse
import os
from typing import List, Dict, Any
from pathlib import Path
from collections import defaultdict
import re

def load_json(file_path: str) -> List[Dict[str, Any]]:
    """
    Load JSON data from the specified file.

    :param file_path: Path to the JSON file.
    :return: List of dictionaries representing JSON objects.
    """
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
    """
    Print the prompt and result from each LLM interaction.

    :param data: List of dictionaries representing JSON objects.
    :param file_name: Name of the JSON file being processed.
    """
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
    """
    Print the time used for each process step and return total time.

    :param data: List of dictionaries representing JSON objects.
    :param file_name: Name of the JSON file being processed.
    :return: Total time used in milliseconds.
    """
    print(f"\n=== Time Used for Each Step in '{file_name}' ===\n")
    print(f"{'Process':<30} {'Time (ms)':>10}")
    print("-" * 42)
    total_time = 0
    for entry in data:
        process = entry.get('process', 'Unknown Process')
        time_str = entry.get('time', '0')
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
    """
    Print the token usage for each step and return total tokens used.

    :param data: List of dictionaries representing JSON objects.
    :param file_name: Name of the JSON file being processed.
    :return: Dictionary containing total tokens used and FixWithLLM stats.
    """
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
    """
    Extract code block wrapped by triple backticks from the response string.

    :param response: The response string containing the code block.
    :return: Extracted code as a string, or an empty string if no code block is found.
    """

    # Regular expression to match code block wrapped by triple backticks, optional `~~`, and language tag
    regex = r'```(?:\w+)?(?:~~)?\s*([\s\S]*?)\s*```'

    # Match the response against the regular expression
    match = re.search(regex, response)

    # If a match is found, return the extracted code; otherwise, return an empty string
    if match:
        return match.group(1).strip()  # match.group(1) contains the code inside the backticks

    # If no code block is found, return an empty string
    print("No code block found in the response!")
    return ""

def save_code_to_naive_directory(file_path, folder_path):
    original_folder_path=folder_path.name
    file_name = Path(file_path).name
    try:
        data = load_json(file_path)
    except (FileNotFoundError, ValueError) as e:
        print(f"Error processing '{file_name}': {e}")

    for entry in data:
        if entry.get('process') == 'invokeLLM' :
            if entry.get('llmInfo') and entry['llmInfo'].get('result'):
                file_path = entry['fileName']
                code = entry['llmInfo']['result']
                code = parse_code(code)
                # Get the directory path to save the code under "naive"
                naive_directory = Path(file_path).as_posix().replace(original_folder_path, f"realNaive_{original_folder_path}")
                naive_dir = Path(naive_directory).parent  # Get the directory path

                # Ensure the directory exists
                os.makedirs(naive_dir, exist_ok=True)

                # Save the extracted code to a file in the new directory
                with open(naive_directory, 'w') as file:
                    file.write(code)

                print(f"Code saved to: {naive_directory}")

def save_final_code_to_directory(file_path, folder_path, suffix_for_folder="realNaive"):
    original_folder_path=folder_path.name
    file_name = Path(file_path).name
    try:
        data = load_json(file_path)
    except (FileNotFoundError, ValueError) as e:
        print(f"Error processing '{file_name}': {e}")

    for entry in data:
        if entry.get('llmInfo') and entry['llmInfo'].get('result'):
            file_path = entry['fileName']
            code = entry['llmInfo']['result']
            code = parse_code(code)
            # Get the directory path to save the code under "naive"
            naive_directory = Path(file_path).as_posix().replace(original_folder_path, f"{suffix_for_folder}_{original_folder_path}")
            naive_dir = Path(naive_directory).parent  # Get the directory path
            print(f"Code saved to: {naive_directory}")
    
    # Ensure the directory exists
    os.makedirs(naive_dir, exist_ok=True)

    # Save the extracted code to a file in the new directory
    with open(naive_directory, 'w') as file:
        file.write(code)
def analyze_json_file(file_path: str) -> Dict[str, Any]:
    """
    Analyze a single JSON file and print the required information.

    :param file_path: Path to the JSON file.
    :return: Dictionary containing total time, total tokens, FixWithLLM tokens, and FixWithLLM count.
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
            "fixwithllm_count": 0
        }
    print_prompts_and_results(data, file_name)
    total_time = print_time_used(data, file_name)
    token_stats = print_token_usage(data, file_name)

    return {
        "time": total_time,
        "total_tokens": token_stats["total_tokens"],
        "fixwithllm_tokens": token_stats["fixwithllm_tokens"],
        "fixwithllm_count": token_stats["fixwithllm_count"]
    }

def main():
    parser = argparse.ArgumentParser(description="Analyze LLM Experiment JSON Files in a Directory.")
    parser.add_argument('folder', help="Path to the folder containing JSON files to analyze.")
    args = parser.parse_args()

    folder_path = Path(args.folder)
    if not folder_path.is_dir():
        print(f"Error: The path '{folder_path}' is not a valid directory.")
        return

    json_files = list(folder_path.glob('*.json'))
    if not json_files:
        print(f"No JSON files found in the directory '{folder_path}'.")
        return

    overall_time = 0
    overall_tokens = 0
    overall_fixwithllm_tokens = 0
    overall_fixwithllm_count = 0
    file_count = 0

    for json_file in json_files:
        print(f"\nProcessing file: {json_file.name}")
        result = analyze_json_file(str(json_file))
        save_code_to_naive_directory(str(json_file), folder_path)
        save_final_code_to_directory(str(json_file), folder_path, suffix_for_folder="Final")
        overall_time += result["time"]
        overall_tokens += result["total_tokens"]
        overall_fixwithllm_tokens += result["fixwithllm_tokens"]
        overall_fixwithllm_count += result["fixwithllm_count"]
        file_count += 1

    if file_count == 0:
        print("No valid JSON files were processed.")
        return

    average_time = overall_time / file_count
    average_tokens = overall_tokens / file_count
    average_fixwithllm_tokens = overall_fixwithllm_tokens / file_count if file_count > 0 else 0
    average_fixwithllm_count = overall_fixwithllm_count / file_count if file_count > 0 else 0

    print("\n=== Overall Statistics ===\n")
    print(f"Total Files Processed: {file_count}")
    print(f"Total Time Used (ms): {overall_time}")
    print(f"Total Tokens Used: {overall_tokens}")
    if overall_fixwithllm_count > 0:
        print(f"Total FixWithLLM Tokens Used: {overall_fixwithllm_tokens}")
        print(f"Total FixWithLLM Processes Run: {overall_fixwithllm_count}")
    print(f"Average Time per File (ms): {average_time:.2f}")
    print(f"Average Tokens per File: {average_tokens:.2f}")
    if overall_fixwithllm_count > 0:
        print(f"Average FixWithLLM Tokens per File: {average_fixwithllm_tokens:.2f}")
        print(f"Average FixWithLLM Processes per File: {average_fixwithllm_count:.2f}")
    print("\n")

if __name__ == "__main__":
    main()
