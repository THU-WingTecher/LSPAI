# Minimal usage (only srcPath required)
# it should be pass the below test File first :
xvfb-run -a npm run test --testFile=llm  # check whether we can invoke LLM successfully

# Full usage with all options
xvfb-run -a npm run test --testFile=exp.python

# xvfb-run -a npm run experiment /LSPRAG/experiments/projects/commons-cli \
#     --model deepseek-reasoner \
#     --provider deepseek \
#     --exp-prob 0.2 \
#     --timeout 0 \
#     --parallel-count 16 \
#     --max-round 5 \
#     --prompt-type detailed