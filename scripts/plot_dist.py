import json
import os
import glob
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# plt.rcParams['text.usetex'] = True
# plt.rcParams['font.family'] = 'serif'

# 1. Gather all JSON files
# Adjust the pattern to match your actual file paths or naming scheme
json_files = glob.glob("/LSPAI/experiments/data/*/taskList.json")
assert len(json_files) == 6, f"Expected 6 JSON files, got {len(json_files)}"
data = []

# 2. Loop through each JSON file, load the data, and append to a list
project_name_mapping = {
    "black": "BAK",
    "cobra": "COB",
    "logrus": "LOG",
    "crawl4ai": "C4AI",
    "commons-cli": "CLI",
    "commons-csv": "CSV"
}

for file_path in json_files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = json.load(f)
    
    original_project_name = file_path.split("/")[-2]
    # Use the mapping to get the LaTeX formatted name
    project_name = project_name_mapping.get(original_project_name, original_project_name)
    
    for entry in content:
        data.append({
            "Project": project_name,
            "MethodSize": entry["lineNum"]
        })

# Count total methods per project
df = pd.DataFrame(data)
print(df.head())
method_counts = df['Project'].value_counts().sort_index()
print("\nNumber of methods per project:")
print("-" * 30)
for project, count in method_counts.items():
    print(f"{project}: {count} methods")
print("-" * 30)
# Set up the figure
fig, axes = plt.subplots(nrows=2, ncols=1, figsize=(10, 10), sharex=False, gridspec_kw={'height_ratios': [1, 2]})

# Bar plot for total number of methods
# sns.barplot(x=method_counts.index, y=method_counts.values, ax=axes[0])
# axes[0].set_title('Total Number of Methods per Project')
# axes[0].set_ylabel('Method Count')
# axes[0].set_xlabel('')
plt.figure(figsize=(12, 6))

# Create violin plot with increased font sizes and LaTeX formatting
sns.violinplot(x='Project', y='MethodSize', data=df, palette='Set2')
plt.ylabel('Lines of Codes', fontsize=18)  # Remove LaTeX formatting
plt.grid(True, axis='y', linestyle='--', alpha=0.7)  # Only horizontal grid lines with dashed style
plt.grid(True, axis='x', linestyle='--', alpha=0.7)  # Only horizontal grid lines with dashed style

# Increase tick label sizes
# plt.xticks([])  
plt.xticks(range(len(df['Project'].unique())), df['Project'].unique(), fontsize=22)
plt.xlabel('', fontsize=14)  # Remove LaTeX formatting
plt.yticks(fontsize=14)

# Add statistical markers
# Calculate median and quartiles for each project
# for i, project in enumerate(df['Project'].unique()):
#     project_data = df[df['Project'] == project]['MethodSize']
#     median = project_data.median()
#     q1 = project_data.quantile(0.25)
#     q3 = project_data.quantile(0.75)
    
#     # Plot median point
#     plt.plot(i, median, 'ro', markersize=8, label='Median' if i == 0 else "")
#     # Plot quartile points
#     plt.plot(i, q1, 'ko', markersize=6, label='Q1/Q3' if i == 0 else "")
#     plt.plot(i, q3, 'ko', markersize=6)

# # Add legend
# plt.legend(loc='upper right')
# plt.xlabel('Project')
# 3. Create a DataFrame from all your collected data
# # 4. Get method counts per project
# method_counts = df["Project"].value_counts()

# fig, axes = plt.subplots(nrows=2, ncols=3, figsize=(18, 12))
# axes = axes.flatten()  # Flatten the 2x3 array to make it easier to iterate

# # Create individual violin plots
# for idx, (project, project_data) in enumerate(df.groupby("Project")):
#     sns.violinplot(y="MethodSize", data=project_data, ax=axes[idx])
#     axes[idx].set_title(f"{project} Method Size Distribution")
#     axes[idx].set_ylabel("Method Size (Lines of Code)")

# plt.tight_layout()

# Bar plot for total number of methods
# sns.barplot(x=method_counts.index, y=method_counts.values, ax=ax[1])
# ax[1].set_title("Total Number of Methods per Project")
# ax[1].set_ylabel("Method Count")
# ax[1].set_xlabel("Project")

plt.tight_layout()
plt.savefig("out/method_size_distribution.png", dpi=300)  # Higher DPI for better quality
plt.savefig("out/method_size_distribution.pdf", format='pdf')  # Save as PDF
plt.show()
