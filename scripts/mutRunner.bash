export PYTHONPATH=/LSPAI/experiments/projects/black:/LSPAI/experiments/projects/black/src:/LSPAI/experiments/projects/black/src/black:/LSPAI/experiments/projects/black/crawl4ai

echo "&&&& LSPRAG &&&&"

echo "### LSPRAG - black - deepseek-chat - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/lsprag/1/deepseek-chat/results/final \
  --runner pytest

echo "### LSPRAG - black - gpt-4o - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/lsprag/1/gpt-4o/results/final \
  --runner pytest

echo "### LSPRAG - black - gpt-4o-mini - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/lsprag/1/gpt-4o-mini/results/final \
  --runner pytest

echo "&&&& NAIVE &&&&"

echo "### NAIVE - black - deepseek-chat - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/naive/1/deepseek-chat/results/final \
  --runner pytest

echo "### NAIVE - black - gpt-4o - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/naive/1/gpt-4o/results/final \
  --runner pytest

echo "### NAIVE - black - gpt-4o-mini - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/naive/1/gpt-4o-mini/results/final \
  --runner pytest

echo "&&&& SYMPROMPT &&&&"

echo "### SYMPROMPT - black - deepseek-chat - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/symprompt/1/deepseek-chat/results/final \
  --runner pytest

echo "### SYMPROMPT - black - gpt-4o - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/symprompt/1/gpt-4o/results/final \
  --runner pytest

echo "### SYMPROMPT - black - gpt-4o-mini - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
  --project-root /LSPAI/experiments/projects/black \
  --module-root /LSPAI/experiments/projects/black \
  --test-mapping /LSPAI/experiments/config/black_test_file_map.json \
  --test-dir /LSPAI/experiments/data/main_result/black/symprompt/1/gpt-4o-mini/results/final \
  --runner pytest

echo "&&&& DraCo &&&&"

echo "### DraCo - black - deepseek-chat - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/draco/DraCo_deepseek-chat_20250613_061851/codes \
    --runner pytest

echo "### DraCo - black - gpt-4o - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/draco/DraCo_gpt-4o_20250610_092532/codes \
    --runner pytest

echo "### DraCo - black - gpt-4o-mini - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/draco/DraCo_gpt-4o-mini_20250608_143055/codes \
    --runner pytest

echo "&&&& code_qa &&&&"

echo "### code_qa - black - deepseek-chat - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/code_qa/codeQA_deepseek-chat_20250531_112041/codes \
    --runner pytest

echo "### code_qa - black - gpt-4o - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/code_qa/codeQA_gpt-4o_20250706_090747/codes \
    --runner pytest

echo "### code_qa - black - gpt-4o-mini - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/code_qa/codeQA_gpt-4o-mini_20250531_110321/codes \
    --runner pytest

echo "&&&& standard &&&&"

echo "### standard - black - deepseek-chat - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/standard/standardRag_deepseek-chat_20250601_150311/codes \
    --runner pytest

echo "### standard - black - gpt-4o - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/standard/standardRag_gpt-4o_20250601_153252/codes \
    --runner pytest

echo "### standard - black - deepseek-chat - pytest"
python /LSPAI/scripts/compute_mutation_score.py \
    --project-root /LSPAI/experiments/projects/black \
    --module-root /LSPAI/experiments/projects/black \
    --test-mapping /LSPAI/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPAI/experiments/data/main_result/black/standard/standardRag_gpt-4o-mini_20250601_154022/codes \
    --runner pytest

mut.py --runner pytest --path /LSPAI/experiments/projects/black/src --path /LSPAI/experiments/projects/black --path /LSPAI/experiments/data/main_result/black/standard/standardRag_deepseek-chat_20250601_150311/codes --target src.blib2to3.pytree --unit-test update_sibling_maps_4553_test --report /LSPAI/experiments/data/main_result/black/standard/standardRag_deepseek-chat_20250601_150311/codes-muation-logs/update_sibling_maps_4553_test.report.txt --path /LSPAI/experiments/data/main_result/black/standard/standardRag_deepseek-chat_20250601_150311/codes/src/blib2to3

mut.py --runner pytest --path /LSPAI/experiments/projects/black/src --path /LSPAI/experiments/projects/black --path /LSPAI/experiments/data/main_result/black/standard/standardRag_deepseek-chat_20250601_150311/codes --target src.black.linegen --unit-test rhs_6729_test --report /LSPAI/experiments/data/main_result/black/standard/standardRag_deepseek-chat_20250601_150311/codes-muation-logs/rhs_6729_test.report.txt --path /LSPAI/experiments/data/main_result/black/standard/standardRag_deepseek-chat_20250601_150311/codes/src/black