#!/usr/bin/env python3
"""
Create diverse publication-style figures to show the effect of the method on
decreasing mean assertion error count.

Outputs:
1) Main panel figure (absolute values + reductions)
2) Dumbbell figure (each baseline vs method)
3) Slope figure (baselines converging to method)
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
from typing import Any, Dict, List, Tuple


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def pick_best_candidate(payload: Dict[str, Any]) -> Dict[str, Any]:
    top_candidates = payload.get("top_candidates") or []
    if top_candidates:
        return top_candidates[0]
    best_candidate = payload.get("best_candidate")
    if best_candidate:
        return best_candidate
    raise ValueError("No top_candidates or best_candidate found in result JSON.")


def xml_escape(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def nice_ticks(max_val: float, n_ticks: int = 5) -> List[float]:
    if max_val <= 0:
        return [0.0, 1.0]
    rough_step = max_val / max(2, n_ticks)
    magnitude = 10 ** math.floor(math.log10(rough_step))
    residual = rough_step / magnitude
    if residual <= 1:
        nice = 1
    elif residual <= 2:
        nice = 2
    elif residual <= 5:
        nice = 5
    else:
        nice = 10
    step = nice * magnitude
    top = math.ceil(max_val / step) * step
    count = int(round(top / step))
    return [i * step for i in range(count + 1)]


def method_setting(best: Dict[str, Any]) -> str:
    if "n" in best and "m" in best:
        return f"n={best['n']}, m={best['m']}"
    if "A" in best and "B" in best:
        return f"A={best['A']}, B={best['B']}"
    if "n_pct" in best and "m_pct" in best:
        return f"n_pct={best['n_pct']}, m_pct={best['m_pct']}"
    return "best candidate"


def extract_plot_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    baselines = payload.get("baselines", {})
    overall = ((baselines.get("overall_k1") or {}).get("mean_error_count"))
    a_only = ((baselines.get("A_only") or {}).get("mean_error_count"))
    b_only = ((baselines.get("B_only") or {}).get("mean_error_count"))

    if overall is None or a_only is None or b_only is None:
        raise ValueError(
            "Missing baselines.overall_k1.mean_error_count or "
            "baselines.A_only.mean_error_count or baselines.B_only.mean_error_count."
        )

    best = pick_best_candidate(payload)
    metrics = best.get("metrics") or {}
    current = metrics.get("mean_error_count")
    if current is None:
        objective = ((payload.get("meta") or {}).get("objective"))
        if objective == "mean_error_count":
            current = best.get("objective_value")
    if current is None:
        raise ValueError("Missing current candidate mean_error_count in top candidate.")

    meta = payload.get("meta") or {}
    return {
        "robust": float(current),
        "all": float(overall),
        "testUsageOnly": float(a_only),
        "ProductionUsageOnly": float(b_only),
        "k": meta.get("k"),
        "objective": meta.get("objective"),
        "error_definition": meta.get("error_definition"),
        "setting": method_setting(best),
    }


def normalize_data(data: Dict[str, Any], factor: float) -> Dict[str, Any]:
    if factor <= 0:
        raise ValueError("normalize-by must be > 0")
    out = dict(data)
    out["robust"] = out["robust"] / factor
    out["all"] = out["all"] / factor
    out["testUsageOnly"] = out["testUsageOnly"] / factor
    out["ProductionUsageOnly"] = out["ProductionUsageOnly"] / factor
    out["normalized_by"] = factor
    return out


def write_svg(path: str, lines: List[str]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def write_csv(path: str, headers: List[str], rows: List[List[str]]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def write_markdown_table(path: str, headers: List[str], rows: List[List[str]]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    lines = []
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
    for row in rows:
        lines.append("| " + " | ".join(row) + " |")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def build_table_rows(data: Dict[str, Any], robust_label: str) -> Tuple[List[str], List[List[str]]]:
    robust = data["robust"]
    methods = [
        (robust_label, data["robust"]),
        ("all", data["all"]),
        ("ProductionUsageOnly", data["ProductionUsageOnly"]),
        ("testUsageOnly", data["testUsageOnly"]),
    ]
    ranked = sorted(methods, key=lambda x: x[1])
    rank_map = {name: i + 1 for i, (name, _) in enumerate(ranked)}

    headers = [
        "Method",
        "mean_assertion_error_count",
        f"delta_vs_{robust_label}",
        f"delta_pct_vs_{robust_label}",
        "rank",
    ]

    rows: List[List[str]] = []
    for name, val in methods:
        delta = val - robust
        pct = (delta / robust * 100.0) if robust else 0.0
        rows.append(
            [
                name,
                f"{val:.6f}",
                f"{delta:+.6f}",
                f"{pct:+.2f}%",
                str(rank_map[name]),
            ]
        )
    return headers, rows


def plot_table_svg(
    out_path: str,
    title: str,
    headers: List[str],
    rows: List[List[str]],
    robust_label: str,
) -> None:
    # Double-column friendly table figure.
    width_units = 1432
    height_units = 360
    width_in = 7.16
    height_in = 1.8

    left = 46
    top = 74
    table_w = width_units - 2 * left
    header_h = 44
    row_h = 52
    col_widths = [0.25, 0.24, 0.21, 0.21, 0.09]  # sum to 1.0
    col_px = [table_w * w for w in col_widths]

    # precompute x positions
    x_pos = [left]
    for w in col_px:
        x_pos.append(x_pos[-1] + w)

    lines: List[str] = []
    lines.append(
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width_in}in' height='{height_in}in' viewBox='0 0 {width_units} {height_units}'>"
    )
    lines.append("<rect width='100%' height='100%' fill='#ffffff'/>")
    lines.append(
        "<style>"
        "text{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;fill:#111}"
        ".title{font-size:21px;font-weight:700}"
        ".head{font-size:12px;font-weight:700;fill:#222}"
        ".cell{font-size:12px;fill:#222}"
        ".grid{stroke:#cfcfcf;stroke-width:1}"
        ".header_bg{fill:#f3f4f6}"
        ".robust_bg{fill:#eef6ff}"
        "</style>"
    )

    lines.append(f"<text class='title' x='{width_units/2}' y='34' text-anchor='middle'>{xml_escape(title)}</text>")

    # Header background
    lines.append(
        f"<rect class='header_bg' x='{left}' y='{top}' width='{table_w}' height='{header_h}'/>"
    )

    # Rows (highlight robust row)
    for i, row in enumerate(rows):
        y = top + header_h + i * row_h
        if row[0] == robust_label:
            lines.append(f"<rect class='robust_bg' x='{left}' y='{y}' width='{table_w}' height='{row_h}'/>")

    # Grid lines horizontal
    total_h = header_h + len(rows) * row_h
    for i in range(len(rows) + 2):
        y = top + i * row_h if i > 0 else top
        if i == 1:
            y = top + header_h
        elif i > 1:
            y = top + header_h + (i - 1) * row_h
        lines.append(f"<line class='grid' x1='{left}' y1='{y}' x2='{left + table_w}' y2='{y}'/>")

    # Grid lines vertical
    for x in x_pos:
        lines.append(f"<line class='grid' x1='{x}' y1='{top}' x2='{x}' y2='{top + total_h}'/>")

    # Header text
    for i, h in enumerate(headers):
        x = (x_pos[i] + x_pos[i + 1]) / 2
        lines.append(f"<text class='head' x='{x}' y='{top + 27}' text-anchor='middle'>{xml_escape(h)}</text>")

    # Cell text
    for r_idx, row in enumerate(rows):
        y = top + header_h + r_idx * row_h + 31
        for c_idx, cell in enumerate(row):
            if c_idx == 0:
                x = x_pos[c_idx] + 10
                anchor = "start"
            else:
                x = (x_pos[c_idx] + x_pos[c_idx + 1]) / 2
                anchor = "middle"
            lines.append(f"<text class='cell' x='{x}' y='{y}' text-anchor='{anchor}'>{xml_escape(cell)}</text>")

    lines.append("</svg>")
    write_svg(out_path, lines)


def plot_main_panel(data: Dict[str, Any], out_path: str, title: str, robust_label: str) -> None:
    labels = [robust_label, "all", "ProductionUsageOnly", "testUsageOnly"]
    values = [data["robust"], data["all"], data["ProductionUsageOnly"], data["testUsageOnly"]]
    colors = ["#0072B2", "#8D8D8D", "#56B4E9", "#E69F00"]

    gains = [values[1] - values[0], values[2] - values[0], values[3] - values[0]]
    gain_labels = ["vs all", "vs ProductionUsageOnly", "vs testUsageOnly"]
    gain_pcts = [
        (gains[0] / values[1] * 100.0) if values[1] else 0.0,
        (gains[1] / values[2] * 100.0) if values[2] else 0.0,
        (gains[2] / values[3] * 100.0) if values[3] else 0.0,
    ]
    gain_colors = ["#CC79A7", "#009E73", "#D55E00"]

    width = 1360
    height = 760

    pa_x = 70
    pa_y = 145
    pa_w = 860
    pa_h = 550
    pa_bar_x = 400
    pa_bar_w = 500
    pa_row_gap = 102
    pa_first_cy = pa_y + 140
    pa_bar_h = 44
    pa_max = max(values) * 1.12 if max(values) > 0 else 1.0
    pa_ticks = nice_ticks(pa_max, n_ticks=5)
    pa_axis_top = pa_first_cy - 58
    pa_axis_bottom = pa_first_cy + (len(values) - 1) * pa_row_gap + 58

    pb_x = 970
    pb_y = 185
    pb_w = 340
    pb_h = 470
    pb_bar_x = pb_x + 130
    pb_bar_w = 165
    pb_row_gap = 112
    pb_first_cy = pb_y + 110
    pb_bar_h = 40
    pb_max = max(gains) * 1.20 if max(gains) > 0 else 1.0
    pb_ticks = nice_ticks(pb_max, n_ticks=4)
    pb_axis_top = pb_first_cy - 46
    pb_axis_bottom = pb_first_cy + (len(gains) - 1) * pb_row_gap + 46

    lines: List[str] = []
    lines.append(
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>"
    )
    lines.append("<rect width='100%' height='100%' fill='#ffffff'/>")
    lines.append(
        "<style>"
        "text{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;fill:#111}"
        ".title{font-size:31px;font-weight:700;letter-spacing:0.1px}"
        ".subtitle{font-size:14px;fill:#444}"
        ".panel{fill:#fff;stroke:#d9d9d9;stroke-width:1.2}"
        ".panel_tag{font-size:18px;font-weight:700;fill:#333}"
        ".panel_title{font-size:16px;font-weight:700;fill:#222}"
        ".axis{stroke:#444;stroke-width:1.2}"
        ".grid{stroke:#ececec;stroke-width:1}"
        ".tick{font-size:12px;fill:#555}"
        ".label{font-size:15px;fill:#222}"
        ".bar{stroke:#3a3a3a;stroke-width:0.8}"
        ".value{font-size:14px;font-weight:700;fill:#111}"
        ".foot{font-size:12px;fill:#666}"
        "</style>"
    )

    lines.append(
        f"<text class='title' x='{width/2}' y='54' text-anchor='middle'>{xml_escape(title)}</text>"
    )
    subtitle = (
        f"Metric: mean_assertion_error_count (lower is better) | "
        f"{robust_label} setting: {data['setting']} | "
        f"k={data['k']} | objective={data['objective']} | error_definition={data['error_definition']} | "
        f"normalized_by={data.get('normalized_by', 1)}"
    )
    lines.append(
        f"<text class='subtitle' x='{width/2}' y='84' text-anchor='middle'>{xml_escape(subtitle)}</text>"
    )

    lines.append(f"<rect class='panel' x='{pa_x}' y='{pa_y}' width='{pa_w}' height='{pa_h}' rx='8' ry='8'/>")
    lines.append(f"<rect class='panel' x='{pb_x}' y='{pb_y}' width='{pb_w}' height='{pb_h}' rx='8' ry='8'/>")

    lines.append(f"<text class='panel_tag' x='{pa_x + 20}' y='{pa_y + 37}'>A</text>")
    lines.append(
        f"<text class='panel_title' x='{pa_x + 52}' y='{pa_y + 37}'>Absolute mean assertion error count</text>"
    )
    lines.append(f"<text class='panel_tag' x='{pb_x + 16}' y='{pb_y + 34}'>B</text>")
    lines.append(
        f"<text class='panel_title' x='{pb_x + 44}' y='{pb_y + 34}'>Reduction vs {xml_escape(robust_label)}</text>"
    )

    lines.append(
        f"<line class='axis' x1='{pa_bar_x}' y1='{pa_axis_bottom}' x2='{pa_bar_x + pa_bar_w}' y2='{pa_axis_bottom}'/>"
    )
    for tick in pa_ticks:
        tx = pa_bar_x + (tick / pa_max) * pa_bar_w
        lines.append(
            f"<line class='grid' x1='{tx}' y1='{pa_axis_top}' x2='{tx}' y2='{pa_axis_bottom}'/>"
        )
        lines.append(
            f"<text class='tick' x='{tx}' y='{pa_axis_bottom + 23}' text-anchor='middle'>{tick:.1f}</text>"
        )

    for i, (label, val, color) in enumerate(zip(labels, values, colors)):
        cy = pa_first_cy + i * pa_row_gap
        bw = (val / pa_max) * pa_bar_w
        y = cy - pa_bar_h / 2
        lines.append(
            f"<rect class='bar' x='{pa_bar_x}' y='{y}' width='{bw}' height='{pa_bar_h}' fill='{color}' rx='4' ry='4'/>"
        )
        lines.append(
            f"<text class='label' x='{pa_x + 20}' y='{cy + 5}' text-anchor='start'>{xml_escape(label)}</text>"
        )
        lines.append(
            f"<text class='value' x='{pa_bar_x + bw + 10}' y='{cy + 5}' text-anchor='start'>{val:.3f}</text>"
        )

    lines.append(
        f"<text class='tick' x='{pa_bar_x + pa_bar_w/2}' y='{pa_axis_bottom + 49}' text-anchor='middle'>"
        "Mean assertion error count"
        "</text>"
    )

    lines.append(
        f"<line class='axis' x1='{pb_bar_x}' y1='{pb_axis_bottom}' x2='{pb_bar_x + pb_bar_w}' y2='{pb_axis_bottom}'/>"
    )
    for tick in pb_ticks:
        tx = pb_bar_x + (tick / pb_max) * pb_bar_w
        lines.append(
            f"<line class='grid' x1='{tx}' y1='{pb_axis_top}' x2='{tx}' y2='{pb_axis_bottom}'/>"
        )
        lines.append(
            f"<text class='tick' x='{tx}' y='{pb_axis_bottom + 20}' text-anchor='middle'>{tick:.1f}</text>"
        )

    for i, (glabel, gain, pct, gcolor) in enumerate(zip(gain_labels, gains, gain_pcts, gain_colors)):
        cy = pb_first_cy + i * pb_row_gap
        bw = (gain / pb_max) * pb_bar_w if pb_max > 0 else 0
        y = cy - pb_bar_h / 2
        lines.append(
            f"<rect class='bar' x='{pb_bar_x}' y='{y}' width='{bw}' height='{pb_bar_h}' fill='{gcolor}' rx='4' ry='4'/>"
        )
        lines.append(
            f"<text class='label' x='{pb_bar_x - 10}' y='{cy + 5}' text-anchor='end'>{xml_escape(glabel)}</text>"
        )
        lines.append(
            f"<text class='value' x='{pb_bar_x + bw + 8}' y='{cy + 5}' text-anchor='start'>{gain:.3f} ({pct:.1f}%)</text>"
        )

    lines.append(
        f"<text class='tick' x='{pb_bar_x + pb_bar_w/2}' y='{pb_axis_bottom + 42}' text-anchor='middle'>"
        "Absolute reduction (higher is better)"
        "</text>"
    )
    lines.append(
        f"<text class='foot' x='{width/2}' y='{height - 24}' text-anchor='middle'>"
        f"{xml_escape(robust_label)} has the lowest mean assertion error count among all comparators."
        "</text>"
    )

    lines.append("</svg>")
    write_svg(out_path, lines)


def plot_dumbbell(data: Dict[str, Any], out_path: str, robust_label: str) -> None:
    rows: List[Tuple[str, float, str]] = [
        ("all", data["all"], "#8D8D8D"),
        ("ProductionUsageOnly", data["ProductionUsageOnly"], "#56B4E9"),
        ("testUsageOnly", data["testUsageOnly"], "#E69F00"),
    ]
    robust = data["robust"]

    width = 1220
    height = 620
    left = 210
    right = 90
    top = 140
    bottom = 110
    chart_w = width - left - right
    chart_h = height - top - bottom
    x_max = max(v for _, v, _ in rows) * 1.15
    ticks = nice_ticks(x_max, n_ticks=6)

    row_gap = chart_h / max(1, len(rows) - 1)

    def x(v: float) -> float:
        return left + (v / x_max) * chart_w

    lines: List[str] = []
    lines.append(
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>"
    )
    lines.append("<rect width='100%' height='100%' fill='#ffffff'/>")
    lines.append(
        "<style>"
        "text{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;fill:#111}"
        ".title{font-size:28px;font-weight:700}"
        ".subtitle{font-size:14px;fill:#444}"
        ".axis{stroke:#444;stroke-width:1.2}"
        ".grid{stroke:#ececec;stroke-width:1}"
        ".tick{font-size:12px;fill:#555}"
        ".label{font-size:15px;fill:#222}"
        ".note{font-size:13px;font-weight:700;fill:#111}"
        "</style>"
    )

    lines.append(
        f"<text class='title' x='{width/2}' y='52' text-anchor='middle'>Dumbbell View: Baselines vs {xml_escape(robust_label)}</text>"
    )
    lines.append(
        f"<text class='subtitle' x='{width/2}' y='82' text-anchor='middle'>"
        "Mean assertion error count (left is better, lower is better)"
        "</text>"
    )

    y0 = top + chart_h
    lines.append(f"<line class='axis' x1='{left}' y1='{y0}' x2='{left + chart_w}' y2='{y0}'/>")
    for t in ticks:
        xt = x(t)
        lines.append(f"<line class='grid' x1='{xt}' y1='{top - 25}' x2='{xt}' y2='{y0}'/>")
        lines.append(f"<text class='tick' x='{xt}' y='{y0 + 23}' text-anchor='middle'>{t:.1f}</text>")

    for i, (name, baseline, color) in enumerate(rows):
        y = top + i * row_gap
        xr = x(robust)
        xb = x(baseline)
        delta = baseline - robust
        pct = (delta / baseline * 100.0) if baseline else 0.0

        lines.append(f"<line x1='{xr}' y1='{y}' x2='{xb}' y2='{y}' stroke='#9f9f9f' stroke-width='4'/>")
        lines.append(f"<circle cx='{xb}' cy='{y}' r='9' fill='{color}' stroke='#333' stroke-width='1'/>")
        lines.append(f"<circle cx='{xr}' cy='{y}' r='9' fill='#0072B2' stroke='#333' stroke-width='1'/>")

        lines.append(f"<text class='label' x='{left - 16}' y='{y + 5}' text-anchor='end'>{xml_escape(name)}</text>")
        lines.append(
            f"<text class='tick' x='{xb + 14}' y='{y + 5}' text-anchor='start'>{baseline:.3f}</text>"
        )
        lines.append(
            f"<text class='tick' x='{xr - 14}' y='{y + 5}' text-anchor='end'>{robust:.3f}</text>"
        )
        lines.append(
            f"<text class='note' x='{max(xr, xb) + 20}' y='{y + 5}' text-anchor='start'>"
            f"\u2193 {delta:.3f} ({pct:.1f}%)"
            "</text>"
        )

    legend_y = height - 36
    lines.append("<circle cx='350' cy='{0}' r='7' fill='#0072B2' stroke='#333' stroke-width='1'/>".format(legend_y))
    lines.append(
        f"<text class='tick' x='365' y='{legend_y + 4}' text-anchor='start'>{xml_escape(robust_label)}</text>"
    )
    lines.append("<circle cx='520' cy='{0}' r='7' fill='#999' stroke='#333' stroke-width='1'/>".format(legend_y))
    lines.append(
        f"<text class='tick' x='535' y='{legend_y + 4}' text-anchor='start'>Baseline point</text>"
    )

    lines.append("</svg>")
    write_svg(out_path, lines)


def plot_slope(data: Dict[str, Any], out_path: str, robust_label: str) -> None:
    rows: List[Tuple[str, float, str]] = [
        ("all", data["all"], "#8D8D8D"),
        ("ProductionUsageOnly", data["ProductionUsageOnly"], "#56B4E9"),
        ("testUsageOnly", data["testUsageOnly"], "#E69F00"),
    ]
    robust = data["robust"]

    width = 1180
    height = 700
    left = 130
    right = 110
    top = 130
    bottom = 110
    chart_w = width - left - right
    chart_h = height - top - bottom

    y_max = max(v for _, v, _ in rows) * 1.12
    ticks = nice_ticks(y_max, n_ticks=6)

    x_left = left + 120
    x_right = left + chart_w - 120

    def y(v: float) -> float:
        return top + chart_h * (1.0 - (v / y_max))

    lines: List[str] = []
    lines.append(
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>"
    )
    lines.append("<rect width='100%' height='100%' fill='#ffffff'/>")
    lines.append(
        "<style>"
        "text{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;fill:#111}"
        ".title{font-size:28px;font-weight:700}"
        ".subtitle{font-size:14px;fill:#444}"
        ".axis{stroke:#444;stroke-width:1.2}"
        ".grid{stroke:#ececec;stroke-width:1}"
        ".tick{font-size:12px;fill:#555}"
        ".label{font-size:14px;fill:#222}"
        ".note{font-size:13px;font-weight:700;fill:#111}"
        "</style>"
    )

    lines.append(
        f"<text class='title' x='{width/2}' y='52' text-anchor='middle'>Slope View: Convergence to {xml_escape(robust_label)}</text>"
    )
    lines.append(
        f"<text class='subtitle' x='{width/2}' y='82' text-anchor='middle'>"
        "Each line shows baseline mean assertion error count reduced to the method result"
        "</text>"
    )

    for t in ticks:
        yt = y(t)
        lines.append(f"<line class='grid' x1='{left}' y1='{yt}' x2='{left + chart_w}' y2='{yt}'/>")
        lines.append(f"<text class='tick' x='{left - 10}' y='{yt + 4}' text-anchor='end'>{t:.1f}</text>")

    lines.append(f"<line class='axis' x1='{x_left}' y1='{top - 5}' x2='{x_left}' y2='{top + chart_h + 5}'/>")
    lines.append(f"<line class='axis' x1='{x_right}' y1='{top - 5}' x2='{x_right}' y2='{top + chart_h + 5}'/>")
    lines.append(f"<text class='label' x='{x_left}' y='{top + chart_h + 36}' text-anchor='middle'>Baselines</text>")
    lines.append(
        f"<text class='label' x='{x_right}' y='{top + chart_h + 36}' text-anchor='middle'>{xml_escape(robust_label)}</text>"
    )

    robust_y = y(robust)
    lines.append(f"<circle cx='{x_right}' cy='{robust_y}' r='10' fill='#0072B2' stroke='#1f1f1f' stroke-width='1.2'/>")
    lines.append(
        f"<text class='note' x='{x_right + 16}' y='{robust_y + 5}' text-anchor='start'>{xml_escape(robust_label)} = {robust:.3f}</text>"
    )

    for name, baseline, color in rows:
        yb = y(baseline)
        delta = baseline - robust
        pct = (delta / baseline * 100.0) if baseline else 0.0
        xm = (x_left + x_right) / 2
        ym = (yb + robust_y) / 2

        lines.append(f"<line x1='{x_left}' y1='{yb}' x2='{x_right}' y2='{robust_y}' stroke='{color}' stroke-width='3'/>")
        lines.append(f"<circle cx='{x_left}' cy='{yb}' r='8' fill='{color}' stroke='#333' stroke-width='1'/>")
        lines.append(
            f"<text class='label' x='{x_left - 14}' y='{yb + 5}' text-anchor='end'>{xml_escape(name)} = {baseline:.3f}</text>"
        )
        lines.append(
            f"<text class='note' x='{xm}' y='{ym - 8}' text-anchor='middle'>\u2193 {delta:.3f} ({pct:.1f}%)</text>"
        )

    lines.append(
        f"<text class='tick' x='{left + chart_w/2}' y='{height - 22}' text-anchor='middle'>"
        "y-axis: mean assertion error count (lower is better)"
        "</text>"
    )

    lines.append("</svg>")
    write_svg(out_path, lines)


def plot_double_column_summary(
    data: Dict[str, Any], out_path: str, title: str, robust_label: str
) -> None:
    labels = [robust_label, "all", "ProductionUsageOnly", "testUsageOnly"]
    values = [data["robust"], data["all"], data["ProductionUsageOnly"], data["testUsageOnly"]]
    colors = ["#0072B2", "#8D8D8D", "#56B4E9", "#E69F00"]

    gains = [values[1] - values[0], values[2] - values[0], values[3] - values[0]]
    gain_labels = ["vs all", "vs ProductionUsageOnly", "vs testUsageOnly"]
    gain_colors = ["#CC79A7", "#009E73", "#D55E00"]
    gain_pcts = [
        (gains[0] / values[1] * 100.0) if values[1] else 0.0,
        (gains[1] / values[2] * 100.0) if values[2] else 0.0,
        (gains[2] / values[3] * 100.0) if values[3] else 0.0,
    ]

    # Double-column target (roughly 7.16in x 2.65in).
    width_units = 1432
    height_units = 530
    width_in = 7.16
    height_in = 2.65

    left_x = 56
    left_y = 94
    left_w = 855
    left_h = 360

    right_x = 940
    right_y = 94
    right_w = 436
    right_h = 360

    left_axis_x = 345
    left_axis_w = 520
    left_rows_y0 = 166
    left_row_gap = 76

    right_axis_x = 1080
    right_axis_w = 256
    right_rows_y0 = 170
    right_row_gap = 90

    v_max = max(values) * 1.12 if max(values) > 0 else 1.0
    v_ticks = nice_ticks(v_max, n_ticks=4)
    v_scale_max = v_ticks[-1] if v_ticks else v_max
    g_max = max(gains) * 1.18 if max(gains) > 0 else 1.0
    g_ticks = nice_ticks(g_max, n_ticks=3)
    g_scale_max = g_ticks[-1] if g_ticks else g_max

    lines: List[str] = []
    lines.append(
        f"<svg xmlns='http://www.w3.org/2000/svg' width='{width_in}in' height='{height_in}in' viewBox='0 0 {width_units} {height_units}'>"
    )
    lines.append("<rect width='100%' height='100%' fill='#ffffff'/>")
    lines.append(
        "<style>"
        "text{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;fill:#111}"
        ".title{font-size:22px;font-weight:700}"
        ".subtitle{font-size:13px;fill:#444}"
        ".panel{fill:#fff;stroke:#d9d9d9;stroke-width:1.0}"
        ".panelt{font-size:14px;font-weight:700;fill:#222}"
        ".axis{stroke:#444;stroke-width:1.1}"
        ".grid{stroke:#ececec;stroke-width:1}"
        ".tick{font-size:11px;fill:#555}"
        ".label{font-size:12px;fill:#222}"
        ".value{font-size:12px;font-weight:700;fill:#111}"
        ".bar{stroke:#333;stroke-width:0.7}"
        "</style>"
    )

    lines.append(
        f"<text class='title' x='{width_units/2}' y='34' text-anchor='middle'>{xml_escape(title)}</text>"
    )
    subtitle = (
        f"{robust_label} setting: {data['setting']} | "
        f"k={data['k']}, objective={data['objective']}, errors={data['error_definition']}, "
        f"normalized_by={data.get('normalized_by', 1)}"
    )
    lines.append(
        f"<text class='subtitle' x='{width_units/2}' y='56' text-anchor='middle'>{xml_escape(subtitle)}</text>"
    )

    lines.append(f"<rect class='panel' x='{left_x}' y='{left_y}' width='{left_w}' height='{left_h}' rx='6' ry='6'/>")
    lines.append(f"<rect class='panel' x='{right_x}' y='{right_y}' width='{right_w}' height='{right_h}' rx='6' ry='6'/>")
    lines.append(
        f"<text class='panelt' x='{left_x + 16}' y='{left_y + 24}'>Mean assertion error count (lower is better)</text>"
    )
    lines.append(
        f"<text class='panelt' x='{right_x + 16}' y='{right_y + 24}'>Reduction vs {xml_escape(robust_label)}</text>"
    )

    # Left panel axis/grid.
    axis_y = left_y + left_h - 44
    lines.append(
        f"<line class='axis' x1='{left_axis_x}' y1='{axis_y}' x2='{left_axis_x + left_axis_w}' y2='{axis_y}'/>"
    )
    for t in v_ticks:
        tx = left_axis_x + (t / v_scale_max) * left_axis_w
        lines.append(f"<line class='grid' x1='{tx}' y1='{left_rows_y0 - 34}' x2='{tx}' y2='{axis_y}'/>")
        lines.append(f"<text class='tick' x='{tx}' y='{axis_y + 18}' text-anchor='middle'>{t:.1f}</text>")

    # Left panel bars.
    bar_h = 24
    for i, (label, val, color) in enumerate(zip(labels, values, colors)):
        cy = left_rows_y0 + i * left_row_gap
        bw = (val / v_scale_max) * left_axis_w
        by = cy - bar_h / 2
        lines.append(
            f"<rect class='bar' x='{left_axis_x}' y='{by}' width='{bw}' height='{bar_h}' fill='{color}' rx='3' ry='3'/>"
        )
        lines.append(f"<text class='label' x='{left_x + 14}' y='{cy + 4}' text-anchor='start'>{xml_escape(label)}</text>")
        lines.append(f"<text class='value' x='{left_axis_x + bw + 8}' y='{cy + 4}' text-anchor='start'>{val:.3f}</text>")

    # Right panel axis/grid.
    right_axis_y = right_y + right_h - 44
    lines.append(
        f"<line class='axis' x1='{right_axis_x}' y1='{right_axis_y}' x2='{right_axis_x + right_axis_w}' y2='{right_axis_y}'/>"
    )
    for t in g_ticks:
        tx = right_axis_x + (t / g_scale_max) * right_axis_w
        lines.append(f"<line class='grid' x1='{tx}' y1='{right_rows_y0 - 36}' x2='{tx}' y2='{right_axis_y}'/>")
        lines.append(f"<text class='tick' x='{tx}' y='{right_axis_y + 18}' text-anchor='middle'>{t:.1f}</text>")

    # Right panel bars.
    for i, (glabel, gval, gpct, color) in enumerate(zip(gain_labels, gains, gain_pcts, gain_colors)):
        cy = right_rows_y0 + i * right_row_gap
        bw = (gval / g_scale_max) * right_axis_w if g_scale_max > 0 else 0
        by = cy - bar_h / 2
        lines.append(
            f"<rect class='bar' x='{right_axis_x}' y='{by}' width='{bw}' height='{bar_h}' fill='{color}' rx='3' ry='3'/>"
        )
        lines.append(f"<text class='label' x='{right_axis_x - 8}' y='{cy + 4}' text-anchor='end'>{xml_escape(glabel)}</text>")
        lines.append(f"<text class='value' x='{right_axis_x + bw + 7}' y='{cy + 4}' text-anchor='start'>{gval:.3f} ({gpct:.1f}%)</text>")

    lines.append(
        f"<text class='tick' x='{width_units/2}' y='{height_units - 14}' text-anchor='middle'>"
        f"{xml_escape(robust_label)} achieves the lowest mean assertion error count."
        "</text>"
    )

    lines.append("</svg>")
    write_svg(out_path, lines)


def derive_paths(main_svg: str, dumbbell_svg: str | None, slope_svg: str | None) -> Tuple[str, str]:
    base, ext = os.path.splitext(main_svg)
    if not ext:
        ext = ".svg"
        main_svg = main_svg + ext
    if dumbbell_svg is None:
        dumbbell_svg = f"{base}_dumbbell{ext}"
    if slope_svg is None:
        slope_svg = f"{base}_slope{ext}"
    return dumbbell_svg, slope_svg


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate diverse graphs for mean assertion error comparison."
    )
    parser.add_argument(
        "--result-json",
        default="experiments/data/RA/RobustFUT/result.json",
        help="Path to robustness result JSON.",
    )
    parser.add_argument(
        "--output-svg",
        default="experiments/data/RA/RobustFUT/mean_assertion_error_count_comparison.svg",
        help="Main output SVG path (panel figure).",
    )
    parser.add_argument(
        "--output-dumbbell-svg",
        default=None,
        help="Optional dumbbell SVG output path.",
    )
    parser.add_argument(
        "--output-slope-svg",
        default=None,
        help="Optional slope SVG output path.",
    )
    parser.add_argument(
        "--output-2col-svg",
        default="experiments/data/RA/RobustFUT/mean_assertion_error_count_comparison_2col.svg",
        help="Double-column optimized SVG output path.",
    )
    parser.add_argument(
        "--output-table-svg",
        default="experiments/data/RA/RobustFUT/mean_assertion_error_count_comparison_table.svg",
        help="Double-column optimized table SVG output path.",
    )
    parser.add_argument(
        "--output-table-csv",
        default="experiments/data/RA/RobustFUT/mean_assertion_error_count_comparison_table.csv",
        help="CSV table output path.",
    )
    parser.add_argument(
        "--output-table-md",
        default="experiments/data/RA/RobustFUT/mean_assertion_error_count_comparison_table.md",
        help="Markdown table output path.",
    )
    parser.add_argument(
        "--title",
        default="Roubst SUT Decreases Mean Assertion Error Count Across Baselines",
        help="Title for the main panel figure.",
    )
    parser.add_argument(
        "--title-2col",
        default="Roubst SUT vs Baselines on Mean Assertion Error Count",
        help="Title for the double-column optimized figure.",
    )
    parser.add_argument(
        "--robust-label",
        default="Roubst SUT",
        help="Label for the current/best method.",
    )
    parser.add_argument(
        "--table-title",
        default="Table: Mean Assertion Error Count Comparison",
        help="Title for the table SVG.",
    )
    parser.add_argument(
        "--normalize-by",
        type=float,
        default=1.0,
        help="Divide all metric values by this factor before plotting/tabling (e.g., 2 for two tools).",
    )
    args = parser.parse_args()

    payload = load_json(args.result_json)
    data = normalize_data(extract_plot_data(payload), args.normalize_by)
    dumbbell_svg, slope_svg = derive_paths(args.output_svg, args.output_dumbbell_svg, args.output_slope_svg)
    table_headers, table_rows = build_table_rows(data=data, robust_label=args.robust_label)

    plot_main_panel(data=data, out_path=args.output_svg, title=args.title, robust_label=args.robust_label)
    plot_dumbbell(data=data, out_path=dumbbell_svg, robust_label=args.robust_label)
    plot_slope(data=data, out_path=slope_svg, robust_label=args.robust_label)
    plot_double_column_summary(
        data=data,
        out_path=args.output_2col_svg,
        title=args.title_2col,
        robust_label=args.robust_label,
    )
    plot_table_svg(
        out_path=args.output_table_svg,
        title=args.table_title,
        headers=table_headers,
        rows=table_rows,
        robust_label=args.robust_label,
    )
    write_csv(args.output_table_csv, table_headers, table_rows)
    write_markdown_table(args.output_table_md, table_headers, table_rows)

    print(f"Wrote figure: {args.output_svg}")
    print(f"Wrote figure: {dumbbell_svg}")
    print(f"Wrote figure: {slope_svg}")
    print(f"Wrote figure: {args.output_2col_svg}")
    print(f"Wrote table: {args.output_table_svg}")
    print(f"Wrote table: {args.output_table_csv}")
    print(f"Wrote table: {args.output_table_md}")
    print(
        "Values -> "
        f"{args.robust_label}: {data['robust']:.6f}, "
        f"all: {data['all']:.6f}, "
        f"testUsageOnly: {data['testUsageOnly']:.6f}, "
        f"ProductionUsageOnly: {data['ProductionUsageOnly']:.6f}, "
        f"normalized_by: {args.normalize_by:g}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
