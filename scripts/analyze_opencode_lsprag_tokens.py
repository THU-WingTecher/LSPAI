#!/usr/bin/env python3
"""
Analyze token usage for opencode and lsprag experiments.

What this script does:
1) Scans experiments/data/result for assertion_analysis_summary.json files.
2) Keeps the newest run (by mtime) per:
      (tool, variant, model, project)
   where:
      - tool in {opencode, lsprag}
      - variant in {baseline, cfg_vars}
3) Finds the corresponding logs directory for that run.
4) Computes per-test-file token usage and averages.
5) Writes grouped outputs and cfg-vs-baseline deltas.

Extraction rules:
- opencode baseline:
  Reads *.log.json test logs and extracts token fields from the
  final `type == "step-finish"` entry (last one in the log):
    total, input, output, reasoning, cache.read, cache.write
- lsprag baseline + cfg variants (and opencode cfg_vars):
  Reads llmInfo.tokenUsage from *.py.json test logs (sum per file).

Variant mapping:
- lsprag baseline: `lsprag_withcontext`
- lsprag cfg_vars: `experimental_withcontext` (not `lsprag_cfg`)
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


TARGET_FILE = "assertion_analysis_summary.json"
TEST_LOG_PATTERN = re.compile(r"_test\.py(?:\.log)?\.json$", re.IGNORECASE)
PROJECT_ORDER = ["black", "tornado", "thefuck", "youtube-dl", "sanic"]
MODEL_ORDER = ["deepseek", "gpt-5", "haiku"]
SKIP_PATH_PARTS = {"bak", "backup", "tmp", "temp", "archive"}
EXCLUDED_LOG_SUBDIRS = {
    "context",
    "paths",
    "diagnostic_report",
    "history",
    "results",
    "codes-final-report",
    "final-final-report",
    "initial",
    "final",
}


@dataclass
class RunSelection:
    tool: str
    variant: str
    model: str
    project: str
    summary_path: Path
    mtime: float


def normalize_text(path: Path) -> str:
    return str(path).lower().replace("-", "_")


def detect_target(rel_path: Path) -> Optional[Tuple[str, str]]:
    text = normalize_text(rel_path)

    if "opencode" in text:
        if "cfg_vars" in text:
            return ("opencode", "cfg_vars")
        if "naive" in text:
            return None
        if re.search(r"(^|[_/])cfg($|[_/])", text):
            return None
        return ("opencode", "baseline")

    if "lsprag" in text:
        if "experimental_withcontext" in text:
            return ("lsprag", "cfg_vars")
        if "lsprag_withcontext" in text:
            return ("lsprag", "baseline")
        return None

    return None


def to_float(value: object) -> float:
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return 0.0
    return 0.0


def find_logs_dir(summary_path: Path, root: Path) -> Optional[Path]:
    candidates: List[Path] = []
    for parent in [summary_path.parent, *summary_path.parents]:
        candidate = parent / "logs"
        if candidate.is_dir():
            candidates.append(candidate)
        if parent == root:
            break

    if not candidates:
        return None

    # Prefer the closest logs directory that actually contains per-test logs.
    for candidate in candidates:
        if collect_test_log_files(candidate):
            return candidate

    return candidates[0]


def collect_test_log_files(logs_dir: Path) -> List[Path]:
    candidates: List[List[Path]] = []

    # Candidate 1: files directly under logs_dir.
    direct = sorted(
        p
        for p in logs_dir.glob("*.json")
        if p.is_file() and TEST_LOG_PATTERN.search(p.name)
    )
    if direct:
        candidates.append(direct)

    # Candidate 2: files under one-level subdirectories, excluding metadata folders.
    for child in sorted(p for p in logs_dir.iterdir() if p.is_dir()):
        if child.name.lower() in EXCLUDED_LOG_SUBDIRS:
            continue
        child_files = sorted(
            p
            for p in child.glob("*.json")
            if p.is_file() and TEST_LOG_PATTERN.search(p.name)
        )
        if child_files:
            candidates.append(child_files)

    if candidates:
        # Use the candidate with the most per-test logs.
        return max(candidates, key=len)

    # Fallback for unexpected naming.
    all_json = sorted(p for p in logs_dir.rglob("*.json") if p.is_file())
    fallback = [
        p
        for p in all_json
        if (p.name.endswith(".log.json") or p.name.endswith(".py.json"))
        and not any(part.lower() in EXCLUDED_LOG_SUBDIRS for part in p.parts)
    ]
    return sorted(fallback)


def parse_llm_token_usage(file_path: Path) -> float:
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0.0

    total = 0.0
    if isinstance(data, list):
        for entry in data:
            if not isinstance(entry, dict):
                continue
            llm_info = entry.get("llmInfo")
            if not isinstance(llm_info, dict):
                continue
            total += to_float(llm_info.get("tokenUsage"))
        return total

    if isinstance(data, dict):
        llm_info = data.get("llmInfo")
        if isinstance(llm_info, dict):
            return to_float(llm_info.get("tokenUsage"))
    return 0.0


def parse_opencode_tokens(file_path: Path) -> Dict[str, float]:
    metrics = {
        "total_tokens": 0.0,
        "input_tokens": 0.0,
        "output_tokens": 0.0,
        "reasoning_tokens": 0.0,
        "cache_read_tokens": 0.0,
        "cache_write_tokens": 0.0,
        "token_entries": 0.0,
    }

    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return metrics

    if not isinstance(data, dict):
        return metrics

    step_finish_tokens: List[Dict[str, object]] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            node_type = node.get("type")
            tokens = node.get("tokens")
            if node_type == "step-finish" and isinstance(tokens, dict):
                step_finish_tokens.append(tokens)
            for value in node.values():
                walk(value)
            return
        if isinstance(node, list):
            for item in node:
                walk(item)

    # Search the full JSON, but this is intended for opencode logs.
    walk(data)
    if not step_finish_tokens:
        return metrics

    # Use only the final step-finish entry (end-of-run snapshot).
    tokens = step_finish_tokens[-1]
    cache = tokens.get("cache")
    cache_read = 0.0
    cache_write = 0.0
    if isinstance(cache, dict):
        cache_read = to_float(cache.get("read"))
        cache_write = to_float(cache.get("write"))

    input_tokens = to_float(tokens.get("input"))
    output_tokens = to_float(tokens.get("output"))
    reasoning_tokens = to_float(tokens.get("reasoning"))
    if "total" in tokens and tokens.get("total") not in (None, ""):
        total_tokens = to_float(tokens.get("total"))
    else:
        total_tokens = input_tokens + output_tokens + reasoning_tokens + cache_read + cache_write

    metrics["total_tokens"] = total_tokens
    metrics["input_tokens"] = input_tokens
    metrics["output_tokens"] = output_tokens
    metrics["reasoning_tokens"] = reasoning_tokens
    metrics["cache_read_tokens"] = cache_read
    metrics["cache_write_tokens"] = cache_write
    metrics["token_entries"] = 1.0

    return metrics


def collect_latest_runs(root: Path) -> Dict[Tuple[str, str, str, str], RunSelection]:
    selected: Dict[Tuple[str, str, str, str], RunSelection] = {}

    for summary_path in sorted(root.rglob(TARGET_FILE)):
        rel = summary_path.relative_to(root)
        if len(rel.parts) < 2:
            continue
        if any(part.lower() in SKIP_PATH_PARTS for part in rel.parts):
            continue

        model = rel.parts[0].lower()
        project = rel.parts[1].lower()
        detected = detect_target(rel)
        if detected is None:
            continue
        tool, variant = detected

        try:
            mtime = summary_path.stat().st_mtime
        except OSError:
            mtime = 0.0

        key = (tool, variant, model, project)
        candidate = RunSelection(
            tool=tool,
            variant=variant,
            model=model,
            project=project,
            summary_path=summary_path,
            mtime=mtime,
        )
        current = selected.get(key)
        if current is None or (candidate.mtime, str(candidate.summary_path)) > (
            current.mtime,
            str(current.summary_path),
        ):
            selected[key] = candidate

    return selected


def write_csv(path: Path, rows: Iterable[Dict[str, object]], fieldnames: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {k: ("" if row.get(k) is None else row.get(k)) for k in fieldnames}
            )


def fmt_num(value: object, digits: int = 2) -> str:
    if value is None or value == "":
        return "-"
    num = to_float(value)
    return f"{num:,.{digits}f}"


def fmt_int(value: object) -> str:
    if value is None or value == "":
        return "-"
    try:
        return str(int(float(value)))
    except (TypeError, ValueError):
        return "-"


def arithmetic_mean(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def fmt_latex_num(value: object, digits: int = 2) -> str:
    if value is None or value == "":
        return "-"
    num = to_float(value)
    return f"{num:.{digits}f}"


def fmt_latex_int(value: object) -> str:
    if value is None or value == "":
        return "-"
    num = to_float(value)
    return str(int(round(num)))


def build_project_summary_rows(group_rows: List[Dict[str, object]]) -> List[Dict[str, object]]:
    index: Dict[Tuple[str, str, str, str], Dict[str, object]] = {}
    for row in group_rows:
        key = (
            str(row.get("tool", "")),
            str(row.get("variant", "")),
            str(row.get("model", "")),
            str(row.get("project", "")),
        )
        index[key] = row

    result: List[Dict[str, object]] = []
    for project in PROJECT_ORDER:
        op_base_values: List[float] = []
        op_cfg_values: List[float] = []
        ls_base_values: List[float] = []
        ls_cfg_values: List[float] = []

        for model in MODEL_ORDER:
            op_base = index.get(("opencode", "baseline", model, project))
            op_cfg = index.get(("opencode", "cfg_vars", model, project))
            ls_base = index.get(("lsprag", "baseline", model, project))
            ls_cfg = index.get(("lsprag", "cfg_vars", model, project))

            if op_base is not None:
                op_base_values.append(to_float(op_base.get("avg_total_tokens")))
            if op_cfg is not None:
                op_cfg_values.append(to_float(op_cfg.get("avg_token_usage")))
            if ls_base is not None:
                ls_base_values.append(to_float(ls_base.get("avg_token_usage")))
            if ls_cfg is not None:
                ls_cfg_values.append(to_float(ls_cfg.get("avg_token_usage")))

        op_base_avg = arithmetic_mean(op_base_values)
        op_cfg_avg = arithmetic_mean(op_cfg_values)
        ls_base_avg = arithmetic_mean(ls_base_values)
        ls_cfg_avg = arithmetic_mean(ls_cfg_values)

        op_delta = (
            (op_cfg_avg - op_base_avg)
            if op_base_avg is not None and op_cfg_avg is not None
            else None
        )
        ls_delta = (
            (ls_cfg_avg - ls_base_avg)
            if ls_base_avg is not None and ls_cfg_avg is not None
            else None
        )

        # Relative percent w.r.t. original baseline cost:
        # (cfg / baseline) * 100
        op_delta_pct = (
            (op_cfg_avg / op_base_avg * 100.0)
            if op_base_avg is not None and op_cfg_avg is not None and op_base_avg > 0
            else None
        )
        ls_delta_pct = (
            (ls_cfg_avg / ls_base_avg * 100.0)
            if ls_base_avg is not None and ls_cfg_avg is not None and ls_base_avg > 0
            else None
        )

        result.append(
            {
                "project": project,
                "opencode_avg_tokens": op_base_avg,
                "opencode_cfg_vars_avg_tokens": op_cfg_avg,
                "opencode_overhead_tokens": op_delta,
                "opencode_overhead_pct": op_delta_pct,
                "lsprag_withcontext_avg_tokens": ls_base_avg,
                "experimental_withcontext_avg_tokens": ls_cfg_avg,
                "lsprag_overhead_tokens": ls_delta,
                "lsprag_overhead_pct": ls_delta_pct,
                "opencode_models_used_baseline": len(op_base_values),
                "opencode_models_used_cfg": len(op_cfg_values),
                "lsprag_models_used_baseline": len(ls_base_values),
                "lsprag_models_used_cfg": len(ls_cfg_values),
            }
        )
    return result


def build_project_latex_table(project_summary_rows: List[Dict[str, object]]) -> str:
    lines: List[str] = []
    lines.append(r"\begin{table}[t]")
    lines.append(r"\centering")
    lines.append(r"\resizebox{\linewidth}{!}{%")
    lines.append(r"\begin{tabular}{lrrrr}")
    lines.append(r"\toprule")
    lines.append(
        r"Project & \opencode & \shortstack{\opencode\\+\tool{}} & \lsprag & \shortstack{\lsprag\\+\tool{}} \\"
    )
    lines.append(r"\midrule")
    for row in project_summary_rows:
        lines.append(
            r"{project} & {op_base} & {op_cfg} & {ls_base} & {ls_cfg} \\".format(
                project=str(row.get("project", "-")).replace("_", r"\_"),
                op_base=fmt_latex_int(row.get("opencode_avg_tokens")),
                op_cfg=fmt_latex_int(row.get("opencode_cfg_vars_avg_tokens")),
                ls_base=fmt_latex_int(row.get("lsprag_withcontext_avg_tokens")),
                ls_cfg=fmt_latex_int(row.get("experimental_withcontext_avg_tokens")),
            )
        )
    lines.append(r"\bottomrule")
    lines.append(r"\end{tabular}")
    lines.append(r"}")
    lines.append(
        r"\caption{Average token usage by project (averaged across available models: deepseek, gpt-5, haiku).}"
    )
    lines.append(r"\label{tab:token-usage-project}")
    lines.append(r"\end{table}")
    lines.append("")
    return "\n".join(lines)


def build_markdown_report(
    generated_at: str,
    root: Path,
    group_rows: List[Dict[str, object]],
    comparison_rows: List[Dict[str, object]],
    missing_rows: List[Dict[str, object]],
) -> str:
    project_summary_rows = build_project_summary_rows(group_rows)

    lines: List[str] = []
    lines.append(f"> Generated: `{generated_at}`")
    lines.append(f"> Root: `{root}`")
    lines.append("")

    lines.append("## Final Table (Project Rows)")
    lines.append(
        "| project | opencode avg | opencode+cfg_vars avg | opencode overhead | lsprag_withcontext avg | experimental_withcontext avg | lsprag overhead |"
    )
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for row in project_summary_rows:
        op_overhead = (
            f"{fmt_num(row.get('opencode_overhead_tokens'))} ({fmt_num(row.get('opencode_overhead_pct'))}% of baseline)"
            if row.get("opencode_overhead_tokens") is not None
            else "-"
        )
        ls_overhead = (
            f"{fmt_num(row.get('lsprag_overhead_tokens'))} ({fmt_num(row.get('lsprag_overhead_pct'))}% of baseline)"
            if row.get("lsprag_overhead_tokens") is not None
            else "-"
        )
        lines.append(
            "| {project} | {op_base} | {op_cfg} | {op_overhead} | {ls_base} | {ls_cfg} | {ls_overhead} |".format(
                project=row.get("project", "-"),
                op_base=fmt_num(row.get("opencode_avg_tokens")),
                op_cfg=fmt_num(row.get("opencode_cfg_vars_avg_tokens")),
                op_overhead=op_overhead,
                ls_base=fmt_num(row.get("lsprag_withcontext_avg_tokens")),
                ls_cfg=fmt_num(row.get("experimental_withcontext_avg_tokens")),
                ls_overhead=ls_overhead,
            )
        )
    lines.append("")
    lines.append(
        "> Note: averages are over available models in `{deepseek, gpt-5, haiku}`. "
        "For some opencode baseline project-models, raw token logs are unavailable."
    )
    lines.append("")

    lines.append("## CFG vs Baseline (Avg Tokens per Test File)")
    lines.append(
        "| tool | model | project | baseline files | cfg files | baseline avg | cfg avg | delta (cfg-baseline) | delta % | basis |"
    )
    lines.append("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
    for row in comparison_rows:
        lines.append(
            "| {tool} | {model} | {project} | {baseline_files} | {cfg_files} | {baseline_avg} | {cfg_avg} | {delta} | {delta_pct} | {basis} |".format(
                tool=row.get("tool", "-"),
                model=row.get("model", "-"),
                project=row.get("project", "-"),
                baseline_files=fmt_int(row.get("baseline_files")),
                cfg_files=fmt_int(row.get("cfg_files")),
                baseline_avg=fmt_num(row.get("baseline_avg_tokens")),
                cfg_avg=fmt_num(row.get("cfg_avg_tokens")),
                delta=fmt_num(row.get("delta_cfg_minus_baseline")),
                delta_pct=fmt_num(row.get("delta_pct")),
                basis=row.get("comparison_basis", "-"),
            )
        )
    lines.append("")

    opencode_baseline_rows = [
        row
        for row in group_rows
        if row.get("tool") == "opencode" and row.get("variant") == "baseline"
    ]
    lines.append("## Opencode Baseline Token Details")
    lines.append(
        "| model | project | files | files with token data | avg total | avg input | avg output | avg reasoning | avg cache.read | avg cache.write |"
    )
    lines.append("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for row in sorted(opencode_baseline_rows, key=lambda r: (str(r.get("model")), str(r.get("project")))):
        lines.append(
            "| {model} | {project} | {files} | {files_with} | {avg_total} | {avg_input} | {avg_output} | {avg_reasoning} | {avg_cache_read} | {avg_cache_write} |".format(
                model=row.get("model", "-"),
                project=row.get("project", "-"),
                files=fmt_int(row.get("files_analyzed")),
                files_with=fmt_int(row.get("files_with_token_data")),
                avg_total=fmt_num(row.get("avg_total_tokens")),
                avg_input=fmt_num(row.get("avg_input_tokens")),
                avg_output=fmt_num(row.get("avg_output_tokens")),
                avg_reasoning=fmt_num(row.get("avg_reasoning_tokens")),
                avg_cache_read=fmt_num(row.get("avg_cache_read_tokens")),
                avg_cache_write=fmt_num(row.get("avg_cache_write_tokens")),
            )
        )
    lines.append("")

    lines.append("## Missing")
    if not missing_rows:
        lines.append("- none")
    else:
        for row in missing_rows:
            lines.append(
                "- `{tool}/{variant}/{model}/{project}`: {reason} (`{summary}`)".format(
                    tool=row.get("tool", "-"),
                    variant=row.get("variant", "-"),
                    model=row.get("model", "-"),
                    project=row.get("project", "-"),
                    reason=row.get("reason", "-"),
                    summary=row.get("summary_rel", "-"),
                )
            )
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Extract token usage from opencode/lsprag logs and compute grouped "
            "averages plus cfg-vs-baseline deltas."
        )
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("experiments/data/result"),
        help="Root dataset directory (default: experiments/data/result).",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=Path("experiments/data/result/opencode_lsprag_token_usage_summary.json"),
        help="Output JSON path.",
    )
    parser.add_argument(
        "--output-groups-csv",
        type=Path,
        default=Path("experiments/data/result/opencode_lsprag_token_usage_groups.csv"),
        help="Output CSV for grouped averages.",
    )
    parser.add_argument(
        "--output-comparison-csv",
        type=Path,
        default=Path("experiments/data/result/opencode_lsprag_token_usage_comparison.csv"),
        help="Output CSV for cfg-vs-baseline deltas.",
    )
    parser.add_argument(
        "--output-markdown",
        type=Path,
        default=Path("experiments/data/result/opencode_lsprag_token_usage_report.md"),
        help="Output Markdown report path.",
    )
    parser.add_argument(
        "--output-project-summary-csv",
        type=Path,
        default=Path("experiments/data/result/opencode_lsprag_project_level_summary.csv"),
        help="Output CSV for project-level model-averaged summary table.",
    )
    parser.add_argument(
        "--output-latex",
        type=Path,
        default=Path("experiments/data/result/opencode_lsprag_project_table.tex"),
        help="Output LaTeX table path (project rows, requested 4 metric columns).",
    )
    args = parser.parse_args()

    root = args.root.resolve()
    if not root.exists() or not root.is_dir():
        print(f"Error: root directory does not exist or is not a directory: {root}", file=sys.stderr)
        return 1

    selected_runs = collect_latest_runs(root)

    group_rows: List[Dict[str, object]] = []
    missing_rows: List[Dict[str, object]] = []

    for key in sorted(selected_runs.keys()):
        run = selected_runs[key]
        logs_dir = find_logs_dir(run.summary_path, root)
        if logs_dir is None:
            missing_rows.append(
                {
                    "tool": run.tool,
                    "variant": run.variant,
                    "model": run.model,
                    "project": run.project,
                    "reason": "logs_dir_not_found",
                    "summary_rel": str(run.summary_path.relative_to(root)),
                }
            )
            continue

        log_files = collect_test_log_files(logs_dir)
        if not log_files:
            missing_rows.append(
                {
                    "tool": run.tool,
                    "variant": run.variant,
                    "model": run.model,
                    "project": run.project,
                    "reason": "test_logs_not_found",
                    "summary_rel": str(run.summary_path.relative_to(root)),
                    "logs_dir_rel": str(logs_dir.relative_to(root)),
                }
            )
            continue

        row: Dict[str, object] = {
            "tool": run.tool,
            "variant": run.variant,
            "model": run.model,
            "project": run.project,
            "files_analyzed": len(log_files),
            "summary_rel": str(run.summary_path.relative_to(root)),
            "logs_dir_rel": str(logs_dir.relative_to(root)),
        }

        if run.tool == "opencode" and run.variant == "baseline":
            sums = {
                "total_tokens": 0.0,
                "input_tokens": 0.0,
                "output_tokens": 0.0,
                "reasoning_tokens": 0.0,
                "cache_read_tokens": 0.0,
                "cache_write_tokens": 0.0,
                "token_entries": 0.0,
            }
            files_with_token_data = 0

            for file_path in log_files:
                metrics = parse_opencode_tokens(file_path)
                for metric_key in sums:
                    sums[metric_key] += metrics[metric_key]
                if metrics["token_entries"] > 0:
                    files_with_token_data += 1

            row.update(
                {
                    "metric_type": "opencode_session_tokens",
                    "files_with_token_data": files_with_token_data,
                    "total_total_tokens": sums["total_tokens"],
                    "avg_total_tokens": sums["total_tokens"] / len(log_files),
                    "total_input_tokens": sums["input_tokens"],
                    "avg_input_tokens": sums["input_tokens"] / len(log_files),
                    "total_output_tokens": sums["output_tokens"],
                    "avg_output_tokens": sums["output_tokens"] / len(log_files),
                    "total_reasoning_tokens": sums["reasoning_tokens"],
                    "avg_reasoning_tokens": sums["reasoning_tokens"] / len(log_files),
                    "total_cache_read_tokens": sums["cache_read_tokens"],
                    "avg_cache_read_tokens": sums["cache_read_tokens"] / len(log_files),
                    "total_cache_write_tokens": sums["cache_write_tokens"],
                    "avg_cache_write_tokens": sums["cache_write_tokens"] / len(log_files),
                    "token_entries": sums["token_entries"],
                }
            )
        else:
            token_sum = 0.0
            files_with_token_data = 0
            for file_path in log_files:
                token_usage = parse_llm_token_usage(file_path)
                token_sum += token_usage
                if token_usage > 0:
                    files_with_token_data += 1

            row.update(
                {
                    "metric_type": "llmInfo.tokenUsage",
                    "files_with_token_data": files_with_token_data,
                    "total_token_usage": token_sum,
                    "avg_token_usage": token_sum / len(log_files),
                }
            )

        group_rows.append(row)

    group_rows = sorted(
        group_rows,
        key=lambda r: (
            str(r["tool"]),
            str(r["variant"]),
            str(r["model"]),
            str(r["project"]),
        ),
    )

    index: Dict[Tuple[str, str, str, str], Dict[str, object]] = {}
    for row in group_rows:
        index[(str(row["tool"]), str(row["variant"]), str(row["model"]), str(row["project"]))] = row

    comparison_rows: List[Dict[str, object]] = []
    for tool in ("opencode", "lsprag"):
        model_project_keys = sorted(
            {
                (str(r["model"]), str(r["project"]))
                for r in group_rows
                if str(r["tool"]) == tool
            }
        )
        for model, project in model_project_keys:
            base = index.get((tool, "baseline", model, project))
            cfg = index.get((tool, "cfg_vars", model, project))
            if base is None or cfg is None:
                continue

            if tool == "opencode":
                baseline_avg = to_float(base.get("avg_total_tokens"))
                cfg_avg = to_float(cfg.get("avg_token_usage"))
                basis = "cfg.llmInfo.tokenUsage - baseline.step_finish.tokens.total"
            else:
                baseline_avg = to_float(base.get("avg_token_usage"))
                cfg_avg = to_float(cfg.get("avg_token_usage"))
                basis = "cfg.llmInfo.tokenUsage - baseline.llmInfo.tokenUsage"

            delta = cfg_avg - baseline_avg
            delta_pct = (delta / baseline_avg * 100.0) if baseline_avg > 0 else None

            comparison_rows.append(
                {
                    "tool": tool,
                    "model": model,
                    "project": project,
                    "baseline_variant": "baseline",
                    "cfg_variant": "cfg_vars",
                    "baseline_files": base.get("files_analyzed"),
                    "cfg_files": cfg.get("files_analyzed"),
                    "baseline_avg_tokens": baseline_avg,
                    "cfg_avg_tokens": cfg_avg,
                    "delta_cfg_minus_baseline": delta,
                    "delta_pct": delta_pct,
                    "comparison_basis": basis,
                }
            )

    comparison_rows = sorted(
        comparison_rows,
        key=lambda r: (str(r["tool"]), str(r["model"]), str(r["project"])),
    )

    generated_at = datetime.now(timezone.utc).isoformat()
    output = {
        "generated_at": generated_at,
        "root": str(root),
        "selection_rule": "latest assertion_analysis_summary.json by mtime per (tool, variant, model, project)",
        "group_rows": group_rows,
        "comparison_rows": comparison_rows,
        "missing": missing_rows,
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(output, indent=2), encoding="utf-8")

    group_fields = [
        "tool",
        "variant",
        "model",
        "project",
        "metric_type",
        "files_analyzed",
        "files_with_token_data",
        "total_token_usage",
        "avg_token_usage",
        "total_total_tokens",
        "avg_total_tokens",
        "total_input_tokens",
        "avg_input_tokens",
        "total_output_tokens",
        "avg_output_tokens",
        "total_reasoning_tokens",
        "avg_reasoning_tokens",
        "total_cache_read_tokens",
        "avg_cache_read_tokens",
        "total_cache_write_tokens",
        "avg_cache_write_tokens",
        "token_entries",
        "summary_rel",
        "logs_dir_rel",
    ]
    write_csv(args.output_groups_csv, group_rows, group_fields)

    comparison_fields = [
        "tool",
        "model",
        "project",
        "baseline_variant",
        "cfg_variant",
        "baseline_files",
        "cfg_files",
        "baseline_avg_tokens",
        "cfg_avg_tokens",
        "delta_cfg_minus_baseline",
        "delta_pct",
        "comparison_basis",
    ]
    write_csv(args.output_comparison_csv, comparison_rows, comparison_fields)

    project_summary_rows = build_project_summary_rows(group_rows)
    project_summary_fields = [
        "project",
        "opencode_avg_tokens",
        "opencode_cfg_vars_avg_tokens",
        "opencode_overhead_tokens",
        "opencode_overhead_pct",
        "lsprag_withcontext_avg_tokens",
        "experimental_withcontext_avg_tokens",
        "lsprag_overhead_tokens",
        "lsprag_overhead_pct",
        "opencode_models_used_baseline",
        "opencode_models_used_cfg",
        "lsprag_models_used_baseline",
        "lsprag_models_used_cfg",
    ]
    write_csv(args.output_project_summary_csv, project_summary_rows, project_summary_fields)

    latex = build_project_latex_table(project_summary_rows)
    args.output_latex.parent.mkdir(parents=True, exist_ok=True)
    args.output_latex.write_text(latex, encoding="utf-8")

    markdown = build_markdown_report(
        generated_at=generated_at,
        root=root,
        group_rows=group_rows,
        comparison_rows=comparison_rows,
        missing_rows=missing_rows,
    )
    args.output_markdown.parent.mkdir(parents=True, exist_ok=True)
    args.output_markdown.write_text(markdown, encoding="utf-8")

    print(f"Wrote JSON: {args.output_json}")
    print(f"Wrote grouped CSV: {args.output_groups_csv}")
    print(f"Wrote comparison CSV: {args.output_comparison_csv}")
    print(f"Wrote project summary CSV: {args.output_project_summary_csv}")
    print(f"Wrote latex: {args.output_latex}")
    print(f"Wrote markdown: {args.output_markdown}")
    print(f"Groups: {len(group_rows)}, comparisons: {len(comparison_rows)}, missing: {len(missing_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
