#!/bin/bash
# Wrapper script to run assertion tracker with proper environment

# Activate black conda environment
source $(conda info --base)/etc/profile.d/conda.sh
conda activate black

# Set PYTHONPATH for black project
export PYTHONPATH=experiments/projects/black:experiments/projects/black/src:experiments/projects/black/src/black:experiments/projects/black/crawl4ai

# Run the assertion tracker with all arguments passed through
cd /LSPRAG
python3 scripts/assertion_tracker.py "$@"
