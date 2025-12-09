#!/usr/bin/env python3
"""
Visualize the distribution of mutation analysis metrics grouped by test status.
Compares Passed vs Failed tests across multiple metrics.
Supports merging multiple JSON files into a single visualization.
"""

import json
import sys
import glob
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from typing import Dict, List, Tuple

def load_data(json_path: str) -> Dict:
    """Load the file_analysis.json data."""
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_multiple_files(file_patterns: List[str]) -> Dict[str, Dict]:
    """
    Load multiple JSON files and return them as a dictionary.
    
    Args:
        file_patterns: List of file paths or glob patterns
        
    Returns:
        Dict mapping file path to loaded data
    """
    all_files = {}
    
    for pattern in file_patterns:
        # Check if it's a direct file path or a glob pattern
        if '*' in pattern or '?' in pattern:
            matched_files = glob.glob(pattern)
        else:
            matched_files = [pattern] if Path(pattern).exists() else []
        
        for file_path in matched_files:
            print(f"Loading: {file_path}")
            try:
                all_files[file_path] = load_data(file_path)
            except Exception as e:
                print(f"Warning: Failed to load {file_path}: {e}")
    
    return all_files

def merge_data(all_files: Dict[str, Dict]) -> Dict:
    """
    Merge multiple file_analysis.json data into a single dictionary.
    
    Args:
        all_files: Dict mapping file path to loaded data
        
    Returns:
        Merged data with unique keys (prefixed with source file if conflicts)
    """
    merged = {}
    
    for source_file, data in all_files.items():
        for key, value in data.items():
            # Create a unique key if there's a conflict
            if key in merged:
                # Add source file prefix to make it unique
                source_name = Path(source_file).stem
                unique_key = f"{source_name}::{key}"
                merged[unique_key] = value
            else:
                merged[key] = value
    
    return merged

def extract_metrics(data: Dict) -> Tuple[Dict[str, List], Dict[str, List]]:
    """
    Extract mutation analysis metrics grouped by status.
    
    Returns:
        Tuple of (passed_metrics, failed_metrics) where each is a dict with:
        - totalTokens: list of values
        - uniquePaths: list of values
        - externalDependencyTokens: list of values
        - tokensInFileOutsideFunction: list of counts
        - tokensInOtherDocuments: list of counts
    """
    passed_metrics = {
        'totalTokens': [],
        'uniquePaths': [],
        'externalDependencyTokens': [],
        'tokensInFileOutsideFunction': [],
        'tokensInOtherDocuments': []
    }
    
    failed_metrics = {
        'totalTokens': [],
        'uniquePaths': [],
        'externalDependencyTokens': [],
        'tokensInFileOutsideFunction': [],
        'tokensInOtherDocuments': []
    }
    
    for file_path, file_data in data.items():
        status = file_data.get('status', '').lower()
        mut_analysis = file_data.get('mutAnalysis')
        
        if not mut_analysis:
            continue
        
        # Determine which group this belongs to
        if status == 'passed':
            metrics = passed_metrics
        elif status == 'failed':
            metrics = failed_metrics
        else:
            # Skip if status is neither passed nor failed
            continue
        
        # Extract metrics
        metrics['totalTokens'].append(mut_analysis.get('totalTokens', 0))
        metrics['uniquePaths'].append(mut_analysis.get('uniquePaths', 0))
        metrics['externalDependencyTokens'].append(mut_analysis.get('externalDependencyTokens', 0))
        metrics['tokensInFileOutsideFunction'].append(
            len(mut_analysis.get('tokensInFileOutsideFunction', []))
        )
        metrics['tokensInOtherDocuments'].append(
            len(mut_analysis.get('tokensInOtherDocuments', []))
        )
    
    return passed_metrics, failed_metrics

