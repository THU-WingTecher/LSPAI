#!/usr/bin/env python3
"""
Generate Markdown/LaTeX ablation templates from ablation manifest TSV files.

The script can emit real failed-files ratios when available, or placeholder-only
templates for manual filling.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict
from typing import List
from typing import Optional
from typing import Tuple


DEFAULT_MANIFESTS = [
    Path("/LSPRAG/experiments/data/result/ablation/MANIFEST.tsv"),
    Path("/LSPRAG/experiments/data/result/ablation/MANIFEST_final_versions.tsv"),
]
VARIANT_ORDER = [
    "base",
    "naive",
    "only-cfg",
    "only-reflection",
    "cfg-vars",
    "experimental_withcontext",
]
METHOD_VARIANT_DEFAULTS = {
    "claudecode": ["base", "naive", "only-cfg", "only-reflection", "cfg-vars"],
    "opencode": ["base", "naive", "only-cfg", "only-reflection", "cfg-vars"],
    "lsprag": ["base", "naive", "only-cfg", "only-reflection", "experimental_withcontext"],
}
METHOD_ORDER = ["claudecode", "opencode", "lsprag"]
PROJECT_ORDER = ["black", "tornado"]
MODEL_ORDER = ["deepseek", "haiku"]
MODEL_DISPLAY = {
    "deepseek": "DS",
    "haiku": "HK",
    "gpt-5": "GPT",
}
TEX_COLUMNS: List[Tuple[str, str, str]] = [
    ("black", "deepseek", "Black/DS"),
    ("black", "haiku", "Black/HK"),
    ("tornado", "deepseek", "Tornado/DS"),
    ("tornado", "haiku", "Tornado/HK"),
]
METHOD_MACRO = {
    "claudecode": r"\cc",
    "opencode": r"\opencode",
    "lsprag": r"\lsprag",
}


@dataclass
class ManifestRow:
    variant: str
    project: str
    model: str
    method: str
    source: Path
    destination: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Markdown/TeX ablation templates from ablation manifests."
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        action="append",
        help=(
            "Path to a manifest TSV file. Can be repeated. "
            "If omitted, uses default manifests under /LSPRAG/experiments/data/result/ablation."
        ),
    )
    parser.add_argument(
        "--output-md",
        type=Path,
        default=Path("/LSPRAG/experiments/data/result/ablation/ablation_failed_files_template.md"),
        help="Output Markdown path",
    )
    parser.add_argument(
        "--output-tex",
        type=Path,
        default=Path("/LSPRAG/experiments/data/result/ablation/ablation_failed_files_template.tex"),
        help="Output TeX path",
    )
    parser.add_argument(
        "--digits",
        type=int,
        default=2,
        help="Decimal digits for percentages (default: 2)",
    )
    parser.add_argument(
        "--placeholder-only",
        action="store_true",
        help="Emit placeholders only (ignore discovered summary values).",
    )
    return parser.parse_args()


def resolve_manifests(raw_paths: Optional[List[Path]]) -> List[Path]:
    if raw_paths:
        return raw_paths
    return [p for p in DEFAULT_MANIFESTS if p.exists()]


def read_manifest(path: Path) -> List[ManifestRow]:
    if not path.exists():
        raise FileNotFoundError(f"Manifest not found: {path}")
    rows: List[ManifestRow] = []
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for raw in reader:
            variant = (raw.get("category") or raw.get("variant") or "").strip()
            rows.append(
                ManifestRow(
                    variant=variant,
                    project=(raw.get("project") or "").strip(),
                    model=(raw.get("model") or "").strip(),
                    method=(raw.get("method") or "").strip(),
                    source=Path((raw.get("source") or "").strip()),
                    destination=Path((raw.get("destination") or "").strip()),
                )
            )
    return rows


def read_manifests(paths: List[Path]) -> List[ManifestRow]:
    rows: List[ManifestRow] = []
    for p in paths:
        rows.extend(read_manifest(p))
    return rows


def merge_order(default_order: List[str], discovered: List[str]) -> List[str]:
    merged: List[str] = []
    seen = set()
    for x in default_order + discovered:
        if not x or x in seen:
            continue
        seen.add(x)
        merged.append(x)
    return merged


def select_best_summary(payload_dir: Path) -> Optional[Path]:
    if not payload_dir.exists():
        return None

    candidates: List[Path] = []
    candidates.extend(payload_dir.glob("**/results/final-final-report/assertion_analysis_summary.json"))
    candidates.extend(payload_dir.glob("**/codes-final-report/assertion_analysis_summary.json"))
    if not candidates:
        candidates.extend(payload_dir.glob("**/assertion_analysis_summary.json"))
    if not candidates:
        return None

    def rank(p: Path) -> Tuple[int, float]:
        text = str(p).lower()
        # Prefer reflective final-final-report over raw codes-final-report.
        if "results/final-final-report" in text:
            cls = 3
        elif "codes-final-report" in text:
            cls = 2
        else:
            cls = 1
        return (cls, p.stat().st_mtime)

    return max(candidates, key=rank)


def extract_failed_files_percent(summary_path: Path) -> Optional[float]:
    try:
        data = json.loads(summary_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    ratios = data.get("ratios")
    if isinstance(ratios, dict):
        ratio = ratios.get("failed_files")
        if isinstance(ratio, (int, float)):
            return float(ratio) * 100.0

    counts = data.get("counts")
    if isinstance(counts, dict):
        files = counts.get("files")
        if isinstance(files, dict):
            failed = files.get("failed")
            total = files.get("total")
            if isinstance(failed, (int, float)) and isinstance(total, (int, float)) and total > 0:
                return float(failed) / float(total) * 100.0

    return None


def build_value_map(
    rows: List[ManifestRow],
    placeholder_only: bool,
) -> Dict[Tuple[str, str, str, str], Optional[float]]:
    value_map: Dict[Tuple[str, str, str, str], Optional[float]] = {}
    mtime_map: Dict[Tuple[str, str, str, str], float] = {}

    for row in rows:
        key = (row.method, row.variant, row.project, row.model)
        if placeholder_only:
            value_map[key] = None
            mtime_map[key] = -1
            continue

        summary_path = select_best_summary(row.destination)
        value = extract_failed_files_percent(summary_path) if summary_path else None
        stamp = summary_path.stat().st_mtime if summary_path and summary_path.exists() else -1

        if key not in value_map or stamp >= mtime_map[key]:
            value_map[key] = value
            mtime_map[key] = stamp

    return value_map


def fmt_cell(value: Optional[float], digits: int) -> str:
    if value is None:
        return "TBD"
    return f"{value:.{digits}f}"


def build_markdown(
    value_map: Dict[Tuple[str, str, str, str], Optional[float]],
    method_order: List[str],
    method_variants: Dict[str, List[str]],
    project_order: List[str],
    model_order: List[str],
    manifest_paths: List[Path],
    digits: int,
) -> str:
    columns: List[Tuple[str, str]] = []
    for project in project_order:
        for model in model_order:
            columns.append((project, model))

    header = ["Method", "Variant"] + [
        f"{project} {MODEL_DISPLAY.get(model, model)}" for project, model in columns
    ]

    manifest_desc = ", ".join(str(p) for p in manifest_paths) if manifest_paths else "(none)"

    lines = [
        "> Source: `assertion_analysis_summary.json -> ratios.failed_files` (x100 = %)",
        f"> Generated from `{manifest_desc}`",
        "",
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---", "---"] + [":---:"] * len(columns)) + " |",
    ]

    for method in method_order:
        for variant in method_variants.get(method, []):
            row = [method, variant]
            for project, model in columns:
                value = value_map.get((method, variant, project, model))
                row.append(fmt_cell(value, digits))
            lines.append("| " + " | ".join(row) + " |")

    return "\n".join(lines) + "\n"


def latex_escape(text: str) -> str:
    return (
        text.replace("\\", "\\textbackslash{}")
        .replace("_", "\\_")
        .replace("%", "\\%")
        .replace("&", "\\&")
        .replace("#", "\\#")
    )


def variant_rows_for_method(method: str) -> List[Tuple[str, str]]:
    cfg_refl_key = "experimental_withcontext" if method == "lsprag" else "cfg-vars"
    return [
        ("base", "Base"),
        ("naive", "Naive"),
        ("only-cfg", "Only-CFG"),
        ("only-reflection", "Only-Refl."),
        (cfg_refl_key, "CFG+Refl."),
    ]


def fmt_latex_number(value: Optional[float], digits: int) -> str:
    if value is None:
        return "--"
    return f"{value:.{digits}f}"


def build_latex(
    value_map: Dict[Tuple[str, str, str, str], Optional[float]],
    method_order: List[str],
    method_variants: Dict[str, List[str]],
    project_order: List[str],
    model_order: List[str],
    digits: int,
) -> str:
    # Keep signature stable; this renderer intentionally uses fixed ablation columns.
    _ = (method_variants, project_order, model_order)

    lines: List[str] = [
        r"\begin{table}[t]",
        r"\centering",
        r"% \caption{Ablation study of false-positive assertion failure ratio. Lower is better; best values within each tool are in \textbf{bold}.}",
        r"\caption{False-positive assertion failure ratio of each configuration. Lower is better; the best result within each tool is shown in \textbf{bold}.}",
        r"\label{tab:ablation-vertical}",
        r"\resizebox{0.85\columnwidth}{!}{",
        r"\begin{tabular}{lcccc}",
        r"\toprule",
        r"\textbf{Variant} & \textbf{\shortstack{Black\\\deepseek}} & \textbf{\shortstack{Black\\\haiku}} & \textbf{\shortstack{Tornado\\\deepseek}} & \textbf{\shortstack{Tornado\\\haiku}} \\",
        r"\midrule",
    ]

    for idx, method in enumerate(method_order):
        rows = variant_rows_for_method(method)

        # Best-per-column within this method over available numeric values.
        col_mins: Dict[Tuple[str, str], float] = {}
        for project, model, _label in TEX_COLUMNS:
            vals: List[float] = []
            for key, _disp in rows:
                v = value_map.get((method, key, project, model))
                if v is not None:
                    vals.append(v)
            if vals:
                col_mins[(project, model)] = min(vals)

        method_macro = METHOD_MACRO.get(method, latex_escape(method))
        lines.append(rf"\multicolumn{{5}}{{c}}{{\textbf{{{method_macro}}}}} \\")

        for key, disp in rows:
            cell_values: List[str] = []
            for project, model, _label in TEX_COLUMNS:
                v = value_map.get((method, key, project, model))
                txt = fmt_latex_number(v, digits)
                best = col_mins.get((project, model))
                if v is not None and best is not None and abs(v - best) < 1e-12:
                    txt = rf"\textbf{{{txt}}}"
                cell_values.append(txt)
            lines.append(f"{disp} & " + " & ".join(cell_values) + r" \\")

        if idx < len(method_order) - 1:
            lines.append(r"\midrule")

    lines.extend(
        [
            r"\bottomrule",
            r"\end{tabular}",
            r"}",
            r"\vspace{-.6em}",
            r"\end{table}",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    manifests = resolve_manifests(args.manifest)
    if not manifests:
        raise FileNotFoundError(
            "No manifest files found. Provide --manifest or create /LSPRAG/experiments/data/result/ablation/MANIFEST.tsv."
        )

    rows = read_manifests(manifests)
    discovered_methods = [r.method for r in rows]
    discovered_variants = [r.variant for r in rows]
    discovered_projects = [r.project for r in rows]
    discovered_models = [r.model for r in rows]

    method_order = merge_order(METHOD_ORDER, discovered_methods)
    variant_order = merge_order(VARIANT_ORDER, discovered_variants)
    project_order = merge_order(PROJECT_ORDER, discovered_projects)
    model_order = merge_order(MODEL_ORDER, discovered_models)

    method_variants: Dict[str, List[str]] = {}
    for method in method_order:
        discovered_for_method = [r.variant for r in rows if r.method == method]
        default_for_method = METHOD_VARIANT_DEFAULTS.get(method, variant_order)
        method_variants[method] = merge_order(default_for_method, discovered_for_method)

    value_map = build_value_map(rows, placeholder_only=args.placeholder_only)

    md = build_markdown(
        value_map=value_map,
        method_order=method_order,
        method_variants=method_variants,
        project_order=project_order,
        model_order=model_order,
        manifest_paths=manifests,
        digits=args.digits,
    )
    tex = build_latex(
        value_map=value_map,
        method_order=method_order,
        method_variants=method_variants,
        project_order=project_order,
        model_order=model_order,
        digits=args.digits,
    )

    args.output_md.parent.mkdir(parents=True, exist_ok=True)
    args.output_tex.parent.mkdir(parents=True, exist_ok=True)
    args.output_md.write_text(md, encoding="utf-8")
    args.output_tex.write_text(tex, encoding="utf-8")

    print(f"Wrote markdown template: {args.output_md}")
    print(f"Wrote TeX template: {args.output_tex}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
