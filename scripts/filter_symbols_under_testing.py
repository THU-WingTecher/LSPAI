r"""
python scripts/filter_symbols_under_testing.py \
        --input experiments/projects/thefuck/symbol_robustness_results.json \
        --min-test-refs 1 \
        --format tasklist --output thefuck_pct.json --max-results 100
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from typing import Any, Iterable, List, Optional


@dataclass(frozen=True)
class FilterConfig:
    min_total_refs: int
    min_test_refs: int
    min_non_test_refs: Optional[int]
    min_refs_mode: str
    max_non_test_refs: Optional[int]
    min_test_ratio: Optional[float]
    max_non_test_ratio: Optional[float]
    top_non_test_pct: Optional[float]
    top_test_pct: Optional[float]


def _positive_int(raw: str) -> int:
    try:
        value = int(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid integer: {raw}") from exc
    if value < 0:
        raise argparse.ArgumentTypeError(f"Value must be >= 0: {value}")
    return value


def _ratio(raw: str) -> float:
    try:
        value = float(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid ratio: {raw}") from exc
    if value < 0.0 or value > 1.0:
        raise argparse.ArgumentTypeError(f"Ratio must be in [0, 1]: {value}")
    return value


def _pct(raw: str) -> float:
    value = _ratio(raw)
    if value == 0.0:
        raise argparse.ArgumentTypeError("Percent must be > 0")
    return value


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def compute_metrics(entry: dict) -> dict:
    total = entry.get("totalReferences")
    test = entry.get("testReferences")
    if not isinstance(total, int) or not isinstance(test, int):
        raise ValueError("Entry missing integer totalReferences/testReferences")
    if total <= 0:
        raise ValueError(f"Invalid totalReferences (must be > 0): {total}")
    if test < 0 or test > total:
        raise ValueError(f"Invalid testReferences {test} for totalReferences {total}")
    non_test = total - test
    return {
        "nonTestReferences": non_test,
        "testRatio": (test / total) if total else 0.0,
        "nonTestRatio": (non_test / total) if total else 0.0,
    }


def iter_entries(data: Any) -> Iterable[dict]:
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                yield item
        return
    raise ValueError("Expected top-level JSON array of objects")


def passes_filter(entry: dict, metrics: dict, cfg: FilterConfig) -> bool:
    total = entry["totalReferences"]
    test = entry["testReferences"]
    non_test = metrics["nonTestReferences"]

    if total < cfg.min_total_refs:
        return False

    test_ok = test >= cfg.min_test_refs
    non_test_ok = True if cfg.min_non_test_refs is None else (non_test >= cfg.min_non_test_refs)

    if cfg.min_refs_mode == "and":
        if not (test_ok and non_test_ok):
            return False
    elif cfg.min_refs_mode == "or":
        if not (test_ok or non_test_ok):
            return False
    else:
        raise ValueError(f"Unknown min_refs_mode: {cfg.min_refs_mode}")

    if cfg.max_non_test_refs is not None and non_test > cfg.max_non_test_refs:
        return False
    if cfg.min_test_ratio is not None and metrics["testRatio"] < cfg.min_test_ratio:
        return False
    if cfg.max_non_test_ratio is not None and metrics["nonTestRatio"] > cfg.max_non_test_ratio:
        return False
    return True


def entry_identity(entry: dict) -> tuple:
    # Prefer fields that are stable/unique in these datasets.
    return (
        entry.get("symbolName"),
        entry.get("relativeDocumentPath"),
        entry.get("lineNum"),
        entry.get("line_num"),
    )


def select_top_pct(entries: List[dict], pct: float, metric: str) -> List[dict]:
    if not entries:
        return []
    if pct <= 0.0 or pct > 1.0:
        raise ValueError(f"pct must be in (0,1]: {pct}")
    k = int(math.ceil(pct * len(entries)))
    k = max(1, min(k, len(entries)))
    ranked = sorted(entries, key=lambda e: (e.get(metric, 0), e.get("testReferences", 0)), reverse=True)
    return ranked[:k]


def apply_percentile_selection(entries: List[dict], top_non_test_pct: Optional[float], top_test_pct: Optional[float]) -> List[dict]:
    return apply_percentile_selection_mode(entries, top_non_test_pct, top_test_pct, mode="or")


def apply_percentile_selection_mode(
    entries: List[dict],
    top_non_test_pct: Optional[float],
    top_test_pct: Optional[float],
    mode: str,
) -> List[dict]:
    if top_non_test_pct is None and top_test_pct is None:
        return entries

    if mode not in {"or", "and"}:
        raise ValueError(f"Unknown top-pct mode: {mode}")

    selected_non: Optional[set] = None
    selected_test: Optional[set] = None

    if top_non_test_pct is not None:
        selected_non = {entry_identity(e) for e in select_top_pct(entries, top_non_test_pct, "nonTestReferences")}
    if top_test_pct is not None:
        selected_test = {entry_identity(e) for e in select_top_pct(entries, top_test_pct, "testReferences")}

    if mode == "or":
        selected_ids: set = set()
        if selected_non:
            selected_ids |= selected_non
        if selected_test:
            selected_ids |= selected_test
        return [e for e in entries if entry_identity(e) in selected_ids]

    # mode == "and"
    if selected_non is None:
        selected_ids = set() if selected_test is None else selected_test
        return [e for e in entries if entry_identity(e) in selected_ids]
    if selected_test is None:
        selected_ids = set() if selected_non is None else selected_non
        return [e for e in entries if entry_identity(e) in selected_ids]
    common_ids = selected_non & selected_test
    return [e for e in entries if entry_identity(e) in common_ids]

def sort_entries(entries: List[dict], sort_key: str) -> List[dict]:
    if sort_key == "input":
        return entries
    if sort_key == "test_desc":
        return sorted(
            entries,
            key=lambda e: (e["testReferences"], -e["nonTestReferences"], e.get("symbolName") or ""),
            reverse=True,
        )
    if sort_key == "non_test_asc":
        return sorted(entries, key=lambda e: (e["nonTestReferences"], -e["testReferences"]))
    if sort_key == "test_ratio_desc":
        return sorted(entries, key=lambda e: (e["testRatio"], e["testReferences"]), reverse=True)
    raise ValueError(f"Unknown sort key: {sort_key}")


def emit(entries: List[dict], fmt: str, out_path: Optional[str]) -> None:
    if fmt == "json":
        payload = entries
        text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    elif fmt == "jsonl":
        text = "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in entries)
    elif fmt == "tasklist":
        payload = []
        for e in entries:
            symbol = e.get("symbolName")
            rel_path = e.get("relativeDocumentPath")
            source = e.get("sourceCode")
            import_str = e.get("importString")
            line_num = e.get("lineNum")
            location = e.get("line_num") if isinstance(e.get("line_num"), int) else e.get("location")
            if (
                isinstance(symbol, str)
                and symbol
                and isinstance(rel_path, str)
                and rel_path
                and isinstance(source, str)
                and isinstance(import_str, str)
                and isinstance(line_num, int)
                and isinstance(location, int)
            ):
                payload.append(
                    {
                        "symbolName": symbol,
                        "sourceCode": source,
                        "importString": import_str,
                        "lineNum": line_num,
                        "location": location,
                        "relativeDocumentPath": rel_path,
                    }
                )
        text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    elif fmt == "names":
        text = "".join((e.get("symbolName") or "") + "\n" for e in entries)
    elif fmt == "tsv":
        header = [
            "symbolName",
            "relativeDocumentPath",
            "totalReferences",
            "testReferences",
            "nonTestReferences",
            "testRatio",
            "nonTestRatio",
            "robustnessScore",
            "lineNum",
        ]
        lines = ["\t".join(header)]
        for e in entries:
            row = [
                str(e.get("symbolName") or ""),
                str(e.get("relativeDocumentPath") or ""),
                str(e.get("totalReferences") or ""),
                str(e.get("testReferences") or ""),
                str(e.get("nonTestReferences") or ""),
                f"{(e.get('testRatio') or 0.0):.6f}",
                f"{(e.get('nonTestRatio') or 0.0):.6f}",
                str(e.get("robustnessScore") or ""),
                str(e.get("lineNum") or e.get("line_num") or ""),
            ]
            lines.append("\t".join(row))
        text = "\n".join(lines) + "\n"
    else:
        raise ValueError(f"Unknown format: {fmt}")

    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        sys.stdout.write(text)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--input",
        required=True,
        help="Path to symbol_robustness_results.json",
    )
    p.add_argument(
        "--output",
        default=None,
        help="Optional output file path (defaults to stdout)",
    )
    p.add_argument(
        "--max-results",
        type=_positive_int,
        default=None,
        help="If provided, truncate output to at most this many entries (after filtering/selection/sorting).",
    )
    p.add_argument("--min-total-refs", type=_positive_int, default=1)
    p.add_argument("--min-test-refs", type=_positive_int, default=1)
    p.add_argument("--min-non-test-refs", type=_positive_int, default=None)
    p.add_argument(
        "--min-refs-mode",
        choices=["and", "or"],
        default="and",
        help="How to combine min-test-refs and min-non-test-refs (default: and).",
    )
    p.add_argument("--max-non-test-refs", type=_positive_int, default=None)
    p.add_argument("--min-test-ratio", type=_ratio, default=None)
    p.add_argument(
        "--max-non-test-ratio",
        type=_ratio,
        default=None,
        help="Deprecated (prefer --max-non-test-refs). Maximum allowed nonTestReferences/totalReferences.",
    )
    p.add_argument(
        "--top-non-test-pct",
        type=_pct,
        default=None,
        help="Select top X%% by nonTestReferences.",
    )
    p.add_argument(
        "--top-test-pct",
        type=_pct,
        default=None,
        help="Select top X%% by testReferences.",
    )
    p.add_argument(
        "--top-pct-mode",
        choices=["or", "and"],
        default="or",
        help="How to combine --top-non-test-pct and --top-test-pct (default: or/union).",
    )
    p.add_argument(
        "--top-pct-scope",
        choices=["post_filter", "all_valid"],
        default="post_filter",
        help=(
            "Where to compute top-%% selection. "
            "post_filter: after applying threshold filters (default). "
            "all_valid: compute on all valid entries, then apply threshold filters to the selected set."
        ),
    )
    p.add_argument(
        "--sort",
        choices=["input", "test_desc", "non_test_asc", "test_ratio_desc"],
        default="test_desc",
    )
    p.add_argument(
        "--format",
        choices=["json", "jsonl", "tsv", "names", "tasklist"],
        default="json",
    )
    p.add_argument(
        "--annotate",
        action="store_true",
        help="Include computed metrics in output entries (recommended for json/jsonl).",
    )
    return p


def main(argv: List[str]) -> int:
    sort_specified = any(a == "--sort" or a.startswith("--sort=") for a in argv)
    args = build_parser().parse_args(argv)
    cfg = FilterConfig(
        min_total_refs=args.min_total_refs,
        min_test_refs=args.min_test_refs,
        min_non_test_refs=args.min_non_test_refs,
        min_refs_mode=args.min_refs_mode,
        max_non_test_refs=args.max_non_test_refs,
        min_test_ratio=args.min_test_ratio,
        max_non_test_ratio=args.max_non_test_ratio,
        top_non_test_pct=args.top_non_test_pct,
        top_test_pct=args.top_test_pct,
    )

    data = load_json(args.input)
    valid_entries: List[dict] = []
    filtered_entries: List[dict] = []
    skipped_invalid = 0

    for entry in iter_entries(data):
        try:
            metrics = compute_metrics(entry)
        except Exception:
            skipped_invalid += 1
            continue

        out_entry = dict(entry)
        # Always attach computed fields for sorting/tsv, then optionally strip before emitting.
        out_entry.update(metrics)
        valid_entries.append(out_entry)
        if passes_filter(entry, metrics, cfg):
            filtered_entries.append(out_entry)

    kept: List[dict]
    if cfg.top_non_test_pct is None and cfg.top_test_pct is None:
        kept = filtered_entries
    else:
        pool = filtered_entries if args.top_pct_scope == "post_filter" else valid_entries
        kept = apply_percentile_selection_mode(pool, cfg.top_non_test_pct, cfg.top_test_pct, mode=args.top_pct_mode)
        if args.top_pct_scope == "all_valid":
            kept = [e for e in kept if passes_filter(e, e, cfg)]

    sort_key = args.sort
    if args.format == "tasklist" and not sort_specified:
        sort_key = "input"
    kept = sort_entries(kept, sort_key)

    if args.max_results is not None and len(kept) > args.max_results:
        sys.stderr.write(f"Truncating results: {len(kept)} -> {args.max_results}\n")
        kept = kept[: args.max_results]

    if not args.annotate and args.format in {"json", "jsonl"}:
        for e in kept:
            e.pop("nonTestReferences", None)
            e.pop("testRatio", None)
            e.pop("nonTestRatio", None)
    emit(kept, args.format, args.output)

    if skipped_invalid:
        sys.stderr.write(f"Skipped {skipped_invalid} invalid entries\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