def plot_distributions(passed_metrics: Dict[str, List], 
                       failed_metrics: Dict[str, List],
                       output_path: str = None,
                       num_files: int = 1):
    """
    Create distribution plots comparing passed vs failed tests.
    """
    metrics_labels = [
        ('totalTokens', 'Total Tokens'),
        ('uniquePaths', 'Unique Paths'),
        ('externalDependencyTokens', 'External Dependency Tokens'),
        ('tokensInFileOutsideFunction', 'Tokens in File Outside Function'),
        ('tokensInOtherDocuments', 'Tokens in Other Documents')
    ]
    
    # Set up the plot style
    sns.set_style("whitegrid")
    fig, axes = plt.subplots(3, 2, figsize=(15, 12))
    axes = axes.flatten()
    
    for idx, (metric_key, metric_label) in enumerate(metrics_labels):
        ax = axes[idx]
        
        passed_data = passed_metrics[metric_key]
        failed_data = failed_metrics[metric_key]
        
        # Create histogram with overlapping bars
        if passed_data:
            ax.hist(passed_data, bins=30, alpha=0.6, label=f'Passed (n={len(passed_data)})', 
                   color='green', edgecolor='black')
        
        if failed_data:
            ax.hist(failed_data, bins=30, alpha=0.6, label=f'Failed (n={len(failed_data)})', 
                   color='red', edgecolor='black')
        
        ax.set_xlabel(metric_label, fontsize=10)
        ax.set_ylabel('Frequency', fontsize=10)
        ax.set_title(f'Distribution of {metric_label}', fontsize=12, fontweight='bold')
        ax.legend(loc='upper right')
        ax.grid(True, alpha=0.3)
    
    # Remove the last empty subplot
    fig.delaxes(axes[5])
    
    # Add overall title
    title = 'Mutation Analysis Metrics: Passed vs Failed Tests'
    if num_files > 1:
        title += f' (Merged from {num_files} files)'
    fig.suptitle(title, fontsize=16, fontweight='bold', y=0.995)
    
    plt.tight_layout()
    
    # Save or show
    if output_path:
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"Plot saved to: {output_path}")
    else:
        plt.show()

def plot_box_plots(passed_metrics: Dict[str, List], 
                   failed_metrics: Dict[str, List],
                   output_path: str = None,
                   num_files: int = 1):
    """
    Create box plots comparing passed vs failed tests.
    """
    metrics_labels = [
        ('totalTokens', 'Total Tokens'),
        ('uniquePaths', 'Unique Paths'),
        ('externalDependencyTokens', 'External Dependency Tokens'),
        ('tokensInFileOutsideFunction', 'Tokens in File Outside Function'),
        ('tokensInOtherDocuments', 'Tokens in Other Documents')
    ]
    
    fig, axes = plt.subplots(3, 2, figsize=(15, 12))
    axes = axes.flatten()
    
    for idx, (metric_key, metric_label) in enumerate(metrics_labels):
        ax = axes[idx]
        
        passed_data = passed_metrics[metric_key]
        failed_data = failed_metrics[metric_key]
        
        # Prepare data for box plot
        data_to_plot = []
        labels = []
        
        if passed_data:
            data_to_plot.append(passed_data)
            labels.append(f'Passed\n(n={len(passed_data)})')
        
        if failed_data:
            data_to_plot.append(failed_data)
            labels.append(f'Failed\n(n={len(failed_data)})')
        
        if data_to_plot:
            bp = ax.boxplot(data_to_plot, labels=labels, patch_artist=True)
            
            # Color the boxes
            colors = ['lightgreen', 'lightcoral']
            for patch, color in zip(bp['boxes'], colors[:len(data_to_plot)]):
                patch.set_facecolor(color)
        
        ax.set_ylabel(metric_label, fontsize=10)
        ax.set_title(f'{metric_label}', fontsize=12, fontweight='bold')
        ax.grid(True, alpha=0.3, axis='y')
    
    # Remove the last empty subplot
    fig.delaxes(axes[5])
    
    # Add overall title
    title = 'Mutation Analysis Metrics: Passed vs Failed Tests (Box Plots)'
    if num_files > 1:
        title += f' - Merged from {num_files} files'
    fig.suptitle(title, fontsize=16, fontweight='bold', y=0.995)
    
    plt.tight_layout()
    
    if output_path:
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"Plot saved to: {output_path}")
    else:
        plt.show()

