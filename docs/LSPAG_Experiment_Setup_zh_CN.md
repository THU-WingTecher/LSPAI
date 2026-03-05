# LSPRAG 任务交接执行手册

更新时间: 2026-02-25

## 1. 目标与范围

- 目标: 在服务器容器中复现 LSPRAG 的 Python 实验流程，并产出可对比的 `FP rate / coverage` 结果。
- 当前优先项目: `black`、`tornado`、`thefuck`

### 2.3 拉仓库 + Node 依赖

```bash
cd /
git clone https://github.com/THU-WingTecher/LSPRAG.git
cd /LSPRAG
git checkout nightly
npm install --force
npm run compile
```

### 2.4 Miniconda（Python 实验必需）

```bash
cd /tmp
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b -p $HOME/miniconda3
$HOME/miniconda3/bin/conda init bash
source ~/.bashrc
conda --version
```

## 3. 环境变量

推荐直接使用:
我会私发给你 .env.sh文件
```bash
source /LSPRAG/.env.sh
```


## 4. Python 项目硬约束

`src/config.ts` 对路径和解释器有硬编码，目录名和 conda env 名不要改:

- `black` -> workspace: `/LSPRAG/experiments/projects/black`，python: `/root/miniconda3/envs/black/bin/python`
- `tornado` -> workspace: `/LSPRAG/experiments/projects/tornado`，python: `/root/miniconda3/envs/tornado/bin/python`
- `tqdm` -> workspace: `/LSPRAG/experiments/projects/tqdm`，python: `/root/miniconda3/envs/tqdm/bin/python`
- `thefuck` -> workspace: `/LSPRAG/experiments/projects/thefuck`，python: `/root/miniconda3/envs/thefuck/bin/python`
...

## 5. 项目环境安装（建议先配 black）

### 5.1 black

```bash
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/psf/black.git
cd /LSPRAG/experiments/projects/black
git checkout 8dc912774e322a2cd46f691f19fb91d2237d06e2

conda create -n black python=3.10 -y
conda activate black

pip install coverage pytest pytest-json-report
pip install -r docs/requirements.txt
pip install -r test_requirements.txt
pip install click mypy_extensions packaging urllib3 pathspec platformdirs aiohttp

echo "version = '00.0.0'" > src/black/_black_version.py
rm pyproject.toml
```

### 5.2 tornado

```bash
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/tornadoweb/tornado.git
cd /LSPRAG/experiments/projects/tornado

conda create -n tornado python=3.11 -y
conda activate tornado

pip install coverage pytest pytest-json-report
pip install -r requirements.txt
```

### 5.3 thefuck

```bash
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/nvbn/thefuck.git
cd /LSPRAG/experiments/projects/thefuck

git checkout c7e7e1d
conda create -n thefuck python=3.8
conda activate thefuck
pip install -r requirements.txt
python setup.py develop 
pip install coverage pytest pytest-json-report
pytest # for checking whether the setting is complete # there will be a symbol named "get_valid_history_without_current" that do not pass unit test 
```
#### 5.4 Youtube-dl

To set up the coocki-cutter, follow these steps:

```bash
cd /LSPRAG/experiments/projects
git clone https://github.com/ytdl-org/youtube-dl.git

# Python Setup
# (env already existed)
git checkout 956b8c585
conda create -n youtube-dl python=3.10
conda activate youtube-dl

pip install -U pip setuptools wheel
pip install -e .
pip install pytest nose pynose brotli pycryptodome

# Test run (as requested)
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
export NO_PROXY=127.0.0.1,localhost
pytest test \
  --ignore=test/test_download.py \
  --ignore=test/test_age_restriction.py \
  --ignore=test/test_subtitles.py \
  --ignore=test/test_write_annotations.py \
  --ignore=test/test_youtube_lists.py \
  --ignore=test/test_iqiyi_sdk_interpreter.py \
  --ignore=test/test_socks.py
```

### 5.5 dataclass-json

To set up the dataclass-json, follow these steps:

```bash
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/lidatong/dataclasses-json.git
cd /LSPRAG/experiments/projects/dataclasses-json

# Python Setup
conda create -n dataclasses-json python=3.10
conda activate dataclasses-json

# Install dependencies
# Don't forget to activate venv environment
git checkout dc63902

pip install coverage pytest pytest-json-report
pip install -e . 
pip install mypy hypothesis 
pytest # for checking whether the setting is complete
```

