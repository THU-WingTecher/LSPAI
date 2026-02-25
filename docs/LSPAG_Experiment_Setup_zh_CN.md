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
git checkout 
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

## 8. 检查清单

1. 能通过 `heyuan -> 容器(3305)` 完成 SSH 登录。
2. `npm run compile` 成功。
3. `conda --version` 正常，且可 `conda activate black`。
4. `source /LSPRAG/.env.sh` 后模型调用不报鉴权错误。 可用 `xvfb-run -a npm run test --testFile=utills.llm` 进行检查
5. 在 `black` 上先完成一次 claudecode naive 小规模运行（可先降并发验证）。
6. 再跑 cfg + reflect，并确认 `assertion_analysis_summary.json` 已生成。
