#!/usr/bin/env python3
"""
eval_swarm_cg.py — Evaluate LLM call-graph analysis on SWARM-CG benchmarks.

Compares two conditions:
  1. baseline:  LLM reads code only
  2. augmented: LLM reads code + lsprag-skills callHierarchy output

Usage:
  # Baseline only (LLM-only call graph generation)
  python eval_swarm_cg.py --mode baseline --model gpt-4o-mini --suite pycg

  # Augmented (LLM + tool output)
  python eval_swarm_cg.py --mode augmented --model gpt-4o-mini --suite pycg

  # Both (A/B comparison)
  python eval_swarm_cg.py --mode both --model gpt-4o-mini --suite pycg

  # Subset of categories
  python eval_swarm_cg.py --mode both --model gpt-4o-mini --categories direct_calls,classes

  # Limit number of test cases (for quick pilot)
  python eval_swarm_cg.py --mode both --model gpt-4o-mini --max-tests 20

Environment:
  OPENAI_API_KEY   — required for OpenAI models
  ANTHROPIC_API_KEY — required for Claude models
"""
import argparse
import json
import os
import re
import subprocess
import sys
import csv
import time
from pathlib import Path
from typing import Any

# ── paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
SWARM_CG_DIR = SCRIPT_DIR.parent / "SWARM-CG"
BENCHMARKS_DIR = SWARM_CG_DIR / "benchmarks" / "python"

# ── metrics (ported from SWARM-CG) ───────────────────────────────────────────


def equal_sound(actual: dict, expected: dict) -> bool:
    """All expected edges exist in actual (no false negatives)."""
    for item in expected:
        if item not in actual:
            return False
        for edge in expected[item]:
            if edge not in actual.get(item, []):
                return False
    return True


def equal_complete(actual: dict, expected: dict) -> bool:
    """All actual edges exist in expected (no false positives)."""
    for item in actual:
        if item not in expected:
            continue
        for edge in actual[item]:
            if edge not in expected.get(item, []):
                return False
    return True


def measure_precision(actual: dict, expected: dict) -> float:
    num_all = 0
    num_caught = 0
    for node in actual:
        num_all += len(actual[node])
        for item in actual[node]:
            if item in expected.get(node, []):
                num_caught += 1
    return num_caught / max(num_all, 1)


def measure_recall(actual: dict, expected: dict) -> float:
    num_all = 0
    num_caught = 0
    for node in expected:
        num_all += len(expected[node])
        for item in expected[node]:
            if item in actual.get(node, []):
                num_caught += 1
    return num_caught / max(num_all, 1)


def measure_exact_matches(actual: dict, expected: dict) -> tuple[int, int]:
    num_all = 0
    num_exact = 0
    for node in expected:
        items = expected[node]
        actual_items = actual.get(node)
        if not items:
            num_all += 1
            if actual_items == []:
                num_exact += 1
            continue
        num_all += len(items)
        for item in items:
            if actual_items is not None and item in actual_items:
                num_exact += 1
    return num_exact, max(num_all, 1)


# ── code loading ──────────────────────────────────────────────────────────────


def load_test_code(test_dir: Path) -> str:
    """Read all source files in a test directory, concatenated."""
    parts = []
    for f in sorted(test_dir.rglob("*.py")):
        if f.name.startswith("."):
            continue
        rel = f.relative_to(test_dir)
        parts.append(f"# --- {rel} ---\n{f.read_text()}")
    return "\n\n".join(parts)


def load_callgraph(test_dir: Path) -> dict:
    cg_path = test_dir / "callgraph.json"
    if not cg_path.exists():
        return {}
    return json.loads(cg_path.read_text())


# ── prompt construction ───────────────────────────────────────────────────────


