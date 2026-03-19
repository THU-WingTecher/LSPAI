#!/usr/bin/env bash
set -euo pipefail

PARALLEL_COUNT="${PARALLEL_COUNT:-64}"

run_one() {
  local project_name="$1"
  local task_list_path="$2"
  local model_name="$3"
  local provider_name="$4"
  local config_path="$5"

  xvfb-run -a npm run test \
    --testFile=exp.python.reflectRunner \
    --projectName="${project_name}" \
    --taskListPath="${task_list_path}" \
    --parallelCount="${PARALLEL_COUNT}" \
    --model="${model_name}" \
    --provider="${provider_name}" \
    --testType=config \
    --testConfigPath="${config_path}"

  echo "Finished running tests for ${project_name} with model ${model_name}, provider ${provider_name}, config ${config_path}"
}

# deepseek
# run_one black /LSPRAG/experiments/config/black-robust-final.json deepseek-chat deepseek /LSPRAG/experiments/config/repetitive/black-deepseek.json
# run_one tornado /LSPRAG/experiments/config/tornado-robust-final.json deepseek-chat deepseek /LSPRAG/experiments/config/repetitive/tornado-deepseek.json
# run_one sanic /LSPRAG/experiments/config/sanic-robust-final.json deepseek-chat deepseek /LSPRAG/experiments/config/repetitive/sanic-deepseek.json
# run_one youtube-dl /LSPRAG/experiments/config/youtube-dl-robust-final.json deepseek-chat deepseek /LSPRAG/experiments/config/repetitive/youtube-dl-deepseek.json
# run_one thefuck /LSPRAG/experiments/config/thefuck-robust-final.json deepseek-chat deepseek /LSPRAG/experiments/config/repetitive/thefuck-deepseek.json

# # # haiku
# run_one black /LSPRAG/experiments/config/black-robust-final.json claude-haiku-4-5 anthropic /LSPRAG/experiments/config/repetitive/black-haiku.json
# run_one tornado /LSPRAG/experiments/config/tornado-robust-final.json claude-haiku-4-5 anthropic /LSPRAG/experiments/config/repetitive/tornado-haiku.json
# run_one sanic /LSPRAG/experiments/config/sanic-robust-final.json claude-haiku-4-5 anthropic /LSPRAG/experiments/config/repetitive/sanic-haiku.json
# run_one youtube-dl /LSPRAG/experiments/config/youtube-dl-robust-final.json claude-haiku-4-5 anthropic /LSPRAG/experiments/config/repetitive/youtube-dl-haiku.json
# run_one thefuck /LSPRAG/experiments/config/thefuck-robust-final.json claude-haiku-4-5 anthropic /LSPRAG/experiments/config/repetitive/thefuck-haiku.json

# # gpt-5
# run_one black /LSPRAG/experiments/config/black-robust-final.json gpt-5 openai /LSPRAG/experiments/config/repetitive/black-gpt5.json
run_one tornado /LSPRAG/experiments/config/tornado-robust-final.json gpt-5 openai /LSPRAG/experiments/config/repetitive/tornado-gpt5.json
run_one sanic /LSPRAG/experiments/config/sanic-robust-final.json gpt-5 openai /LSPRAG/experiments/config/repetitive/sanic-gpt5.json
run_one youtube-dl /LSPRAG/experiments/config/youtube-dl-robust-final.json gpt-5 openai /LSPRAG/experiments/config/repetitive/youtube-dl-gpt5.json
run_one thefuck /LSPRAG/experiments/config/thefuck-robust-final.json gpt-5 openai /LSPRAG/experiments/config/repetitive/thefuck-gpt5.json


# black run three times 
run_one black /LSPRAG/experiments/config/black-robust-final.json deepseek-chat deepseek /LSPRAG/experiments/config/repetitive/black-deepseek.json
run_one black /LSPRAG/experiments/config/black-robust-final.json claude-haiku-4-5 anthropic /LSPRAG/experiments/config/repetitive/black-haiku.json
run_one black /LSPRAG/experiments/config/black-robust-final.json gpt-5 openai /LSPRAG/experiments/config/repetitive/black-gpt5.json
# black run three times 
run_one black /LSPRAG/experiments/config/black-robust-final.json deepseek-chat deepseek /LSPRAG/experiments/config/repetitive/black-deepseek.json
run_one black /LSPRAG/experiments/config/black-robust-final.json claude-haiku-4-5 anthropic /LSPRAG/experiments/config/repetitive/black-haiku.json
run_one black /LSPRAG/experiments/config/black-robust-final.json gpt-5 openai /LSPRAG/experiments/config/repetitive/black-gpt5.json
# black run three times 
run_one black /LSPRAG/experiments/config/black-robust-final.json deepseek-chat deepseek /LSPRAG/experiments/config/repetitive/black-deepseek.json
run_one black /LSPRAG/experiments/config/black-robust-final.json claude-haiku-4-5 anthropic /LSPRAG/experiments/config/repetitive/black-haiku.json
run_one black /LSPRAG/experiments/config/black-robust-final.json gpt-5 openai /LSPRAG/experiments/config/repetitive/black-gpt5.json
