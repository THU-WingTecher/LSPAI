import re

def extract_lines(report_path: str) -> None:
    """Print “Total lines …” and “Missed Lines …” from a JaCoCo HTML report."""
    with open(report_path, encoding="utf‑8") as f:
        html = f.read()

    # 1. Grab the <tfoot>…</tfoot> block (the grand‑total row)
    m = re.search(r"<tfoot>(.*?)</tfoot>", html, flags=re.S)
    if not m:
        raise RuntimeError("No <tfoot> section found.")
    tfoot = m.group(1)

    # 2. Inside that block, collect every pair of
    #    <td class="ctr1">number</td><td class="ctr2">number</td>
    pairs = re.findall(
        r'<td class="ctr1">\s*([\d,]+)\s*</td>\s*'
        r'<td class="ctr2">\s*([\d,]+)\s*</td>',
        tfoot,
        flags=re.S,
    )

    if len(pairs) < 2:
        raise RuntimeError("Couldn’t locate the Lines columns.")

    # 3. The second pair is “Missed Lines” / “Lines”
    missed_lines = int(pairs[1][0].replace(",", ""))
    total_lines  = int(pairs[1][1].replace(",", ""))

    print("============================")
    print(f"Total lines {total_lines}")
    print(f"Missed Lines {missed_lines}")
    print(f"Line Coverages are {round((total_lines-missed_lines)/total_lines*100,2)}%")
    print("============================")
# ---- run it ----
# example:
# extract_lines("index.html")


# --- run it ---
# put the path to your report here, e.g. "index.html"
if __name__ == "__main__" : 
    import sys  
    extract_lines(sys.argv[1])