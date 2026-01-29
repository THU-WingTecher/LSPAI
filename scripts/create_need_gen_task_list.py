#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def normalize_path(path_str: str) -> str:
    # Normalize separators and strip leading "./" for stable comparisons.
    return path_str.replace("\\", "/").lstrip("./")


def build_covered_keys(
    test_file_map: Dict[str, Any],
    match_symbol_only: bool,
) -> Set[Tuple[Optional[str], str]]:
    covered: Set[Tuple[Optional[str], str]] = set()
    for _, info in test_file_map.items():
        if not isinstance(info, dict):
            continue
        symbol = info.get("symbol_name")
        file_name = info.get("file_name")
        if not symbol:
            continue
        file_key = None
        if not match_symbol_only and isinstance(file_name, str):
            file_key = normalize_path(file_name)
        covered.add((file_key, symbol))
    return covered


def task_key(
    task: Dict[str, Any],
    match_symbol_only: bool,
) -> Optional[Tuple[Optional[str], str]]:
    symbol = task.get("symbolName") or task.get("symbol_name")
    if not symbol:
        return None
    if match_symbol_only:
        return (None, symbol)
    rel_path = (
        task.get("relativeDocumentPath")
        or task.get("file_name")
        or task.get("relative_path")
    )
    if isinstance(rel_path, str):
        return (normalize_path(rel_path), symbol)
    return (None, symbol)