## 6. 实验执行流程（black + deepseek 示例）

先安装 CLI:

```bash
npm install -g @anthropic-ai/claude-code
npm i -g opencode-ai@latest
source /LSPRAG/.env.sh
```

### 6.1 baseline: claudecode naive

```bash
npm run experiment -- --type claudecode --task-list /LSPRAG/experiments/config/black-robust-final.json --project-root /LSPRAG/experiments/projects/black --model deepseek-chat --provider deepseek --parallel true --concurrency 30 --output-name claudecode-deepseek-black
```

### 6.2 baseline: claudecode cfg

```bash
npm run experiment -- --type claudecode --task-list /LSPRAG/experiments/config/black-robust-final.json --project-root /LSPRAG/experiments/projects/black --model deepseek-chat --provider deepseek --parallel true --concurrency 30 --output-name claudecode-deepseek-black-cfg --prompt-template cfg
```

### 6.3 reflect 对比

基于在6.1, 6.2 已生成好的测试用例(cachedDir)以及对应的focal symbol(testFileMapPath), 进行context查询并利用LLM进行反思
`promptType=WITHCONTEXT` 意味着正常用context构建prompt, `promptType=NAIVE` 意味着我们不用提供任何context, 直接让LLM进行反思(消融实验)
创建 `/LSPRAG/expRun3Config.json`:

```json
[
  {
    "cachedDir": "/LSPRAG/claudecode-tests/deepseek-chat/claudecode-deepseek-black-cfg/deepseek-chat/codes",
    "testFileMapPath": "/LSPRAG/claudecode-tests/deepseek-chat/claudecode-deepseek-black-cfg/test_file_map.json",
    "promptType": "WITHCONTEXT",
    "saveName": "claudecode_cfg_vars_deepseek"
  },
  {
    "cachedDir": "/LSPRAG/claudecode-tests/deepseek-chat/claudecode-deepseek-black/deepseek-chat/codes",
    "testFileMapPath": "/LSPRAG/claudecode-tests/deepseek-chat/claudecode-deepseek-black/test_file_map.json",
    "promptType": "NAIVE",
    "saveName": "claudecode_naive"
  }
]
```

执行 reflect:

```bash
xvfb-run -a npm run test \
  --testFile=exp.python.reflectRunner \
  --projectName=black \
  --taskListPath=/LSPRAG/experiments/config/black-robust-final.json \
  --parallelCount=30 \
  --model=deepseek-chat \
  --provider=deepseek \
  --testType=config --testConfigPath=/LSPRAG/expRun3Config.json
```

### 6.4 opencode 跑法

和 claudecode 相同，仅将 `--type claudecode` 改为 `--type opencode`。

### 6.5 LSPRAG 跑法

```bash
xvfb-run -a npm run test \
  --testFile=exp.python.reflectRunner \
  --projectName=black \
  --taskListPath=/LSPRAG/experiments/config/black-robust-final.json \
  --parallelCount=40 \
  --model=deepseek-chat \
  --provider=deepseek \
  --testType=lsprag
```

重要限制:
- `xvfb-run -a npm run test` 单容器一次只跑一个进程。
- 需要并发时，请起多个容器分摊任务。

## 7. 结果查看与验收

- 运行产物目录: `/LSPRAG/experiments/projects/<project>/lsprag-workspace/<timestamp>/...`
- 关键报告: `final-final-report/assertion_analysis_summary.json`
- 重点字段:
  - `ratios.failed_testcases`
  - `ratios.failed_files`

## 8. Task List 

- black : /LSPRAG/experiments/config/black-robust-final.json
- tornado : /LSPRAG/experiments/config/tornado-robust-final.json
- youtube-dl : /LSPRAG/experiments/config/youtube-dl-robust-final.json
- thefuck : /LSPRAG/experiments/config/thefuck-dl-robust-final.json
- dataclass-json : /LSPRAG/experiments/config/dataclass-json-robust-final.json


# 9. Coverage/Mutation Score

**Research Question**：在应用我们的方法之后，原有的 bug-finding 能力是否受到影响？