def build_baseline_prompt(code: str, expected_cg: dict) -> list[dict]:
    """Build prompt asking LLM to produce a call graph (baseline — no tool output)."""
    # Generate questions from the expected call graph (same approach as SWARM-CG)
    questions = generate_questions(expected_cg)
    question_block = "\n".join(
        f"{i+1}. {q}" for i, q in enumerate(questions)
    )

    system = (
        "You will examine and identify the function calls in the given Python code. "
        "You have to examine the code in detail by resolving the alias of variables."
    )

    user = (
        "Examine the following Python code and answer each question by listing "
        "the functions that are called. List only the fully qualified function names "
        "(e.g., main.func, main.ClassName.method), separated by commas. "
        "Include implicit calls like __init__ when objects are created. "
        "If no functions are called, leave the answer empty.\n\n"
        f"```python\n{code}\n```\n\n"
        f"Questions:\n{question_block}\n\n"
        "Provide your answers in this exact format:\n"
        + "\n".join(f"{i+1}. " for i in range(len(questions)))
    )

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def build_augmented_prompt(
    code: str, expected_cg: dict, tool_output: str
) -> list[dict]:
    """Build prompt with tool output injected."""
    questions = generate_questions(expected_cg)
    question_block = "\n".join(
        f"{i+1}. {q}" for i, q in enumerate(questions)
    )

    system = (
        "You will examine and identify the function calls in the given Python code. "
        "You have to examine the code in detail by resolving the alias of variables. "
        "You are also provided with call hierarchy analysis from an LSP tool to help you."
    )

    user = (
        "Examine the following Python code and answer each question by listing "
        "the functions that are called. List only the fully qualified function names "
        "(e.g., main.func, main.ClassName.method), separated by commas. "
        "Include implicit calls like __init__ when objects are created. "
        "If no functions are called, leave the answer empty.\n\n"
        f"```python\n{code}\n```\n\n"
        "## LSP Call Hierarchy Analysis\n"
        "The following call hierarchy information was extracted by a static analysis tool:\n"
        f"```\n{tool_output}\n```\n\n"
        f"Questions:\n{question_block}\n\n"
        "Provide your answers in this exact format:\n"
        + "\n".join(f"{i+1}. " for i in range(len(questions)))
    )

    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def generate_questions(cg: dict) -> list[str]:
    """Generate questions from a ground-truth call graph (matching SWARM-CG style)."""
    questions = []
    for key in sorted(cg.keys()):
        # Module-level (key is just the module name like "main")
        if "." not in key:
            questions.append(
                f"What are the function calls at the module level in '{key}'?"
            )
        else:
            questions.append(
                f"What are the function calls inside '{key}'?"
            )
    return questions


# ── answer parsing ────────────────────────────────────────────────────────────


def parse_llm_answers(response_text: str, expected_cg: dict) -> dict:
    """Parse numbered answers from LLM response into a call graph JSON."""
    keys = sorted(expected_cg.keys())
    result = {k: [] for k in keys}

    # Find numbered answers: "1. func1, func2\n2. \n3. ..."
    pattern = re.compile(r"(\d+)\.\s*(.*)")
    for match in pattern.finditer(response_text):
        idx = int(match.group(1)) - 1
        answer_text = match.group(2).strip()
        if idx < 0 or idx >= len(keys):
            continue
        if not answer_text:
            result[keys[idx]] = []
            continue
        callees = [c.strip() for c in answer_text.split(",") if c.strip()]
        result[keys[idx]] = callees

    return result


# ── LLM call ──────────────────────────────────────────────────────────────────


def call_llm(messages: list[dict], model: str, max_tokens: int = 512) -> str:
    """Call an LLM API. Supports openai, anthropic, and deepseek models."""
    if model.startswith("claude"):
        return _call_anthropic(messages, model, max_tokens)
    elif model.startswith("deepseek"):
        return _call_deepseek(messages, model, max_tokens)
    else:
        return _call_openai(messages, model, max_tokens)


def _call_openai(messages: list[dict], model: str, max_tokens: int) -> str:
    try:
        from openai import OpenAI
    except ImportError:
        print("pip install openai  (required for OpenAI models)", file=sys.stderr)
        sys.exit(1)

    client = OpenAI()
    resp = client.chat.completions.create(
        model=model, messages=messages, temperature=0, max_tokens=max_tokens
    )
    return resp.choices[0].message.content or ""


