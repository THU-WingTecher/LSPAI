#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from typing import List, Optional, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed


def detect_module_root(project_root: str) -> str:
    """Return module root for imports. Prefer <project_root>/src if it exists."""
    src_root = os.path.join(project_root, "src")
    return src_root if os.path.isdir(src_root) else project_root


def parse_mutpy_stats(text: str) -> Dict[str, Optional[float]]:
    """
    Extract basic stats from MutPy output. Returns dict with keys:
    - score (float)    : mutation score percentage
    - total (int)      : total mutants
    - killed (int)     : killed mutants
    Any missing value is None.
    """
    score = None
    total = None
    killed = None

    m = re.search(r"Mutation score:\s*([0-9]+(?:\.[0-9]+)?)\s*%", text, flags=re.IGNORECASE)
    if m:
        try:
            score = float(m.group(1))
        except ValueError:
            score = None

    for pat in [
        r"Total mutants:\s*([0-9]+)",
        r"Generated mutants:\s*([0-9]+)",
        r"Mutants generated:\s*([0-9]+)",
    ]:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            try:
                total = int(m.group(1))
                break
            except ValueError:
                total = None

    m = re.search(r"Killed mutants:\s*([0-9]+)", text, flags=re.IGNORECASE)
    if m:
        try:
            killed = int(m.group(1))
        except ValueError:
            killed = None

    return {"score": score, "total": total, "killed": killed}


