import json
import os
import glob
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# 1. Gather all JSON files
# Adjust the pattern to match your actual file paths or naming scheme
json_files = glob.glob("/LSPAI/experiments/data/**/*.json", recursive=True)

data = []

# 2. Loop through each JSON file, load the data, and append to a list
for file_path in json_files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = json.load(f)
        
    # Use the file's name (minus extension) as the "Project" name
    project_name = os.path.splitext(os.path.basename(file_path))[0]
    
    # For each dictionary in the JSON list, extract `lineNum` as method size
    for entry in content:
        data.append({
            "Project": project_name,
            "MethodSize": entry["lineNum"]
        })

# 3. Create a DataFrame from all your collected data
df = pd.DataFrame(data)

# 4. Get method counts per project
method_counts = df["Project"].value_counts()

# 5. Create the combined figure: violin plot (left) and bar chart (right)
fig, ax = plt.subplots(nrows=1, ncols=2, figsize=(14, 6), gridspec_kw={'width_ratios': [2, 1]})

# Violin plot for method size distribution
sns.violinplot(x="Project", y="MethodSize", data=df, ax=ax[0])
ax[0].set_title("Method Size Distribution per Project")
ax[0].set_ylabel("Method Size (Lines of Code)")
ax[0].set_xlabel("Project")

# Bar plot for total number of methods
sns.barplot(x=method_counts.index, y=method_counts.values, ax=ax[1])
ax[1].set_title("Total Number of Methods per Project")
ax[1].set_ylabel("Method Count")
ax[1].set_xlabel("Project")

plt.tight_layout()
plt.show()
