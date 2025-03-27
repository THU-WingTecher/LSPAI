import os
from pathlib import Path
import shutil
def find_uncompiled_files(src_dir, compiled_dir):
    uncompiled = []

    # Walk through the source directory and collect all .java file names (without extension)
    for root, _, files in os.walk(src_dir):
        for file in files:
            if file.endswith(".java"):
                base_name = Path(file).stem
                # Build the expected .class path in compiled_dir
                relative_path = os.path.relpath(root, src_dir)
                class_file_path = os.path.join(compiled_dir, relative_path, base_name + ".class")

                if not os.path.exists(class_file_path):
                    # Store the relative .java path for reporting
                    java_file_path = os.path.join(relative_path, file)
                    uncompiled.append(java_file_path)

    return uncompiled

# if __name__ == "__main__":
#     # Change these paths as needed
#     source_folder = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_20_2025__21_10_06/deepseek-reasoner"
#     compiled_folder =  f"{source_folder}-compiled"

#     print("=============================DEEPSEEK REASONER=============================")
#     result = find_uncompiled_files(source_folder, compiled_folder)

#     print("Uncompiled .java files:")
#     for filename in result:
#         print(filename)

#     print("=============================DEEPSEEK REASONER=============================")
#     result = find_uncompiled_files(source_folder, compiled_folder)

#     print("Uncompiled .java files:")
#     for filename in result:
#         print(filename)

#     source_folder = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_18_2025__16_10_41/gpt-4o-mini"
#     compiled_folder = f"{source_folder}-compiled"

#     print("=============================GPT-4O-MINI=============================")
#     result = find_uncompiled_files(source_folder, compiled_folder)

#     print("Uncompiled .java files:")
#     for filename in result:
#         print(filename)

#     source_folder = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_18_2025__15_33_48/gpt-4o"
#     compiled_folder = f"{source_folder}-compiled"

#     print("=============================GPT-4O=============================")
#     result = find_uncompiled_files(source_folder, compiled_folder)

#     print("Uncompiled .java files:")
#     for filename in result:
#         print(filename)

if __name__ == "__main__":
    # Dictionary to store uncompiled files for each model
    # model_results = {}
    
    # # Collect results for deepseek-reasoner
    # source_folder = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_20_2025__21_10_06/deepseek-reasoner"
    # compiled_folder = f"{source_folder}-compiled"
    # model_results['deepseek-reasoner'] = set(find_uncompiled_files(source_folder, compiled_folder))

    # # Collect results for gpt-4o-mini
    # source_folder = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_18_2025__16_10_41/gpt-4o-mini"
    # compiled_folder = f"{source_folder}-compiled"
    # model_results['gpt-4o-mini'] = set(find_uncompiled_files(source_folder, compiled_folder))

    # # Collect results for gpt-4o
    # source_folder = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_18_2025__15_33_48/gpt-4o"
    # compiled_folder = f"{source_folder}-compiled"
    # model_results['gpt-4o'] = set(find_uncompiled_files(source_folder, compiled_folder))

    # # Print table header
    # print("\nAnalysis of Incompilable Cases:")
    # print("-" * 80)
    # print("Model Combination | Number of Incompilable Files")
    # print("-" * 80)

    # # Individual models
    # for model in model_results:
    #     print(f"{model:<30} | {len(model_results[model])}")

    # # Combinations of two models
    # model_names = list(model_results.keys())
    # for i in range(len(model_names)):
    #     for j in range(i+1, len(model_names)):
    #         model1, model2 = model_names[i], model_names[j]
    #         common_files = model_results[model1].intersection(model_results[model2])
    #         print(f"{model1} && {model2:<15} | {len(common_files)}")

    # # All three models
    # common_all = model_results['deepseek-reasoner'].intersection(
    #     model_results['gpt-4o-mini']).intersection(
    #     model_results['gpt-4o'])
    # print(f"All models                      | {len(common_all)}")

