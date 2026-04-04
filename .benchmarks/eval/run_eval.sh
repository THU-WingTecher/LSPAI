#!/usr/bin/env bash
set -euo pipefail

# run_eval.sh — Run lsprag-skills evaluation on code analysis benchmarks
#
# Usage:
#   ./run_eval.sh swarm-cg [options]   # SWARM-CG call graph benchmark
#   ./run_eval.sh core [options]       # CoRe dependency analysis benchmark
#   ./run_eval.sh pilot                # Quick pilot: 20 tests on each benchmark
#
# Examples:
#   ./run_eval.sh swarm-cg --model gpt-4o-mini --mode both --max-tests 20
#   ./run_eval.sh core --model gpt-4o-mini --task data --lang Python --mode both --max-tasks 20
#   ./run_eval.sh pilot --model gpt-4o-mini

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'HELP'
run_eval.sh — Evaluate lsprag-skills on code analysis benchmarks

Usage:
  ./run_eval.sh <benchmark> [options]

Benchmarks:
  swarm-cg    SWARM-CG call graph micro-benchmarks (precision/recall/soundness)
  core        CoRe dependency analysis (classification accuracy, trace quality)
  pilot       Quick pilot run on both benchmarks (20 tests each)

Common options:
  --model <name>     LLM model (default: gpt-4o-mini)
  --mode <mode>      baseline | augmented | both (default: both)

SWARM-CG options:
  --suite <name>     Benchmark suite (default: pycg)
  --categories <csv> Comma-separated categories
  --max-tests <n>    Max test cases

CoRe options:
  --task <type>      data | control | infoflow | all (default: data)
  --lang <lang>      C | Java | Python | all (default: Python)
  --eval-mode <m>    source | trace (default: source)
  --max-tasks <n>    Max tasks

Environment:
  OPENAI_API_KEY      Required for OpenAI models
  ANTHROPIC_API_KEY   Required for Claude models
  LSPRAG_LSP_PROVIDER Optional: path to LSP provider for real tool output

Examples:
  # Quick pilot (20 tests per benchmark, A/B comparison)
  ./run_eval.sh pilot --model gpt-4o-mini

  # Full SWARM-CG evaluation
  ./run_eval.sh swarm-cg --model gpt-4o-mini --mode both

  # CoRe data dependency on Python
  ./run_eval.sh core --model gpt-4o-mini --task data --lang Python --mode both
HELP
}

CMD="${1:-}"
shift 2>/dev/null || true

case "$CMD" in
  swarm-cg)
    exec python3 "$SCRIPT_DIR/eval_swarm_cg.py" "$@"
    ;;
  core)
    exec python3 "$SCRIPT_DIR/eval_core.py" "$@"
    ;;
  pilot)
    MODEL="gpt-4o-mini"
    MODE="both"
    # Parse overrides
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --model) MODEL="$2"; shift 2 ;;
        --mode)  MODE="$2";  shift 2 ;;
        *)       shift ;;
      esac
    done

    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  LSPRAG-Skills Evaluation Pilot                     ║"
    echo "║  Model: $MODEL                                      "
    echo "║  Mode:  $MODE                                       "
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""

    echo "▶ SWARM-CG: Call Graph Analysis (20 tests)"
    echo "─────────────────────────────────────────────"
    python3 "$SCRIPT_DIR/eval_swarm_cg.py" \
      --model "$MODEL" --mode "$MODE" \
      --max-tests 20 --suite pycg
    echo ""

    echo "▶ CoRe: Data Dependency — Python (20 tasks)"
    echo "─────────────────────────────────────────────"
    python3 "$SCRIPT_DIR/eval_core.py" \
      --model "$MODEL" --mode "$MODE" \
      --task data --lang Python --eval-mode source \
      --max-tasks 20
    echo ""

    echo "▶ CoRe: Control Dependency — Python (20 tasks)"
    echo "─────────────────────────────────────────────────"
    python3 "$SCRIPT_DIR/eval_core.py" \
      --model "$MODEL" --mode "$MODE" \
      --task control --lang Python --eval-mode source \
      --max-tasks 20

    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "  Pilot evaluation complete."
    echo "  Results in: $SCRIPT_DIR/results/"
    echo "════════════════════════════════════════════════════════"
    ;;
  help|--help|-h)
    usage
    ;;
  "")
    usage
    exit 1
    ;;
  *)
    echo "Unknown benchmark: $CMD" >&2
    usage
    exit 1
    ;;
esac
