#!/bin/bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <black|tornado|thefuck|youtube-dl|dataclasses-json>"
  exit 1
fi

PROJECT="$1"
case "$PROJECT" in
  black)
    ENV_NAME="black"
    TASK_LIST="/LSPRAG/experiments/config/black-robust-final.json"
    PROJECT_ROOT="/LSPRAG/experiments/projects/black"
    CFG_JSON="/LSPRAG/expRun3Config_black.json"
    ;;
  thefuck)
    ENV_NAME="thefuck"
    TASK_LIST="/LSPRAG/experiments/config/thefuck-robust-final.json"
    PROJECT_ROOT="/LSPRAG/experiments/projects/thefuck"
    CFG_JSON="/LSPRAG/expRun3Config_thefuck.json"
    ;;
  tornado)
    ENV_NAME="tornado"
    TASK_LIST="/LSPRAG/experiments/config/tornado-robust-final.json"
    PROJECT_ROOT="/LSPRAG/experiments/projects/tornado"
    CFG_JSON="/LSPRAG/expRun3Config_tornado.json"
    ;;
  youtube-dl)
    ENV_NAME="youtube-dl"
    TASK_LIST="/LSPRAG/experiments/config/youtube-dl-robust-final.json"
    PROJECT_ROOT="/LSPRAG/experiments/projects/youtube-dl"
    CFG_JSON="/LSPRAG/expRun3Config_youtube_dl.json"
    ;;
  dataclasses-json)
    ENV_NAME="dataclasses-json"
    TASK_LIST="/LSPRAG/experiments/config/dataclass-json-robust-final.json"
    PROJECT_ROOT="/LSPRAG/experiments/projects/dataclasses-json"
    CFG_JSON="/LSPRAG/expRun3Config_dataclasses_json.json"
    ;;
  *)
    echo "Unsupported project: $PROJECT (use black, tornado, thefuck, youtube-dl, or dataclasses-json)"
    exit 1
    ;;
esac

source /root/miniconda3/etc/profile.d/conda.sh
source /LSPRAG/.env.sh
cd /LSPRAG

MODEL="claude-haiku-4-5"
PROVIDER="anthropic"
# MODEL="deepseek-chat"
# PROVIDER="deepseek"
CONC=30

echo "========== START $PROJECT (single-project run) =========="
conda activate "$ENV_NAME"

echo "[1/6] $PROJECT claudecode naive..."
npm run experiment -- --type claudecode \
  --task-list "$TASK_LIST" \
  --project-root "$PROJECT_ROOT" \
  --model "$MODEL" --provider "$PROVIDER" \
  --parallel true --concurrency "$CONC" \
  --output-name "claudecode-deepseek-$PROJECT"
echo "[1/6] DONE"

echo "[2/6] $PROJECT claudecode cfg..."
npm run experiment -- --type claudecode \
  --task-list "$TASK_LIST" \
  --project-root "$PROJECT_ROOT" \
  --model "$MODEL" --provider "$PROVIDER" \
  --parallel true --concurrency "$CONC" \
  --output-name "claudecode-deepseek-$PROJECT-cfg" --prompt-template cfg
echo "[2/6] DONE"

echo "[3/6] $PROJECT opencode naive..."
npm run experiment -- --type opencode \
  --task-list "$TASK_LIST" \
  --project-root "$PROJECT_ROOT" \
  --model "$MODEL" --provider "$PROVIDER" \
  --parallel true --concurrency "$CONC" \
  --output-name "opencode-deepseek-$PROJECT"
echo "[3/6] DONE"

echo "[4/6] $PROJECT opencode cfg..."
npm run experiment -- --type opencode \
  --task-list "$TASK_LIST" \
  --project-root "$PROJECT_ROOT" \
  --model "$MODEL" --provider "$PROVIDER" \
  --parallel true --concurrency "$CONC" \
  --output-name "opencode-deepseek-$PROJECT-cfg" --prompt-template cfg
echo "[4/6] DONE"

# echo "[5/6] $PROJECT config reflect..."
# xvfb-run -a npm run test \
#   --testFile=exp.python.reflectRunner \
#   --projectName="$PROJECT" \
#   --taskListPath="$TASK_LIST" \
#   --parallelCount="$CONC" \
#   --model="$MODEL" \
#   --provider="$PROVIDER" \
#   --testType=config \
#   --testConfigPath="$CFG_JSON"
# echo "[5/6] DONE"

# echo "[6/6] $PROJECT lsprag reflect..."
# xvfb-run -a npm run test \
#   --testFile=exp.python.reflectRunner \
#   --projectName="$PROJECT" \
#   --taskListPath="$TASK_LIST" \
#   --parallelCount="$CONC" \
#   --model="$MODEL" \
#   --provider="$PROVIDER" \
#   --testType=lsprag
# echo "[6/6] DONE"

echo "========== ALL DONE: $PROJECT =========="