# On the base of this, 
# I want to print out the the two things. 
# deepseek-reasoner don't have the name, but other two have. 
# or 
# deepseek-reasoner hae the name, but other two dont have

    model_results = {}
    
    # Collect results for each model
    source_folder_ds = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_20_2025__21_10_06/deepseek-reasoner"
    log_folder_ds = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_20_2025__21_10_06/deepseek-reasoner/logs/deepseek-reasoner"
    compiled_folder_ds = f"{source_folder_ds}-compiled"
    model_results['deepseek-reasoner'] = set(find_uncompiled_files(source_folder_ds, compiled_folder_ds))

    source_folder_omi = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_18_2025__16_10_41/gpt-4o-mini"
    log_folder_omi = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_18_2025__16_10_41/gpt-4o-mini/logs/gpt-4o-mini"
    compiled_folder_omi = f"{source_folder_omi}-compiled"
    model_results['gpt-4o-mini'] = set(find_uncompiled_files(source_folder_omi, compiled_folder_omi))

    source_folder_gpt = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_18_2025__15_33_48/gpt-4o"
    log_folder_gpt = "/LSPAI/experiments/projects/commons-cli/results_agent_detailed_3_18_2025__15_33_48/gpt-4o/logs/gpt-4o"
    compiled_folder_gpt = f"{source_folder_gpt}-compiled"
    model_results['gpt-4o'] = set(find_uncompiled_files(source_folder_gpt, compiled_folder_gpt))

    # Create base output directory
    output_base = "/LSPAI/experiments/projects/commons-cli/compilation_analysis"
    os.makedirs(output_base, exist_ok=True)

    # Files that only GPT models have (not in deepseek)
    gpt_common = model_results['gpt-4o'].intersection(model_results['gpt-4o-mini'])
    only_in_gpt = gpt_common - model_results['deepseek-reasoner']

    # Create directory for GPT-only failures
    gpt_only_dir = os.path.join(output_base, "gpt_only_failures")
    os.makedirs(gpt_only_dir, exist_ok=True)

    print("\nFiles that both GPT models fail to compile but Deepseek succeeds:")
    print("-" * 80)
    for file in only_in_gpt:
        print(file)
        # Copy file from deepseek-reasoner (since it's the successful version)
        ds_src_path = os.path.join(source_folder_ds, file)
        ds_dst_path = os.path.join(gpt_only_dir, "deepseek-reasoner/" + os.path.basename(file))
        os.makedirs(os.path.dirname(ds_dst_path), exist_ok=True)
        # find a file that starts with os.path.basename(file)
        ds_log_path = [f for f in os.listdir(log_folder_ds) if f.startswith(os.path.basename(file).replace(".java",""))]
        if len(ds_log_path) == 0 :
            continue
        ds_log_path = ds_log_path[0]
        ds_log_path = os.path.join(log_folder_ds, ds_log_path)
        ds_log_dst_path = os.path.join(gpt_only_dir, "deepseek-reasoner/" + ds_log_path)
        os.makedirs(os.path.dirname(ds_log_dst_path), exist_ok=True)

        omi_src_path = os.path.join(source_folder_omi, file)
        omi_dst_path = os.path.join(gpt_only_dir, "gpt-4o-mini/" + os.path.basename(file))
        os.makedirs(os.path.dirname(omi_dst_path), exist_ok=True)
        omi_log_path = [f for f in os.listdir(log_folder_omi) if f.startswith(os.path.basename(file).replace(".java",""))]
        if len(omi_log_path) == 0 :
            continue
        omi_log_path = omi_log_path[0]
        omi_log_path = os.path.join(log_folder_omi, omi_log_path)
        omi_log_dst_path = os.path.join(gpt_only_dir, "gpt-4o-mini/" + omi_log_path)
        os.makedirs(os.path.dirname(omi_log_dst_path), exist_ok=True)

        gpt_src_path = os.path.join(source_folder_gpt, file)
        gpt_dst_path = os.path.join(gpt_only_dir, "gpt-4o/" + os.path.basename(file))
        os.makedirs(os.path.dirname(gpt_dst_path), exist_ok=True)
        gpt_log_path = [f for f in os.listdir(log_folder_gpt) if f.startswith(os.path.basename(file).replace(".java",""))]
        if len(gpt_log_path) == 0 :
            continue
        gpt_log_path = gpt_log_path[0]
        gpt_log_path = os.path.join(log_folder_gpt, gpt_log_path)
        gpt_log_dst_path = os.path.join(gpt_only_dir, "gpt-4o/" + gpt_log_path)
        os.makedirs(os.path.dirname(gpt_log_dst_path), exist_ok=True)

        if os.path.exists(ds_src_path):
            shutil.copy2(ds_src_path, ds_dst_path)
            shutil.copy2(ds_log_path, ds_log_dst_path)
        if os.path.exists(omi_src_path):
            shutil.copy2(omi_src_path, omi_dst_path)
            shutil.copy2(omi_log_path, omi_log_dst_path)
        if os.path.exists(gpt_src_path):
            shutil.copy2(gpt_src_path, gpt_dst_path)
            shutil.copy2(gpt_log_path, gpt_log_dst_path)

    # Files that only deepseek has (not in GPT models)
    only_in_deepseek = model_results['deepseek-reasoner'] - (model_results['gpt-4o'].union(model_results['gpt-4o-mini']))

    # Create directory for Deepseek-only failures
    deepseek_only_dir = os.path.join(output_base, "deepseek_only_failures")
    os.makedirs(deepseek_only_dir, exist_ok=True)

    print("\nFiles that only Deepseek fails to compile but both GPT models succeed:")
    print("-" * 80)
    for file in only_in_deepseek:
        print(file)
        # Copy file from deepseek-reasoner (since it's the successful version)
        print(file)
        # Copy file from deepseek-reasoner (since it's the successful version)
        ds_src_path = os.path.join(source_folder_ds, file)
        ds_dst_path = os.path.join(deepseek_only_dir, "deepseek-reasoner/" + os.path.basename(file))
        os.makedirs(os.path.dirname(ds_dst_path), exist_ok=True)
        # find a file that starts with os.path.basename(file)
        ds_log_path = [f for f in os.listdir(log_folder_ds) if f.startswith(os.path.basename(file).replace(".java",""))]
        if len(ds_log_path) == 0 :
            continue
        ds_log_path = ds_log_path[0]
        ds_log_path = os.path.join(log_folder_ds, ds_log_path)
        ds_log_dst_path = os.path.join(deepseek_only_dir, "deepseek-reasoner/" + ds_log_path)
        os.makedirs(os.path.dirname(ds_log_dst_path), exist_ok=True)

        omi_src_path = os.path.join(source_folder_omi, file)
        omi_dst_path = os.path.join(deepseek_only_dir, "gpt-4o-mini/" + os.path.basename(file))
        os.makedirs(os.path.dirname(omi_dst_path), exist_ok=True)
        omi_log_path = [f for f in os.listdir(log_folder_omi) if f.startswith(os.path.basename(file).replace(".java",""))]
        if len(omi_log_path) == 0 :
            continue
        omi_log_path = omi_log_path[0]
        omi_log_path = os.path.join(log_folder_omi, omi_log_path)
        omi_log_dst_path = os.path.join(deepseek_only_dir, "gpt-4o-mini/" + omi_log_path)
        os.makedirs(os.path.dirname(omi_log_dst_path), exist_ok=True)

        gpt_src_path = os.path.join(source_folder_gpt, file)
        gpt_dst_path = os.path.join(deepseek_only_dir, "gpt-4o/" + os.path.basename(file))
        os.makedirs(os.path.dirname(gpt_dst_path), exist_ok=True)
        gpt_log_path = [f for f in os.listdir(log_folder_gpt) if f.startswith(os.path.basename(file).replace(".java",""))]
        if len(gpt_log_path) == 0 :
            continue
        gpt_log_path = gpt_log_path[0]
        gpt_log_path = os.path.join(log_folder_gpt, gpt_log_path)
        gpt_log_dst_path = os.path.join(deepseek_only_dir, "gpt-4o/" + gpt_log_path)
        os.makedirs(os.path.dirname(gpt_log_dst_path), exist_ok=True)

        if os.path.exists(ds_src_path):
            shutil.copy2(ds_src_path, ds_dst_path)
            shutil.copy2(ds_log_path, ds_log_dst_path)
        if os.path.exists(omi_src_path):
            shutil.copy2(omi_src_path, omi_dst_path)
            shutil.copy2(omi_log_path, omi_log_dst_path)
        if os.path.exists(gpt_src_path):
            shutil.copy2(gpt_src_path, gpt_dst_path)
            shutil.copy2(gpt_log_path, gpt_log_dst_path)

    print(f"\nFiles have been copied to:")
    print(f"GPT-only failures: {gpt_only_dir}")
    print(f"Deepseek-only failures: {deepseek_only_dir}")