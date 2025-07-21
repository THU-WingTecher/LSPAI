import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# --- Real Data Preparation ---
# run below command and paste it to value of each key!
# Python Projects
# python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/black/logs/gpt-4o /LSPRAG/experiments/data/cost-data/tornado/logs/gpt-4o
# Go Projects
#python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/logrus/logs/gpt-4o /LSPRAG/experiments/data/cost-data/cobra/logs/gpt-4o
# Java Projects
# python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/commons-cli/logs/gpt-4o /LSPRAG/experiments/data/cost-data/commons-csv/logs/gpt-4o
data = {
    'Python': 
    {'fix': 5591.812195121951, 'gen': 15597.84268292683, 'cfg': 217.6182926829268, 'def': 2555.5329268292685, 'ref': 295.1353658536585, 'filter': 2291.1621951219513, 'diag': 2492.423076923077, 'save': 0.28846153846153844},
    'Golang': {'fix': 13101.336, 'gen': 18576.68, 'cfg': 344.976, 'def': 2251.736, 'ref': 244.376, 'filter': 2334.056, 'diag': 3575.635135135135, 'save': 109.77027027027027},
    'Java': {'fix': 9350.845744680852, 'gen': 11433.18085106383, 'cfg': 3.202127659574468, 'def': 417.97872340425533, 'ref': 277.25531914893617, 'filter': 2072.7978723404253, 'diag': 3590.2758620689656, 'save': 1.3563218390804597}
}
process_map = {
    'fix': 'LLM (FIX)', 'gen': 'LLM (Gen)', 'cfg': 'Build CFG', 'def': 'DEF',
    'ref': 'REF', 'filter': 'Key Token Extraction', 'diag': 'Get Diagnostics'
}
records = [{'Dataset': d, 'Process': process_map[p], 'Time (ms)': t} for d, ps in data.items() for p, t in ps.items() if p != "save"]
full_df = pd.DataFrame(records)

# --- Define Final Academic, Colorblind-Safe Palette ---
color_palette = {
    'LLM (Gen)': '#5d3754', 'LLM (FIX)': '#b35900', 'Get Diagnostics': '#006400',
    'Key Token Extraction': '#93003a', 'DEF': '#00429d', 'REF': '#005b70',
    'Build CFG': '#bf1849'
    # , 'Save Code': '#5A5A5A'
}
process_order = list(color_palette.keys())

# --- Visualization Setup ---
fig, ax = plt.subplots(figsize=(8, 3))  # Reduced height from 4.2 to 2.5
sns.set_style("whitegrid")
# Set font to Times New Roman
plt.rcParams.update({'font.size': 10, 'font.family': 'serif'})
plt.rcParams['font.serif'] = ['Times New Roman'] + plt.rcParams['font.serif']

# --- Create the Bar Chart ---
time_pivot = full_df.pivot(index='Dataset', columns='Process', values='Time (ms)')[process_order]
time_pivot.plot(kind='barh', stacked=True, ax=ax, color=[color_palette[p] for p in process_order], 
                legend=False, width=0.7)  # Added width=0.7 to make bars thicker

# --- Add Advanced Annotations ---
total_widths = time_pivot.sum(axis=1)
for bar_index, (dataset_name, row) in enumerate(time_pivot.iterrows()):
    cumulative_width = 0
    callout_v_offset = 0.4
    for process_name in process_order:
        value = row[process_name]
        if value > 500:
            ax.text(cumulative_width + value / 2, bar_index, f'{value:,.0f}',
                    ha='center', va='center', color='white', fontsize=8, fontweight='bold')
        # elif 50 < value <= 500:
        #     ax.annotate(f'{process_name}: {value:.0f}',
        #                 xy=(cumulative_width + value / 2, bar_index),
        #                 xytext=(total_widths[dataset_name] + 1000, bar_index + callout_v_offset),
        #                 fontsize=8, arrowprops=dict(arrowstyle="-", color='black', connectionstyle="arc3,rad=-0.1"))
        #     callout_v_offset -= 0.25
        cumulative_width += value

# --- Integrate Totals into Y-Axis Labels ---
new_ylabels = []
for dataset_name in time_pivot.index:
    total = total_widths[dataset_name]
    new_ylabels.append(f'{dataset_name}')
    # new_ylabels.append(f'{dataset_name}\n(Total: {total:,.0f} ms)')
ax.set_yticklabels(new_ylabels, rotation=90, ha='center', va='center')  # Set alignment here

# --- Final Touches ---
# ax.set_title('Detailed Time Cost Breakdown by Language', fontsize=13)
ax.set_xlabel('Total Average Time (ms)', fontsize=10)
ax.set_ylabel('')
ax.set_xlim(0, 41000)
# ax.set_xlim(right=ax.get_xlim()[1] * 1.3)
ax.tick_params(axis='y', which='major', labelsize=10) # Removed rotation and ha from here

# --- Position the Legend Below the Plot ---
handles, labels = ax.get_legend_handles_labels()
fig.legend(handles[::-1], labels[::-1], loc='lower center',
           bbox_to_anchor=(0.5, -0), ncol=8, fontsize=7)

# --- Saving the Figure ---
sns.despine(left=True, bottom=True)
plt.tight_layout(rect=[0, 0.05, 1, 1])
plt.savefig("final_publication_figure.png", format='png', dpi=300, bbox_inches='tight')
plt.savefig("final_publication_figure.pdf", format='pdf', bbox_inches='tight')
plt.show()



