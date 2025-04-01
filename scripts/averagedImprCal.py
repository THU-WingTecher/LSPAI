# Define the data
# data = {
#     "CLI": {
#         "GPT4o": [57.04, 35.14, 56.52, 40.58],
#         "GPT4o-mini": [51.34, 13.30, 43.00, 17.87],
#         "DS-V3": [54.31, 28.72, 57.48, 44.93],
#     },
#     "CSV": {
#         "GPT4o": [50.53, 35.62, 55.71, 31.43],
#         "GPT4o-mini": [42.25, 17.56, 38.57, 6.43],
#         "DS-V3": [68.26, 41.01, 43.57, 10.71],
#     },
#     "LOG": {
#         "GPT4o": [42.17, 1.53, 30.00, 2.85],
#         "GPT4o-mini": [33.16, 4.76, 11.42, 3.57],
#         "DS-V3": [29.59, 8.50, 21.42, 14.28],
#     },
#     "COB": {
#         "GPT4o": [11.24, 1.23, 34.64, 5.23],
#         "GPT4o-mini": [10.72, 5.09, 16.99, 6.53],
#         "DS-V3": [14.05, 1.81, 41.17, 27.45],
#     },
#     "BAK": {
#         "GPT4o": [47.49, 44.79, 47.03, 52.96],
#         "GPT4o-mini": [35.43, 33.89, 55.29, 62.28],
#         "DS-V3": [38.04, 37.29, 85.58, 83.52],
#     },
#     "C4AI": {
#         "GPT4o": [32.76, 31.46, 75.46, 72.75],
#         "GPT4o-mini": [37.33, 28.53, 74.60, 78.88],
#         "DS-V3": [40.70, 43.45, 67.81, 64.62],
#     },
# }

# def calculate_improvement(before, after):
#     return [(after[i] - before[i]) / before[i] * 100 if before[i] != 0 else 0 for i in range(len(before))]

# # Calculate averaged improvement ratios for each project
# averaged_improvement_ratios = {}
# for project, metrics in data.items():
#     ratios = calculate_improvement(metrics["NAIVE"], metrics["LSP"])
#     averaged_improvement_ratios[project] = sum(ratios) / len(ratios)

# # Print the results
# print("Averaged Improvement Ratios (LSP compared to NAIVE) by Project:")
# for project, avg_ratio in averaged_improvement_ratios.items():
#     print(f"{project}: {avg_ratio:.2f}%")
    
# # Function to calculate improvement ratios
# def calculate_improvement(before, after):
#     return [(after[i] - before[i]) / before[i] * 100 if before[i] != 0 else 0 for i in range(len(before))]

# # Combine all improvement ratios
# all_ratios = []
# for project in data.values():
#     # Compare GPT4o-mini vs GPT4o for all metrics
#     all_ratios += calculate_improvement(project["GPT4o"], project["GPT4o-mini"])
#     # Compare DS-V3 vs GPT4o for all metrics
#     all_ratios += calculate_improvement(project["GPT4o"], project["DS-V3"])

# # Calculate overall average improvement ratio
# average_improvement = sum(all_ratios) / len(all_ratios)

# # Print the result
# print(f"Overall Averaged Improvement Ratio: {average_improvement:.2f}%")

# Define the data
data = {
    "CLI": {
        "LSP": [57.04, 51.34, 54.31],
        "NAIVE": [35.14, 13.30, 28.72],
    },
    "CSV": {
        "LSP": [50.53, 42.25, 68.26],
        "NAIVE": [35.62, 17.56, 41.01],
    },
    "LOG": {
        "LSP": [42.17, 33.16, 29.59],
        "NAIVE": [1.53, 4.76, 8.50],
    },
    "COB": {
        "LSP": [11.24, 10.72, 14.05],
        "NAIVE": [1.23, 5.09, 1.81],
    },
    "BAK": {
        "LSP": [47.49, 35.43, 38.04],
        "NAIVE": [44.79, 33.89, 37.29],
    },
    "C4AI": {
        "LSP": [32.74, 37.36, 40.70],
        "NAIVE": [32.72, 36.28, 39.69],
    },
}
data2 = {
    "CLI": {
        "LSP": [56.52, 43.00, 57,48],
        "NAIVE": [40.58, 17.87, 44.93],
    },
    "CSV": {
        "LSP": [55.71,38.57,43.57],
        "NAIVE": [31.43, 6.43, 10.71],
    },
    "LOG": {
        "LSP": [30.00, 11.42, 21.42],
        "NAIVE": [2.85, 3.57, 14.28],
    },
    "COB": {
        "LSP": [34.64, 16.99, 41.17],
        "NAIVE": [2.85, 3.57, 14.28],
    },
    "BAK": {
        "LSP": [55.00, 52.04, 71.36],
        "NAIVE": [43.18, 59.54, 67.27],
    },
    "C4AI": {
        "LSP": [54.37, 52.78, 67.90],
        "NAIVE": [49.33, 62.59, 62.86],
    },
}

# Function to calculate improvement ratio
def calculate_improvement(before, after):
    return [(after[i] - before[i]) / before[i] * 100 if before[i] != 0 else 0 for i in range(len(before))]

# Calculate averaged improvement ratios for each project
averaged_improvement_ratios = {}
for project, metrics in data.items():
    ratios = calculate_improvement(metrics["NAIVE"], metrics["LSP"])
    averaged_improvement_ratios[project] = sum(ratios) / len(ratios)

# Print the results
print("Averaged Improvement Ratios (LSP compared to NAIVE) by Project:")
for project, avg_ratio in averaged_improvement_ratios.items():
    print(f"{project}: {avg_ratio:.2f}%")


print('valid rate')
averaged_improvement_ratios = {}
for project, metrics in data2.items():
    ratios = calculate_improvement(metrics["NAIVE"], metrics["LSP"])
    averaged_improvement_ratios[project] = sum(ratios) / len(ratios)

# Print the results
print("Averaged Improvement Ratios (LSP compared to NAIVE) by Project:")
for project, avg_ratio in averaged_improvement_ratios.items():
    print(f"{project}: {avg_ratio:.2f}%")