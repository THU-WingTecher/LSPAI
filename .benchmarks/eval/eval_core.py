#!/usr/bin/env python3
"""
eval_core.py — Evaluate LLM code reasoning on CoRe benchmark (dependency analysis).

Compares two conditions:
  1. baseline:  LLM with original CoRe prompts
  2. augmented: LLM with original prompts + lsprag-skills tool output appended

Usage:
  # Baseline on data dependency (Python, source mode), first 20 tasks
  python eval_core.py --mode baseline --model gpt-4o-mini --task data --lang Python --eval-mode source --max-tasks 20

  # A/B comparison
  python eval_core.py --mode both --model gpt-4o-mini --task data --lang Python --eval-mode source --max-tasks 20

  # All task types, all languages
  python eval_core.py --mode both --model gpt-4o-mini --task all --lang all --eval-mode source

Environment:
  OPENAI_API_KEY    — required for OpenAI models
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
CORE_DIR = SCRIPT_DIR.parent / "CoRe"
PROMPTS_DIR = CORE_DIR / "prompts"
RAW_DIR = CORE_DIR / "raw_annotation"

# ── response parsing (ported from CoRe/scripts/parse_response.py) ─────────────

DEPENDENCE_KEYS = {
    "control": "ControlDependence",
    "data": "DataDependence",
    "infoflow": "InformationFlow",
}

SOURCES_KEYS = {
    "control": ["ControlDependenceSources"],
    "data": ["DataDependenceSources"],
    "infoflow": ["InformationFlowSources", "InfomationFlowSources"],
}


def extract_code_blocks(text: str) -> list[str]:
    return re.findall(r"```(?:\w+)?\n?(.*?)```", text, re.DOTALL)


def parse_json_block(block: str) -> dict | None:
    try:
        return json.loads(block)
    except json.JSONDecodeError:
        return None


def parse_dependence_output(text: str, task_type: str) -> dict | None:
    """Parse LLM response into structured output (classification + trace or sources)."""
    key = DEPENDENCE_KEYS.get(task_type)
    if not key:
        return None

    blocks = extract_code_blocks(text)
    candidates = blocks if blocks else [text]

    for block in candidates:
        parsed = parse_json_block(block)
        if not parsed:
            continue

        # Check for sources format first
        for skey in SOURCES_KEYS.get(task_type, []):
            if skey in parsed:
                return {"sources": parsed[skey]}

        # Check for classification format
        if key in parsed:
            answer = bool(parsed[key])
            trace = parsed.get("Trace", []) if answer else []
            return {"answer": answer, "trace": trace}

    return None


# ── LLM call ──────────────────────────────────────────────────────────────────


def call_llm(prompt: str, model: str, max_tokens: int = 1024) -> str:
    """Call LLM with a single prompt string."""
    messages = [{"role": "user", "content": prompt}]

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
    resp = client.messages.create(
        model=model, messages=messages, temperature=0, max_tokens=max_tokens,
    )
    return resp.content[0].text


# ── tool augmentation ─────────────────────────────────────────────────────────


def generate_tool_augmentation(task: dict) -> str:
    """
    Generate tool output for a CoRe task using a real LSP provider.

    Requires LSPRAG_LSP_PROVIDER to be set. No regex fallback.
    Returns empty string if no provider is available.
    """
    provider = os.environ.get("LSPRAG_LSP_PROVIDER", "")
    if not provider:
        return ""

    lang = task.get("language", "")
    code_file = task.get("code_file", "")
    if not code_file:
        return ""

    code_path = RAW_DIR / lang / "code" / code_file
    if not code_path.exists():
        return ""

    lsprag_bin = SCRIPT_DIR.parent.parent / "lsprag-skills" / "scripts" / "lsprag"
    if not lsprag_bin.exists():
        return ""

    # Use lsprag referenceInfo on the source file for dependency analysis
    outputs = []
    src = task.get("src_transformed", {})
    dst = task.get("dst_transformed", {})

    for var_info in [src, dst]:
        if not var_info:
            continue
        name = var_info.get("name", "")
        line = var_info.get("line", 0)
        if not name or not line:
            continue
        try:
            result = subprocess.run(
                [
                    str(lsprag_bin),
                    "referenceInfo",
                    "--file", str(code_path.resolve()),
                    "--line", str(line),
                    "--character", "0",
                    "--symbol", name,
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


def augment_prompt(original_prompt: str, tool_output: str) -> str:
    """Append tool analysis output to the original CoRe prompt."""
    if not tool_output:
        return original_prompt

    augmentation = (
        "\n\n## Static Analysis Tool Output\n"
        "The following information was extracted by an LSP-based code analysis tool:\n"
        f"```\n{tool_output}\n```\n"
        "Use this information to help with your analysis, but verify it against the code."
    )
    return original_prompt + augmentation


# ── evaluation ────────────────────────────────────────────────────────────────


def load_prompt_file(task_type: str, lang: str, eval_mode: str) -> list[dict]:
    """Load tasks from a CoRe JSONL prompt file."""
    filename = f"{task_type}_{lang}_{eval_mode}.jsonl"
    prompt_path = PROMPTS_DIR / filename
    if not prompt_path.exists():
        print(f"Prompt file not found: {prompt_path}", file=sys.stderr)
        return []

    tasks = []
    with open(prompt_path) as f:
        for line in f:
            line = line.strip()
            if line:
                tasks.append(json.loads(line))
    return tasks


def evaluate_source_response(
    response: dict | None, task: dict, task_type: str
) -> dict:
    """Evaluate a source-mode response against ground truth."""
    if response is None:
        return {"parsed": False}

    if "sources" in response:
        # Source enumeration format
        return {"parsed": True, "has_sources": True, "sources": response["sources"]}

    return {"parsed": True, "has_sources": False}


def evaluate_trace_response(
    response: dict | None, task: dict, task_type: str
) -> dict:
    """Evaluate a trace-mode response against ground truth."""
    if response is None:
        return {"parsed": False, "classification_correct": False}

    gt = task.get("groundtruth")
    if "answer" in response:
        correct = response["answer"] == gt
        return {
            "parsed": True,
            "classification_correct": correct,
            "predicted": response["answer"],
            "groundtruth": gt,
            "has_trace": len(response.get("trace", [])) > 0,
        }

    return {"parsed": True, "classification_correct": False}


def run_evaluation(args: argparse.Namespace):
    task_types = ["data", "control", "infoflow"] if args.task == "all" else [args.task]
    languages = ["C", "Java", "Python"] if args.lang == "all" else [args.lang]
    modes = ["baseline", "augmented"] if args.mode == "both" else [args.mode]

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    results_dir = SCRIPT_DIR / "results" / f"core-{args.model}-{timestamp}"
    results_dir.mkdir(parents=True, exist_ok=True)

    all_summaries = []

    for mode in modes:
        print(f"\n{'='*60}")
        print(f"  Mode: {mode.upper()} | Model: {args.model}")
        print(f"{'='*60}")

        for task_type in task_types:
            for lang in languages:
                tasks = load_prompt_file(task_type, lang, args.eval_mode)
                if not tasks:
                    continue

                if args.max_tasks:
                    tasks = tasks[:args.max_tasks]

                label = f"{task_type}_{lang}_{args.eval_mode}"
                print(f"\n  [{label}] {len(tasks)} tasks")

                results = []
                parsed_count = 0
                correct_count = 0

                for i, task in enumerate(tasks):
                    prompt = task.get("prompt", "")
                    if not prompt:
                        continue

                    if mode == "augmented":
                        tool_output = generate_tool_augmentation(task)
                        prompt = augment_prompt(prompt, tool_output)

                    try:
                        response_text = call_llm(prompt, args.model)
                    except Exception as e:
                        print(f"    [{i+1}/{len(tasks)}] ERROR: {e}")
                        results.append({"task_id": task.get("task_id"), "error": str(e)})
                        continue

                    parsed = parse_dependence_output(response_text, task_type)

                    if args.eval_mode == "trace":
                        eval_result = evaluate_trace_response(parsed, task, task_type)
                    else:
                        eval_result = evaluate_source_response(parsed, task, task_type)

                    if eval_result.get("parsed"):
                        parsed_count += 1
                    if eval_result.get("classification_correct"):
                        correct_count += 1

                    status = "OK" if eval_result.get("parsed") else "FAIL"
                    if args.eval_mode == "trace" and eval_result.get("parsed"):
                        status = "CORRECT" if eval_result.get("classification_correct") else "WRONG"

                    if (i + 1) % 10 == 0 or i == len(tasks) - 1:
                        print(f"    [{i+1}/{len(tasks)}] parsed={parsed_count} correct={correct_count}")

                    results.append({
                        "task_id": task.get("task_id"),
                        "mode": mode,
                        "response_raw": response_text[:500],
                        **eval_result,
                    })

                # Summary
                n = len(results)
                parse_rate = parsed_count / max(n, 1)
                acc = correct_count / max(n, 1) if args.eval_mode == "trace" else None

                summary = {
                    "mode": mode,
                    "task_type": task_type,
                    "language": lang,
                    "eval_mode": args.eval_mode,
                    "num_tasks": n,
                    "parsed": parsed_count,
                    "parse_rate": f"{parse_rate:.4f}",
                }
                if acc is not None:
                    summary["accuracy"] = f"{acc:.4f}"
                    summary["correct"] = correct_count

                all_summaries.append(summary)

                print(f"    → parse_rate={parse_rate:.2%}" + (f" accuracy={acc:.2%}" if acc is not None else ""))

                # Save per-config results
                out_file = results_dir / f"{mode}_{label}_results.jsonl"
                with open(out_file, "w") as f:
                    for r in results:
                        f.write(json.dumps(r, default=str) + "\n")

    # Save overall summary
    summary_file = results_dir / "summary.csv"
    if all_summaries:
        keys = list(all_summaries[0].keys())
        with open(summary_file, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(all_summaries)

    # Print comparison table
    if len(modes) == 2:
        print(f"\n{'='*60}")
        print("  A/B Comparison")
        print(f"{'='*60}")
        print(f"  {'Config':<30} {'Baseline':>10} {'Augmented':>10} {'Delta':>8}")
        print(f"  {'─'*30} {'─'*10} {'─'*10} {'─'*8}")

        baseline_results = {s["task_type"] + "_" + s["language"]: s for s in all_summaries if s["mode"] == "baseline"}
        augmented_results = {s["task_type"] + "_" + s["language"]: s for s in all_summaries if s["mode"] == "augmented"}

        for key in sorted(set(baseline_results) | set(augmented_results)):
            b = baseline_results.get(key, {})
            a = augmented_results.get(key, {})
            metric = "accuracy" if args.eval_mode == "trace" else "parse_rate"
            bv = float(b.get(metric, 0))
            av = float(a.get(metric, 0))
            delta = av - bv
            sign = "+" if delta > 0 else ""
            print(f"  {key:<30} {bv:>9.2%} {av:>9.2%} {sign}{delta:>7.2%}")

    print(f"\nAll results in: {results_dir}")


# ── main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Evaluate LLM code reasoning on CoRe benchmark"
    )
    parser.add_argument(
        "--mode",
        choices=["baseline", "augmented", "both"],
        default="both",
        help="Evaluation mode",
    )
    parser.add_argument(
        "--model",
        default="gpt-4o-mini",
        help="LLM model (default: gpt-4o-mini)",
    )
    parser.add_argument(
        "--task",
        choices=["data", "control", "infoflow", "all"],
        default="data",
        help="CoRe task type (default: data)",
    )
    parser.add_argument(
        "--lang",
        choices=["C", "Java", "Python", "all"],
        default="Python",
        help="Programming language (default: Python)",
    )
    parser.add_argument(
        "--eval-mode",
        choices=["source", "trace"],
        default="source",
        help="Evaluation mode: source (enumerate deps) or trace (classify + trace)",
    )
    parser.add_argument(
        "--max-tasks",
        type=int,
        default=0,
        help="Max tasks to evaluate (0 = all)",
    )
    args = parser.parse_args()
    run_evaluation(args)
