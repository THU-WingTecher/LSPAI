#!/bin/bash
set -euo pipefail

# Safe serial runner:
# - Runs one project at a time via run_one_project_again.sh
# - After each project, kills stale xvfb/vscode-test leftovers
# - Verifies no related processes remain before moving on

SCRIPT_ONE="/LSPRAG/scripts/run_a_project.sh"
LOG_DIR="/LSPRAG/logs"

if [ ! -x "$SCRIPT_ONE" ]; then
  echo "Missing executable: $SCRIPT_ONE"
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 <project1> [project2 ...]"
  echo "Example: $0 thefuck tornado"
  exit 1
fi

cleanup_residuals() {
  # Best-effort cleanup only; ignore failures if no process exists.
  pkill -f "run_one_project_again.sh" || true
  pkill -f "reflectRunner" || true
  pkill -f "npm run test" || true
  pkill -f "vscode-test" || true
  pkill -f "xvfb-run" || true
}

wait_until_clean() {
  local tries=20
  local pattern="run_a_project.sh|reflectRunner|npm run test|vscode-test|xvfb-run"
  while [ $tries -gt 0 ]; do
    if ! ps -ef | grep -E "$pattern" | grep -v grep >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    tries=$((tries - 1))
  done
  echo "Warning: residual processes still detected after wait."
  ps -ef | grep -E "$pattern" | grep -v grep || true
  return 1
}

for project in "$@"; do
  ts="$(date +%Y%m%d_%H%M%S)"
  log_file="$LOG_DIR/run_${project}_single_${ts}.log"

  echo "========== START $project =========="
  echo "Log: $log_file"
  bash "$SCRIPT_ONE" "$project" 2>&1 | tee "$log_file"
  echo "========== DONE $project =========="

  echo "Cleaning residual processes..."
  cleanup_residuals
  wait_until_clean || true
done

echo "========== ALL PROJECTS DONE (SERIAL SAFE) =========="
