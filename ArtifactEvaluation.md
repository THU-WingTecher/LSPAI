# Artifact Evaluation: LSPRAG

## Table of Contents

1. [Artifact Abstract](#artifact-abstract)
2. [Claim for Availability](#claim-for-availability)
3. [Claim for Reusable](#claim-for-reusable)
   - [Documentation](#documentation)
   - [Evidence of Reusability](#evidence-of-reusability)
   - [Installation & Setup](#installation--setup)
4. [Claim for Reproducibility](#claim-for-reproducibility)
   - [Common Setup Steps](#common-setup-steps)
   - [Optional: Experience Test Case Generation](#optional-experience-test-case-generation)
   - [Claim 1: Coverage Comparison](#claim-1-coverage-comparison)
     - [Java Projects (Commons-CLI, Commons-CSV)](#java-projects-commons-cli-commons-csv)
     - [Go Projects (Logrus, Cobra)](#go-projects-logrus-cobra)
     - [Python Projects (Black, Tornado)](#python-projects-black-tornado)
   - [Claim 2: Under-Minute Overheads](#claim-2-under-minute-overheads)
5. [Conclusion](#conclusion)

---

## Artifact Abstract

LSPRAG is a VSCode extension that leverages Language Server Protocol (LSP) for 
language-agnostic program analysis, supporting Python, C++, Java, and Go. 
The artifact includes the complete source code, test suites, evaluation scripts, 
and reproduction packages for all experiments in the paper.

**Artifact Structure:**
- `/src/` - Core extension implementation
- `/src/test/suite/` - Test suites for all components
- `/evaluation/` - Evaluation scripts and data
- `/docs/` - Documentation (setup, usage, API)
- `REPRODUCTION.md` - Step-by-step reproduction guide
- `ARTIFACT_STRUCTURE.md` - Detailed codebase structure and component descriptions

---

## Claim for Availability

- Publicly archived on Zenodo with permanent DOI: [https://zenodo.org/records/18065707]
- Licensed under Apache 2.0 for open reuse
- Source code also available at: https://github.com/THU-WingTecher/LSPRAG.git
- VSCode extension available and usable at: https://marketplace.visualstudio.com/items?itemName=LSPRAG.LSPRAG
- Archive includes: source code, datasets, scripts, and documentation

---

## Claim for Reusable

### Documentation

- `README.md` - Overview and Quick Start for extension user
- `QuickStart.md` - Quick start for software development
- `CONTRIBUTING.md` - Guide for extending to new languages, and software development
- `ARCHITECTURE.md` - System design and component interaction

### Evidence of Reusability

- Modular design with clear interfaces and well-developed test cases for easy start
  
  **Step to verify:** Try to follow QUICKSTART.md 🚀 5-Minute Setup or 📚 Learning Path

- Docker container for reproducible environment: `docker pull gwihwan/lsprag:latest`

- **Off-the-shelf tool:** We have published our tool as VSCode Extensions. We recommend you to experience our tool!

### Installation & Setup

#### 1. Download the Extension

Download the extension named `LSPRAG`. Although Cursor is compatible with VSCode-based extension, but its extension market is not completely synchronized with it. Therefore, you should use VSCode to download our LSPRAG extension at Cursor's extension market.

#### 2. Setup LLM in VSCode Settings

**Option A: VS Code Settings UI**
- Open Settings (`Ctrl/Cmd + ,`)
- Search for "LSPRAG"
- Configure provider, model, and API keys
- For example, you can set provider as deepseek, and model as deepseek-chat, and you can also set provider as openai and model as gpt-4o-mini, or gpt-5.

**Option B: Direct JSON Configuration**
- For example, add below settings to `.vscode/settings.json`:

```json
{
  "LSPRAG": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "deepseekApiKey": "your-api-key",
    "openaiApiKey": "your-openai-key",
    "localLLMUrl": "http://localhost:11434",
    "savePath": "lsprag-tests",
    "promptType": "detailed",
    "generationType": "original",
    "maxRound": 3
  }
}
```

#### 3. Install Language Server Extensions

**For Python:**
- Install "Pylance" and "Python" extensions
![Language Server Integration](docs/assets/language_server.png)

**For Java:**
- Install "Oracle Java Extension Pack" from VS Code Marketplace

**For Go:**
- Install "Go" extension
- Enable semantic tokens in settings:

```json
{
  "gopls": {
    "ui.semanticTokens": true
  }
}
```

#### 4. Open Your Project

It can be any project written in Python, Java or Golang.

If you don't know which project to test, you can directly clone our project and move to its demo files:
- `git clone https://github.com/THU-WingTecher/LSPRAG.git`
- Navigate to the demo test files: `LSPRAG/src/test/fixtures/python`
  - At Editor, click left-up `File` -> `Open Folder` -> Select workspace to `LSPRAG/src/test/fixtures/python`

**[Optional] Test core utilities:**
- You can check out your current setting by calling `Cmd/Ctrl + Shift + P => LSPRAG: Show Current Settings`
- You can test your LLM availability by calling `Cmd/Ctrl + Shift + P => LSPRAG: Test LLM`
- You can test your Language Server availability by calling `Cmd/Ctrl + Shift + P => LSPRAG: Test Language Server`

#### 5. Generate Tests

- Navigate to any function or method
- Right-click within the function definition
- Select **"LSPRAG: Generate Unit Test"** from the context menu
  ![Generate Unit test](docs/assets/CommandFig.png)
- Wait for generation to complete
  ![Waiting](docs/assets/loading.png)

#### 6. Review & Deploy

- Generated tests will appear with accept/reject options
  <img src="docs/assets/UnitGenResult.png" alt="LSPRAG Logo" width="200">

#### 7. Final Result

- All logs including LLM prompt and specific cfg, and diagnostic-fix histories will be saved under `{your-workspace}/lsprag-workspace/`
- If you click [Accept] the test file, the test file will be saved at `{your-workspace}/lsprag-tests`
- You can change the save path by changing default value of save path. You can change it through VS Code Extension settings at the same interface with set up LLM.

---

## Claim for Reproducibility

Our tool is driven by LLM and it costs lot of money. Therefore, we provide here the original data for verifying reproducibility.

### Common Setup Steps

#### 1. Pull the Image and Run

```bash
docker pull gwihwan/lsprag:latest
docker run -it -name lsprag gwihwan/lsprag:latest
docker attach lsprag
```

#### 2. Clone and Build

```bash
git clone https://github.com/THU-WingTecher/LSPRAG.git
cd LSPRAG

# Install dependencies
npm install

# Build the extension
npm run compile
```

**Known Issues:** If you met the below error while compiling:

```bash
node_modules/lru-cache/dist/commonjs/index.d.ts:1032:5 - error TS2416: Property 'forEach' in type 'LRUCache<K, V, FC>' is not assignable to the same property in base type 'Map<K, V>'.node_modules/lru-cache/dist/commonjs/index.d.ts:1032:5 - error TS2416: Property 'forEach' in type 'LRUCache<K, V, FC>' is not assignable to the same property in base type 'Map<K, V>'.
```

You can try to downgrade the version of lru-cache to 10.1.0 by running the following command:

```bash
npm install lru-cache@10.1.0
```

#### 3. Download Existing Dataset

```bash 
cd /LSPRAG
mkdir -p experiments 
cd experiments
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/0910553cfe484f2d9a1c/?dl=1" -O experimentData.tar.gz
tar xvfz experimentData.tar.gz
```

### Optional: Experience Test Case Generation

Below is the process that experience our test case generation process. If you directly jump to reproducibility verification, move to [Claim 1](#claim-1-coverage-comparison).

#### 1. Set the LLM Options for Test Case Generation

Create `.env.sh` file with below configurations:

```bash
# export https_proxy=http://127.0.0.1:23312
# export http_proxy=http://127.0.0.1:23312
export OPENAI_MODEL_NAME="gpt-5-mini"
export OPENAI_API_KEY="sk-"
export DEEPSEEK_API_KEY="sk-"
```

#### 2. Activate .env.sh File

```bash
source .env.sh
```

#### 3. Experience Test Case Generation Process

For Java test cases:

```bash
npm run test --testFile=exp.fixtures.java
```

For Python test cases:

```bash
npm run test --testFile=exp.fixtures.python
```

**Known issues:** For ssh-remote environment, you should add `xvfb-run -a` before `npm run test`. For example, `xvfb-run -a npm run test --testFile=exp.fixtures.python`

#### 4. Checkout Generated Test Files

There will be all logs including llm logs, cfg paths, iteration history, and final test case at `/LSPRAG/src/test/fixtures/java/lsprag-workspace/{current_time}` or `/LSPRAG/src/test/fixtures/python/lsprag-workspace/{current_time}`

---

## Claim 1: Coverage Comparison

**Can "LSPRAG" generate higher coverage unit tests than other baselines?**

Now, let's start to reproduce the experiment demonstrated in our paper. For the first, at Table 3, we compared the line coverage and valid rate across all baselines. This process contains multiple programming languages, we first start with Java.

### Java Projects (Commons-CLI, Commons-CSV)

#### Java Setup

Ensure that you download the necessary libraries from the provided link:

```bash
# Download required libraries
cd /LSPRAG/scripts
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/efade5fc56a54ee59ed1/?dl=1" -O ../javaLib.tar.gz
tar xvf ../javaLib.tar.gz
```

After running above commands, you can observe that jar files are located at `/LSPRAG/experiments/lib/`.

```bash
|-- lib
|   |-- jacocoagent.jar
|   |-- jacococli.jar
|   |-- junit-jupiter-api-5.11.2.jar
|   |-- junit-jupiter-engine-5.11.2.jar
|   |-- junit-platform-console-standalone-1.8.2.jar
|   `-- junit-platform-launcher-1.8.2.jar
```

Once the environment is set up and the unit tests are prepared, you can proceed to reproduce experiments using the provided dataset.

#### Commons-CLI Project Setup

To set up the CLI project, follow these steps:

```bash
# Clone and checkout a specific version
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/apache/commons-cli.git
cd commons-cli

# Java Setup - This step is required for coverage analysis
mvn install -DskipTests -Drat.skip=true
mvn dependency:copy-dependencies
```

##### Reproduce Experiment Results

To reproduce the experiment results, execute the following commands one by one and check the output. This script loads the generated unit tests from all baselines stored under `experiments/data` and prints the results in CSV format.

Run the following command:

```bash
python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/commons-cli
```

**Expected Result:**

```
# CODES (5/5 results):
# codes: Coverage=0.2081  ValidRate=0.1818 
# codes: Coverage=0.2331  ValidRate=0.1818 
# codes: Coverage=0.2107  ValidRate=0.1591 
# codes: Coverage=0.1796  ValidRate=0.1364 
# codes: Coverage=0.0524  ValidRate=0.0682 
# Average Coverage: 0.1768 (5/5 data points)
# Average Valid Rate: 0.1455 (5/5 data points)

# ====================================================================================================
# COVERAGE RESULTS SUMMARY (CSV FORMAT)
# ====================================================================================================
# project codeQA  StandardRAG     Naive   SymPrompt       LSPRAG  DraCo   LSPRAG-nofix
# cli-4o-mini     0.106259542     0.050178117     0.045903308     0.027582697     0.332926209     None    0.271043257
# cli-4o  0.095979644     0.032061069     0.127124682     0.030025445     0.346870229     None    0.231552163
# cli-deepseek    0.207226463     0.176793893     0.064631043     0.056183206     0.377201018     None    0.287735369

# ====================================================================================================
# VALID RATE RESULTS SUMMARY (CSV FORMAT)
# ====================================================================================================
# project codeQA  StandardRAG     Naive   SymPrompt       LSPRAG  DraCo   LSPRAG-nofix
# cli-4o-mini     0.124025974     0.081818182     0.134003771     0.070521684     0.450775194     None    0.234935401
# cli-4o  0.082251082     0.072727273     0.326084224     0.072030170     0.481183932     None    0.285891473
# cli-deepseek    0.132900433     0.145454545     0.171967316     0.092131783     0.605170798     None    0.313178295
# Warning: openpyxl not installed. Excel files will not be generated.
# Install with: pip install openpyxl

# Files saved:
# Coverage results: coverage_results_20250719_052404.csv
# Valid rate results: validrate_results_20250719_052404.csv
```

#### Commons-CSV Project Setup

To set up the CSV project, follow these steps:

```bash
# Clone and checkout a specific version
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/apache/commons-csv.git
cd commons-csv

# Java Setup
mvn install -DskipTests -Drat.skip=true
mvn dependency:copy-dependencies
```

##### Reproduce Experiment Results

To reproduce the experiment results, execute the following commands one by one and check the output. This script loads the generated unit tests from all baselines stored under `experiments/data` and prints the results in CSV format.

Run the following command:

```bash
python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/commons-csv
```

**Expected Result:**

```
# commons-csv + gpt-4o-mini + standard
# --------------------------------------------------------------------------------

# CODES (5/5 results):
#   codes: Coverage=0.2538  ValidRate=0.1156 
#   codes: Coverage=0.2530  ValidRate=0.1361 
#   codes: Coverage=0.2474  ValidRate=0.1429 
#   codes: Coverage=0.2450  ValidRate=0.1224 
#   codes: Coverage=0.2474  ValidRate=0.1429 
#   Average Coverage: 0.2493 (5/5 data points)
#   Average Valid Rate: 0.1320 (5/5 data points)

# ====================================================================================================
# COVERAGE RESULTS SUMMARY (CSV FORMAT)
# ====================================================================================================
# project codeQA  StandardRAG     Naive   SymPrompt       LSPRAG  DraCo   LSPRAG-nofix
# csv-4o-mini     0.409705648     0.249323787     0.266984885     0.185043755     0.805091488     None    0.697692920
# csv-4o  0.448528242     0.448369133     0.391567224     0.252824185     0.783293556     None    0.760540971
# csv-deepseek    0.651073986     0.446778043     0.326650756     0.350676213     0.831980907     None    0.752903739

# ====================================================================================================
# VALID RATE RESULTS SUMMARY (CSV FORMAT)
# ====================================================================================================
# project codeQA  StandardRAG     Naive   SymPrompt       LSPRAG  DraCo   LSPRAG-nofix
# csv-4o-mini     0.236394558     0.131972789     0.157402076     0.062799189     0.828468893     None    0.374321570
# csv-4o  0.206802721     0.265306122     0.356853030     0.144110886     0.908976571     None    0.544464519
# csv-deepseek    0.432653061     0.322448980     0.367579511     0.298242055     0.909500010     None    0.492918639

# Files saved:
#   Coverage results: coverage_results_20250719_055246.csv
#   Valid rate results: validrate_results_20250719_055246.csv
#   Excel results: test_results_20250719_055246.xlsx
```

### Go Projects (Logrus, Cobra)

#### Prepare Unit Test Codes

**Option A: Generate Unit Tests (Manual Method)**

Follow above instructions.

**Option B: Use Pre-generated Dataset (Recommended)**

Download dataset by following **Prepare Unit Test Codes :: Option B**.

#### Logrus Project Setup

To set up the Logrus project, follow these steps:

```bash
# Clone and checkout a specific version
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/sirupsen/logrus.git
cd logrus
# Optional: Checkout specific commit (if applicable)
# git checkout <specific_version>

# Go Setup
go env -w GOPROXY=https://goproxy.io,direct
go mod tidy
```

##### Reproduce Experiment Results

To reproduce the experiment results, execute the following commands one by one and check the output. This script loads the generated unit tests from all baselines stored under `experiments/data` and prints the results in CSV format.

Run the following command:

```bash
python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/logrus
```

**Expected Result:**

```
#   Average Coverage: 0.1100 (5/5 data points)
#   Average Valid Rate: 0.1583 (5/5 data points)

# ====================================================================================================
# COVERAGE RESULTS SUMMARY (CSV FORMAT)
# ====================================================================================================
# project codeQA  StandardRAG     Naive   SymPrompt       LSPRAG  DraCo   LSPRAG-nofix
# logrus-4o-mini  0.055220418     0.111368910     0.023201856     0.002320186     0.237122970     None    0.115545244
# logrus-4o       0.056148492     0.130858469     0.006496520     0.002320186     0.277494200     None    0.105800464
# logrus-deepseek 0.113369024     0.109976798     0.106728538     0.054292343     0.218097448     None    0.135498840

# ====================================================================================================
# VALID RATE RESULTS SUMMARY (CSV FORMAT)
# ====================================================================================================
# project codeQA  StandardRAG     Naive   SymPrompt       LSPRAG  DraCo   LSPRAG-nofix
# logrus-4o-mini  0.143181818     0.208333333     0.033333333     0.008333333     0.340151515     None    0.188636364
# logrus-4o       0.141666667     0.265217391     0.008333333     0.008333333     0.320238095     None    0.150000000
# logrus-deepseek 0.133333333     0.158333333     0.225000000     0.075000000     0.331060606     None    0.170454545

# Files saved:
#   Coverage results: coverage_results_20250719_061138.csv
#   Valid rate results: validrate_results_20250719_061138.csv
#   Excel results: test_results_20250719_061138.xlsx
```

#### Cobra Project Setup

To set up the Cobra project, follow these steps:

```bash
# Clone and checkout a specific version
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/spf13/cobra.git
cd cobra
# Optional: Checkout specific commit (if applicable)
# git checkout <specific_version>

# Go Setup
go env -w GOPROXY=https://goproxy.io,direct
go mod tidy
```

##### Reproduce Experiment Results

To reproduce the experiment results, execute the following commands one by one and check the output. This script loads the generated unit tests from all baselines stored under `experiments/data` and prints the results in CSV format.

Run the following command:

```bash
python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/cobra
```

**Expected Result:**

```
#   codes: Coverage=0.0635  ValidRate=0.0891 
#   Average Coverage: 0.0757 (5/5 data points)
#   Average Valid Rate: 0.0812 (5/5 data points)

# ====================================================================================================
# COVERAGE RESULTS SUMMARY (CSV FORMAT)
# ====================================================================================================
# project codeQA  StandardRAG     Naive   SymPrompt       LSPRAG  DraCo   LSPRAG-nofix
# cobra-4o-mini   0.071143376     0.120326679     0.013611615     0.033938294     0.230308530     None    0.099092559
# cobra-4o        0.100544465     0.075680581     0.027223230     0.002177858     0.276043557     None    0.125589837
# cobra-deepseek  0.154990926     0.130127042     0.115789474     0.085662432     0.372232305     None    0.256079855

# ====================================================================================================
# VALID RATE RESULTS SUMMARY (CSV FORMAT)
# ====================================================================================================
# project codeQA  StandardRAG     Naive   SymPrompt       LSPRAG  DraCo   LSPRAG-nofix
# cobra-4o-mini   0.060080808     0.095049505     0.011940594     0.012293729     0.238822303     None    0.071261073
# cobra-4o        0.097029703     0.081188119     0.017861386     0.008127063     0.332673267     None    0.089108911
# cobra-deepseek  0.102970297     0.106930693     0.091267327     0.027847837     0.346534653     None    0.217821782

# Files saved:
#   Coverage results: coverage_results_20250719_060223.csv
#   Valid rate results: validrate_results_20250719_060223.csv
```

### Python Projects (Black, Tornado)

#### Prepare Unit Test Codes

**Option A: Generate Unit Tests (Manual Method)**

Follow above instructions.

**Option B: Use Pre-generated Dataset (Recommended)**

Download dataset by following **Prepare Unit Test Codes :: Option B**.

Run below command to move dataset to target project:

```bash
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects/black # black should be substitute to crawl4ai if you proceed with crawl4ai projects
cp -r /LSPRAG/experiments/data/black/* .
```

#### Black Project Setup

To set up the Black project, follow these steps:

```bash
# Clone and checkout specific version
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/psf/black.git
cd black
git checkout 8dc912774e322a2cd46f691f19fb91d2237d06e2

# Python Setup
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install coverage pytest pytest-json-report
pip install -r docs/requirements.txt
pip install -r test_requirements.txt
pip install click mypy_extensions packaging urllib3 pathspec platformdirs

# Configure project
echo "version = '00.0.0'" > src/black/_black_version.py
rm pyproject.toml
```

##### Reproduce Experiment Results

To reproduce the experiment results, execute the following commands one by one and check the output. This script loads the generated unit tests from all baselines stored under `experiments/data` and prints the results in CSV format.

Run the following command:

```bash
python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/black
```

#### Tornado Project Setup

To set up the Tornado project, follow these steps:

```bash
mkdir -p /LSPRAG/experiments/projects
cd /LSPRAG/experiments/projects
git clone https://github.com/tornadoweb/tornado.git
cd tornado

# Python Setup
python3 -m venv venv
source venv/bin/activate

# Install dependencies
# Don't forget to activate venv environment
pip install -r requirements.txt
```

##### Reproduce Experiment Results

To reproduce the experiment results, execute the following commands one by one and check the output. This script loads the generated unit tests from all baselines stored under `experiments/data` and prints the results in CSV format.

Run the following command:

```bash
python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/tornado
```

---

## Claim 2: Under-Minute Overheads

**"LSPRAG" has under-minute overheads.**

### Reproduce Experiment Results (Table 4)

In this section, we reproduce the experiment results of Table 4, focusing on the tokens used and the time taken. LSPRAG generates log files when generating test files, and based on these log files, we summarize and analyze the costs associated with LSPRAG's operations.

Before proceeding, make sure you have already downloaded the provided dataset as described in this section (#option-b-use-pre-generated-dataset-recommended).

To reproduce Table 4 (CLI project with gpt-4o-mini), you should run below command:

```bash
python3 scripts/anal_cost.py experiments/log-data/commons-cli/results_gpt-4o/logs/gpt-4o experiments/log-data/commons-csv/results_gpt-4o/logs/gpt-4o
```

**Expected Result:**

```
# === Overall Statistics (across ALL directories) ===

# Total Files Processed: 247
# Total Time Used (ms): 57163673
# Total Tokens Used: 1088852
# Total FixWithLLM Tokens Used: 708132
# Total FixWithLLM Processes Run: 427
# Average Time per Function (ms): 231431.87
# Average Tokens per Function: 4408.31
# Average FixWithLLM Time per Function (ms): 16194.67  -> FIX Time
# Average FixWithLLM Tokens per Function: 2866.93   -> FIX Token

# === Average Time and Token Usage per Process ===

# Process                          Avg Time (ms)      Avg Tokens
# -----------------------------------------------------------------
# End                                  145638.22            0.00 
# FixWithLLM_1                           8988.04         1796.13 
# FixWithLLM_2                           9974.16         1686.47 
# FixWithLLM_3                           9566.90         1725.96 
# FixWithLLM_4                          10286.59         1537.58 
# FixWithLLM_5                           9621.97         1647.16 
# collectInfo                           38758.34            0.00   ->  Retrieval
# getDiagnosticsForFilePath             19168.33            0.00   ->  getDiagnostic
# invokeLLM                             11669.13         1541.38   ->  Gen
# saveGeneratedCodeToFolder                 3.19            0.00 
# start                                     0.00            0.00 
# Average Total Time Used (ms): 231431.8744939271
# Average Total Tokens Used: 4408.307692307692

# Done.
```

**For Go Projects:**

```bash
python3 scripts/anal_cost.py experiments/log-data/cobra/results_gpt-4o/logs/gpt-4o experiments/log-data/logrus/results_gpt-4o/logs/gpt-4o
```

**Expected Result:**

```
# === Overall Statistics (across ALL directories) ===

# Total Files Processed: 284
# Total Time Used (ms): 39373513
# Total Tokens Used: 1714158
# Total FixWithLLM Tokens Used: 1387533
# Total FixWithLLM Processes Run: 734
# Average Time per Function (ms): 138639.13
# Average Tokens per Function: 6035.77
# Average FixWithLLM Time per Function (ms): 26938.10  -> FIX Time
# Average FixWithLLM Tokens per Function: 4885.68   -> FIX Token

# === Average Time and Token Usage per Process ===

# Process                          Avg Time (ms)      Avg Tokens
# -----------------------------------------------------------------
# End                                   89213.40            0.00 
# FixWithLLM_1                           9980.98         1774.48 
# FixWithLLM_2                          10409.20         1883.25 
# FixWithLLM_3                          10406.60         1950.94 
# FixWithLLM_4                          11077.05         1944.60 
# FixWithLLM_5                          11112.21         2112.56 
# collectInfo                            5925.96            0.00   ->  Retrieval
# getDiagnosticsForFilePath              5337.97            0.00   ->  getDiagnostic
# invokeLLM                             11177.64         1150.09   ->  Gen
# saveGeneratedCodeToFolder                46.06            0.00 
# start                                     0.00            0.00 
# Average Total Time Used (ms): 138639.13028169013
# Average Total Tokens Used: 6035.767605633803

# Done.
```

**For Python Projects:**

```bash
python3 scripts/anal_cost.py experiments/log-data/crawl4ai/results_gpt-4o/logs/gpt-4o experiments/log-data/black/results_gpt-4o/logs/gpt-4o
```

**Expected Result:**

```
# === Overall Statistics (across ALL directories) ===

# Total Files Processed: 358
# Total Time Used (ms): 103379052
# Total Tokens Used: 705537
# Total FixWithLLM Tokens Used: 182738
# Total FixWithLLM Processes Run: 135
# Average Time per Function (ms): 288768.30
# Average Tokens per Function: 1970.77
# Average FixWithLLM Time per Function (ms): 4604.38  -> FIX Time
# Average FixWithLLM Tokens per Function: 510.44   -> FIX Token

# === Average Time and Token Usage per Process ===

# Process                          Avg Time (ms)      Avg Tokens
# -----------------------------------------------------------------
# End                                  150391.62            0.00 
# FixWithLLM_1                          12483.74         1471.38 
# FixWithLLM_2                          13027.28         1390.61 
# FixWithLLM_3                          14145.07         1477.60 
# FixWithLLM_4                          16213.36         1541.18 
# FixWithLLM_5                          14725.00         1551.36 
# collectInfo                           98533.54            0.00   ->  Retrieval
# getDiagnosticsForFilePath             22033.93            0.00   ->  getDiagnostic
# invokeLLM                             13203.63         1460.33   ->  Gen
# saveGeneratedCodeToFolder                 1.20            0.00 
# start                                     0.00            0.00 
# Average Total Time Used (ms): 288768.30167597765
# Average Total Tokens Used: 1970.7737430167597

# Done.
```

### Inspect Other Throughput Result

For each dataset folder (e.g., `results_deepseek`, `results_gpt-4o`, and `results_gpt-4o-mini`), you will find corresponding logs folders. The structure should look like this:

```bash
├── cost-data
│   ├── black
│   │   ├── history
│   │   ├── logs
│   │   |   ├── gpt-4o <-- COPY the PATH of this folder!
│   │   └── results
│   ├── cobra
│   │   ├── history
│   │   ├── logs
│   │   |   ├── gpt-4o <-- COPY the PATH of this folder!
│   │   └── results
│   ├── commons-cli
│   │   ├── history
│   │   ├── logs
│   │   |   ├── gpt-4o <-- COPY the PATH of this folder!
│   │   └── results
│   ├── commons-csv
│   │   ├── history
│   │   ├── logs
│   │   |   ├── gpt-4o <-- COPY the PATH of this folder!
│   │   └── results
│   ├── logrus
│   │   ├── history
│   │   ├── logs
│   │   |   ├── gpt-4o <-- COPY the PATH of this folder!
│   │   └── results
│   └── tornado
│       ├── history
│       ├── logs
│   │   |   ├── gpt-4o <-- COPY the PATH of this folder!
│       └── results
```

Copy the absolute path of the folder marked as `<-- COPY the PATH of this folder!`, and then run the prewritten Python scripts below.

To summarize the overall cost of generating unit tests for Python projects (`tornado` and `black`), use the following commands:

**Python Projects:**

```bash
python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/black/logs/gpt-4o /LSPRAG/experiments/data/cost-data/tornado/logs/gpt-4o
```

**Expected Results:**

```
# === Average Time and Token Usage per Process ===

# Process                          Avg Time (ms)      Avg Tokens
# -----------------------------------------------------------------
# FixWithLLM_1                          13918.80         1523.17 
# FixWithLLM_2                          15696.09         1289.48 
# FixWithLLM_3                          13469.41         1374.65 
# FixWithLLM_4                          16785.50         1420.42 
# FixWithLLM_5                          15907.36         1358.64 
# buildCFG                                  1.51            0.00 
# collectCFGPaths                         216.11            0.00 
# fixDiagnostics                         8456.63            0.00 
# gatherContext                          2850.67            0.00 
# gatherContext-1                        2555.53            0.00   ->  Retrieval(def)
# gatherContext-2                         295.14            0.00   ->  Retrieval(ref)
# generateTest                          15597.84         2674.69   ->  Gen
# getContextTermsFromTokens              2291.16            0.00 
# getDiagnosticsForFilePath              2492.42            0.00   ->  getDiagnostic
# saveGeneratedCodeToFolder                 0.29            0.00 
# Average Total Time Used (ms): 27339.475609756097
# Average Total Tokens Used: 3261.3280487804877

# Done.

# PASTE BELOW DICTIONARY TO scripts/plot_cost.py
# {'fix': 5591.812195121951, 'gen': 15597.84268292683, 'cfg': 217.6182926829268, 'def': 2555.5329268292685, 'ref': 295.1353658536585, 'filter': 2291.1621951219513, 'diag': 2492.423076923077, 'save': 0.28846153846153844}
```

**Go Projects:**

```bash
python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/logrus/logs/gpt-4o /LSPRAG/experiments/data/cost-data/cobra/logs/gpt-4o
```

**Expected Results:**

```
# === Overall Statistics (across ALL directories) ===

# Total Files Processed: 125
# Total Time Used (ms): 4879365
# Total Tokens Used: 604827
# Total FixWithLLM Tokens Used: 182358
# Total FixWithLLM Processes Run: 119
# Average Time per Function (ms): 39034.92
# Average Tokens per Function: 4838.62
# Average FixWithLLM Time per Function (ms): 13101.34  -> FIX Time
# Average FixWithLLM Tokens per Function: 1458.86   -> FIX Token

# === Average Time and Token Usage per Process ===

# Process                          Avg Time (ms)      Avg Tokens
# -----------------------------------------------------------------
# FixWithLLM_1                          14490.76         1542.74 
# FixWithLLM_2                          12549.68         1567.39 
# FixWithLLM_3                          12369.42         1439.08 
# FixWithLLM_4                          14863.00         1162.00 
# FixWithLLM_5                          13015.00         1175.00 
# buildCFG                                  2.98            0.00 
# collectCFGPaths                         342.00            0.00 
# fixDiagnostics                        18209.94            0.00 
# gatherContext                          2496.11            0.00 
# gatherContext-1                        2251.74            0.00   ->  Retrieval(def)
# gatherContext-2                         244.38            0.00   ->  Retrieval(ref)
# generateTest                          18576.68         3379.75   ->  Gen
# getContextTermsFromTokens              2334.06            0.00 
# getDiagnosticsForFilePath              3575.64            0.00   ->  getDiagnostic
# saveGeneratedCodeToFolder               109.77            0.00 
# Average Total Time Used (ms): 39034.92
# Average Total Tokens Used: 4838.616

# Done.

# PASTE BELOW DICTIONARY TO scripts/plot_cost.py
# {'fix': 13101.336, 'gen': 18576.68, 'cfg': 344.976, 'def': 2251.736, 'ref': 244.376, 'filter': 2334.056, 'diag': 3575.635135135135, 'save': 109.77027027027027}
```

**Java Projects:**

```bash
python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/commons-cli/logs/gpt-4o /LSPRAG/experiments/data/cost-data/commons-csv/logs/gpt-4o
```

**Expected Results:**

```
# === Overall Statistics (across ALL directories) ===

# Total Files Processed: 188
# Total Time Used (ms): 4740861
# Total Tokens Used: 1014672
# Total FixWithLLM Tokens Used: 611481
# Total FixWithLLM Processes Run: 156
# Average Time per Function (ms): 25217.35
# Average Tokens per Function: 5397.19
# Average FixWithLLM Time per Function (ms): 9350.85  -> FIX Time
# Average FixWithLLM Tokens per Function: 3252.56   -> FIX Token

# === Average Time and Token Usage per Process ===

# Process                          Avg Time (ms)      Avg Tokens
# -----------------------------------------------------------------
# FixWithLLM_1                          11315.53         4482.89 
# FixWithLLM_2                          11278.86         2949.28 
# FixWithLLM_3                          11122.94         3531.50 
# FixWithLLM_4                          11839.33         4950.92 
# FixWithLLM_5                          10413.60         1296.30 
# buildCFG                                  0.95            0.00 
# collectCFGPaths                           2.26            0.00 
# fixDiagnostics                        14173.65            0.00 
# gatherContext                           695.24            0.00 
# gatherContext-1                         417.98            0.00   ->  Retrieval(def)
# gatherContext-2                         277.26            0.00   ->  Retrieval(ref)
# generateTest                          11433.18         2144.63   ->  Gen
# getContextTermsFromTokens              2072.80            0.00 
# getDiagnosticsForFilePath              3590.28            0.00   ->  getDiagnostic
# saveGeneratedCodeToFolder                 1.36            0.00 
# Average Total Time Used (ms): 25217.34574468085
# Average Total Tokens Used: 5397.191489361702

# Done.

# PASTE BELOW DICTIONARY TO scripts/plot_cost.py
# {'fix': 9350.845744680852, 'gen': 11433.18085106383, 'cfg': 3.202127659574468, 'def': 417.97872340425533, 'ref': 277.25531914893617, 'filter': 2072.7978723404253, 'diag': 3590.2758620689656, 'save': 1.3563218390804597}
```

Copy the last printed dictionary values and paste to `scripts/plot_cost.py`'s variable `data`. And then, run the `plot_cost.py` and you can see exactly same plot graph on paper.

### Interpret Result

Since we perform 5 rounds for each FixWithLLM process, to get the average time and tokens used for fixing the code, refer to the values under `Average FixWithLLM Time per File` and `Average FixWithLLM Tokens per File`.

For other processes, such as collecting context information (`collectInfo`), generating diagnostic error messages (`getDiagnosticsForFilePath`), or saving files (`saveGeneratedCodeToFolder`), you can directly refer to the figures under the Process Avg Time (ms) Avg Tokens section.

---

## Conclusion

Thank you for reading this experiment reproduction document! If you encounter any issues or errors, feel free to contact me by creating an issue or sending me an email at iejw1914@gmail.com.

We are dedicated to contributing to the open-source community and welcome any contributions or recommendations!