我们的目标是证明：在应用本方法前后，**mutation score** 与 **line coverage** 基本保持一致（即无显著下降）。

---

## 9.1 Line Coverage 收集方法

Line coverage 是广泛使用的测试用例质量度量指标之一。

### 环境准备

如未安装相关依赖，请执行：

```bash
pip install coverage pytest pytest-json-report
```

### 覆盖率收集脚本

```bash
bash /LSPRAG/scripts/python_coverage.bash {project_path} {testCasesDir}
```

---

### 示例：Black + DeepSeek + OpenCode

假设我们要对 `black-deepseek-opencode` 进行实验。

OpenCode 原始测试数据位于：

```
/LSPRAG/opencode-tests/deepseek-chat/2026-02-09T06-57-32
```

其中包含测试代码的最深层目录为：

```
/LSPRAG/opencode-tests/deepseek-chat/2026-02-09T06-57-32/deepseek-chat/codes
```

我们对该测试集执行覆盖率收集：

```bash
bash /LSPRAG/scripts/python_coverage.bash \
  /LSPRAG/experiments/projects/black \
  /LSPRAG/opencode-tests/deepseek-chat/2026-02-09T06-57-32/deepseek-chat/codes
```

示例输出：

```bash
src/blib2to3/pytree.py               475    242    49%
------------------------------------------------------
TOTAL                               7182   4584    36%
```

⚠️ **记录方式说明：**

我们记录的是：

```
4584 / 7182
```

即实际覆盖行数 / 总行数，而不要仅记录系统自动计算出的百分比值（例如 36%）。

---

### LSPRAG 结果对比

Reflect 生成的测试代码位于：

```
/LSPRAG/experiments/projects/black/lsprag-workspace/20260206_040834/black/opencode-cfg-vars
```

对应测试目录：

```
.../results/final
```

执行覆盖率收集：

```bash
bash /LSPRAG/scripts/python_coverage.bash \
  /LSPRAG/experiments/projects/black \
  /LSPRAG/experiments/projects/black/lsprag-workspace/20260206_040834/black/opencode-cfg-vars/results/final
```

⚠️ 注意：

- `results` 目录下通常包含 `initial` 和 `final`
- 统一使用 `final` 进行统计

---

### LSPRAG 实验对比规则

比较：

- `lsprag_withcontext/results/final`
- `experimental_withcontext/results/final`

---

## 9.2 Mutation Score 计算方法

Mutation Score 是衡量测试断言 bug-finding 能力的核心指标。

---

### 环境准备

安装 mutation score 工具：

```bash
pip install mutpy
```

---

### 执行脚本

- `--project-root` 与 `--module-root`：统一使用 benchmark workspace
- `--test-mapping`：指定 `testfileMap.json`
- `--test-dir`：指定测试用例目录

示例：

```bash
python /LSPRAG/scripts/compute_mutation_score.py \
  --project-root /LSPRAG/experiments/projects/tornado \
  --module-root /LSPRAG/experiments/projects/tornado \
  --test-mapping /LSPRAG/experiments/config/tornado_test_file_map.json \
  --test-dir /LSPRAG/experiments/data/main_result/tornado/lsprag/1/deepseek-chat/results/final \
  --runner pytest
```

---

# 重要说明（必须阅读）

⚠️ Coverage 与 Mutation Score 的收集对运行环境高度敏感。

如出现以下异常现象，请立即联系我：

### 可疑异常情况

- 覆盖率为 0
- Mutation score 计算异常快
- 无任何 mutation 结果输出
- 测试未实际执行

这些通常意味着：

- 测试未正确加载
- 路径配置错误
- 虚拟环境不一致
- pytest 未成功运行

## 8. 检查清单

1. 能通过 `heyuan -> 容器(3305)` 完成 SSH 登录。
2. `npm run compile` 成功。
3. `conda --version` 正常，且可 `conda activate black`。
4. `source /LSPRAG/.env.sh` 后模型调用不报鉴权错误。 可用 `xvfb-run -a npm run test --testFile=utills.llm` 进行检查
5. 在 `black` 上先完成一次 claudecode naive 小规模运行（可先降并发验证）。
6. 再跑 cfg + reflect，并确认 `assertion_analysis_summary.json` 已生成。
