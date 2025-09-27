export PYTHONPATH=/LSPRAG/experiments/projects/tornado:/LSPRAG/experiments/projects/tornado/src:/LSPRAG/experiments/projects/tornado/src/black:/LSPRAG/experiments/projects/tornado/crawl4ai

echo "&&&& LSPRAG &&&&"

echo "### LSPRAG - tornado - deepseek-chat - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/lsprag/1/deepseek-chat/results/final \
  --runner pytest

echo "### LSPRAG - tornado - gpt-4o - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/lsprag/1/gpt-4o/results/final \
  --runner pytest

echo "### LSPRAG - tornado - gpt-4o-mini - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/lsprag/2/gpt-4o-mini/results/final \
  --runner pytest

echo "&&&& NAIVE &&&&"

echo "### NAIVE - tornado - deepseek-chat - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/naive/1/deepseek-chat/results/final \
  --runner pytest

echo "### NAIVE - tornado - gpt-4o - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/naive/1/gpt-4o/results/final \
  --runner pytest

echo "### NAIVE - tornado - gpt-4o-mini - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/naive/1/gpt-4o-mini/results/final \
  --runner pytest

echo "&&&& SYMPROMPT &&&&"

echo "### SYMPROMPT - tornado - deepseek-chat - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/symprompt/1/deepseek-chat/results/final \
  --runner pytest

echo "### SYMPROMPT - tornado - gpt-4o - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/symprompt/1/gpt-4o/results/final \
  --runner pytest

echo "### SYMPROMPT - tornado - gpt-4o-mini - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/symprompt/1/gpt-4o-mini/results/final \
  --runner pytest

echo "&&&& DraCo &&&&"

echo "### DraCo - tornado - deepseek-chat - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/tornado/draco/DraCo_deepseek-chat_20250617_185252/codes \
    --runner pytest

echo "### DraCo - tornado - gpt-4o - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/tornado/draco/DraCo_gpt-4o_20250617_163610/codes \
    --runner pytest

echo "### DraCo - tornado - gpt-4o-mini - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/tornado/draco/DraCo_gpt-4o-mini_20250617_150750/codes \
    --runner pytest

echo "&&&& code_qa &&&&"

echo "### code_qa - tornado - deepseek-chat - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/black/code_qa/codeQA_deepseek-chat_20250708_130455/codes \
    --runner pytest

echo "### code_qa - tornado - gpt-4o - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/tornado/code_qa/codeQA_gpt-4o_20250531_133827/codes \
    --runner pytest

echo "### code_qa - tornado - gpt-4o-mini - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/tornado/code_qa/codeQA_gpt-4o-mini_20250531_121207/codes \
    --runner pytest

echo "&&&& standard &&&&"

echo "### standard - tornado - deepseek-chat - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/tornado/standard/standardRag_deepseek-chat_20250617_152056/codes/tornado \
    --runner pytest

echo "### standard - tornado - gpt-4o - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/tornado/standard/standardRag_gpt-4o_20250601_222641/codes/tornado \
    --runner pytest

echo "### standard - tornado - deepseek-chat - pytest"
python /LSPRAG/scripts/old_compute_mutation_score.py \
    --project-root /LSPRAG/experiments/projects/tornado \
    --module-root /LSPRAG/experiments/projects/tornado \
    --test-mapping /LSPRAG/experiments/config/tornado_test_file_baselines.json \
    --test-dir /LSPRAG/experiments/data/main_result/tornado/standard/standardRag_gpt-4o-mini_20250617_064926/codes/tornado \
    --runner pytest
