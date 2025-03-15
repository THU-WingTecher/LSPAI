# Minimal usage (only srcPath required)
# npm run experiment /LSPAI/experiments/projects/commons-cli

# Full usage with all options
xvfb-run -a npm run experiment /LSPAI/experiments/projects/commons-cli \
    --model deepseek-reasoner \
    --provider deepseek \
    --exp-prob 0.2 \
    --timeout 0 \
    --parallel-count 16 \
    --max-round 5 \
    --prompt-type detailed