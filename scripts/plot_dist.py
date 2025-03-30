import json
import os
import glob
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# 1. Gather all JSON files
# Adjust the pattern to match your actual file paths or naming scheme
json_files = glob.glob("/LSPAI/experiments/data/**/taskList.json", recursive=True)
assert len(json_files) == 6, f"Expected 6 JSON files, got {len(json_files)}"
data = []

# 2. Loop through each JSON file, load the data, and append to a list
for file_path in json_files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = json.load(f)
    
    project_name = file_path.split("/")[-2]
    print(project_name)
    # Use the file's name (minus extension) as the "Project" name
    # project_name = dirName.split("/")[-1]
    # For each dictionary in the JSON list, extract `lineNum` as method size
    for entry in content:
        # print(entry)
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

sns.violinplot(x='Project', y='MethodSize', data=df, palette='Set2')
# plt.title('Size Distribution')
plt.ylabel('Lines of Code')
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