def filter_missing_tasks(
    tasks: Iterable[Dict[str, Any]],
    covered_keys: Set[Tuple[Optional[str], str]],
    match_symbol_only: bool,
) -> List[Dict[str, Any]]:
    missing: List[Dict[str, Any]] = []
    for task in tasks:
        if not isinstance(task, dict):
            continue
        key = task_key(task, match_symbol_only=match_symbol_only)
        if key is None or key not in covered_keys:
            missing.append(task)
    return missing


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Create a need_gen_task_list by comparing test_file_map "
            "with an existing taskList.json, or compare two test_file_map.json files."
        )
    )
    parser.add_argument(
        "--base-map",
        help="Base test_file_map.json path (for map-to-map comparison).",
    )
    parser.add_argument(
        "--compare-map",
        help="Compare test_file_map.json path (for map-to-map comparison).",
    )
    parser.add_argument(
        "--base-task-list",
        help="Base taskList.json path (for tasklist-to-tasklist comparison).",
    )
    parser.add_argument(
        "--compare-task-list",
        help="Compare taskList.json path (for tasklist-to-tasklist comparison).",
    )
    parser.add_argument(
        "--test-file-map",
        help="Path to test_file_map.json",
    )
    parser.add_argument(
        "--task-list",
        help="Path to taskList.json",
    )
    parser.add_argument(
        "--out",
        required=True,
        help="Output path for need_gen_task_list.json",
    )
    parser.add_argument(
        "--match-symbol-only",
        action="store_true",
        help="Match by symbol name only (ignore file path).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress summary output.",
    )
    parser.add_argument(
        "--include-extra",
        action="store_true",
        help="Include entries that exist only in compare-map (map-to-map mode).",
    )
    parser.add_argument(
        "--compare-by",
        choices=["pair", "test-file"],
        default="pair",
        help=(
            "Map-to-map comparison mode: "
            "'pair' compares unique (file_name, symbol_name) pairs; "
            "'test-file' compares each test filename's mapped path+symbol exactly."
        ),
    )

    args = parser.parse_args()

    out_path = Path(args.out)

    if args.base_task_list and args.compare_task_list:
        base_task_list_path = Path(args.base_task_list)
        compare_task_list_path = Path(args.compare_task_list)

        base_task_list = load_json(base_task_list_path)
        if not isinstance(base_task_list, list):
            raise ValueError("base taskList.json must be a JSON array (list).")

        compare_task_list = load_json(compare_task_list_path)
        if not isinstance(compare_task_list, list):
            raise ValueError("compare taskList.json must be a JSON array (list).")

        def build_task_index(tasks: Iterable[Dict[str, Any]]) -> Dict[Tuple[Optional[str], str], List[Dict[str, Any]]]:
            index: Dict[Tuple[Optional[str], str], List[Dict[str, Any]]] = {}
            for task in tasks:
                if not isinstance(task, dict):
                    continue
                key = task_key(task, match_symbol_only=args.match_symbol_only)
                if key is None:
                    continue
                index.setdefault(key, []).append(task)
            return index

        base_index = build_task_index(base_task_list)
        compare_index = build_task_index(compare_task_list)

        missing_entries: List[Dict[str, Any]] = []
        for key, base_tasks in base_index.items():
            compare_tasks = compare_index.get(key, [])
            if len(base_tasks) > len(compare_tasks):
                missing_entries.extend(base_tasks[: len(base_tasks) - len(compare_tasks)])

        output_payload: Any = missing_entries

        extra_entries: List[Dict[str, Any]] = []
        if args.include_extra:
            for key, compare_tasks in compare_index.items():
                base_tasks = base_index.get(key, [])
                if len(compare_tasks) > len(base_tasks):
                    extra_entries.extend(compare_tasks[: len(compare_tasks) - len(base_tasks)])
            output_payload = {
                "missing": missing_entries,
                "extra": extra_entries,
            }

        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(output_payload, f, indent=2, ensure_ascii=True)

        if not args.quiet:
            print(f"Base task list entries: {len(base_task_list)}")
            print(f"Compare task list entries: {len(compare_task_list)}")
            print(f"Missing tasks: {len(missing_entries)}")
            if args.include_extra:
                print(f"Extra tasks: {len(extra_entries)}")
            mode = "symbol-only" if args.match_symbol_only else "symbol+file"
            print(f"Unique keys (base): {len(base_index)}")
            print(f"Unique keys (compare): {len(compare_index)}")
            print(f"Match mode: {mode}")
            print(f"Output: {out_path}")

        return 0

    if args.base_map and args.compare_map:
        base_map_path = Path(args.base_map)
        compare_map_path = Path(args.compare_map)

        base_map = load_json(base_map_path)
        if not isinstance(base_map, dict):
            raise ValueError("base test_file_map.json must be a JSON object (dict).")

        compare_map = load_json(compare_map_path)
        if not isinstance(compare_map, dict):
            raise ValueError("compare test_file_map.json must be a JSON object (dict).")

        def build_index(test_map: Dict[str, Any]) -> Dict[Tuple[str, str], List[str]]:
            index: Dict[Tuple[str, str], List[str]] = {}
            for test_file, info in test_map.items():
                if not isinstance(info, dict):
                    continue
                symbol = info.get("symbol_name")
                file_name = info.get("file_name")
                if not symbol or not isinstance(file_name, str):
                    continue
                key = (normalize_path(file_name), symbol)
                index.setdefault(key, []).append(test_file)
            return index

        if args.compare_by == "pair":
            base_index = build_index(base_map)
            compare_index = build_index(compare_map)

            missing_pairs = [key for key in base_index.keys() if key not in compare_index]
            missing_entries = [
                {
                    "symbol_name": symbol,
                    "file_name": file_name,
                    "test_files": base_index[(file_name, symbol)],
                }
                for (file_name, symbol) in missing_pairs
            ]

            output_payload: Any = missing_entries

            extra_entries: List[Dict[str, Any]] = []
            if args.include_extra:
                extra_pairs = [key for key in compare_index.keys() if key not in base_index]
                extra_entries = [
                    {
                        "symbol_name": symbol,
                        "file_name": file_name,
                        "test_files": compare_index[(file_name, symbol)],
                    }
                    for (file_name, symbol) in extra_pairs
                ]
                output_payload = {
                    "missing": missing_entries,
                    "extra": extra_entries,
                }

            out_path.parent.mkdir(parents=True, exist_ok=True)
            with out_path.open("w", encoding="utf-8") as f:
                json.dump(output_payload, f, indent=2, ensure_ascii=True)

            if not args.quiet:
                print(f"Base map entries: {len(base_map)}")
                print(f"Compare map entries: {len(compare_map)}")
                print(f"Missing symbol+file pairs: {len(missing_entries)}")
                if args.include_extra:
                    print(f"Extra symbol+file pairs: {len(extra_entries)}")
                print("Compare mode: pair")
                print(f"Output: {out_path}")

            return 0

        # compare-by test-file (exact test filename -> path+symbol mapping)
        def normalize_entry(info: Dict[str, Any]) -> Optional[Tuple[str, str]]:
            symbol = info.get("symbol_name")
            file_name = info.get("file_name")
            if not symbol or not isinstance(file_name, str):
                return None
            return (normalize_path(file_name), symbol)

        missing_entries: List[Dict[str, Any]] = []
        mismatched_entries: List[Dict[str, Any]] = []
        extra_entries: List[Dict[str, Any]] = []

        for test_file, info in base_map.items():
            if not isinstance(info, dict):
                continue
            base_norm = normalize_entry(info)
            if base_norm is None:
                continue
            compare_info = compare_map.get(test_file)
            if not isinstance(compare_info, dict):
                missing_entries.append(
                    {
                        "test_file": test_file,
                        "symbol_name": info.get("symbol_name"),
                        "file_name": normalize_path(info.get("file_name", "")),
                    }
                )
                continue
            compare_norm = normalize_entry(compare_info)
            if compare_norm is None or compare_norm != base_norm:
                mismatched_entries.append(
                    {
                        "test_file": test_file,
                        "base": {
                            "symbol_name": info.get("symbol_name"),
                            "file_name": normalize_path(info.get("file_name", "")),
                        },
                        "compare": {
                            "symbol_name": compare_info.get("symbol_name"),
                            "file_name": normalize_path(compare_info.get("file_name", "")),
                        },
                    }
                )

        if args.include_extra:
            for test_file, info in compare_map.items():
                if test_file in base_map:
                    continue
                if not isinstance(info, dict):
                    continue
                norm = normalize_entry(info)
                if norm is None:
                    continue
                extra_entries.append(
                    {
                        "test_file": test_file,
                        "symbol_name": info.get("symbol_name"),
                        "file_name": normalize_path(info.get("file_name", "")),
                    }
                )

        output_payload: Any = {
            "missing": missing_entries,
            "mismatched": mismatched_entries,
        }
        if args.include_extra:
            output_payload["extra"] = extra_entries

        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(output_payload, f, indent=2, ensure_ascii=True)

        if not args.quiet:
            print(f"Base map entries: {len(base_map)}")
            print(f"Compare map entries: {len(compare_map)}")
            print(f"Missing test files: {len(missing_entries)}")
            print(f"Mismatched mappings: {len(mismatched_entries)}")
            if args.include_extra:
                print(f"Extra test files: {len(extra_entries)}")
            print("Compare mode: test-file")
            print(f"Output: {out_path}")

        return 0

    if not args.test_file_map or not args.task_list:
        raise ValueError(
            "Provide one mode: "
            "--base-task-list + --compare-task-list, "
            "--base-map + --compare-map, "
            "or --test-file-map + --task-list."
        )

    test_file_map_path = Path(args.test_file_map)
    task_list_path = Path(args.task_list)

    test_file_map = load_json(test_file_map_path)
    if not isinstance(test_file_map, dict):
        raise ValueError("test_file_map.json must be a JSON object (dict).")

    task_list = load_json(task_list_path)
    if not isinstance(task_list, list):
        raise ValueError("taskList.json must be a JSON array (list).")

    covered_keys = build_covered_keys(
        test_file_map,
        match_symbol_only=args.match_symbol_only,
    )
    missing_tasks = filter_missing_tasks(
        task_list,
        covered_keys,
        match_symbol_only=args.match_symbol_only,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(missing_tasks, f, indent=2, ensure_ascii=True)

    if not args.quiet:
        total = len(task_list)
        missing = len(missing_tasks)
        covered = total - missing
        mode = "symbol-only" if args.match_symbol_only else "symbol+file"
        print(f"Total tasks: {total}")
        print(f"Covered tasks: {covered}")
        print(f"Missing tasks: {missing}")
        print(f"Match mode: {mode}")
        print(f"Output: {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