def run_mutpy_for_test(
    mutpy_cmd: List[str],
    runner: str,
    module_root: str,
    project_root: str,
    tests_dir: str,
    target_module: str,
    test_module: str,
    test_file_rel_path: str,
    log_dir: str,
    extra_paths: Optional[List[str]] = None,
    extra_args: Optional[List[str]] = None,
    timeout_sec: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Execute MutPy for a single test module against one target module.
    Returns dict: { success: bool, stdout: str, stats: {score,total,killed}, report_path: str }
    """
    os.makedirs(log_dir, exist_ok=True)
    report_path = os.path.join(log_dir, f"{test_module}.report.txt")

    # Prefer adding the real project source root ahead of tests to avoid shadowing
    module_root_src = os.path.join(module_root, "src")
    cmd = list(mutpy_cmd) + ["--runner", runner]
    if os.path.isdir(module_root_src):
        cmd += ["--path", module_root_src]
    cmd += ["--path", module_root]
    cmd += ["--path", tests_dir]
    cmd += [
        "--target", target_module,
        "--unit-test", test_module,
        "--report", report_path,
    ]
    
    # Add the deepest parent directory of the test file as import root (after main roots)
    # Example: tests_dir/src/blib2to3/pgen2/parse_atom_1561_test.py -> add tests_dir/src/blib2to3/pgen2
    test_parent_dir = os.path.dirname(test_file_rel_path)
    if test_parent_dir and test_parent_dir != ".":
        parent_path = os.path.join(tests_dir, test_parent_dir)
        if os.path.isdir(parent_path):
            cmd += ["--path", parent_path]
    
    print(cmd)
    # Helpful extra import roots
    if project_root != module_root:
        cmd += ["--path", project_root]
    if extra_paths:
        for p in extra_paths:
            cmd += ["--path", p]

    if extra_args:
        cmd += extra_args

    env = os.environ.copy()
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            timeout=timeout_sec,
            check=False,
            cwd=tests_dir,
        )

        out = proc.stdout or ""
        stats = parse_mutpy_stats(out)

        report = None
        if os.path.exists(report_path):
            report = parse_mutpy_report(report_path)
            if stats["score"] is None and report.get("score") is not None:
                stats = {"score": report["score"], "total": report["total"], "killed": report["killed"]}

        # Success if either stdout or report gave a score
        success = stats["score"] is not None

        # Always write raw stdout alongside the report for debugging
        with open(os.path.join(log_dir, f"{test_module}.stdout.log"), "w") as f:
            f.write(out)

        return {
            "success": success,
            "stdout": out,
            "stats": stats,
            "report_path": report_path,
            "report": report,
            "exit_code": proc.returncode,
        }
    except subprocess.TimeoutExpired as e:
        out = getattr(e, "stdout", None)
        if out is None:
            out = ""
        # Coerce bytes to string if necessary
        if isinstance(out, bytes):
            try:
                out = out.decode("utf-8", errors="replace")
            except Exception:
                out = str(out)
        with open(os.path.join(log_dir, f"{test_module}.stdout.log"), "w") as f:
            f.write(out)
            f.write("\n[timeout]\n")
        return {
            "success": False,
            "stdout": out,
            "stats": {"score": None, "total": None, "killed": None},
            "report_path": report_path,
            "report": None,
            "exit_code": 124,
        }

def to_abs(path: str) -> str:
    return os.path.abspath(path)


def load_test_file_mapping(mapping_file: str) -> Dict[str, Dict[str, Any]]:
    """Load the test file mapping from JSON file."""
    try:
        with open(mapping_file, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        raise SystemExit(f"Mapping file not found: {mapping_file}")
    except json.JSONDecodeError as e:
        raise SystemExit(f"Invalid JSON in mapping file: {e}")


def remove_random_numbers(filename: str) -> str:
    """Remove random numbers from test filename for matching."""
    # Remove .py extension first
    name = filename
    if name.endswith('.py'):
        name = name[:-3]
    
    # Remove random numbers (sequences of digits)
    # Pattern matches digits that are likely random numbers
    cleaned = re.sub(r'_\d+', '', name)
    return cleaned


def find_matching_test_in_mapping(test_filename: str, mapping: Dict[str, Dict[str, Any]]) -> Optional[str]:
    """Find matching test entry in mapping by removing random numbers."""
    cleaned_name = remove_random_numbers(test_filename)
    
    # Find all potential matches
    matches = []
    for key in mapping.keys():
        cleaned_key = remove_random_numbers(key)
        if cleaned_key == cleaned_name:
            matches.append(key)
    
    # Return first match if any exist
    return matches[0] if matches else None


def get_source_files_from_test_directory(
    project_root: str, 
    test_dir: str, 
    mapping: Dict[str, Dict[str, Any]]
) -> List[str]:
    """Get source files corresponding to test files in the given directory."""
    source_files = []
    test_dir_abs = to_abs(test_dir)
    
    if not os.path.isdir(test_dir_abs):
        raise SystemExit(f"Test directory not found: {test_dir_abs}")
    
    # Recursively find Python test files
    test_files = []
    for dirpath, _, filenames in os.walk(test_dir_abs):
        for filename in filenames:
            if filename.endswith('.py') and (filename.startswith('test_') or filename.endswith('_test.py')):
                test_files.append(os.path.join(dirpath, filename))
    
    if not test_files:
        raise SystemExit(f"No test files found in directory: {test_dir_abs}")
    
    print(f"Found {len(test_files)} test files in directory")
    
    # Match each test file with mapping entries
    matched_count = 0
    for test_file in test_files:
        matching_key = find_matching_test_in_mapping(os.path.basename(test_file), mapping)
        
        if matching_key:
            file_info = mapping[matching_key]
            source_file = file_info['file_name']
            
            # Convert to absolute path
            abs_source_file = os.path.join(project_root, source_file)
            if os.path.exists(abs_source_file):
                source_files.append(abs_source_file)
                matched_count += 1
                print(f"Matched: {os.path.basename(test_file)} -> {source_file}")
            else:
                print(f"Warning: Source file not found: {abs_source_file}")
        else:
            print(f"Warning: No mapping found for test file: {os.path.basename(test_file)}")
    
    print(f"Successfully matched {matched_count} out of {len(test_files)} test files")
    
    if not source_files:
        raise SystemExit("No source files found from test directory mapping")
    
    # Remove duplicates while preserving order
    seen = set()
    unique_sources = []
    for source in source_files:
        if source not in seen:
            seen.add(source)
            unique_sources.append(source)
    
    return unique_sources


def file_to_module(project_root: str, file_path: str) -> str:
    """
    Convert a Python file path under project_root into a module name usable by MutPy's -m.
    Example: /proj/pkg/sub/mod.py -> pkg.sub.mod
    """
    pr = to_abs(project_root)
    fp = to_abs(file_path)

    if not fp.startswith(pr + os.sep) and fp != pr:
        raise ValueError(f"File is not under project root:\n  root: {pr}\n  file: {fp}")

    rel = os.path.relpath(fp, pr)

    # Strip .py and handle __init__.py
    if rel.endswith(".py"):
        rel = rel[:-3]
    if rel.endswith(os.path.join("", "__init__")) or rel == "__init__":
        rel = os.path.dirname(rel)

    parts = [p for p in rel.split(os.sep) if p]
    if not parts:
        raise ValueError(f"Could not derive module for: {file_path}")

    return ".".join(parts)


def detect_mutpy_command(explicit_cmd: Optional[str]) -> List[str]:
    """
    Prefer a provided command; otherwise try 'mut.py', then 'python -m mutpy'.
    """
    if explicit_cmd:
        return [explicit_cmd]

    mutpy_bin = shutil.which("mut.py")
    if mutpy_bin:
        return [mutpy_bin]

    # Fallback: attempt module execution (may or may not be available depending on install)
    return [sys.executable, "-m", "mutpy"]


def run_mutpy_and_capture_score(
    mutpy_cmd: List[str],
    tests_dir: str,
    modules: List[str],
    project_root: str,
    extra_args: Optional[List[str]] = None,
    timeout_sec: Optional[int] = None,
) -> float:
    if not modules:
        raise ValueError("No modules provided to MutPy.")

    cmd = list(mutpy_cmd) + [
        "-t", tests_dir,
        "-m", ",".join(modules),
        # You can add defaults that tend to be stable across environments here if desired:
        # e.g., "--timeout", "10"
    ]
    if extra_args:
        cmd += extra_args

    env = os.environ.copy()
    env["PYTHONPATH"] = project_root + (os.pathsep + env["PYTHONPATH"] if "PYTHONPATH" in env and env["PYTHONPATH"] else "")

    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
        timeout=timeout_sec,
        check=False,
    )

    output = proc.stdout or ""
    # Typical MutPy line: "Mutation score: 85.71%"
    m = re.search(r"Mutation score:\s*([0-9]+(?:\.[0-9]+)?)\s*%", output)
    if not m:
        # Surface output for debugging if parsing fails.
        raise RuntimeError(
            "Failed to parse mutation score from MutPy output.\n"
            f"Command: {' '.join(cmd)}\n"
            f"Exit code: {proc.returncode}\n"
            f"Output (truncated to 5000 chars):\n{output[:5000]}"
        )

    return float(m.group(1))


def collect_sources_from_args(project_root: str, sources: List[str]) -> List[str]:
    modules: List[str] = []
    for src in sources:
        abs_src = to_abs(src)
        if os.path.isdir(abs_src):
            # If a directory is provided, include all .py files under it (excluding tests).
            for dirpath, _, filenames in os.walk(abs_src):
                for fn in filenames:
                    if not fn.endswith(".py"):
                        continue
                    full = os.path.join(dirpath, fn)
                    # Avoid test files commonly named test_*.py or *_test.py in source dirs
                    base = os.path.basename(full)
                    if base.startswith("test_") or base.endswith("_test.py"):
                        continue
                    modules.append(file_to_module(project_root, full))
        else:
            if not abs_src.endswith(".py"):
                raise ValueError(f"Not a .py file: {src}")
            modules.append(file_to_module(project_root, abs_src))
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for m in modules:
        if m not in seen:
            seen.add(m)
            unique.append(m)
    return unique

def parse_mutpy_report(report_path: str) -> Dict[str, Any]:
    """
    Parse MutPy report text to extract:
      - score: float or None
      - mutants: list of {module, operator, lineno (int|None), status}
      - killed: int (count of 'killed')
      - total: int (eligible mutants, excludes 'incompetent')
    """
    if not os.path.exists(report_path):
        return {"score": None, "mutants": [], "killed": 0, "total": 0}

    score = None
    mutants: List[Dict[str, Any]] = []

    with open(report_path, "r") as f:
        lines = f.readlines()

    # score
    for ln in lines:
        m = re.search(r"^\s*mutation_score:\s*([0-9]+(?:\.[0-9]+)?)", ln)
        if m:
            try:
                score = float(m.group(1))
            except ValueError:
                score = None
            break

    # track latest explicit module for anchors like '*id001'
    last_explicit_module: Optional[str] = None

    def finalize(cur):
        if not cur:
            return
        mutants.append({
            "module": cur.get("module") or last_explicit_module,
            "operator": cur.get("operator"),
            "lineno": cur.get("lineno"),
            "status": cur.get("status"),
        })

    cur: Dict[str, Any] = {}
    in_mutations_block = False

    for raw in lines:
        line = raw.rstrip("\n")

        # explicit module line with python tag
        m = re.search(r"module:\s*(?:&\w+\s*)?!!python/module:([^\s]+)", line)
        if m:
            last_explicit_module = m.group(1)
            # only set current when starting a new block
            if not cur.get("module"):
                cur["module"] = last_explicit_module
            continue

        # new mutation block starts
        if re.match(r"^\s*-\s+exception_traceback:", line):
            finalize(cur)
            cur = {"module": last_explicit_module, "operator": None, "lineno": None, "status": None}
            in_mutations_block = False
            continue

        # anchor reuse 'module: *id001' -> keep last_explicit_module
        if re.match(r"^\s*module:\s*\*[\w]+", line):
            cur["module"] = last_explicit_module
            continue

        # enter mutations sublist
        if re.match(r"^\s*mutations:\s*$", line):
            in_mutations_block = True
            continue

        if in_mutations_block:
            m = re.search(r"^\s*-\s*lineno:\s*([0-9]+)", line)
            if m and cur.get("lineno") is None:
                try:
                    cur["lineno"] = int(m.group(1))
                except ValueError:
                    cur["lineno"] = None
                continue
            m = re.search(r"^\s*operator:\s*([A-Z]+)", line)
            if m and cur.get("operator") is None:
                cur["operator"] = m.group(1)
                continue

        m = re.search(r"^\s*status:\s*([a-zA-Z_]+)", line)
        if m:
            cur["status"] = m.group(1)
            continue

    finalize(cur)

    # compute counts
    excluded = {"incompetent"}
    eligible = [m for m in mutants if (m["status"] or "").lower() not in excluded]
    killed = [m for m in eligible if (m["status"] or "").lower() == "killed"]

    return {
        "score": score,
        "mutants": mutants,
        "killed": len(killed),
        "total": len(eligible),
    }

def main() -> None:
    ap = argparse.ArgumentParser(
        description="Compute mutation score(s) using MutPy per-test with mapping and merge."
    )
    ap.add_argument("--project-root", required=True, help="Absolute path to your project root.")
    ap.add_argument(
        "--mutpy-bin",
        default=None,
        help="Path to MutPy CLI (e.g., /usr/bin/mut.py). If omitted, tries 'mut.py' then 'python -m mutpy'.",
    )
    ap.add_argument("--runner", default="pytest", choices=["pytest", "unittest"], help="Test runner to use.")
    ap.add_argument(
        "--jobs",
        type=int,
        default=max(1, (os.cpu_count() or 2) - 1),
        help="Number of concurrent MutPy runs (default: CPU_count-1).",
    )
    ap.add_argument(
        "--extra-args",
        nargs="*",
        default=None,
        help="Extra arguments to pass to MutPy.",
    )
    ap.add_argument(
        "--timeout-sec",
        type=int,
        default=60,
        help="Timeout (seconds) for each MutPy per-test run.",
    )
    ap.add_argument(
        "--test-mapping",
        required=True,
        help="Path to JSON mapping test files -> source file paths.",
    )
    ap.add_argument(
        "--test-dir",
        required=True,
        help="Directory containing test files to run with MutPy.",
    )
    ap.add_argument(
        "--module-root",
        default=None,
        help="Root directory for source imports (default: <project-root>/src if exists, else <project-root>).",
    )
    ap.add_argument(
        "--log-dir",
        default=None,
        help="Directory to write per-test reports/logs (default: <project-root>/mutation_logs).",
    )
    ap.add_argument(
        "sources",
        nargs="*",
        help="Unused in per-test mode (kept for compatibility).",
    )
    args = ap.parse_args()
    project_root = to_abs(args.project_root)
    if not os.path.isdir(project_root):
        raise SystemExit(f"--project-root not found: {project_root}")
    tests_dir = to_abs(args.test_dir)
    if not os.path.isdir(tests_dir):
        raise SystemExit(f"--test-dir not found: {tests_dir}")

    # Paths must be absolute for inputs
    for p in [project_root, tests_dir]:
        if not os.path.isabs(p):
            raise SystemExit(f"Please use absolute paths. Found non-absolute: {p}")

    module_root = to_abs(args.module_root) if args.module_root else detect_module_root(project_root)
    log_dir = to_abs(args.log_dir) if args.log_dir else tests_dir + "-muation-logs"
    os.makedirs(log_dir, exist_ok=True)
    mapping = load_test_file_mapping(args.test_mapping)

    # Discover candidate test files in tests_dir
    # Discover candidate test files in tests_dir (recursive)
    test_files: List[str] = []
    for dirpath, _, filenames in os.walk(tests_dir):
        for fn in filenames:
            if fn.endswith(".py") and (fn.startswith("test_") or fn.endswith("_test.py")):
                rel = os.path.relpath(os.path.join(dirpath, fn), tests_dir)
                test_files.append(rel)
    test_files.sort()
    if not test_files:
        raise SystemExit(f"No test files found in directory: {tests_dir}")

    mutpy_cmd = detect_mutpy_command(args.mutpy_bin)

    per_test_results: List[Dict[str, Any]] = []
    eligible_union: Dict[str, set] = {}  # module -> set of ids
    killed_union: Dict[str, set] = {}    # module -> set of ids

    def sig(m: Dict[str, Any]) -> tuple:
        # stable-ish signature across runs
        return (m.get("module"), m.get("operator"), m.get("lineno"))

    print(f"Running MutPy per test in parallel (jobs={args.jobs}, runner={args.runner})")
    print(f"project_root={project_root}")
    print(f"module_root={module_root}")
    print(f"tests_dir={tests_dir}")
    print(f"logs={log_dir}")

    # Build tasks from test files and mapping
    tasks: List[Dict[str, str]] = []
    for test_file in test_files:
        # Mapping is keyed by filename; use basename for lookup
        key = find_matching_test_in_mapping(os.path.basename(test_file), mapping)
        if not key:
            print(f"[skip] No mapping found for test file: {test_file}")
            continue
        file_info = mapping[key]
        rel_source = file_info.get("file_name")
        if not rel_source:
            print(f"[skip] Mapping missing 'file_name' for: {key}")
            continue
        abs_source = os.path.join(project_root, rel_source)
        if not os.path.exists(abs_source):
            print(f"[skip] Source file not found: {abs_source}")
            continue
        try:
            target_module = file_to_module(module_root, abs_source)
        except Exception as e:
            print(f"[skip] Unable to derive module for {abs_source}: {e}")
            continue
        # Use bare module name (file basename without .py); import roots are provided via --path
        test_module = os.path.splitext(os.path.basename(test_file))[0]
        tasks.append({"test_module": test_module, "target_module": target_module, "test_file": test_file})

    if not tasks:
        print("No runnable tasks after mapping. Exiting.")
        return

    # Launch in parallel
    futures = {}
    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        for t in tasks:
            fut = ex.submit(
                run_mutpy_for_test,
                mutpy_cmd,
                args.runner,
                module_root,
                project_root,
                tests_dir,
                t["target_module"],
                t["test_module"],
                t["test_file"],
                log_dir,
                None,
                args.extra_args,
                args.timeout_sec,
            )
            futures[fut] = t

        for fut in as_completed(futures):
            t = futures[fut]
            result = fut.result()
            tm, tgt = t["test_module"], t["target_module"]
            if not result["success"]:
                print(f"[fail] {tm} -> {tgt} (exit={result['exit_code']})")
                per_test_results.append({"test_module": tm, "target_module": tgt, "success": False, "stats": result["stats"]})
                continue

            stats = result["stats"]
            print(f"[ok] {tm} -> {tgt} | score={stats['score']}% total={stats['total']} killed={stats['killed']}")
            per_test_results.append({"test_module": tm, "target_module": tgt, "success": True, "stats": stats})

            rep = result.get("report")
            if rep and rep.get("mutants"):
                # Union by module reported in the file (more reliable than tgt)
                for m in rep["mutants"]:
                    mod = m.get("module") or tgt
                    if not mod:
                        continue
                    elig = eligible_union.setdefault(mod, set())
                    kill = killed_union.setdefault(mod, set())
                    sid = sig(m)
                    status = (m.get("status") or "").lower()
                    if status != "incompetent":
                        elig.add(sid)
                        if status == "killed":
                            kill.add(sid)

    total_sum = sum(len(s) for s in eligible_union.values())
    killed_sum = sum(len(s) for s in killed_union.values())
    overall = (killed_sum / total_sum * 100.0) if total_sum > 0 else 0.0

    summary_path = os.path.join(log_dir, "summary.txt")
    with open(summary_path, "w") as f:
        f.write(f"Per-test results ({len(per_test_results)} runs):\n")
        for r in per_test_results:
            s = r["stats"]
            f.write(
                f"{'[ok]' if r['success'] else '[fail]'} {r['test_module']} -> {r['target_module']} "
                f"score={s['score']} total={s['total']} killed={s['killed']}\n"
            )
        f.write(f"\nOverall score: {overall:.2f}% (killed={killed_sum} / total={total_sum})\n")

    print(f"Overall score: {overall:.2f}% (killed={killed_sum} / total={total_sum})")
    print(f"Summary written to: {summary_path}")


if __name__ == "__main__":
    main()


# python scripts/compute_mutation_score.py \
#   --project-root /LSPRAG/experiments/projects/black \
#   --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
#   --test-dir /LSPRAG/experiments/data/main_result/black/lsprag/1/deepseek-chat/results/final


# python /LSPRAG/scripts/compute_mutation_score.py \
#   --project-root /LSPRAG/experiments/projects/black \
#   --module-root /LSPRAG/experiments/projects/black \
#   --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
#   --test-dir /LSPRAG/experiments/data/main_result/black/lsprag/1/deepseek-chat/results/final \
#   --runner pytest

# python /LSPRAG/scripts/compute_mutation_score.py \
#     --project-root /LSPRAG/experiments/projects/black \
#     --module-root /LSPRAG/experiments/projects/black \
#     --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
#     --test-dir /LSPRAG/experiments/data/main_result/black/draco/DraCo_deepseek-chat_20250613_061851/codes \
#     --runner pytest
# python /LSPRAG/scripts/compute_mutation_score.py \