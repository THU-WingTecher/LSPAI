# Mutation Analysis Visualization

## visualize_mut_distribution.py

This script visualizes the distribution of mutation analysis metrics, comparing **Passed** vs **Failed** test cases across multiple metrics.

### Features

- ✅ Support for single or multiple JSON files
- ✅ Automatic merging of data from multiple sources
- ✅ Glob pattern support for batch processing
- ✅ Generates both histograms and box plots
- ✅ Detailed statistics output

### Metrics Analyzed

1. **Total Tokens** - Number of tokens in the mutation analysis
2. **Unique Paths** - Number of unique code paths
3. **External Dependency Tokens** - Tokens from external dependencies
4. **Tokens in File Outside Function** - Count of tokens in the same file but outside the function
5. **Tokens in Other Documents** - Count of tokens from other documents

### Usage

#### Single File

```bash
python src/analysis/visualize_mut_distribution.py path/to/file_analysis.json
```

#### Single File with Output Directory

```bash
python src/analysis/visualize_mut_distribution.py path/to/file_analysis.json ./output
```

#### Multiple Files

```bash
python src/analysis/visualize_mut_distribution.py \
    file1.json \
    file2.json \
    file3.json \
    ./output
```

#### Using Glob Patterns

```bash
# Match all file_analysis.json files in subdirectories
python src/analysis/visualize_mut_distribution.py \
    'opencode-tests/*/file_analysis.json' \
    ./output

# Match multiple patterns
python src/analysis/visualize_mut_distribution.py \
    'experiment1/*/file_analysis.json' \
    'experiment2/*/file_analysis.json' \
    ./output
```

### Output

The script generates:

1. **Console Output**: Detailed statistics for each metric
   - Count (n)
   - Mean
   - Median
   - Min/Max
   - Standard Deviation

2. **mut_distribution_histograms.png**: Overlapping histograms showing frequency distributions
   - Green bars: Passed tests
   - Red bars: Failed tests

3. **mut_distribution_boxplots.png**: Box plots showing statistical summaries
   - Green boxes: Passed tests
   - Red boxes: Failed tests
   - Shows median, quartiles, and outliers

### Dependencies

```bash
pip install matplotlib seaborn
```

### Example

```bash
# Analyze a single experiment
python src/analysis/visualize_mut_distribution.py \
    opencode-tests/gpt-5/2025-12-03T14-58-39/gpt-5/codes-final-report/file_analysis.json \
    ./output

# Compare multiple experiments
python src/analysis/visualize_mut_distribution.py \
    'opencode-tests/gpt-5/*/gpt-5/codes-final-report/file_analysis.json' \
    ./merged_analysis
```

### Notes

- If multiple files contain the same test file path, the script automatically creates unique keys
- When merging, the total count of test files from all sources is reported
- Statistics are computed on the merged dataset
- The plot title indicates how many files were merged

