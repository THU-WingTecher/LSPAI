#!/usr/bin/env python3
"""
Summarize assertion-analysis ratios into compact grouped tables.
python scripts/summarize_failed_files_table.py \                                                   
        --base-dir experiments/data/main_result/black \
        --contains deepseek \
        --metric failed_testcases_ratio \
        --metric failed_or_errored_files_ratio \
        --percent --digits 2

"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


DEFAULT_BASE_DIR = Path("experiments/projects/data/main_result/black")
FALLBACK_BASE_DIR = Path("experiments/data/main_result/black")
TARGET_FILE_NAME = "assertion_analysis_summary.json"
VARIANT_ORDER = ["original", "cfg_vars", "vars", "naive", "cfg"]
METRIC_KEYS = [
    "failed_files_ratio",
    "failed_testcases_ratio",
    "failed_or_errored_files_ratio",
    "failed_or_errored_testcases_ratio",
]
DEFAULT_METRICS = [
    "failed_testcases_ratio",
    "failed_or_errored_files_ratio",
    "failed_or_errored_testcases_ratio",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Scan run folders, extract ratio metrics from assertion_analysis_summary.json, "
            "and print trend tables."
        )
    )
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=DEFAULT_BASE_DIR,
        help=(
            "Directory whose immediate subfolders are run names (columns). "
            f"Default: {DEFAULT_BASE_DIR}"
        ),
    )
    parser.add_argument(
        "--contains",
        default="deepseek",
        help="Only include run folders whose name contains this substring (case-insensitive).",
    )
    parser.add_argument(
        "--metric",
        action="append",
        choices=METRIC_KEYS,
        help=(
            "Metric to render. Can be repeated. "
            f"Default metrics: {', '.join(DEFAULT_METRICS)}"
        ),
    )
    parser.add_argument(
        "--all-metrics",
        action="store_true",
        help=f"Render all metrics: {', '.join(METRIC_KEYS)}",
    )
    parser.add_argument(
        "--output-csv",
        type=Path,
        help="Optional path to save table output as CSV.",
    )
    parser.add_argument(
        "--digits",
        type=int,
        default=2,
        help="Decimal digits for numeric values and decrease-rate values.",
    )
    parser.add_argument(
        "--percent",
        action="store_true",
        help="Render metric values as percentages (value * 100 plus %).",
    )
    parser.add_argument(
        "--no-decrease",
        action="store_true",
        help="Do not append decrease rate vs the same column in the 'original' row.",
    )
    parser.add_argument(
        "--show-source",
        action="store_true",
        help="Also print which JSON file was used for each folder.",
    )
    parser.add_argument(
        "--layout",
        choices=["grouped", "flat"],
        default="grouped",
        help="Table layout style. 'grouped' is the compact view.",
    )
    return parser.parse_args()


def resolve_base_dir(base_dir: Path) -> Tuple[Path, bool]:
    if base_dir.exists():
        return base_dir, False
    if base_dir == DEFAULT_BASE_DIR and FALLBACK_BASE_DIR.exists():
        return FALLBACK_BASE_DIR, True
    return base_dir, False


def find_summary_json(run_dir: Path) -> Optional[Path]:
    matches = sorted(
        run_dir.rglob(TARGET_FILE_NAME),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return matches[0] if matches else None


def as_float(value: object) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def safe_div(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator


def read_metric_values(path: Path) -> Dict[str, Optional[float]]:
    metrics: Dict[str, Optional[float]] = {metric: None for metric in METRIC_KEYS}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return metrics

    if not isinstance(data, dict):
        return metrics

    ratios = data.get("ratios") if isinstance(data.get("ratios"), dict) else {}
    counts = data.get("counts") if isinstance(data.get("counts"), dict) else {}
    files = counts.get("files") if isinstance(counts.get("files"), dict) else {}
    testcases = counts.get("testcases") if isinstance(counts.get("testcases"), dict) else {}

    files_total = as_float(files.get("total"))
    files_failed = as_float(files.get("failed"))
    files_errored = as_float(files.get("errored"))

    test_total = as_float(testcases.get("total"))
    test_failed = as_float(testcases.get("failed"))
    test_errored = as_float(testcases.get("errored"))

    failed_files_ratio = as_float(ratios.get("failed_files"))
    if failed_files_ratio is None:
        failed_files_ratio = safe_div(files_failed, files_total)
    metrics["failed_files_ratio"] = failed_files_ratio

    failed_testcases_ratio = as_float(ratios.get("failed_testcases"))
    if failed_testcases_ratio is None:
        failed_testcases_ratio = safe_div(test_failed, test_total)
    metrics["failed_testcases_ratio"] = failed_testcases_ratio

    files_failed_or_errored = None
    if files_failed is not None and files_errored is not None:
        files_failed_or_errored = files_failed + files_errored
    metrics["failed_or_errored_files_ratio"] = safe_div(files_failed_or_errored, files_total)

    test_failed_or_errored = None
    if test_failed is not None and test_errored is not None:
        test_failed_or_errored = test_failed + test_errored
    metrics["failed_or_errored_testcases_ratio"] = safe_div(test_failed_or_errored, test_total)

    return metrics


def format_value(value: Optional[float], digits: int, percent: bool) -> str:
    if value is None:
        return "N/A"
    if percent:
        return f"{value * 100:.{digits}f}%"
    return f"{value:.{digits}f}"


def format_decrease(value: Optional[float], baseline: Optional[float], digits: int) -> Optional[str]:
    if value is None or baseline is None or baseline == 0:
        return None
    change = (baseline - value) / baseline
    if abs(change) < 1e-12:
        return f"same {0:.{digits}f}%"
    if change > 0:
        return f"dec {change * 100:.{digits}f}%"
    return f"inc {abs(change) * 100:.{digits}f}%"


def compose_grouped_cell(
    row_label: str,
    column: str,
    display_matrix: Dict[str, Dict[str, str]],
    raw_matrix: Dict[str, Dict[str, Optional[float]]],
    digits: int,
    show_decrease: bool,
) -> str:
    value_text = display_matrix.get(row_label, {}).get(column, "N/A")
    if not show_decrease or row_label == "original" or value_text == "N/A":
        return value_text

    baseline_value = raw_matrix.get("original", {}).get(column)
    value = raw_matrix.get(row_label, {}).get(column)
    decrease = format_decrease(value, baseline_value, digits)
    if decrease is None:
        return f"{value_text} (vs original: N/A)"
    return f"{value_text} ({decrease})"


def build_markdown_flat(
    columns: List[str],
    selected_metrics: List[str],
    flat_values_by_metric: Dict[str, List[str]],
) -> str:
    lines = [
        "| " + " | ".join(["metric", *columns]) + " |",
        "| " + " | ".join(["---"] * (len(columns) + 1)) + " |",
    ]
    for metric in selected_metrics:
        lines.append("| " + " | ".join([metric, *flat_values_by_metric[metric]]) + " |")
    return "\n".join(lines)


def build_markdown_grouped(
    columns: List[str],
    row_labels: List[str],
    display_matrix: Dict[str, Dict[str, str]],
    raw_matrix: Dict[str, Dict[str, Optional[float]]],
    digits: int,
    show_decrease: bool,
) -> str:
    lines = [
        "| " + " | ".join(["variant", *columns]) + " |",
        "| " + " | ".join(["---"] * (len(columns) + 1)) + " |",
    ]
    for row_label in row_labels:
        row_values = [
            compose_grouped_cell(
                row_label,
                column,
                display_matrix,
                raw_matrix,
                digits,
                show_decrease,
            )
            for column in columns
        ]
        lines.append("| " + " | ".join([row_label, *row_values]) + " |")
    return "\n".join(lines)


def write_csv_flat(
    path: Path,
    columns: List[str],
    selected_metrics: List[str],
    flat_values_by_metric: Dict[str, List[str]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["metric", *columns])
        for metric in selected_metrics:
            writer.writerow([metric, *flat_values_by_metric[metric]])


def write_csv_grouped(
    path: Path,
    columns: List[str],
    row_labels: List[str],
    selected_metrics: List[str],
    grouped_display_by_metric: Dict[str, Dict[str, Dict[str, str]]],
    grouped_raw_by_metric: Dict[str, Dict[str, Dict[str, Optional[float]]]],
    digits: int,
    show_decrease: bool,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["metric", "variant", *columns])
        for metric in selected_metrics:
            for row_label in row_labels:
                row_values = [
                    compose_grouped_cell(
                        row_label,
                        column,
                        grouped_display_by_metric[metric],
                        grouped_raw_by_metric[metric],
                        digits,
                        show_decrease,
                    )
                    for column in columns
                ]
                writer.writerow([metric, row_label, *row_values])


def parse_group_keys(folder_name: str) -> Tuple[str, str]:
    normalized = folder_name.lower().replace("_", "-")
    normalized = re.sub(r"-{2,}", "-", normalized)

    pattern = re.compile(
        r"^(?P<base>.+?)(?:-(?P<variant>cfg-vars|vars|naive|cfg))?-deepseek(?:-chat)?$"
    )
    match = pattern.match(normalized)
    if not match:
        return folder_name, "original"

    base = match.group("base")
    variant_raw = match.group("variant")

    if variant_raw is None:
        variant = "original"
    elif variant_raw == "cfg-vars":
        variant = "cfg_vars"
    else:
        variant = variant_raw

    return f"{base}-deepseek", variant


def unique_in_order(items: List[str]) -> List[str]:
    seen = set()
    result = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def main() -> int:
    args = parse_args()
    base_dir, used_fallback = resolve_base_dir(args.base_dir)

    if not base_dir.exists():
        print(f"Error: base directory does not exist: {base_dir}", file=sys.stderr)
        return 1

    if args.all_metrics:
        selected_metrics = METRIC_KEYS.copy()
    elif args.metric:
        selected_metrics = unique_in_order(args.metric)
    else:
        selected_metrics = DEFAULT_METRICS.copy()

    selected_dirs = sorted(
        [
            p
            for p in base_dir.iterdir()
            if p.is_dir() and args.contains.lower() in p.name.lower()
        ],
        key=lambda p: p.name.lower(),
    )
    if not selected_dirs:
        print(
            f"No folders in {base_dir} matched substring '{args.contains}'.",
            file=sys.stderr,
        )
        return 1

    flat_columns: List[str] = []
    flat_values_by_metric: Dict[str, List[str]] = {metric: [] for metric in selected_metrics}
    sources: Dict[str, str] = {}

    grouped_columns_set = set()
    variant_set = set()
    grouped_display_by_metric: Dict[str, Dict[str, Dict[str, str]]] = {
        metric: {} for metric in selected_metrics
    }
    grouped_raw_by_metric: Dict[str, Dict[str, Dict[str, Optional[float]]]] = {
        metric: {} for metric in selected_metrics
    }

    for run_dir in selected_dirs:
        summary_path = find_summary_json(run_dir)
        metric_values = read_metric_values(summary_path) if summary_path else {}

        flat_columns.append(run_dir.name)

        grouped_column, variant = parse_group_keys(run_dir.name)
        grouped_columns_set.add(grouped_column)
        variant_set.add(variant)

        for metric in selected_metrics:
            raw_value = metric_values.get(metric)
            value_text = format_value(raw_value, args.digits, args.percent)
            flat_values_by_metric[metric].append(value_text)

            grouped_display_by_metric[metric].setdefault(variant, {})
            grouped_display_by_metric[metric][variant][grouped_column] = value_text

            grouped_raw_by_metric[metric].setdefault(variant, {})
            grouped_raw_by_metric[metric][variant][grouped_column] = raw_value

        sources[run_dir.name] = (
            str(summary_path.relative_to(base_dir)) if summary_path else "N/A"
        )

    if used_fallback:
        print(
            "Note: base directory fallback applied: "
            f"'{DEFAULT_BASE_DIR}' not found, using '{FALLBACK_BASE_DIR}'.",
            file=sys.stderr,
        )

    show_decrease = not args.no_decrease

    if args.layout == "flat":
        print(build_markdown_flat(flat_columns, selected_metrics, flat_values_by_metric))
        if args.output_csv:
            write_csv_flat(args.output_csv, flat_columns, selected_metrics, flat_values_by_metric)
            print(f"\nCSV saved to: {args.output_csv}")
    else:
        grouped_columns = sorted(grouped_columns_set)
        ordered_variants = [variant for variant in VARIANT_ORDER if variant in variant_set]
        ordered_variants.extend(
            sorted(variant for variant in variant_set if variant not in VARIANT_ORDER)
        )

        for idx, metric in enumerate(selected_metrics):
            if len(selected_metrics) > 1:
                if idx > 0:
                    print()
                print(f"Metric: {metric}")
            print(
                build_markdown_grouped(
                    grouped_columns,
                    ordered_variants,
                    grouped_display_by_metric[metric],
                    grouped_raw_by_metric[metric],
                    args.digits,
                    show_decrease,
                )
            )

        if args.output_csv:
            write_csv_grouped(
                args.output_csv,
                grouped_columns,
                ordered_variants,
                selected_metrics,
                grouped_display_by_metric,
                grouped_raw_by_metric,
                args.digits,
                show_decrease,
            )
            print(f"\nCSV saved to: {args.output_csv}")

    if args.show_source:
        print("\nSources:")
        for name in flat_columns:
            print(f"- {name}: {sources[name]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
