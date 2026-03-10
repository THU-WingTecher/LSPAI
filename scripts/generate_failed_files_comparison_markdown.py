#!/usr/bin/env python3
"""
Generate a cross-model markdown comparison table from assertion analysis summaries.

Source metric:
    assertion_analysis_summary.json -> ratios.failed_files (x100 => %)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple


TARGET_FILE = "assertion_analysis_summary.json"
DEFAULT_DEEPSEEK_DIR = Path("experiments/data/main_result/deepseek")
DEFAULT_GPT_DIR = Path("experiments/data/main_result/gpt-5")
DEFAULT_HAIKU_DIR = Path("experiments/data/main_result/haiku-data")
DEFAULT_PROJECT_ORDER = ["black", "tornado", "thefuck", "youtube-dl", "sanic"]
MODEL_ORDER = ["DS", "GPT", "HK"]

PROJECT_DISPLAY = {
    "black": "black",
    "tornado": "Tornado",
    "thefuck": "TheFuck",
    "youtube-dl": "Youtube-dl",
    "sanic": "sanic",
}

ROW_ORDER: List[Tuple[str, str]] = [
    ("claudecode_original", "**claudecode (baseline)**"),
    ("claudecode_naive", "+ naive reflect (`claudecode_naive`)"),
    ("claudecode_cfg_vars", "**+ CORASSERT** (`claudecode_cfg_vars`)"),
    ("opencode_original", "**opencode (baseline)**"),
    ("opencode_naive", "+ naive reflect (`opencode_naive`)"),
    ("opencode_cfg_vars", "**+ CORASSERT** (`opencode_cfg_vars`)"),
    ("lsprag_original", "**lsprag (baseline)** (`lsprag_withcontext`)"),
    ("lsprag_naive", "+ naive reflect (`experimental_naive`)"),
    ("lsprag_withcontext", "**+ CORASSERT** (`experimental_withcontext`)"),
]

BASELINE_BY_METHOD = {
    "claudecode_naive": "claudecode_original",
    "claudecode_cfg_vars": "claudecode_original",
    "opencode_naive": "opencode_original",
    "opencode_cfg_vars": "opencode_original",
    "lsprag_naive": "lsprag_original",
    "lsprag_withcontext": "lsprag_original",
}


@dataclass
class Cell:
    percent: float
    mtime: float
    rel_path: str


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build markdown comparison table for failed-files ratios across "
            "DeepSeek/GPT/Haiku result roots."
        )
    )
    parser.add_argument(
        "--deepseek-dir",
        type=Path,
        default=DEFAULT_DEEPSEEK_DIR,
        help=f"Root path for DeepSeek runs (default: {DEFAULT_DEEPSEEK_DIR}).",
    )
    parser.add_argument(
        "--gpt-dir",
        type=Path,
        default=DEFAULT_GPT_DIR,
        help=f"Root path for GPT runs (default: {DEFAULT_GPT_DIR}).",
    )
    parser.add_argument(
        "--haiku-dir",
        type=Path,
        default=DEFAULT_HAIKU_DIR,
        help=f"Root path for Haiku runs (default: {DEFAULT_HAIKU_DIR}).",
    )
    parser.add_argument(
        "--projects",
        nargs="+",
        default=DEFAULT_PROJECT_ORDER,
        help=(
            "Project order for table columns. "
            f"Default: {' '.join(DEFAULT_PROJECT_ORDER)}"
        ),
    )
    parser.add_argument(
        "--digits",
        type=int,
        default=2,
        help="Decimal digits for percentages (default: 2).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write markdown to this file. If omitted, print to stdout.",
    )
    return parser.parse_args(argv)


def normalize_text(path: Path) -> str:
    return str(path).lower().replace("-", "_")


def detect_method(rel_path: Path) -> Optional[str]:
    text = normalize_text(rel_path)

    if "lsprag" in text:
        if "experimental_withcontext" in text:
            return "lsprag_withcontext"
        if "experimental_naive" in text:
            return "lsprag_naive"
        if "lsprag_withcontext" in text:
            return "lsprag_original"
        return None

    if "claudecode" in text:
        if "cfg_vars" in text:
            return "claudecode_cfg_vars"
        if "naive" in text:
            return "claudecode_naive"
        if re.search(r"(^|[_/])cfg($|[_/])", text):
            return None
        return "claudecode_original"

    if "opencode" in text:
        if "cfg_vars" in text:
            return "opencode_cfg_vars"
        if "naive" in text:
            return "opencode_naive"
        if re.search(r"(^|[_/])cfg($|[_/])", text):
            return None
        return "opencode_original"

    return None


def extract_failed_files_percent(json_path: Path) -> Optional[float]:
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    ratios = data.get("ratios")
    if not isinstance(ratios, dict):
        return None
    raw_ratio = ratios.get("failed_files")
    if isinstance(raw_ratio, bool):
        return None
    if not isinstance(raw_ratio, (int, float)):
        return None
    if raw_ratio < 0:
        return None
    return float(raw_ratio) * 100.0


def collect_model_cells(
    model_code: str,
    base_dir: Path,
    projects: List[str],
) -> Dict[Tuple[str, str, str], Cell]:
    cells: Dict[Tuple[str, str, str], Cell] = {}
    if not base_dir.exists():
        print(f"Note: {model_code} directory not found: {base_dir}", file=sys.stderr)
        return cells
    if not base_dir.is_dir():
        print(f"Note: {model_code} path is not a directory: {base_dir}", file=sys.stderr)
        return cells

    allowed_projects = {project.lower() for project in projects}

    for json_path in sorted(base_dir.rglob(TARGET_FILE)):
        rel = json_path.relative_to(base_dir)
        if len(rel.parts) < 2:
            continue

        project = rel.parts[0].lower()
        if project not in allowed_projects:
            continue

        method = detect_method(rel)
        if method is None:
            continue

        percent = extract_failed_files_percent(json_path)
        if percent is None:
            continue

        try:
            mtime = json_path.stat().st_mtime
        except OSError:
            mtime = 0.0

        key = (method, project, model_code)
        candidate = Cell(percent=percent, mtime=mtime, rel_path=str(rel))
        current = cells.get(key)
        if current is None or (candidate.mtime, candidate.rel_path) > (current.mtime, current.rel_path):
            cells[key] = candidate

    return cells


def project_display_name(project: str) -> str:
    return PROJECT_DISPLAY.get(project.lower(), project)


def arithmetic_mean(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def harmonic_mean(values: List[float]) -> Optional[float]:
    if not values:
        return None
    if any(v <= 0 for v in values):
        return 0.0
    return len(values) / sum(1.0 / v for v in values)


def fmt(value: Optional[float], digits: int) -> str:
    if value is None:
        return "-"
    return f"{value:.{digits}f}"


def fmt_with_delta(value: Optional[float], baseline: Optional[float], digits: int) -> str:
    base_text = fmt(value, digits)
    if value is None or baseline is None:
        return base_text

    diff = value - baseline
    if abs(diff) < 1e-12:
        return f"{base_text} (same 0.{''.join(['0' for _ in range(digits)])}pp)"

    if diff > 0:
        return f"{base_text} (inc {abs(diff):.{digits}f}pp)"
    return f"{base_text} (dec {abs(diff):.{digits}f}pp)"


def render_markdown_table(
    projects: List[str],
    cells: Dict[Tuple[str, str, str], Cell],
    digits: int,
) -> str:
    header: List[str] = ["**Method**"]
    for project in projects:
        name = project_display_name(project)
        for model in MODEL_ORDER:
            header.append(f"{name} {model}")
    header.extend(["Avg% DS", "H-Avg% DS"])

    lines: List[str] = []
    lines.append("| " + " | ".join(header) + " |")
    lines.append("| " + " | ".join(["---"] + [":---:" for _ in header[1:]]) + " |")

    ds_stats: Dict[str, Tuple[Optional[float], Optional[float]]] = {}
    for method_key, _ in ROW_ORDER:
        ds_values_for_method: List[float] = []
        for project in projects:
            cell = cells.get((method_key, project.lower(), "DS"))
            if cell is not None:
                ds_values_for_method.append(cell.percent)
        ds_stats[method_key] = (
            arithmetic_mean(ds_values_for_method),
            harmonic_mean(ds_values_for_method),
        )

    for method_key, method_label in ROW_ORDER:
        row: List[str] = [method_label]
        ds_values: List[float] = []
        baseline_method = BASELINE_BY_METHOD.get(method_key)

        for project in projects:
            normalized_project = project.lower()
            for model in MODEL_ORDER:
                cell = cells.get((method_key, normalized_project, model))
                value = cell.percent if cell is not None else None
                baseline_value: Optional[float] = None
                if baseline_method is not None:
                    baseline_cell = cells.get((baseline_method, normalized_project, model))
                    baseline_value = baseline_cell.percent if baseline_cell is not None else None
                row.append(fmt_with_delta(value, baseline_value, digits))
                if model == "DS" and value is not None:
                    ds_values.append(value)

        avg_ds = arithmetic_mean(ds_values)
        h_avg_ds = harmonic_mean(ds_values)
        if baseline_method is None:
            row.append(fmt(avg_ds, digits))
            row.append(fmt(h_avg_ds, digits))
        else:
            baseline_avg_ds, baseline_h_avg_ds = ds_stats.get(baseline_method, (None, None))
            row.append(fmt_with_delta(avg_ds, baseline_avg_ds, digits))
            row.append(fmt_with_delta(h_avg_ds, baseline_h_avg_ds, digits))
        lines.append("| " + " | ".join(row) + " |")

    return "\n".join(lines)


def build_markdown(
    projects: List[str],
    cells: Dict[Tuple[str, str, str], Cell],
    digits: int,
) -> str:
    table = render_markdown_table(projects=projects, cells=cells, digits=digits)
    return "\n".join(
        [
            "> DS=DeepSeek / GPT=gpt-5 / HK=Haiku",
            "> **소스**: `assertion_analysis_summary.json`의 `ratios.failed_files` (x 100 = %)",
            "> naive / CORASSERT 행은 baseline 대비 변화량을 `inc/dec ...pp`로 표시",
            "",
            table,
        ]
    )


def write_output(markdown: str, output_path: Optional[Path]) -> None:
    if output_path is None:
        print(markdown)
        return
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown + "\n", encoding="utf-8")
    print(f"Wrote markdown: {output_path}", file=sys.stderr)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    projects = [project.lower() for project in args.projects]

    all_cells: Dict[Tuple[str, str, str], Cell] = {}
    model_roots = [
        ("DS", args.deepseek_dir.resolve()),
        ("GPT", args.gpt_dir.resolve()),
        ("HK", args.haiku_dir.resolve()),
    ]
    for model_code, root in model_roots:
        model_cells = collect_model_cells(model_code=model_code, base_dir=root, projects=projects)
        all_cells.update(model_cells)

    markdown = build_markdown(projects=projects, cells=all_cells, digits=args.digits)
    write_output(markdown, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
