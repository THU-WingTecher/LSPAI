#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def normalize_path(path_str: str) -> str:
    return path_str.replace("\\", "/").lstrip("./")


def build_key(task: Dict[str, Any], include_line: bool) -> Tuple[str, str, str]:
    rel_path = task.get("relativeDocumentPath") or task.get("file_name") or ""
    symbol = task.get("symbolName") or task.get("symbol_name") or ""
    line_value = None
    if include_line:
        if task.get("location") is not None:
            line_value = task.get("location")
        elif task.get("line_num") is not None:
            line_value = task.get("line_num")
        elif task.get("lineNum") is not None:
            line_value = task.get("lineNum")
    line = str(line_value) if line_value is not None else ""
    return (normalize_path(rel_path), symbol, line)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Detect duplicate (file, symbol) keys in a taskList.json."
    )
    parser.add_argument(
        "--task-list",
        required=True,
        help="Path to taskList.json",
    )
    parser.add_argument(
        "--include-line",
        action="store_true",
        help="Include location (or lineNum as fallback) in the duplicate key.",
    )
    parser.add_argument(
        "--out",
        help="Optional output path for duplicate details.",
    )

    args = parser.parse_args()
    task_list_path = Path(args.task_list)
    tasks = load_json(task_list_path)
    if not isinstance(tasks, list):
        raise ValueError("taskList.json must be a JSON array (list).")

    index: Dict[Tuple[str, str, str], List[int]] = {}
    for i, task in enumerate(tasks):
        if not isinstance(task, dict):
            continue
        key = build_key(task, include_line=args.include_line)
        if not key[1]:
            continue
        index.setdefault(key, []).append(i)

    duplicates = [
        {
            "file_name": key[0],
            "symbol_name": key[1],
            "location": key[2] if args.include_line else None,
            "count": len(indices),
            "indices": indices,
        }
        for key, indices in index.items()
        if len(indices) > 1
    ]

    print(f"Total tasks: {len(tasks)}")
    print(f"Duplicate keys: {len(duplicates)}")
    if duplicates:
        sample = duplicates[:5]
        print("Sample duplicates:")
        for item in sample:
            line_info = f":{item['location']}" if args.include_line and item["location"] else ""
            print(f"  {item['file_name']} :: {item['symbol_name']}{line_info} (count={item['count']})")

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(duplicates, f, indent=2, ensure_ascii=True)
        print(f"Output: {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
