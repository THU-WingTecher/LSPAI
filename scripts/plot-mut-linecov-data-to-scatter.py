import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from pathlib import Path
from matplotlib.lines import Line2D

projects = ["black", "Tornado", "TheFuck", "Youtube-dl", "sanic"]
models = ["DS", "GPT", "HK"]
tools = ["CC", "OC", "LSP"]

line_rows = {
    "CC base":       [66, np.nan, 56, 42, np.nan, 52, 59, np.nan, 57, 27, np.nan, 27, 28, np.nan, 26],
    "CC CORASSERT":  [60, np.nan, 45, 42, np.nan, 44, 58, np.nan, 58, 27, np.nan, 27, 29, np.nan, 27],
    "OC base":       [59, 50, 61, 54, 51, 55, 64, 60, 61, 26, 28, 28, 32, 38, 33],
    "OC CORASSERT":  [64, 54, 63, 43, 51, 52, 61, 58, 60, 27, 28, 27, 30, 34, 28],
    "LSP base":      [59, 52, 58, 55, 57, 50, 49, 61, 57, 27, 27, 27, 33, 35, 26],
    "LSP CORASSERT": [57, 55, 59, 51, 54, 51, 59, 60, 57, 27, 28, 27, 36, 38, 27],
}
mut_rows = {
    "CC base":       [0, np.nan, 0, 0, np.nan, 0, 19.58, np.nan, 44.98, 19.72, np.nan, 26.02, 17.87, np.nan, 19.06],
    "CC CORASSERT":  [0, np.nan, 0, 0, np.nan, 0, 63.37, np.nan, 41.44, 9.46, np.nan, 21.46, 17.06, np.nan, 18.07],
    "OC base":       [0, 0, 0, 0, 0, 0, 44.78, 36.14, 47.13, 28.95, 10.48, 2.53, 8.77, 31.50, 13.86],
    "OC CORASSERT":  [0, 0, 0, 0, 0, 0, 46.02, 38.04, 52.56, 9.92, 17.54, 15.19, 13.48, 21.13, 12.67],
    "LSP base":      [0, 0, 0, 0, 0, 0, 13.46, 36.24, 57.50, 19.14, 3.05, 21.18, 9.58, 20.01, 8.50],
    "LSP CORASSERT": [0, 0, 0, 0, 0, 0, 41.20, 42.32, 44.90, 31.93, 20.93, 11.06, 19.40, 21.37, 11.87],
}

cols = [f"{p} {m}" for p in projects for m in models]
line_df = pd.DataFrame.from_dict(line_rows, orient="index", columns=cols)
mut_df = pd.DataFrame.from_dict(mut_rows, orient="index", columns=cols)

markers = {"CC": "o", "OC": "s", "LSP": "^"}
default_colors = plt.rcParams['axes.prop_cycle'].by_key()['color']
project_colors = {p: default_colors[i % len(default_colors)] for i, p in enumerate(projects)}

def make_long(df, metric):
    rows = []
    for tool in tools:
        for project in projects:
            for model in models:
                col = f"{project} {model}"
                base = df.loc[f"{tool} base", col]
                cor = df.loc[f"{tool} CORASSERT", col]
                if pd.notna(base) and pd.notna(cor):
                    rows.append({
                        "metric": metric,
                        "tool": tool,
                        "project": project,
                        "model": model,
                        "baseline": float(base),
                        "corassert": float(cor),
                    })
    return pd.DataFrame(rows)

long_df = pd.concat([
    make_long(line_df, "Line Coverage"),
    make_long(mut_df, "Mutation Score")
], ignore_index=True)

def nice_limit(values, pad_low=2, pad_high=2):
    vmin = float(np.nanmin(values))
    vmax = float(np.nanmax(values))
    return max(0, np.floor(vmin - pad_low)), np.ceil(vmax + pad_high)

fig, axes = plt.subplots(3, 2, figsize=(10.5, 10.6))
line_sub = long_df[long_df["metric"] == "Line Coverage"]
mut_sub = long_df[long_df["metric"] == "Mutation Score"]
line_min, line_max = nice_limit(np.concatenate([line_sub["baseline"].values, line_sub["corassert"].values]), 2, 2)
mut_min, mut_max = nice_limit(np.concatenate([mut_sub["baseline"].values, mut_sub["corassert"].values]), 2, 2)
metric_info = [("Line Coverage", 3, line_min, line_max), ("Mutation Score", 5, mut_min, mut_max)]

panel_labels = ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)"]
label_idx = 0
for i, model in enumerate(models):
    for j, (metric, band, xmin, xmax) in enumerate(metric_info):
        ax = axes[i, j]
        sdf = long_df[(long_df["metric"] == metric) & (long_df["model"] == model)].copy()
        xx = np.linspace(xmin, xmax, 200)
        ax.fill_between(xx, xx - band, xx + band, alpha=0.12, zorder=0)
        ax.plot([xmin, xmax], [xmin, xmax], linestyle="--", linewidth=1, zorder=1)

        for tool in tools:
            for project in projects:
                tpdf = sdf[(sdf["tool"] == tool) & (sdf["project"] == project)]
                if len(tpdf) == 0:
                    continue
                ax.scatter(
                    tpdf["baseline"], tpdf["corassert"],
                    marker=markers[tool], s=70, c=project_colors[project],
                    edgecolors="black", linewidths=0.35, zorder=2
                )

        ax.set_xlim(xmin, xmax)
        ax.set_ylim(xmin, xmax)
        ax.grid(True, alpha=0.22)
        if i == 0:
            ax.set_title(metric, fontsize=12, pad=4)
        if j == 0:
            ax.set_ylabel(f"{model}\nCORASSERT (%)", fontsize=10.5)
        if i == 2:
            ax.set_xlabel("Baseline (%)", fontsize=10)
        ax.text(0.02, 0.96, panel_labels[label_idx], transform=ax.transAxes,
                fontsize=10, va="top", ha="left")
        label_idx += 1

# tighter subplot spacing and smaller bottom reserve
fig.subplots_adjust(left=0.085, right=0.985, top=0.975, bottom=0.13, wspace=0.16, hspace=0.18)

handles = [
    Line2D([0], [0], marker=markers["CC"], linestyle="None", color="black", markersize=6.5, label="ClaudeCode"),
    Line2D([0], [0], marker=markers["OC"], linestyle="None", color="black", markersize=6.5, label="OpenCode"),
    Line2D([0], [0], marker=markers["LSP"], linestyle="None", color="black", markersize=6.5, label="LSPRAG"),
]
handles += [
    Line2D([0], [0], marker="o", linestyle="None", color=project_colors[p], markersize=6.5, label=p)
    for p in projects
]
handles += [
    Line2D([0], [0], linewidth=6, alpha=0.12, color="black", label="Preservation band"),
    Line2D([0], [0], linestyle="--", color="black", label="y = x"),
]

fig.legend(
    handles=handles,
    loc="lower center",
    ncol=5,
    fontsize=8.7,
    bbox_to_anchor=(0.5, 0.058),
    frameon=False,
    handletextpad=0.35,
    columnspacing=0.7,
    borderaxespad=0.0,
    labelspacing=0.35,
)

out = Path("/mnt/data/icse_3x2_scatter_demo_tighter_gap.png")
fig.savefig(out, dpi=260, bbox_inches="tight")
plt.close(fig)
print(f"Saved to {out}")