def print_statistics(passed_metrics: Dict[str, List], 
                    failed_metrics: Dict[str, List]):
    """Print summary statistics for each metric."""
    import statistics
    
    print("\n" + "="*80)
    print("SUMMARY STATISTICS")
    print("="*80)
    
    metrics_labels = [
        ('totalTokens', 'Total Tokens'),
        ('uniquePaths', 'Unique Paths'),
        ('externalDependencyTokens', 'External Dependency Tokens'),
        ('tokensInFileOutsideFunction', 'Tokens in File Outside Function'),
        ('tokensInOtherDocuments', 'Tokens in Other Documents')
    ]
    
    for metric_key, metric_label in metrics_labels:
        print(f"\n{metric_label}:")
        print("-" * 80)
        
        passed_data = passed_metrics[metric_key]
        failed_data = failed_metrics[metric_key]
        
        if passed_data:
            print(f"  Passed (n={len(passed_data)}):")
            print(f"    Mean:   {statistics.mean(passed_data):.2f}")
            print(f"    Median: {statistics.median(passed_data):.2f}")
            print(f"    Min:    {min(passed_data)}")
            print(f"    Max:    {max(passed_data)}")
            if len(passed_data) > 1:
                print(f"    StdDev: {statistics.stdev(passed_data):.2f}")
        else:
            print(f"  Passed: No data")
        
        if failed_data:
            print(f"  Failed (n={len(failed_data)}):")
            print(f"    Mean:   {statistics.mean(failed_data):.2f}")
            print(f"    Median: {statistics.median(failed_data):.2f}")
            print(f"    Min:    {min(failed_data)}")
            print(f"    Max:    {max(failed_data)}")
            if len(failed_data) > 1:
                print(f"    StdDev: {statistics.stdev(failed_data):.2f}")
        else:
            print(f"  Failed: No data")

def main():
    if len(sys.argv) < 2:
        print("Usage: python visualize_mut_distribution.py <json_file(s)> [output_dir]")
        print("\nExamples:")
        print("  # Single file")
        print("  python visualize_mut_distribution.py data/file_analysis.json ./output")
        print("\n  # Multiple files")
        print("  python visualize_mut_distribution.py file1.json file2.json file3.json ./output")
        print("\n  # Using glob pattern")
        print("  python visualize_mut_distribution.py 'data/*/file_analysis.json' ./output")
        sys.exit(1)
    
    # Parse arguments: all arguments except the last (if it's a directory) are file patterns
    args = sys.argv[1:]
    
    # Check if last argument is an output directory (doesn't have .json extension)
    if len(args) > 1 and not args[-1].endswith('.json') and not '*' in args[-1]:
        output_dir = args[-1]
        file_patterns = args[:-1]
    else:
        output_dir = None
        file_patterns = args
    
    print(f"File patterns: {file_patterns}")
    
    # Load all files
    all_files = load_multiple_files(file_patterns)
    
    if not all_files:
        print("Error: No valid JSON files found!")
        sys.exit(1)
    
    num_files = len(all_files)
    print(f"\nSuccessfully loaded {num_files} file(s)")
    
    # Merge data from all files
    if num_files > 1:
        print("Merging data from multiple files...")
        data = merge_data(all_files)
    else:
        data = list(all_files.values())[0]
    
    print(f"Total test files in merged data: {len(data)}")
    
    print("\nExtracting metrics...")
    passed_metrics, failed_metrics = extract_metrics(data)
    
    # Print statistics
    print_statistics(passed_metrics, failed_metrics)
    
    # Create output directory if specified
    if output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        hist_output = str(output_path / "mut_distribution_histograms.png")
        box_output = str(output_path / "mut_distribution_boxplots.png")
    else:
        hist_output = None
        box_output = None
    
    # Generate plots
    print("\nGenerating histogram plots...")
    plot_distributions(passed_metrics, failed_metrics, hist_output, num_files)
    
    print("Generating box plots...")
    plot_box_plots(passed_metrics, failed_metrics, box_output, num_files)
    
    print("\nDone!")

if __name__ == "__main__":
    """
    python src/analysis/visualize_mut_distribution.py /LSPRAG/experiments/motiv/assertion/opencode/gpt-5/codes-final-report/file_analysis.json /LSPRAG/experiments/projects/black/lsprag-workspace/20251203_114956/black/lsprag_withcontext_/gpt-5/results/final-final-report/file_analysis.json opencode-tests/gpt-5/2025-12-03T14-58-39/gpt-5/codes-final-report/file_analysis.json /LSPRAG/experiments/projects/tornado/lsprag-workspace/20251203_145746/tornado/lsprag_withcontext_/gpt-5/results/final-final-report/file_analysis.json ./output"""
    main()