def _call_deepseek(messages: list[dict], model: str, max_tokens: int) -> str:
    try:
        from openai import OpenAI
    except ImportError:
        print("pip install openai  (required for DeepSeek models)", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(
        api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
        base_url="https://api.deepseek.com",
    )
    resp = client.chat.completions.create(
        model=model, messages=messages, temperature=0, max_tokens=max_tokens
    )
    return resp.choices[0].message.content or ""


def _call_anthropic(messages: list[dict], model: str, max_tokens: int) -> str:
    try:
        import anthropic
    except ImportError:
        print("pip install anthropic  (required for Claude models)", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic()
    system_msg = ""
    user_msgs = []
    for m in messages:
        if m["role"] == "system":
            system_msg = m["content"]
        else:
            user_msgs.append(m)

    resp = client.messages.create(
        model=model,
        system=system_msg,
        messages=user_msgs,
        temperature=0,
        max_tokens=max_tokens,
    )
    return resp.content[0].text


# ── tool output simulation ────────────────────────────────────────────────────


def run_lsprag_call_hierarchy(test_dir: Path) -> str:
    """
    Run lsprag callHierarchy on the main.py of a test case.

    Returns the tool output as a string, or empty string if the tool
    is not available or fails.

    Requires LSPRAG_LSP_PROVIDER to point to a real LSP provider.
    No regex fallback — only real LSP analysis is used.
    """
    main_py = test_dir / "main.py"
    if not main_py.exists():
        return ""

    provider = os.environ.get("LSPRAG_LSP_PROVIDER", "")
    if not provider:
        print("  WARNING: LSPRAG_LSP_PROVIDER not set — augmented mode needs a real LSP provider", file=sys.stderr)
        return ""

    lsprag_bin = REPO_ROOT / "lsprag-skills" / "scripts" / "lsprag"
    if not lsprag_bin.exists():
        print("  WARNING: lsprag CLI not found — augmented mode needs lsprag-skills installed", file=sys.stderr)
        return ""

    outputs = []
    # Get symbols from the file to query call hierarchy
    code = main_py.read_text()
    # Use LSP to discover top-level symbols — parse def/class names only for CLI invocation targets
    func_names = re.findall(r"^(?:def|class)\s+(\w+)", code, re.MULTILINE)
    for name in func_names:
        for direction in ["outgoing", "incoming"]:
            try:
                result = subprocess.run(
                    [
                        str(lsprag_bin),
                        "callHierarchy",
                        "--file", str(main_py.resolve()),
                        "--symbol", name,
                        "--direction", direction,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    env={**os.environ, "LSPRAG_LSP_PROVIDER": provider},
                )
                if result.stdout.strip():
                    outputs.append(result.stdout.strip())
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass

    return "\n\n".join(outputs)


# ── evaluation loop ───────────────────────────────────────────────────────────


def discover_tests(
    suite: str, categories: list[str] | None = None, max_tests: int = 0
) -> list[tuple[str, str, Path]]:
    """Discover test cases. Returns list of (category, test_name, test_path)."""
    suite_dir = BENCHMARKS_DIR / suite
    if not suite_dir.exists():
        print(f"Suite not found: {suite_dir}", file=sys.stderr)
        sys.exit(1)

    tests = []
    for cat_dir in sorted(suite_dir.iterdir()):
        if not cat_dir.is_dir():
            continue
        if categories and cat_dir.name not in categories:
            continue
        for test_dir in sorted(cat_dir.iterdir()):
            if not test_dir.is_dir():
                continue
            if not (test_dir / "callgraph.json").exists():
                continue
            tests.append((cat_dir.name, test_dir.name, test_dir))
            if max_tests and len(tests) >= max_tests:
                return tests
    return tests


def evaluate_single(
    test_path: Path,
    mode: str,
    model: str,
) -> dict:
    """Evaluate a single test case. Returns metrics dict."""
    code = load_test_code(test_path)
    expected_cg = load_callgraph(test_path)

    if not expected_cg:
        return {"skipped": True}

    if mode == "baseline":
        messages = build_baseline_prompt(code, expected_cg)
    else:
        tool_output = run_lsprag_call_hierarchy(test_path)
        messages = build_augmented_prompt(code, expected_cg, tool_output)

    response = call_llm(messages, model)
    actual_cg = parse_llm_answers(response, expected_cg)

    precision = measure_precision(actual_cg, expected_cg)
    recall = measure_recall(actual_cg, expected_cg)
    exact, total = measure_exact_matches(actual_cg, expected_cg)

    return {
        "precision": precision,
        "recall": recall,
        "exact_matches": exact,
        "num_all": total,
        "sound": equal_sound(actual_cg, expected_cg),
        "complete": equal_complete(actual_cg, expected_cg),
        "actual_cg": actual_cg,
        "response": response,
    }


def run_evaluation(args: argparse.Namespace):
    tests = discover_tests(
        args.suite,
        args.categories.split(",") if args.categories else None,
        args.max_tests,
    )
    print(f"Discovered {len(tests)} test cases in suite '{args.suite}'")

    modes = ["baseline", "augmented"] if args.mode == "both" else [args.mode]

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    results_dir = SCRIPT_DIR / "results" / f"swarm-cg-{args.model}-{timestamp}"
    results_dir.mkdir(parents=True, exist_ok=True)

    for mode in modes:
        print(f"\n{'='*60}")
        print(f"  Running: {mode.upper()} (model={args.model})")
        print(f"{'='*60}\n")

        per_category: dict[str, dict] = {}
        all_results = []

        for i, (cat, test_name, test_path) in enumerate(tests):
            label = f"[{i+1}/{len(tests)}] {cat}/{test_name}"
            try:
                result = evaluate_single(test_path, mode, args.model)
            except Exception as e:
                print(f"  {label}: ERROR — {e}")
                result = {"skipped": True, "error": str(e)}

            if result.get("skipped"):
                print(f"  {label}: SKIPPED")
                continue

            p = result["precision"]
            r = result["recall"]
            print(f"  {label}: precision={p:.2f} recall={r:.2f} sound={result['sound']} complete={result['complete']}")

            all_results.append({
                "category": cat,
                "test": test_name,
                "mode": mode,
                **{k: v for k, v in result.items() if k not in ("actual_cg", "response")},
            })

            if cat not in per_category:
                per_category[cat] = {
                    "precision_sum": 0, "recall_sum": 0,
                    "exact_matches": 0, "num_all": 0,
                    "sound": 0, "complete": 0, "count": 0,
                }
            c = per_category[cat]
            c["precision_sum"] += p
            c["recall_sum"] += r
            c["exact_matches"] += result["exact_matches"]
            c["num_all"] += result["num_all"]
            c["sound"] += int(result["sound"])
            c["complete"] += int(result["complete"])
            c["count"] += 1

        # ── summary ──────────────────────────────────────────────────────
        print(f"\n{'─'*60}")
        print(f"  Summary: {mode.upper()}")
        print(f"{'─'*60}")
        print(f"  {'Category':<25} {'Prec':>6} {'Rec':>6} {'EM%':>6} {'Sound':>8} {'Complete':>10} {'N':>4}")
        print(f"  {'─'*25} {'─'*6} {'─'*6} {'─'*6} {'─'*8} {'─'*10} {'─'*4}")

        total_p = total_r = 0.0
        total_em = total_all = 0
        total_sound = total_complete = total_count = 0

        for cat in sorted(per_category):
            c = per_category[cat]
            n = c["count"]
            avg_p = c["precision_sum"] / n
            avg_r = c["recall_sum"] / n
            em_pct = 100 * c["exact_matches"] / max(c["num_all"], 1)
            print(
                f"  {cat:<25} {avg_p:>6.2f} {avg_r:>6.2f} {em_pct:>5.1f}% "
                f"{c['sound']:>4}/{n:<3} {c['complete']:>6}/{n:<3} {n:>4}"
            )
            total_p += c["precision_sum"]
            total_r += c["recall_sum"]
            total_em += c["exact_matches"]
            total_all += c["num_all"]
            total_sound += c["sound"]
            total_complete += c["complete"]
            total_count += n

        if total_count:
            print(f"  {'─'*25} {'─'*6} {'─'*6} {'─'*6} {'─'*8} {'─'*10} {'─'*4}")
            avg_p = total_p / total_count
            avg_r = total_r / total_count
            em_pct = 100 * total_em / max(total_all, 1)
            print(
                f"  {'TOTAL':<25} {avg_p:>6.2f} {avg_r:>6.2f} {em_pct:>5.1f}% "
                f"{total_sound:>4}/{total_count:<3} {total_complete:>6}/{total_count:<3} {total_count:>4}"
            )

        # ── save results ─────────────────────────────────────────────────
        results_file = results_dir / f"{mode}_results.jsonl"
        with open(results_file, "w") as f:
            for r in all_results:
                f.write(json.dumps(r) + "\n")

        summary_file = results_dir / f"{mode}_summary.csv"
        with open(summary_file, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "category", "avg_precision", "avg_recall", "exact_match_pct",
                "sound_rate", "complete_rate", "num_tests"
            ])
            for cat in sorted(per_category):
                c = per_category[cat]
                n = c["count"]
                writer.writerow([
                    cat,
                    f"{c['precision_sum']/n:.4f}",
                    f"{c['recall_sum']/n:.4f}",
                    f"{100*c['exact_matches']/max(c['num_all'],1):.2f}",
                    f"{c['sound']/n:.4f}",
                    f"{c['complete']/n:.4f}",
                    n,
                ])

        print(f"\n  Results saved to: {results_file}")
        print(f"  Summary saved to: {summary_file}")

    print(f"\nAll results in: {results_dir}")


# ── main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Evaluate LLM call-graph analysis on SWARM-CG benchmarks"
    )
    parser.add_argument(
        "--mode",
        choices=["baseline", "augmented", "both"],
        default="both",
        help="Evaluation mode: baseline (LLM only), augmented (LLM + tool), both",
    )
    parser.add_argument(
        "--model",
        default="gpt-4o-mini",
        help="LLM model to use (default: gpt-4o-mini)",
    )
    parser.add_argument(
        "--suite",
        default="pycg",
        help="SWARM-CG benchmark suite (default: pycg)",
    )
    parser.add_argument(
        "--categories",
        default=None,
        help="Comma-separated categories to evaluate (default: all)",
    )
    parser.add_argument(
        "--max-tests",
        type=int,
        default=0,
        help="Max test cases to evaluate (0 = all)",
    )
    args = parser.parse_args()

    run_evaluation(args)
