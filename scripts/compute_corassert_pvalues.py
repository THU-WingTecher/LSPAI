#!/usr/bin/env python3
"""
Compute condition-level CORASSERT hypothesis summaries and exact sign-test p-values.

Hypotheses:
  1) CORASSERT failed-files rate is lower than baseline.
  2) CORASSERT failed-files rate is lower than naive reflect.

Comparison unit:
  (result_root, project, tool, baseline_model)

Defaults:
  - Baseline values come from experiments/data/result
  - CORASSERT / naive values come from experiments/data/result..result5

The sign test is exact and one-sided:
  H0: P(CORASSERT lower) <= 0.5
  H1: P(CORASSERT lower) > 0.5

This tests directional superiority across matched conditions. It does not
independently prove the literal universal statement "for all conditions".
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from statistics import mean, median
from typing import Dict, List, Optional, Sequence, Tuple

from failed_files_reporting import (
    BASELINE_METHODS,
    DEFAULT_DEEPSEEK_RESULT_ROOTS,
    NON_BASELINE_METHODS,
    DEFAULT_DEEPSEEK_BASELINE_DIR,
    DEFAULT_GPT_RESULT_ROOTS,
    DEFAULT_GPT_BASELINE_DIR,
    DEFAULT_HAIKU_RESULT_ROOTS,
    DEFAULT_HAIKU_BASELINE_DIR,
    DEFAULT_PROJECT_ORDER,
    Cell,
    build_grouped_stats,
    build_mean_rows,
    collect_model_cells,
    grouped_stats_as_dicts,
    mean_rows_as_dicts,
)


DEFAULT_DS_ROOTS = DEFAULT_DEEPSEEK_RESULT_ROOTS
DEFAULT_GPT_ROOTS = DEFAULT_GPT_RESULT_ROOTS
DEFAULT_HK_ROOTS = DEFAULT_HAIKU_RESULT_ROOTS

MODEL_SOURCES = [
    ("DS", DEFAULT_DEEPSEEK_BASELINE_DIR, DEFAULT_DS_ROOTS),
    ("GPT", DEFAULT_GPT_BASELINE_DIR, DEFAULT_GPT_ROOTS),
    ("HK", DEFAULT_HAIKU_BASELINE_DIR, DEFAULT_HK_ROOTS),
]

TOOL_METHODS: Dict[str, Tuple[str, str, str]] = {
    "claudecode": ("claudecode_original", "claudecode_naive", "claudecode_cfg_vars"),
    "opencode": ("opencode_original", "opencode_naive", "opencode_cfg_vars"),
    "lsprag": ("lsprag_original", "lsprag_naive", "lsprag_withcontext"),
}


@dataclass
class PairRecord:
    result_root: str
    project: str
    tool: str
    model: str
    baseline: float
    corassert: float
    diff_pp: float
    rel_gain_pct: Optional[float]
    baseline_rel_path: str
    corassert_rel_path: str


@dataclass
class TripleRecord:
    result_root: str
    project: str
    tool: str
    model: str
    baseline: float
    naive: float
    corassert: float
    corassert_minus_baseline_pp: float
    corassert_minus_naive_pp: float
    baseline_rel_path: str
    naive_rel_path: str
    corassert_rel_path: str


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compute exact one-sided sign-test p-values for the condition-level "
            "hypothesis that CORASSERT lowers failed-files rate versus baseline "
            "and naive reflect."
        )
    )
    parser.add_argument(
        "--projects",
        nargs="+",
        default=DEFAULT_PROJECT_ORDER,
        help="Projects to include. Default: %(default)s",
    )
    parser.add_argument(
        "--digits",
        type=int,
        default=4,
        help="Decimal digits for floating-point outputs. Default: %(default)s",
    )
    parser.add_argument(
        "--json-output",
        type=Path,
        help="Optional path to write the full result payload as JSON.",
    )
    return parser.parse_args(argv)


def result_root_label(root: Path) -> str:
    return root.parent.name


def relative_gain_percent(baseline: float, current: float) -> Optional[float]:
    if baseline <= 0:
        return None
    return ((baseline - current) / baseline) * 100.0


def exact_sign_test_pvalue_lower(records: List[PairRecord]) -> Optional[float]:
    wins = sum(1 for record in records if record.diff_pp < 0)
    losses = sum(1 for record in records if record.diff_pp > 0)
    n = wins + losses
    if n == 0:
        return None
    return sum(math.comb(n, k) for k in range(wins, n + 1)) / (2 ** n)


def summarize_pair_records(records: List[PairRecord]) -> Dict[str, object]:
    wins = [record for record in records if record.diff_pp < 0]
    losses = [record for record in records if record.diff_pp > 0]
    ties = [record for record in records if abs(record.diff_pp) < 1e-12]
    rel_gains = [
        record.rel_gain_pct for record in records if record.rel_gain_pct is not None
    ]
    diff_values = [record.diff_pp for record in records]

    return {
        "n_total": len(records),
        "n_wins": len(wins),
        "n_losses": len(losses),
        "n_ties": len(ties),
        "strict_all_better": len(losses) == 0 and len(ties) == 0 and len(records) > 0,
        "mean_diff_pp": mean(diff_values) if diff_values else None,
        "median_diff_pp": median(diff_values) if diff_values else None,
        "mean_rel_gain_pct": mean(rel_gains) if rel_gains else None,
        "exact_sign_test_pvalue": exact_sign_test_pvalue_lower(records),
        "loss_records": [asdict(record) for record in losses],
        "tie_records": [asdict(record) for record in ties],
    }


def build_result_payload(projects: List[str]) -> Dict[str, object]:
    baseline_cells_by_model: Dict[str, Dict[Tuple[str, str, str], Cell]] = {}
    nonbaseline_cells_by_root: Dict[str, Dict[str, Dict[Tuple[str, str, str], Cell]]] = {}

    for model_code, baseline_root, nonbaseline_roots in MODEL_SOURCES:
        baseline_cells_by_model[model_code] = collect_model_cells(
            model_code=model_code,
            base_dir=baseline_root.resolve(),
            projects=projects,
            include_methods=BASELINE_METHODS,
            warn_missing=True,
        )

        root_maps: Dict[str, Dict[Tuple[str, str, str], Cell]] = {}
        for root in nonbaseline_roots:
            resolved = root.resolve()
            label = result_root_label(resolved)
            root_maps[label] = collect_model_cells(
                model_code=model_code,
                base_dir=resolved,
                projects=projects,
                include_methods=NON_BASELINE_METHODS,
                warn_missing=False,
            )
        nonbaseline_cells_by_root[model_code] = root_maps

    baseline_pairs: List[PairRecord] = []
    naive_pairs: List[PairRecord] = []
    triple_records: List[TripleRecord] = []

    for tool, (baseline_method, naive_method, corassert_method) in TOOL_METHODS.items():
        for model_code, _, nonbaseline_roots in MODEL_SOURCES:
            baseline_map = baseline_cells_by_model[model_code]
            for root in nonbaseline_roots:
                root_label = result_root_label(root.resolve())
                run_map = nonbaseline_cells_by_root[model_code][root_label]

                for project in projects:
                    normalized_project = project.lower()
                    baseline_cell = baseline_map.get(
                        (baseline_method, normalized_project, model_code)
                    )
                    naive_cell = run_map.get((naive_method, normalized_project, model_code))
                    corassert_cell = run_map.get(
                        (corassert_method, normalized_project, model_code)
                    )

                    if baseline_cell is not None and corassert_cell is not None:
                        baseline_pairs.append(
                            PairRecord(
                                result_root=root_label,
                                project=normalized_project,
                                tool=tool,
                                model=model_code,
                                baseline=baseline_cell.percent,
                                corassert=corassert_cell.percent,
                                diff_pp=corassert_cell.percent - baseline_cell.percent,
                                rel_gain_pct=relative_gain_percent(
                                    baseline=baseline_cell.percent,
                                    current=corassert_cell.percent,
                                ),
                                baseline_rel_path=baseline_cell.rel_path,
                                corassert_rel_path=corassert_cell.rel_path,
                            )
                        )

                    if naive_cell is not None and corassert_cell is not None:
                        naive_pairs.append(
                            PairRecord(
                                result_root=root_label,
                                project=normalized_project,
                                tool=tool,
                                model=model_code,
                                baseline=naive_cell.percent,
                                corassert=corassert_cell.percent,
                                diff_pp=corassert_cell.percent - naive_cell.percent,
                                rel_gain_pct=relative_gain_percent(
                                    baseline=naive_cell.percent,
                                    current=corassert_cell.percent,
                                ),
                                baseline_rel_path=naive_cell.rel_path,
                                corassert_rel_path=corassert_cell.rel_path,
                            )
                        )

                    if (
                        baseline_cell is not None
                        and naive_cell is not None
                        and corassert_cell is not None
                    ):
                        triple_records.append(
                            TripleRecord(
                                result_root=root_label,
                                project=normalized_project,
                                tool=tool,
                                model=model_code,
                                baseline=baseline_cell.percent,
                                naive=naive_cell.percent,
                                corassert=corassert_cell.percent,
                                corassert_minus_baseline_pp=(
                                    corassert_cell.percent - baseline_cell.percent
                                ),
                                corassert_minus_naive_pp=(
                                    corassert_cell.percent - naive_cell.percent
                                ),
                                baseline_rel_path=baseline_cell.rel_path,
                                naive_rel_path=naive_cell.rel_path,
                                corassert_rel_path=corassert_cell.rel_path,
                            )
                        )

    joint_failures = [
        record
        for record in triple_records
        if not (
            record.corassert_minus_baseline_pp < 0
            and record.corassert_minus_naive_pp < 0
        )
    ]

    mean_rows = build_mean_rows(projects=projects)
    grouped_stats = build_grouped_stats(mean_rows, projects=projects)

    payload = {
        "comparison_unit": "(result_root, project, tool, model)",
        "projects": projects,
        "result_roots": {
            "DS": [result_root_label(path.resolve()) for path in DEFAULT_DS_ROOTS],
            "GPT": [result_root_label(path.resolve()) for path in DEFAULT_GPT_ROOTS],
            "HK": [result_root_label(path.resolve()) for path in DEFAULT_HK_ROOTS],
        },
        "mean_summary": {
            "comparison_unit": "(project, tool, model)",
            "rows": mean_rows_as_dicts(mean_rows),
            "grouped_statistics": grouped_stats_as_dicts(grouped_stats),
        },
        "baseline_vs_corassert": summarize_pair_records(baseline_pairs),
        "naive_vs_corassert": summarize_pair_records(naive_pairs),
        "joint_hypothesis": {
            "n_total": len(triple_records),
            "n_all_strict_wins": len(triple_records) - len(joint_failures),
            "strict_all_better": len(joint_failures) == 0 and len(triple_records) > 0,
            "failure_records": [asdict(record) for record in joint_failures],
        },
    }
    return payload


def fmt(value: Optional[float], digits: int) -> str:
    if value is None:
        return "-"
    if value != 0 and abs(value) < 10 ** (-digits):
        return f"{value:.{digits}e}"
    return f"{value:.{digits}f}"


def render_report(payload: Dict[str, object], digits: int) -> str:
    baseline_summary = payload["baseline_vs_corassert"]
    naive_summary = payload["naive_vs_corassert"]
    joint_summary = payload["joint_hypothesis"]

    lines: List[str] = []
    lines.append("CORASSERT failed-files hypothesis summary")
    lines.append("")
    lines.append(
        "Unit: each observation is a matched "
        "`(result_root, project, tool, model)` condition."
    )
    lines.append("Statistical test: exact one-sided sign test.")
    lines.append("")

    lines.append("CORASSERT vs baseline")
    lines.append(
        f"- n={baseline_summary['n_total']}, wins={baseline_summary['n_wins']}, "
        f"losses={baseline_summary['n_losses']}, ties={baseline_summary['n_ties']}"
    )
    lines.append(
        f"- strict_all_better={baseline_summary['strict_all_better']}, "
        f"p={fmt(baseline_summary['exact_sign_test_pvalue'], digits)}"
    )
    lines.append(
        f"- mean_diff_pp={fmt(baseline_summary['mean_diff_pp'], digits)}, "
        f"median_diff_pp={fmt(baseline_summary['median_diff_pp'], digits)}, "
        f"mean_rel_gain_pct={fmt(baseline_summary['mean_rel_gain_pct'], digits)}"
    )
    lines.append("")

    lines.append("CORASSERT vs naive reflect")
    lines.append(
        f"- n={naive_summary['n_total']}, wins={naive_summary['n_wins']}, "
        f"losses={naive_summary['n_losses']}, ties={naive_summary['n_ties']}"
    )
    lines.append(
        f"- strict_all_better={naive_summary['strict_all_better']}, "
        f"p={fmt(naive_summary['exact_sign_test_pvalue'], digits)}"
    )
    lines.append(
        f"- mean_diff_pp={fmt(naive_summary['mean_diff_pp'], digits)}, "
        f"median_diff_pp={fmt(naive_summary['median_diff_pp'], digits)}, "
        f"mean_rel_gain_pct={fmt(naive_summary['mean_rel_gain_pct'], digits)}"
    )
    lines.append("")

    lines.append("Joint strict hypothesis")
    lines.append(
        f"- n={joint_summary['n_total']}, all_strict_wins={joint_summary['n_all_strict_wins']}, "
        f"strict_all_better={joint_summary['strict_all_better']}"
    )

    baseline_losses = baseline_summary["loss_records"]
    baseline_ties = baseline_summary["tie_records"]
    naive_losses = naive_summary["loss_records"]
    naive_ties = naive_summary["tie_records"]
    joint_failures = joint_summary["failure_records"]

    if baseline_losses:
        lines.append("")
        lines.append(f"Baseline losses ({len(baseline_losses)})")
        for record in baseline_losses:
            lines.append(
                f"- {record['result_root']} | {record['project']} | {record['tool']} | "
                f"{record['model']} | diff_pp={fmt(record['diff_pp'], digits)}"
            )

    if baseline_ties:
        lines.append("")
        lines.append(f"Baseline ties ({len(baseline_ties)})")
        for record in baseline_ties:
            lines.append(
                f"- {record['result_root']} | {record['project']} | {record['tool']} | "
                f"{record['model']} | diff_pp={fmt(record['diff_pp'], digits)}"
            )

    if naive_losses:
        lines.append("")
        lines.append(f"Naive losses ({len(naive_losses)})")
        for record in naive_losses:
            lines.append(
                f"- {record['result_root']} | {record['project']} | {record['tool']} | "
                f"{record['model']} | diff_pp={fmt(record['diff_pp'], digits)}"
            )

    if naive_ties:
        lines.append("")
        lines.append(f"Naive ties ({len(naive_ties)})")
        for record in naive_ties:
            lines.append(
                f"- {record['result_root']} | {record['project']} | {record['tool']} | "
                f"{record['model']} | diff_pp={fmt(record['diff_pp'], digits)}"
            )

    if joint_failures:
        lines.append("")
        lines.append(f"Joint failures ({len(joint_failures)})")
        for record in joint_failures:
            lines.append(
                f"- {record['result_root']} | {record['project']} | {record['tool']} | "
                f"{record['model']} | "
                f"corassert-baseline={fmt(record['corassert_minus_baseline_pp'], digits)}pp | "
                f"corassert-naive={fmt(record['corassert_minus_naive_pp'], digits)}pp"
            )

    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    projects = [project.lower() for project in args.projects]
    payload = build_result_payload(projects)
    report = render_report(payload, digits=args.digits)
    print(report)

    if args.json_output is not None:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
