# Define the data
data = {
    "Language": ["Python", "Java", "Golang"],
    "Retrieval": [34363.95, 13065.78, 7941.88],
    "Diagnosis": [9910.5, 3761.19, 3607.63],
    "LLM-GEN": [15745.94, 13728.67, 12742.48],
    "LLM-FIX": [1111.04, 19339.12, 24456.07],
    "GEN": [1639.96, 1316.71, 1229.20],
    "FIX": [103.68, 2966.22, 3155.65]
}

# Compute averages for each numeric column
averages = {}
for key, values in data.items():
    if key != "Language":  # Skip the 'Language' column
        averages[key] = sum(values) / len(values)

# Print the updated table with the averaged row
print(f"{'Language':<12} {'Retrieval':<12} {'Diagnosis':<12} {'LLM-GEN':<12} {'LLM-FIX':<12} {'GEN':<12} {'FIX':<12}")
for i in range(len(data["Language"])):
    print(f"{data['Language'][i]:<12} {data['Retrieval'][i]:<12.2f} {data['Diagnosis'][i]:<12.2f} {data['LLM-GEN'][i]:<12.2f} {data['LLM-FIX'][i]:<12.2f} {data['GEN'][i]:<12.2f} {data['FIX'][i]:<12.2f}")
print(f"{'Averaged':<12} {averages['Retrieval']:<12.2f} {averages['Diagnosis']:<12.2f} {averages['LLM-GEN']:<12.2f} {averages['LLM-FIX']:<12.2f} {averages['GEN']:<12.2f} {averages['FIX']:<12.2f}")
