export PYTHONPATH=/LSPRAG/experiments/projects/black:/LSPRAG/experiments/projects/black/src:/LSPRAG/experiments/projects/black/src/black:/LSPRAG/experiments/projects/black/crawl4ai

echo "&&&& LSPRAG &&&&"

echo "### LSPRAG - black - deepseek-chat - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/lsprag/3/deepseek-chat/results/final \
  --runner pytest --jobs 512

echo "### LSPRAG - black - gpt-4o - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/lsprag/3/gpt-4o/results/final \
  --runner pytest --jobs 512

echo "### LSPRAG - black - gpt-4o-mini - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/lsprag/1/gpt-4o-mini/results/final \
  --runner pytest --jobs 512

echo "&&&& NAIVE &&&&"

echo "### NAIVE - black - deepseek-chat - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/naive/2/deepseek-chat/results/final \
  --runner pytest --jobs 512

echo "### NAIVE - black - gpt-4o - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/naive/1/gpt-4o/results/final \
  --runner pytest --jobs 512

echo "### NAIVE - black - gpt-4o-mini - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/naive/1/gpt-4o-mini/results/final \
  --runner pytest --jobs 512

echo "&&&& SYMPROMPT &&&&"

echo "### SYMPROMPT - black - deepseek-chat - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/symprompt/1/deepseek-chat/results/final \
  --runner pytest --jobs 512

echo "### SYMPROMPT - black - gpt-4o - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/symprompt/1/gpt-4o/results/final \
  --runner pytest --jobs 512

echo "### SYMPROMPT - black - gpt-4o-mini - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/black \
  --module-root /LSPRAG/experiments/projects/black \
  --test-mapping /LSPRAG/experiments/config/black_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/black/symprompt/2/gpt-4o-mini/results/final \
  --runner pytest --jobs 512

echo "&&&& DraCo &&&&"

echo "### DraCo - black - deepseek-chat - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/draco/DraCo_deepseek-chat_20250613_061851/codes \
    --runner pytest --jobs 512

echo "### DraCo - black - gpt-4o - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/draco/DraCo_gpt-4o_20250610_092532/codes \
    --runner pytest --jobs 512

echo "### DraCo - black - gpt-4o-mini - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/draco/DraCo_gpt-4o-mini_20250608_143055/codes \
    --runner pytest --jobs 512

echo "&&&& code_qa &&&&"

echo "### code_qa - black - deepseek-chat - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/code_qa/codeQA_deepseek-chat_20250531_112041/codes \
    --runner pytest --jobs 512

echo "### code_qa - black - gpt-4o - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/code_qa/codeQA_gpt-4o_20250706_090747/codes \
    --runner pytest --jobs 512

echo "### code_qa - black - gpt-4o-mini - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/code_qa/codeQA_gpt-4o-mini_20250610_092916/codes \
    --runner pytest --jobs 512

echo "&&&& standard &&&&"

echo "### standard - black - deepseek-chat - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/standard/standardRag_deepseek-chat_20250706_140147/codes \
    --runner pytest --jobs 512

echo "### standard - black - gpt-4o - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/standard/standardRag_gpt-4o_20250706_143659/codes \
    --runner pytest --jobs 512

echo "### standard - black - deepseek-chat - pytest"
python /LSPRAG/scripts/compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/black \
    --module-root /LSPRAG/experiments/projects/black \
    --test-mapping /LSPRAG/experiments/config/black_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/standard/standardRag_gpt-4o-mini_20250706_143106/codes \
    --runner pytest --jobs 512
