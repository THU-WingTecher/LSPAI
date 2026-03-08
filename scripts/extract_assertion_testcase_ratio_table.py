#!/usr/bin/env python3
"""
Extract testcase failure ratios from assertion_analysis_summary.json files.

Formula:
    (failed_testcase + errored_testcase) / total_testcase

Expected data layout:
    <base_dir>/<project>/<runner>/<experiment_folder>/.../assertion_analysis_summary.json
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple


TARGET_FILE = "assertion_analysis_summary.json"
DEFAULT_BASE_DIR = Path("experiments/data/main_result/haiku-data")
FALLBACK_BASE_DIR = Path("haiku-data")
VARIANT_ORDER = {"original": 0, "cfg": 1, "cfg-vars": 2, "naive": 3}


@dataclass
class Row:
    project: str
    runner: str
    folder: str
    variant: str
    snapshot: str
    failed: int
    errored: int
    failed_or_errored: int
    total: int
    ratio: float
    json_path: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Scan assertion_analysis_summary.json files and print "
            "(failed + errored) / total for testcases."
        )
    )
    parser.add_argument(
        "--base-dir",
        type=Path,
        default=DEFAULT_BASE_DIR,
        help=f"Root directory to scan (default: {DEFAULT_BASE_DIR}).",
    )
    parser.add_argument(
        "--format",
        choices=["markdown", "tsv", "csv"],
        default="markdown",
        help="Output table format (default: markdown).",
    )
    parser.add_argument(
        "--digits",
        type=int,
        default=4,
        help="Digits for ratio output (default: 4).",
    )
    parser.add_argument(
        "--percent",
        action="store_true",
        help="Render ratio as percent text.",
    )
    parser.add_argument(
        "--include-path",
        action="store_true",
        help="Include the JSON path as the final column.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional output file path. If omitted, print to stdout.",
    )
    parser.add_argument(
        "--project",
        action="append",
        help="Only include these projects (repeatable).",
    )
    parser.add_argument(
        "--runner",
        action="append",
        help="Only include these runners (repeatable).",
    )
    return parser.parse_args()


def resolve_base_dir(base_dir: Path) -> Tuple[Path, bool]:
    if base_dir.exists():
        return base_dir, False
    if base_dir == DEFAULT_BASE_DIR and FALLBACK_BASE_DIR.exists():
        return FALLBACK_BASE_DIR, True
    return base_dir, False


def as_int(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def parse_variant_and_snapshot(folder: str, runner: str, project: str) -> Tuple[str, str]:
    text = folder

    prefix = f"{runner}-{project}"
    if text.startswith(prefix):
        text = text[len(prefix) :]
    elif text.startswith(f"{runner}-"):
        text = text[len(runner) + 1 :]

    snapshot = ""
    match = re.search(r"-(\d{8}_\d{6})$", text)
    if match:
        snapshot = match.group(1)
        text = text[: -(len(snapshot) + 1)]

    if text.endswith("-cfg-vars"):
        return "cfg-vars", snapshot
    if text.endswith("-naive"):
        return "naive", snapshot
    if text.endswith("-cfg"):
        return "cfg", snapshot
    return "original", snapshot


def collect_rows(
    base_dir: Path,
    projects_filter: Optional[Sequence[str]],
    runners_filter: Optional[Sequence[str]],
) -> List[Row]:
    project_allow = {p.lower() for p in projects_filter} if projects_filter else None
    runner_allow = {r.lower() for r in runners_filter} if runners_filter else None
    rows: List[Row] = []

    for json_path in sorted(base_dir.rglob(TARGET_FILE)):
        rel = json_path.relative_to(base_dir)
        if len(rel.parts) < 4:
            continue

        project, runner, folder = rel.parts[0], rel.parts[1], rel.parts[2]

        if project_allow and project.lower() not in project_allow:
            continue
        if runner_allow and runner.lower() not in runner_allow:
            continue

        try:
            with json_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue

        counts = data.get("counts")
        if not isinstance(counts, dict):
            continue
        testcases = counts.get("testcases")
        if not isinstance(testcases, dict):
            continue

        total = as_int(testcases.get("total"))
        failed = as_int(testcases.get("failed"))
        errored = as_int(testcases.get("errored"))
        if total is None or failed is None or errored is None or total <= 0:
            continue

        failed_or_errored = failed + errored
        ratio = failed_or_errored / total
        variant, snapshot = parse_variant_and_snapshot(folder, runner, project)

        rows.append(
            Row(
                project=project,
                runner=runner,
                folder=folder,
                variant=variant,
                snapshot=snapshot,
                failed=failed,
                errored=errored,
                failed_or_errored=failed_or_errored,
                total=total,
                ratio=ratio,
                json_path=str(rel),
            )
        )

    rows.sort(
        key=lambda row: (
            row.project,
            row.runner,
            VARIANT_ORDER.get(row.variant, 99),
            row.snapshot,
            row.folder,
        )
    )
    return rows


def format_ratio(value: float, digits: int, percent: bool) -> str:
    if percent:
        return f"{value * 100:.{digits}f}%"
    return f"{value:.{digits}f}"


def rows_to_table(rows: Iterable[Row], digits: int, percent: bool, include_path: bool) -> List[List[str]]:
    header = [
        "project",
        "runner",
        "folder",
        "variant",
        "snapshot",
        "failed",
        "errored",
        "failed+errored",
        "total",
        "(failed+errored)/total",
    ]
    if include_path:
        header.append("json_path")

    table: List[List[str]] = [header]
    for row in rows:
        values = [
            row.project,
            row.runner,
            row.folder,
            row.variant,
            row.snapshot or "-",
            str(row.failed),
            str(row.errored),
            str(row.failed_or_errored),
            str(row.total),
            format_ratio(row.ratio, digits, percent),
        ]
        if include_path:
            values.append(row.json_path)
        table.append(values)
    return table


def render_markdown(table: List[List[str]]) -> str:
    if not table:
        return ""
    widths = [max(len(row[i]) for row in table) for i in range(len(table[0]))]

    def fmt(row: List[str]) -> str:
        return "| " + " | ".join(cell.ljust(widths[idx]) for idx, cell in enumerate(row)) + " |"

    lines = [fmt(table[0])]
    lines.append("| " + " | ".join("-" * widths[idx] for idx in range(len(widths))) + " |")
    lines.extend(fmt(row) for row in table[1:])
    return "\n".join(lines)


def render_delimited(table: List[List[str]], delimiter: str) -> str:
    output_lines = []
    for row in table:
        output_lines.append(delimiter.join(row))
    return "\n".join(output_lines)


def write_output(text: str, path: Optional[Path]) -> None:
    if path is None:
        print(text)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    base_dir, used_fallback = resolve_base_dir(args.base_dir)
    if not base_dir.exists():
        print(f"Error: base directory does not exist: {base_dir}", file=sys.stderr)
        return 1

    rows = collect_rows(
        base_dir=base_dir,
        projects_filter=args.project,
        runners_filter=args.runner,
    )
    if not rows:
        print("No valid assertion_analysis_summary.json rows found.", file=sys.stderr)
        return 1

    table = rows_to_table(rows, digits=args.digits, percent=args.percent, include_path=args.include_path)

    if args.format == "markdown":
        text = render_markdown(table)
    elif args.format == "csv":
        # Use csv module to safely quote values.
        from io import StringIO

        buf = StringIO()
        writer = csv.writer(buf)
        for row in table:
            writer.writerow(row)
        text = buf.getvalue().rstrip("\n")
    else:
        text = render_delimited(table, "\t")

    if used_fallback:
        print(
            "Note: base directory fallback applied: "
            f"'{DEFAULT_BASE_DIR}' not found, using '{FALLBACK_BASE_DIR}'.",
            file=sys.stderr,
        )

    write_output(text, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
