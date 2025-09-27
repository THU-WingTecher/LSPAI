#!/usr/bin/env python3
"""
Script to calculate averaged generation time from logs in user-given directories.
Supports both Python-based and TypeScript-based baseline categories.
Can process multiple directories and calculate overall averages.
"""

import json
import os
import sys
import argparse
from pathlib import Path
from typing import List, Dict, Any, Union
from collections import defaultdict


class BaselineTimeCalculator:
    """Calculator for baseline generation times from log files."""
    
    def __init__(self):
        self.LLM_TIME_SECONDS = 8  # Fixed LLM time for Python-based baselines
        self.GENERATE_TEST_TIME_SECONDS = 10  # Fixed time for missing generateTest process
    
    def calculate_averaged_time(self, directory_paths: List[str]) -> Dict[str, Any]:
        """
        Calculate averaged generation time from logs in multiple directories.
        
        Args:
            directory_paths: List of paths to directories containing logs
            
        Returns:
            Dictionary with overall results and per-directory breakdown
        """
        all_results = []
        category_totals = defaultdict(lambda: {'total_time': 0, 'total_files': 0})
        
        for directory_path in directory_paths:
            try:
                # Determine the category based on directory structure
                category = self._determine_category(directory_path)
                
                if category == 'python-based':
                    results = self._calculate_python_based_time(directory_path)
                elif category == 'typescript-based':
                    results = self._calculate_typescript_based_time(directory_path)
                else:
                    print(f"Warning: Unknown category for directory: {directory_path}", file=sys.stderr)
                    continue
                
                all_results.extend(results)
                
                # Aggregate by category
                for result in results:
                    category_totals[result['category']]['total_time'] += result['average_time'] * result['total_files']
                    category_totals[result['category']]['total_files'] += result['total_files']
                    
            except Exception as e:
                print(f"Error processing directory {directory_path}: {e}", file=sys.stderr)
                continue
        
        # Calculate overall averages by category
        overall_results = {}
        for category, totals in category_totals.items():
            if totals['total_files'] > 0:
                overall_results[category] = {
                    'average_time': totals['total_time'] / totals['total_files'],
                    'total_files': totals['total_files'],
                    'total_directories': len([r for r in all_results if r['category'] == category])
                }
        
        return {
            'overall_results': overall_results,
            'per_directory_results': all_results,
            'total_directories_processed': len(directory_paths)
        }
    
    def _determine_category(self, directory_path: str) -> str:
        """Determine if the directory contains Python-based or TypeScript-based logs."""
        logs_path = os.path.join(directory_path, 'logs')
        
        if not os.path.exists(logs_path):
            raise FileNotFoundError(f"Logs directory not found: {logs_path}")
        
        # Check if it's a TypeScript-based (Symprompt) structure
        symprompt_path = os.path.join(logs_path, 'gpt-4o')
        if os.path.exists(symprompt_path):
            return 'typescript-based'
        
        # Check if it's a Python-based structure by looking for JSON files with retrieval_time_sec
        json_files = self._find_json_files(logs_path)
        if json_files:
            sample_file = json_files[0]
            try:
                with open(sample_file, 'r', encoding='utf-8') as f:
                    content = json.load(f)
                if 'retrieval_time_sec' in content:
                    return 'python-based'
            except (json.JSONDecodeError, IOError):
                # Continue checking other files
                pass
        
        raise ValueError(f"Cannot determine category for directory: {directory_path}")
    
    def _calculate_python_based_time(self, directory_path: str) -> List[Dict[str, Any]]:
        """
        Calculate time for Python-based baselines (code_qa, draco, standard).
        Generation time = retrieval_time_sec + fixed LLM time (8 seconds)
        """
        results = []
        logs_path = os.path.join(directory_path, 'logs')
        
        json_files = self._find_json_files(logs_path)
        if not json_files:
            raise FileNotFoundError(f"No JSON files found in logs directory: {logs_path}")
        
        total_time = 0
        valid_files = 0
        
        for file_path in json_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = json.load(f)
                
                if 'retrieval_time_sec' in content:
                    # Generation time = retrieval time + fixed LLM time (8 seconds)
                    generation_time = content['retrieval_time_sec'] + self.LLM_TIME_SECONDS
                    total_time += generation_time
                    valid_files += 1
                    
            except (json.JSONDecodeError, IOError) as e:
                print(f"Warning: Failed to parse JSON file {file_path}: {e}", file=sys.stderr)
        
        if valid_files == 0:
            raise ValueError(f"No valid JSON files with retrieval_time_sec found in: {logs_path}")
        
        average_time = total_time / valid_files
        baseline = self._extract_baseline_name(directory_path)
        
        results.append({
            'category': 'python-based',
            'baseline': baseline,
            'directory_path': directory_path,
            'average_time': average_time,
            'total_files': valid_files
        })
        
        return results
    
    def _calculate_typescript_based_time(self, directory_path: str) -> List[Dict[str, Any]]:
        """
        Calculate time for TypeScript-based baselines (Symprompt).
        Sums all time values (converts microseconds to seconds) and adds 10 seconds 
        if generateTest process is missing.
        """
        results = []
        logs_path = os.path.join(directory_path, 'logs', 'gpt-4o')
        
        if not os.path.exists(logs_path):
            raise FileNotFoundError(f"TypeScript logs directory not found: {logs_path}")
        
        json_files = self._find_json_files(logs_path)
        if not json_files:
            raise FileNotFoundError(f"No JSON files found in TypeScript logs directory: {logs_path}")
        
        total_time = 0
        valid_files = 0
        
        for file_path in json_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = json.load(f)
                
                if isinstance(content, list):
                    file_time = 0
                    has_generate_test = False
                    
                    # Sum all time values (convert microseconds to seconds)
                    for entry in content:
                        if 'time' in entry:
                            time_in_seconds = int(entry['time']) / 1000000  # Convert microseconds to seconds
                            file_time += time_in_seconds
                            
                            if entry.get('process') == 'generateTest':
                                has_generate_test = True
                    
                    # Add 10 seconds if generateTest process is missing
                    if not has_generate_test:
                        file_time += self.GENERATE_TEST_TIME_SECONDS
                    
                    total_time += file_time
                    valid_files += 1
                    
            except (json.JSONDecodeError, IOError) as e:
                print(f"Warning: Failed to parse JSON file {file_path}: {e}", file=sys.stderr)
        
        if valid_files == 0:
            raise ValueError(f"No valid JSON files found in: {logs_path}")
        
        average_time = total_time / valid_files
        baseline = self._extract_baseline_name(directory_path)
        
        results.append({
            'category': 'typescript-based',
            'baseline': baseline,
            'directory_path': directory_path,
            'average_time': average_time,
            'total_files': valid_files
        })
        
        return results
    
    def _find_json_files(self, directory_path: str) -> List[str]:
        """Find all JSON files recursively in a directory."""
        json_files = []
        
        for root, dirs, files in os.walk(directory_path):
            for file in files:
                if file.endswith('.json'):
                    json_files.append(os.path.join(root, file))
        
        return json_files
    
    def _extract_baseline_name(self, directory_path: str) -> str:
        """Extract baseline name from directory path."""
        path_parts = directory_path.split(os.sep)
        
        # Look for common baseline patterns
        for part in reversed(path_parts):
            if any(baseline in part.lower() for baseline in ['code_qa', 'draco', 'standard', 'symprompt']):
                return part
        
        # Fallback to the last directory name
        return path_parts[-1]
    
    def format_results(self, results: Dict[str, Any]) -> str:
        """Format results for display."""
        output = "Baseline Time Calculation Results (Multiple Directories):\n"
        output += "========================================================\n\n"
        
        # Overall results by category
        output += "OVERALL AVERAGES BY CATEGORY:\n"
        output += "-----------------------------\n"
        for category, data in results['overall_results'].items():
            output += f"Category: {category}\n"
            output += f"Overall Average Time: {data['average_time']:.3f} seconds\n"
            output += f"Total Files Processed: {data['total_files']}\n"
            output += f"Total Directories: {data['total_directories']}\n"
            output += "-----------------------------\n"
        
        output += f"\nTotal Directories Processed: {results['total_directories_processed']}\n\n"
        
        # Per-directory breakdown
        output += "PER-DIRECTORY BREAKDOWN:\n"
        output += "------------------------\n"
        for result in results['per_directory_results']:
            output += f"Directory: {result['directory_path']}\n"
            output += f"Category: {result['category']}\n"
            output += f"Baseline: {result['baseline']}\n"
            output += f"Average Time: {result['average_time']:.3f} seconds\n"
            output += f"Files Processed: {result['total_files']}\n"
            output += "------------------------\n"
        
        return output


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description="Calculate averaged generation time from logs in multiple directories",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single directory
  python calculate_baseline_time.py /LSPRAG/experiments/data/main_result/black/code_qa/codeQA_gpt-4o_20250706_090747
  
  # Multiple directories
  python calculate_baseline_time.py /path/to/dir1 /path/to/dir2 /path/to/dir3
  
  # Multiple directories with wildcards (use shell expansion)
  python calculate_baseline_time.py /LSPRAG/experiments/data/main_result/black/code_qa/codeQA_*
  
  # JSON output only
  python calculate_baseline_time.py /path/to/dir1 /path/to/dir2 --json
        """
    )
    
    parser.add_argument(
        'directory_paths',
        nargs='+',
        help='One or more paths to directories containing logs'
    )
    
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results in JSON format only'
    )
    
    parser.add_argument(
        '--summary-only',
        action='store_true',
        help='Show only overall averages, skip per-directory breakdown'
    )
    
    args = parser.parse_args()
    
    # Validate all directories exist
    invalid_dirs = []
    for directory_path in args.directory_paths:
        if not os.path.exists(directory_path):
            invalid_dirs.append(directory_path)
    
    if invalid_dirs:
        print(f"Error: The following directories do not exist: {', '.join(invalid_dirs)}", file=sys.stderr)
        sys.exit(1)
    
    try:
        calculator = BaselineTimeCalculator()
        results = calculator.calculate_averaged_time(args.directory_paths)
        
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            if args.summary_only:
                # Show only overall results
                output = "Baseline Time Calculation Results (Summary):\n"
                output += "==========================================\n\n"
                for category, data in results['overall_results'].items():
                    output += f"Category: {category}\n"
                    output += f"Overall Average Time: {data['average_time']:.3f} seconds\n"
                    output += f"Total Files Processed: {data['total_files']}\n"
                    output += f"Total Directories: {data['total_directories']}\n"
                    output += "-----------------------------\n"
                output += f"\nTotal Directories Processed: {results['total_directories_processed']}\n"
                print(output)
            else:
                formatted_output = calculator.format_results(results)
                print(formatted_output)
            
            # Also output JSON for programmatic use
            if not args.json:
                print("\nJSON Output:")
                print(json.dumps(results, indent=2))
        
    except Exception as error:
        print(f"Error calculating baseline time: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()