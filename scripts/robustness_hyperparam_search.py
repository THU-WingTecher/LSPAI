r"""
python /LSPRAG/scripts/robustness_hyperparam_search.py \                                                                                                                                                                                 (base) 
                                           --scoring dual_threshold \
                                           --n-min 1 --n-max 200 --n-step 3 \
                                           --m-min 1 --m-max 10 --m-step 1 \
                                           --k-ratio 0.2 \
                                           --objective mean_error_count \
                                           --error-definition assertion_only \
                                           --datasets-config /LSPRAG/experiments/data/RA/RobustFUT/data_config.json \
                                           --top-n 5 \
                                           --output /LSPRAG/experiments/data/RA/RobustFUT/result.json

                                           
Grid search robustness selection against error outcomes.

robustness_hyperparam_search.py where score is testReferences * A + nonTestReferences * B
A_only baseline uses (A=1, B=0)
B_only baseline uses (A=0, B=1)

Features:
- Supports multiple datasets (test_file_map + file_results) with aggregation.
- Supports fixed k (count) or k-ratio selection.
- Supports error definition (assertion-only vs all errors).
- Reports top candidates with deltas vs baselines.
- Supports loading/saving run configs for reproducibility.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import math
from typing import Dict, Iterable, List, Tuple


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_run_config(path: str) -> dict:
    data = load_json(path)
    if not isinstance(data, dict):
        raise ValueError("run-config must be a JSON object")
    return data


def parse_ratios(raw: str) -> List[float]:
    ratios = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            val = float(part)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"Invalid ratio: {part}") from exc
        if val <= 0 or val > 1:
            raise argparse.ArgumentTypeError(f"Ratio must be in (0,1]: {val}")
        ratios.append(val)
    if not ratios:
        raise argparse.ArgumentTypeError("At least one ratio must be provided")
    return ratios


def build_symbol_index(symbols: List[dict]) -> Dict[tuple, dict]:
    index: Dict[tuple, dict] = {}
    for sym in symbols:
        symbol_name = sym.get("symbolName")
        rel_path = sym.get("relativeDocumentPath") or sym.get("file_name") or sym.get("fileName")
        if symbol_name is None or rel_path is None:
            continue
        key = (symbol_name, rel_path)
        if key not in index:
            index[key] = sym
    return index


def normalize_dataset_entry(entry: dict) -> dict:
    test_map = (
        entry.get("test_file_map")
        or entry.get("testFileMapPath")
        or entry.get("test_file_map_path")
    )
    file_results = (
        entry.get("file_results")
        or entry.get("fileResultsPath")
        or entry.get("file_results_path")
    )
    if not test_map or not file_results:
        raise ValueError(f"Dataset entry missing test_file_map or file_results: {entry}")
    return {"test_file_map": test_map, "file_results": file_results}


def find_single_file(root: str, filename: str) -> str:
    matches = []
    for dirpath, _, filenames in os.walk(root):
        if filename in filenames:
            matches.append(os.path.join(dirpath, filename))
    if len(matches) == 1:
        return matches[0]
    if len(matches) == 0:
        raise RuntimeError(f"No {filename} found under {root}")
    raise RuntimeError(f"Multiple {filename} found under {root}: {matches}")


def datasets_from_dirs(data_dirs: List[str]) -> List[dict]:
    datasets = []
    for root in data_dirs:
        test_map = find_single_file(root, "test_file_map.json")
        file_results = find_single_file(root, "file_results.json")
        datasets.append({"test_file_map": test_map, "file_results": file_results})
    return datasets


def load_datasets(
    config_path: str | None,
    default_test_map: str,
    default_file_results: str,
    data_dirs: List[str],
) -> List[dict]:
    if data_dirs:
        return datasets_from_dirs(data_dirs)
    if not config_path:
        return [{"test_file_map": default_test_map, "file_results": default_file_results}]
    data = load_json(config_path)
    if isinstance(data, dict) and "datasets" in data:
        datasets = data["datasets"]
    elif isinstance(data, list):
        datasets = data
    else:
        raise ValueError("datasets config must be a list or a dict with 'datasets'")
    return [normalize_dataset_entry(d) for d in datasets]


def build_rows_from_datasets(
    symbol_index: Dict[tuple, dict], datasets: List[dict]
) -> Tuple[List[dict], Dict[str, object]]:
    aggregated: Dict[tuple, dict] = {}
    dataset_meta = []

    for dataset in datasets:
        test_map = load_json(dataset["test_file_map"])
        file_results_raw = load_json(dataset["file_results"])
        file_results = file_results_raw.get("files", file_results_raw)
        basename_to_counts = {os.path.basename(k): v.get("counts", {}) for k, v in file_results.items()}

        missing_counts = 0
        missing_symbol = 0
        total_entries = 0

        for test_file, info in test_map.items():
            total_entries += 1
            counts = basename_to_counts.get(test_file)
            if counts is None:
                missing_counts += 1
                continue

            symbol_name = info.get("symbol_name")
            rel_path = info.get("file_name")
            key = (symbol_name, rel_path)
            sym = symbol_index.get(key)
            if sym is None:
                missing_symbol += 1
                continue

            entry = aggregated.get(key)
            if entry is None:
                entry = {
                    "symbol": symbol_name,
                    "file_name": rel_path,
                    "testReferences": int(sym.get("testReferences", 0) or 0),
                    "totalReferences": int(sym.get("totalReferences", 0) or 0),
                    "passed": 0,
                    "assertion_errors": 0,
                    "errors": 0,
                    "runs": 0,
                }
                aggregated[key] = entry

            entry["passed"] += int(counts.get("Passed", 0) or 0)
            entry["assertion_errors"] += int(counts.get("Assertion Errors", 0) or 0)
            entry["errors"] += int(counts.get("Error", 0) or 0)
            entry["runs"] += 1

        dataset_meta.append(
            {
                "test_file_map": dataset["test_file_map"],
                "file_results": dataset["file_results"],
                "total_entries": total_entries,
                "missing_counts": missing_counts,
                "missing_symbol": missing_symbol,
            }
        )

    rows: List[dict] = []
    for entry in aggregated.values():
        total_tests = entry["passed"] + entry["assertion_errors"] + entry["errors"]
        rows.append(
            {
                "symbol": entry["symbol"],
                "file_name": entry["file_name"],
                "testReferences": entry["testReferences"],
                "totalReferences": entry["totalReferences"],
                "nonTestReferences": entry["totalReferences"] - entry["testReferences"],
                "assertion_errors": entry["assertion_errors"],
                "errors": entry["errors"],
                "total_tests": total_tests,
                "runs": entry["runs"],
            }
        )

    meta = {
        "total_rows": len(rows),
        "datasets": dataset_meta,
        "total_symbols_index": len(symbol_index),
    }
    return rows, meta


def rank_key(row: dict, scoring: str, a: int, b: int, n: int | None, m: int | None) -> tuple:
    if scoring == "weighted":
        return (
            row["testReferences"] * a + row["nonTestReferences"] * b,
            row["testReferences"],
            row["nonTestReferences"],
        )
    if scoring == "threshold":
        threshold = 0 if n is None else n
        meets = (row["nonTestReferences"] >= threshold) or (row["testReferences"] > 0)
        return (
            1 if meets else 0,
            row["testReferences"],
            row["nonTestReferences"],
        )
    if scoring == "dual_threshold":
        prod_threshold = 0 if n is None else n
        test_threshold = 0 if m is None else m
        meets = (row["nonTestReferences"] >= prod_threshold) or (row["testReferences"] >= test_threshold)
        return (
            1 if meets else 0,
            row["nonTestReferences"],
            row["testReferences"],
        )
    raise ValueError(f"Unknown scoring: {scoring}")




def threshold_meets(row: dict, scoring: str, n: int | None, m: int | None) -> bool:
    if scoring == "threshold":
        threshold = 0 if n is None else n
        return (row["nonTestReferences"] >= threshold) or (row["testReferences"] > 0)
    if scoring == "dual_threshold":
        prod_threshold = 0 if n is None else n
        test_threshold = 0 if m is None else m
        return (row["nonTestReferences"] >= prod_threshold) or (row["testReferences"] >= test_threshold)
    raise ValueError(f"Unknown scoring for threshold_meets: {scoring}")

def topk(
    rows: List[dict], scoring: str, a: int, b: int, n: int | None, m: int | None, k: int
) -> List[dict]:
    idx = sorted(range(len(rows)), key=lambda i: rank_key(rows[i], scoring, a, b, n, m), reverse=True)
    return [rows[i] for i in idx[:k]]


def mean(values: Iterable[float]) -> float:
    vals = list(values)
    return sum(vals) / len(vals) if vals else 0.0


def error_count(row: dict, error_definition: str) -> int:
    if error_definition == "assertion_only":
        return int(row["assertion_errors"])
    if error_definition == "all_errors":
        return int(row["assertion_errors"] + row["errors"])
    raise ValueError(f"Unknown error_definition: {error_definition}")


def objective_value(row: dict, objective: str, error_definition: str) -> float:
    err = error_count(row, error_definition)
    if objective == "any_error":
        return 1.0 if err > 0 else 0.0
    if objective == "mean_error_count":
        return float(err)
    if objective == "error_rate_tests":
        return float(err / row["total_tests"]) if row["total_tests"] else 0.0
    raise ValueError(f"Unknown objective: {objective}")


def compute_metrics(rows: List[dict], error_definition: str) -> dict:
    err_sum = sum(error_count(r, error_definition) for r in rows)
    any_err = sum(1 for r in rows if error_count(r, error_definition) > 0)
    total_tests = sum(r["total_tests"] for r in rows)
    return {
        "any_error_ratio": (any_err / len(rows)) if rows else 0.0,
        "mean_error_count": (err_sum / len(rows)) if rows else 0.0,
        "error_rate_tests": (err_sum / total_tests) if total_tests else 0.0,
        "total_tests": total_tests,
    }


def write_heatmap_svg(
    path: str,
    grid: List[List[float]],
    a_values: List[int],
    b_values: List[int],
    title: str,
    x_label: str = "A",
    y_label: str = "B",
):
    # Simple heatmap without external deps
    rows = len(b_values)
    cols = len(a_values)
    cell = 30
    margin = 80
    legend_w = 140
    width = margin * 2 + cols * cell + legend_w
    height = margin * 2 + rows * cell

    flat = [v for row in grid for v in row]
    vmin = min(flat) if flat else 0.0
    vmax = max(flat) if flat else 1.0
    if vmin == vmax:
        vmin -= 1.0
        vmax += 1.0

    def color(val: float) -> str:
        # blue (low) -> red (high)
        t = (val - vmin) / (vmax - vmin)
        r = int(255 * t)
        g = int(80 * (1 - t))
        b = int(255 * (1 - t))
        return f"rgb({r},{g},{b})"

    lines = []
    lines.append(f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}'>")
    lines.append("<rect width='100%' height='100%' fill='white'/>")
    lines.append(
        f"<text x='{width/2}' y='30' text-anchor='middle' font-family='Arial' font-size='16'>{title}</text>"
    )

    # Axis labels
    lines.append(
        f"<text x='{width/2 - legend_w/2}' y='{height-10}' text-anchor='middle' font-family='Arial' font-size='12'>{x_label}</text>"
    )
    lines.append(
        f"<text x='20' y='{height/2}' text-anchor='middle' font-family='Arial' font-size='12' transform='rotate(-90 20 {height/2})'>{y_label}</text>"
    )

    # Draw cells (B on y-axis, A on x-axis)
    for i, b in enumerate(b_values):
        for j, a in enumerate(a_values):
            val = grid[i][j]
            x = margin + j * cell
            y = margin + i * cell
            lines.append(f"<rect x='{x}' y='{y}' width='{cell}' height='{cell}' fill='{color(val)}' stroke='#eee' />")

    # Ticks
    for j, a in enumerate(a_values):
        x = margin + j * cell + cell / 2
        lines.append(
            f"<text x='{x}' y='{margin-8}' text-anchor='middle' font-family='Arial' font-size='10'>{a}</text>"
        )
    for i, b in enumerate(b_values):
        y = margin + i * cell + cell / 2 + 3
        lines.append(
            f"<text x='{margin-10}' y='{y}' text-anchor='end' font-family='Arial' font-size='10'>{b}</text>"
        )

    # Legend
    legend_x = margin + cols * cell + 30
    legend_y = margin
    legend_h = rows * cell
    for i in range(legend_h):
        t = i / max(1, legend_h - 1)
        val = vmin + t * (vmax - vmin)
        lines.append(
            f"<rect x='{legend_x}' y='{legend_y + i}' width='20' height='1' fill='{color(val)}' />"
        )
    lines.append(
        f"<text x='{legend_x + 30}' y='{legend_y + 5}' font-family='Arial' font-size='10'>{vmax:.4f}</text>"
    )
    lines.append(
        f"<text x='{legend_x + 30}' y='{legend_y + legend_h}' font-family='Arial' font-size='10'>{vmin:.4f}</text>"
    )
    lines.append(
        f"<text x='{legend_x}' y='{legend_y - 10}' font-family='Arial' font-size='10'>Objective</text>"
    )

    lines.append("</svg>")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def resolve_objective(obj: str) -> str:
    legacy = {
        "any_assertion_error": "any_error",
        "mean_assertion_errors": "mean_error_count",
        "mean_assertion_error_rate": "error_rate_tests",
    }
    return legacy.get(obj, obj)


def resolve_k(total_rows: int, k: int | None, k_ratio: float | None) -> int:
    if k is not None and k_ratio is not None:
        raise ValueError("Use only one of --k or --k-ratio")
    if k is not None:
        if k <= 0:
            raise ValueError("k must be > 0")
        return min(k, total_rows)
    if k_ratio is not None:
        if k_ratio <= 0 or k_ratio > 1:
            raise ValueError("k-ratio must be in (0,1]")
        return max(1, int(round(total_rows * k_ratio)))
    raise ValueError("Either --k or --k-ratio must be provided")


def resolve_threshold_values(n: int | None, n_min: int, n_max: int, n_step: int) -> List[int]:
    if n is not None:
        return [n]
    if n_step <= 0:
        raise ValueError("n-step must be > 0")
    if n_min <= 0 or n_max <= 0:
        raise ValueError("n-min and n-max must be > 0")
    if n_min > n_max:
        raise ValueError("n-min must be <= n-max")
    return list(range(n_min, n_max + 1, n_step))


def resolve_percent_values(p: float | None, p_min: float, p_max: float, p_step: float) -> List[float]:
    if p is not None:
        if p <= 0 or p > 1:
            raise ValueError("percentile must be in (0,1]")
        return [float(p)]
    if p_step <= 0:
        raise ValueError("p-step must be > 0")
    if p_min <= 0 or p_max <= 0 or p_min > 1 or p_max > 1:
        raise ValueError("p-min and p-max must be in (0,1]")
    if p_min > p_max:
        raise ValueError("p-min must be <= p-max")
    out: List[float] = []
    cur = p_min
    # Floating steps accumulate error; round to 10 dp for stable lists.
    while cur <= p_max + 1e-12:
        out.append(round(cur, 10))
        cur += p_step
    return out


def topk_index_by_metric(rows: List[dict], metric: str, k: int) -> set[int]:
    # Deterministic tie-break: prefer larger other metric, then stable by symbol/file.
    if metric == "nonTestReferences":
        key_fn = lambda r: (r["nonTestReferences"], r["testReferences"], r["symbol"], r["file_name"])
    elif metric == "testReferences":
        key_fn = lambda r: (r["testReferences"], r["nonTestReferences"], r["symbol"], r["file_name"])
    else:
        raise ValueError(f"Unknown metric: {metric}")
    idx = sorted(range(len(rows)), key=lambda i: key_fn(rows[i]), reverse=True)
    return set(idx[:k])


def pct_to_k(total: int, pct: float) -> int:
    if pct <= 0 or pct > 1:
        raise ValueError("percentile must be in (0,1]")
    return max(1, int(math.ceil(total * pct)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Grid search robustness selection against error outcomes.")
    parser.add_argument("--run-config", default=None, help="Path to JSON config that overrides CLI args")
    parser.add_argument("--save-config", default=None, help="Write effective args to JSON for reproduction")
    parser.add_argument(
        "--symbol-robustness",
        default="/LSPRAG/experiments/projects/black/symbol_robustness_results.json",
        help="Path to symbol_robustness_results.json",
    )
    parser.add_argument(
        "--test-file-map",
        default="/LSPRAG/experiments/projects/black/lsprag-workspace/20260127_074157/black/lsprag_withcontext/deepseek-chat/results/test_file_map.json",
        help="Path to test_file_map.json",
    )
    parser.add_argument(
        "--file-results",
        default="/LSPRAG/experiments/projects/black/lsprag-workspace/20260127_074157/black/lsprag_withcontext/deepseek-chat/results/final-final-report/file_results.json",
        help="Path to file_results.json",
    )
    parser.add_argument(
        "--datasets-config",
        default=None,
        help="Path to JSON list of datasets with test_file_map and file_results",
    )
    parser.add_argument(
        "--data-dir",
        action="append",
        default=[],
        help="Root directory containing test_file_map.json and file_results.json (can be repeated)",
    )
    parser.add_argument("--a-min", type=int, default=1)
    parser.add_argument("--a-max", type=int, default=30)
    parser.add_argument("--b-min", type=int, default=1)
    parser.add_argument("--b-max", type=int, default=10)
    parser.add_argument(
        "--scoring",
        choices=["weighted", "threshold", "dual_threshold", "dual_threshold_pct"],
        default="weighted",
        help="Selection scoring mode",
    )
    parser.add_argument("--n", type=int, default=None, help="Threshold for non-test references (threshold scoring)")
    parser.add_argument("--n-min", type=int, default=1)
    parser.add_argument("--n-max", type=int, default=20)
    parser.add_argument("--n-step", type=int, default=1)
    parser.add_argument("--m", type=int, default=None, help="Threshold for test references (dual_threshold scoring)")
    parser.add_argument("--m-min", type=int, default=1)
    parser.add_argument("--m-max", type=int, default=20)
    parser.add_argument("--m-step", type=int, default=1)
    parser.add_argument(
        "--n-pct",
        type=float,
        default=None,
        help="Top-percentile for non-test references (dual_threshold_pct scoring, e.g. 0.15 for top 15%)",
    )
    parser.add_argument("--n-pct-min", type=float, default=0.05)
    parser.add_argument("--n-pct-max", type=float, default=0.5)
    parser.add_argument("--n-pct-step", type=float, default=0.05)
    parser.add_argument(
        "--m-pct",
        type=float,
        default=None,
        help="Top-percentile for test references (dual_threshold_pct scoring, e.g. 0.15 for top 15%)",
    )
    parser.add_argument("--m-pct-min", type=float, default=0.05)
    parser.add_argument("--m-pct-max", type=float, default=0.5)
    parser.add_argument("--m-pct-step", type=float, default=0.05)
    parser.add_argument("--k", type=int, default=None, help="Top-k count (overrides ratios)")
    parser.add_argument("--k-ratio", type=float, default=None, help="Top-k ratio (overrides ratios)")
    parser.add_argument("--ratios", type=parse_ratios, default="0.1,0.2,0.3,0.5")
    parser.add_argument(
        "--objective",
        choices=[
            "any_error",
            "mean_error_count",
            "error_rate_tests",
            "any_assertion_error",
            "mean_assertion_errors",
            "mean_assertion_error_rate",
        ],
        default="mean_error_count",
        help="Optimization objective for selection scoring",
    )
    parser.add_argument(
        "--error-definition",
        choices=["assertion_only", "all_errors"],
        default="assertion_only",
        help="Which errors to include in the objective",
    )
    parser.add_argument("--top-n", type=int, default=10, help="Top N A,B candidates to display")
    parser.add_argument(
        "--heatmap-out",
        default=None,
        help="Write SVG heatmap for A/B grid (requires --k or --k-ratio)",
    )
    parser.add_argument(
        "--nm-heatmap-out",
        default=None,
        help="Write SVG heatmap for n/m grid (dual_threshold or dual_threshold_pct scoring)",
    )
    parser.add_argument(
        "--output",
        default="/LSPRAG/experiments/projects/black/robustness_hyperparam_search_results.json",
        help="Output JSON summary path",
    )

    args = parser.parse_args()

    if args.run_config:
        cfg = load_run_config(args.run_config)
        for key, value in cfg.items():
            if key in ("run_config", "save_config"):
                continue
            if not hasattr(args, key):
                raise ValueError(f"Unknown config key: {key}")
            # Only override when the CLI left the value at its default.
            if getattr(args, key) == parser.get_default(key):
                setattr(args, key, value)

    if args.save_config:
        cfg = {k: v for k, v in vars(args).items() if k not in ("run_config", "save_config")}
        out_dir = os.path.dirname(args.save_config)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with open(args.save_config, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)

    objective = resolve_objective(args.objective)

    symbols = load_json(args.symbol_robustness)
    symbol_index = build_symbol_index(symbols)
    datasets = load_datasets(args.datasets_config, args.test_file_map, args.file_results, args.data_dir)

    rows, meta = build_rows_from_datasets(symbol_index, datasets)
    if not rows:
        raise RuntimeError("No rows were built from datasets; check inputs.")

    # If k is provided, run single-k analysis with A,B comparison table.
    if args.k is not None or args.k_ratio is not None:
        k = resolve_k(len(rows), args.k, args.k_ratio)
        overall_metrics = compute_metrics(rows, args.error_definition)

        # Baselines for selected k (A-only/B-only always use weighted scoring)
        a_only_sel = topk(rows, "weighted", 1, 0, None, None, k)
        b_only_sel = topk(rows, "weighted", 0, 1, None, None, k)
        overall_sel = rows

        baselines = {
            "overall_k1": compute_metrics(overall_sel, args.error_definition),
            "A_only": compute_metrics(a_only_sel, args.error_definition),
            "B_only": compute_metrics(b_only_sel, args.error_definition),
        }

        candidates = []
        if args.scoring == "weighted":
            for a in range(args.a_min, args.a_max + 1):
                for b in range(args.b_min, args.b_max + 1):
                    sel = topk(rows, "weighted", a, b, None, None, k)
                    metrics = compute_metrics(sel, args.error_definition)
                    obj_val = {
                        "any_error": metrics["any_error_ratio"],
                        "mean_error_count": metrics["mean_error_count"],
                        "error_rate_tests": metrics["error_rate_tests"],
                    }[objective]
                    candidates.append(
                        {
                            "A": a,
                            "B": b,
                            "objective_value": obj_val,
                            "metrics": metrics,
                            "delta_vs_overall": baselines["overall_k1"][
                                "any_error_ratio" if objective == "any_error" else "mean_error_count" if objective == "mean_error_count" else "error_rate_tests"
                            ]
                            - obj_val,
                            "delta_vs_A_only": baselines["A_only"][
                                "any_error_ratio" if objective == "any_error" else "mean_error_count" if objective == "mean_error_count" else "error_rate_tests"
                            ]
                            - obj_val,
                            "delta_vs_B_only": baselines["B_only"][
                                "any_error_ratio" if objective == "any_error" else "mean_error_count" if objective == "mean_error_count" else "error_rate_tests"
                            ]
                            - obj_val,
                        }
                    )
        elif args.scoring == "threshold":
            n_values = resolve_threshold_values(args.n, args.n_min, args.n_max, args.n_step)
            for n_val in n_values:
                sel = topk(rows, "threshold", 0, 0, n_val, None, k)
                metrics = compute_metrics(sel, args.error_definition)
                eligible_count = sum(1 for r in rows if threshold_meets(r, "threshold", n_val, None))
                obj_val = {
                    "any_error": metrics["any_error_ratio"],
                    "mean_error_count": metrics["mean_error_count"],
                    "error_rate_tests": metrics["error_rate_tests"],
                }[objective]
                candidates.append(
                    {
                        "n": n_val,
                        "objective_value": obj_val,
                        "metrics": metrics,
                        "eligible_count": eligible_count,
                        "selected_k": k,
                        "delta_vs_overall": baselines["overall_k1"][
                            "any_error_ratio" if objective == "any_error" else "mean_error_count" if objective == "mean_error_count" else "error_rate_tests"
                        ]
                        - obj_val,
                        "delta_vs_A_only": baselines["A_only"][
                            "any_error_ratio" if objective == "any_error" else "mean_error_count" if objective == "mean_error_count" else "error_rate_tests"
                        ]
                        - obj_val,
                        "delta_vs_B_only": baselines["B_only"][
                            "any_error_ratio" if objective == "any_error" else "mean_error_count" if objective == "mean_error_count" else "error_rate_tests"
                        ]
                        - obj_val,
                    }
                )
        elif args.scoring == "dual_threshold":
            n_values = resolve_threshold_values(args.n, args.n_min, args.n_max, args.n_step)
            m_values = resolve_threshold_values(args.m, args.m_min, args.m_max, args.m_step)
            for n_val in n_values:
                for m_val in m_values:
                    sel = topk(rows, "dual_threshold", 0, 0, n_val, m_val, k)
                    metrics = compute_metrics(sel, args.error_definition)
                    eligible_count = sum(1 for r in rows if threshold_meets(r, "dual_threshold", n_val, m_val))
                    obj_val = {
                        "any_error": metrics["any_error_ratio"],
                        "mean_error_count": metrics["mean_error_count"],
                        "error_rate_tests": metrics["error_rate_tests"],
                    }[objective]
                    candidates.append(
                        {
                            "n": n_val,
                            "m": m_val,
                            "objective_value": obj_val,
                            "metrics": metrics,
                            "eligible_count": eligible_count,
                            "selected_k": k,
                            "delta_vs_overall": baselines["overall_k1"][
                                "any_error_ratio"
                                if objective == "any_error"
                                else "mean_error_count"
                                if objective == "mean_error_count"
                                else "error_rate_tests"
                            ]
                            - obj_val,
                            "delta_vs_A_only": baselines["A_only"][
                                "any_error_ratio"
                                if objective == "any_error"
                                else "mean_error_count"
                                if objective == "mean_error_count"
                                else "error_rate_tests"
                            ]
                            - obj_val,
                            "delta_vs_B_only": baselines["B_only"][
                                "any_error_ratio"
                                if objective == "any_error"
                                else "mean_error_count"
                                if objective == "mean_error_count"
                                else "error_rate_tests"
                            ]
                            - obj_val,
                        }
                    )
        else:
            # dual_threshold_pct: top p_n by nonTestReferences OR top p_m by testReferences
            n_pcts = resolve_percent_values(args.n_pct, args.n_pct_min, args.n_pct_max, args.n_pct_step)
            m_pcts = resolve_percent_values(args.m_pct, args.m_pct_min, args.m_pct_max, args.m_pct_step)
            for p_n in n_pcts:
                k_n = pct_to_k(len(rows), p_n)
                top_prod = topk_index_by_metric(rows, "nonTestReferences", k_n)
                for p_m in m_pcts:
                    k_m = pct_to_k(len(rows), p_m)
                    top_test = topk_index_by_metric(rows, "testReferences", k_m)
                    eligible_idx = top_prod | top_test

                    # Order: eligible first, then by usage (production then test), then stable.
                    def order_key(i: int) -> tuple:
                        r = rows[i]
                        return (
                            1 if i in eligible_idx else 0,
                            r["nonTestReferences"],
                            r["testReferences"],
                            r["symbol"],
                            r["file_name"],
                        )

                    idx = sorted(range(len(rows)), key=order_key, reverse=True)
                    sel = [rows[i] for i in idx[:k]]
                    metrics = compute_metrics(sel, args.error_definition)
                    obj_val = {
                        "any_error": metrics["any_error_ratio"],
                        "mean_error_count": metrics["mean_error_count"],
                        "error_rate_tests": metrics["error_rate_tests"],
                    }[objective]
                    candidates.append(
                        {
                            "n_pct": p_n,
                            "m_pct": p_m,
                            "n_k": k_n,
                            "m_k": k_m,
                            "objective_value": obj_val,
                            "metrics": metrics,
                            "eligible_count": len(eligible_idx),
                            "selected_k": k,
                            "delta_vs_overall": baselines["overall_k1"][
                                "any_error_ratio"
                                if objective == "any_error"
                                else "mean_error_count"
                                if objective == "mean_error_count"
                                else "error_rate_tests"
                            ]
                            - obj_val,
                            "delta_vs_A_only": baselines["A_only"][
                                "any_error_ratio"
                                if objective == "any_error"
                                else "mean_error_count"
                                if objective == "mean_error_count"
                                else "error_rate_tests"
                            ]
                            - obj_val,
                            "delta_vs_B_only": baselines["B_only"][
                                "any_error_ratio"
                                if objective == "any_error"
                                else "mean_error_count"
                                if objective == "mean_error_count"
                                else "error_rate_tests"
                            ]
                            - obj_val,
                        }
                    )
        candidates.sort(key=lambda x: x["objective_value"])
        top_candidates = candidates[: max(1, args.top_n)]


        if args.nm_heatmap_out:
            if args.scoring == "dual_threshold":
                n_values = resolve_threshold_values(args.n, args.n_min, args.n_max, args.n_step)
                m_values = resolve_threshold_values(args.m, args.m_min, args.m_max, args.m_step)
                grid = []
                for m in m_values:
                    row = []
                    for n in n_values:
                        sel = topk(rows, "dual_threshold", 0, 0, n, m, k)
                        metrics = compute_metrics(sel, args.error_definition)
                        obj_val = {
                            "any_error": metrics["any_error_ratio"],
                            "mean_error_count": metrics["mean_error_count"],
                            "error_rate_tests": metrics["error_rate_tests"],
                        }[objective]
                        row.append(obj_val)
                    grid.append(row)
                title = f"Objective heatmap (k={k}, objective={objective}, errors={args.error_definition})"
                write_heatmap_svg(args.nm_heatmap_out, grid, n_values, m_values, title, x_label="n", y_label="m")
            elif args.scoring == "dual_threshold_pct":
                n_pcts = resolve_percent_values(args.n_pct, args.n_pct_min, args.n_pct_max, args.n_pct_step)
                m_pcts = resolve_percent_values(args.m_pct, args.m_pct_min, args.m_pct_max, args.m_pct_step)
                grid = []
                for p_m in m_pcts:
                    k_m = pct_to_k(len(rows), p_m)
                    top_test = topk_index_by_metric(rows, "testReferences", k_m)
                    row = []
                    for p_n in n_pcts:
                        k_n = pct_to_k(len(rows), p_n)
                        top_prod = topk_index_by_metric(rows, "nonTestReferences", k_n)
                        eligible_idx = top_prod | top_test

                        def order_key(i: int) -> tuple:
                            r = rows[i]
                            return (
                                1 if i in eligible_idx else 0,
                                r["nonTestReferences"],
                                r["testReferences"],
                                r["symbol"],
                                r["file_name"],
                            )

                        idx = sorted(range(len(rows)), key=order_key, reverse=True)
                        sel = [rows[i] for i in idx[:k]]
                        metrics = compute_metrics(sel, args.error_definition)
                        obj_val = {
                            "any_error": metrics["any_error_ratio"],
                            "mean_error_count": metrics["mean_error_count"],
                            "error_rate_tests": metrics["error_rate_tests"],
                        }[objective]
                        row.append(obj_val)
                    grid.append(row)
                title = f"Objective heatmap (k={k}, objective={objective}, errors={args.error_definition})"
                write_heatmap_svg(args.nm_heatmap_out, grid, n_pcts, m_pcts, title, x_label="n_pct", y_label="m_pct")
            else:
                raise ValueError("n/m heatmap is only supported for dual_threshold or dual_threshold_pct scoring")

        if args.heatmap_out:
            if args.scoring != "weighted":
                raise ValueError("Heatmap is only supported for weighted scoring")
            a_values = list(range(args.a_min, args.a_max + 1))
            b_values = list(range(args.b_min, args.b_max + 1))
            grid = []
            for b in b_values:
                row = []
                for a in a_values:
                    sel = topk(rows, "weighted", a, b, None, None, k)
                    metrics = compute_metrics(sel, args.error_definition)
                    obj_val = {
                        "any_error": metrics["any_error_ratio"],
                        "mean_error_count": metrics["mean_error_count"],
                        "error_rate_tests": metrics["error_rate_tests"],
                    }[objective]
                    row.append(obj_val)
                grid.append(row)
            title = f"Objective heatmap (k={k}, objective={objective}, errors={args.error_definition})"
            write_heatmap_svg(args.heatmap_out, grid, a_values, b_values, title)

        payload = {
            "meta": {
                "symbol_robustness": args.symbol_robustness,
                "datasets_config": args.datasets_config,
                "data_dirs": args.data_dir,
                "a_range": [args.a_min, args.a_max],
                "b_range": [args.b_min, args.b_max],
                "n": args.n,
                "m": args.m,
                "n_range": [args.n_min, args.n_max, args.n_step],
                "m_range": [args.m_min, args.m_max, args.m_step],
                "n_pct": args.n_pct,
                "m_pct": args.m_pct,
                "n_pct_range": [args.n_pct_min, args.n_pct_max, args.n_pct_step],
                "m_pct_range": [args.m_pct_min, args.m_pct_max, args.m_pct_step],
                "k": k,
                "total_rows": len(rows),
                "objective": objective,
                "error_definition": args.error_definition,
                "scoring": args.scoring,
                **meta,
            },
            "baselines": baselines,
            "top_candidates": top_candidates,
        }

        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

        if args.scoring == "weighted":
            print("Top A,B candidates (lower is better):")
            for item in top_candidates:
                print(
                    f" A={item['A']} B={item['B']} obj={item['objective_value']:.4f} "
                    f"(Δ vs overall {item['delta_vs_overall']:.4f}, "
                    f"Δ vs A-only {item['delta_vs_A_only']:.4f}, "
                    f"Δ vs B-only {item['delta_vs_B_only']:.4f})"
                )
        elif args.scoring == "threshold":
            print("Top n-threshold candidates (lower is better):")
            for item in top_candidates:
                print(
                    f" n={item['n']} obj={item['objective_value']:.4f} "
                    f"eligible={item['eligible_count']}/{len(rows)} selected={item['selected_k']} "
                    f"(Δ vs overall {item['delta_vs_overall']:.4f}, "
                    f"Δ vs A-only {item['delta_vs_A_only']:.4f}, "
                    f"Δ vs B-only {item['delta_vs_B_only']:.4f})"
                )
        elif args.scoring == "dual_threshold":
            print("Top (n,m) threshold candidates (lower is better):")
            for item in top_candidates:
                print(
                    f" n={item['n']} m={item['m']} obj={item['objective_value']:.4f} "
                    f"eligible={item['eligible_count']}/{len(rows)} selected={item['selected_k']} "
                    f"(Δ vs overall {item['delta_vs_overall']:.4f}, "
                    f"Δ vs A-only {item['delta_vs_A_only']:.4f}, "
                    f"Δ vs B-only {item['delta_vs_B_only']:.4f})"
                )
        else:
            print("Top (n_pct,m_pct) threshold candidates (lower is better):")
            for item in top_candidates:
                print(
                    f" n_pct={item['n_pct']:.4f} m_pct={item['m_pct']:.4f} obj={item['objective_value']:.4f} "
                    f"eligible={item['eligible_count']}/{len(rows)} selected={item['selected_k']} "
                    f"(Δ vs overall {item['delta_vs_overall']:.4f}, "
                    f"Δ vs A-only {item['delta_vs_A_only']:.4f}, "
                    f"Δ vs B-only {item['delta_vs_B_only']:.4f})"
                )

        print(f"Wrote: {args.output}")
        return 0

    # Ratio mode (legacy)
    ratios = args.ratios
    results = {}
    for ratio in ratios:
        k = resolve_k(len(rows), None, ratio)
        best = None
        for a in range(args.a_min, args.a_max + 1):
            for b in range(args.b_min, args.b_max + 1):
                sel = topk(rows, "weighted", a, b, None, None, k)
                metrics = compute_metrics(sel, args.error_definition)
                obj_val = {
                    "any_error": metrics["any_error_ratio"],
                    "mean_error_count": metrics["mean_error_count"],
                    "error_rate_tests": metrics["error_rate_tests"],
                }[objective]
                if best is None or obj_val < best["objective_value"]:
                    best = {
                        "A": a,
                        "B": b,
                        "objective_value": obj_val,
                        "metrics": metrics,
                    }
        results[str(ratio)] = {"best": best, "k": k}

    payload = {
        "meta": {
            "symbol_robustness": args.symbol_robustness,
            "datasets_config": args.datasets_config,
            "data_dirs": args.data_dir,
            "a_range": [args.a_min, args.a_max],
            "b_range": [args.b_min, args.b_max],
            "ratios": ratios,
            "objective": objective,
            "error_definition": args.error_definition,
            "scoring": args.scoring,
            "n": args.n,
            "m": args.m,
            "n_range": [args.n_min, args.n_max, args.n_step],
            "m_range": [args.m_min, args.m_max, args.m_step],
            **meta,
        },
        "results": results,
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print("Ratio-mode summary (lower is better):")
    for ratio, entry in results.items():
        best = entry["best"]
        print(
            f" ratio {ratio} (k={entry['k']}): best {objective} A={best['A']} B={best['B']} -> {best['objective_value']:.4f}"
        )
    print(f"Wrote: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
