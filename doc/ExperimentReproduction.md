# LSPRAG Experiment Reproduction Guide
<!-- <p align="center">
    <!-- <a href="https://arxiv.org/abs/2302.02261"><img src="https://img.shields.io/badge/arXiv-2302.02261-b31b1b.svg?style=for-the-badge"> -->
</p> -->

## Table of Contents
- [LSPRAG Experiment Reproduction Guide](#lsprag-experiment-reproduction-guide)
  - [Table of Contents](#table-of-contents)
  - [🛠️ Setup Guide](#️-setup-guide)
    - [1. Install LSPRAG from Source](#1-install-lsprag-from-source)
- [Generate Unit Test Codes by LSPRAG](#generate-unit-test-codes-by-lsprag)
    - [Language Server Installation](#language-server-installation)
    - [Option B: Build from Source](#option-b-build-from-source)
  - [Reproduce Experiment Results (Table 3)](#reproduce-experiment-results-table-3)
    - [Prepare Unit Test Codes](#prepare-unit-test-codes)
      - [Option A: Generate Unit Tests (Manual Method)](#option-a-generate-unit-tests-manual-method)
      - [Option B: Use Pre-generated Dataset (Recommended)](#option-b-use-pre-generated-dataset-recommended)
    - [Java Projects \[Commons-Cli, Commons-Csv\]](#java-projects-commons-cli-commons-csv)
      - [Java Setup](#java-setup)
        - [\[OPTIONAL\] A. Reproduce by Generating New Test Codes](#optional-a-reproduce-by-generating-new-test-codes)
        - [B. Reproduce with Provided Dataset ( Table 3 )](#b-reproduce-with-provided-dataset--table-3-)
      - [Commons-Cli Project Setup](#commons-cli-project-setup)
        - [Reproduce Experiment Results](#reproduce-experiment-results)
      - [Commons-Csv Project Setup](#commons-csv-project-setup)
        - [Reproduce Experiment Results](#reproduce-experiment-results-1)
    - [Go Projects \[LOGRUS, COBRA\]](#go-projects-logrus-cobra)
      - [Prepare Unit Test Codes](#prepare-unit-test-codes-1)
      - [Logrus Project Setup](#logrus-project-setup)
        - [Reproduce Experiment Results](#reproduce-experiment-results-2)
      - [Cobra Project Setup](#cobra-project-setup)
        - [Reproduce Experiment Results](#reproduce-experiment-results-3)
    - [Python Projects \[ BLACK, CRAWL4AI\]](#python-projects--black-crawl4ai)
      - [Prepare Unit Test Codes](#prepare-unit-test-codes-2)
      - [Black Project Setup](#black-project-setup)
        - [Reproduce Experiment Results](#reproduce-experiment-results-4)
      - [Crawl4ai Project Setup](#crawl4ai-project-setup)
        - [Reproduce Experiment Results](#reproduce-experiment-results-5)
  - [Reproduce Experiment Results (Table 4)](#reproduce-experiment-results-table-4)
      - [Inspect Othe Throuput Result](#inspect-othe-throuput-result)
      - [Interpret Result](#interpret-result)
  - [Conclusion](#conclusion)


## 🛠️ Setup Guide

### 1. Install LSPRAG from Source

1. Pull the image and run 
   ```
   Hold for anonymous
   ```

2. Clone and Build
   ```
   Hold for anonymous
   ```
cd LSPRAG
   # Install dependencies
   npm install

   # Build the extension
   npm run compile
   ```

After installing the extension, please configure your language servers and LLM settings by following the 🛠️ Setup Guide in the [README](../README.md).

3. Known Issues : if you met the below error while compiling
```bash
node_modules/lru-cache/dist/commonjs/index.d.ts:1032:5 - error TS2416: Property 'forEach' in type 'LRUCache<K, V, FC>' is not assignable to the same property in base type 'Map<K, V>'.node_modules/lru-cache/dist/commonjs/index.d.ts:1032:5 - error TS2416: Property 'forEach' in type 'LRUCache<K, V, FC>' is not assignable to the same property in base type 'Map<K, V>'.
```
You can try to downgrade the version of lru-cache to 10.1.0 by running the following command:
```bash
npm install lru-cache@10.1.0
```

## Generate Unit Test Codes by LSPRAG

### Language Server Installation

1. Download the Language Server of your target language (If you pull the docker image, these are already installed.)
   - Java: Oracle Java Extension Pack ( identifier : oracle.oracle-java)
   - Python: Pylance and Python extension ( identifier : ms-python.vscode-pylance, ms-python.python)
   - Go: Go extension ( identifier : golang.go)

2. Language-Specific Setup (This need to be setup)
   
   **For Go:**
   Enable semantic tokenization in your VS Code settings.json:
   ```json
   {
     "gopls": {
       "ui.semanticTokens": true
     }
   }
   ```

   **For Java:**
   In the future, oracle's Java language server does not support the java version under than 17.
   After installing Java Language Server, if it logged error like "Oracle Java SE Language Server exited with 10", please install the java 17 and set `java.jdk home` as the newly installed location. 
   1. Install Java 17 (If you are using linux, or pulled our docker image)
   ```bash
   apt install openjdk-17-jdk
   ``` 
   2. Check the install path
   ```bash
   ls /usr/lib/jvm/java-17-openjdk-amd64
   ```
   If it exists - great! You're done with the install
   3. Set the Language Server's Java version. Please, open `settings.json` and add this :
   ```bash
       "jdk.jdkhome": "/usr/lib/jvm/java-17-openjdk-amd64",
    "jdk.java.imports.groups": [
      "java",
      "javax",
      "org",
      "com",
      ""
    ],
    ```

### Option A: Download IDE Plugin 

1. Download the IDE plugin from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=LSPRAG.lsprag)
2. Install the plugin
3. SetUp LLM Configuration
   - Open the settings.json file
   - Add the following configuration:
   ```json
   {
     "LSPRAG": {
       "provider": "deepseek",    // Choose: // openai // deepseek // ollama
       "model": "deepseek-chat",  // Choose: // gpt-4o-mini // llama3-70b // deepseek-chat
       "openaiApiKey": "your-api-key",    // Required for OpenAI
       "deepseekApiKey": "your-api-key",  // Required for Deepseek
       "localLLMUrl": "http://your-ollama-server:port",  // Required for Ollama
       "proxyUrl": "your-proxy-server"    // Optional: Configure if using a proxy
     }
   }
   ```
4. Open the target project
5. [Optional] Project Compilation
   - While not required, compiling your project can improve error diagnosis and auto-fixing capabilities
5. Move cursor to the function you want to generate unit test codes
6. Press right-click and select `LSPRAG: Generate Unit Test Codes`
7. Wait for the unit test codes to be generated

### Option B: Build from Source
Each programming language has slightly different steps. 
Overall, you can follow these steps:

If you followed the **Setup Guide :: Option A**, you can directly proceed with step 4.

1. Complete the LSPRAG Extension installation (see Setup Guide above)
2. Launch LSPRAG in Development Mode:
- Open `/LSPRAG/src/extension.ts`
   - Press `F5` to launch Extension Development Host
   - Select "VS Code Extension Development" from the dropdown
   - A new VS Code window should open

3. Configure the workspace:
   - Open the target project: Navigate to `experiments/project/black` 
   (File -> Open Folder -> select experiments/project/black)
   ![Configure Workspace](assets/python-workspace-settings.png)

   - **[Python-Specific]** Select Python interpreter: In the bottom-right section, choose your venv-python path.
   ![Change Interpreter](assets/python-select-interpreter.png)
   ![Select Interpreter](assets/interpreter_path_example.png)

Known Issue: If you met the below error, this happens when the language server is not installed.
   ![No Symbols Found Error](assets/noSymbol.png)
Please install the language server and try again.

## Reproduce Experiment Results (Table 3)

Table 3 claims that LSPRAG outperforms other baselines in terms of coverage, and part of valid rate compared to baselines.
There are two ways to proceed with the experiments:

### Prepare Unit Test Codes 

#### Option A: Generate Unit Tests (Manual Method)

> Note: Generating unit tests for every function in real-world projects is time-consuming. We provide pre-generated experiment data as an alternative (see Option B).

1. Checkout the branch
   ```bash
   git checkout fse-industry
   ```
2. Recompile the project
   ```bash
   cd /LSPRAG
   npm install 
   npm run compile
   ```
3. Launch LSPRAG in Development Mode:
   - Open `/LSPRAG/src/extension.ts`
   - Press `F5` to launch Extension Development Host
   - Select "VS Code Extension Development" from the dropdown
   - A new VS Code window should open

4. Run the experiment:
   - Press `CTRL+SHIFT+P`
   - For Python, you should first generate venv-python version, and install necessary libraries, and select python interpreter at righ-bottom section of vscode.
   - Run one of folloing commands: `LSPRAG::Python-Experiment`; `LSPRAG::Java-Experiment`; `LSPRAG::Go-Experiment`;  
   - Monitor progress in the debug console
   - After the experiment ended, you can find out the result_${current_time} folder at your workspace.
   ![Final Result](assets/python-experiment-result.png)

#### Option B: Use Pre-generated Dataset (Recommended)

Download tar.gz file from 
```bash 
https://drive.google.com/file/d/1labc05nmta4fhW05RoGuypk4NsoYjHf2/view
```

{TODO} --- need verification
<!-- ```bash
cd /LSPRAG
mkdir -p experiments 
cd experiments
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/c51bd7b4bb894033ac82/?dl=1" -O experimentData.tar.gz
tar xvfz experimentData.tar.gz
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/f22b98398e7c46d7b4cf/?dl=1" -O logData.tar.gz
tar xvfz logData.tar.gz
``` -->

The extracted dataset will have this structure:
```
{TODO}
```

### Java Projects [Commons-Cli, Commons-Csv]

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
   |-- lib`
   |   |-- jacocoagent.jar
   |   |-- jacococli.jar
   |   |-- junit-jupiter-api-5.11.2.jar
   |   |-- junit-jupiter-engine-5.11.2.jar
   |   |-- junit-platform-console-standalone-1.8.2.jar
   |   `-- junit-platform-launcher-1.8.2.jar
```

   ##### [OPTIONAL] A. Reproduce by Generating New Test Codes

   Open your development environment, configure settings, and ensure the correct setup by following the steps below:
   ```bash
   # Run development mode
   F5 -> Run

   # Open the project
   Open project directory

   # Choose model at settings.json
   Ensure correct model selection in the configuration file (settings.json)

   # Trigger Java Experiment Mode
   Ctrl + Shift + P -> LSPRAG::Java-Experiment
   ```

   If you are reproducing the experiment, by commandline interface, not debuggin mode. 
   The java language server cannot automatically add the test file to class path, therefore you need to manually add test path in the pom.xml file. 
   For example, 
   // We should move file to the 
   ```
   <build>
      <testSourceDirectory>src/test/java</testSourceDirectory>
      <testResources>
         <testResource>
               <directory>src/test/resources</directory>
         </testResource>
      </testResources>

      <plugins>
         <!-- Add this to set multiple test source directories -->
         <plugin>
               <groupId>org.codehaus.mojo</groupId>
               <artifactId>build-helper-maven-plugin</artifactId>
               <version>3.2.0</version>
               <executions>
                  <execution>
                     <id>add-test-source</id>
                     <phase>generate-test-sources</phase>
                     <goals>
                           <goal>add-test-source</goal>
                     </goals>
                     <configuration>
                           <sources>
                              <source>src/lsprag/test/java</source>
                           </sources>
                     </configuration>
                  </execution>
               </executions>
         </plugin>
      </plugins>
   </build>
   ```
   ##### B. Reproduce with Provided Dataset ( Section 7.2 )

   Once the environment is set up and the unit tests are prepared, you can proceed to reproduce experiments using the provided dataset.

   #### Commons-Cli Project Setup

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
   Run 
   ```python
   python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/commons-cli
      Expected Result :
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

   #### Commons-Csv Project Setup

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
   Run 
   ```python
   python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/commons-csv
   # ommons-csv + gpt-4o-mini + standard
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

### Go Projects [LOGRUS, COBRA]

   #### Prepare Unit Test Codes 

   Option A: Generate Unit Tests (Manual Method)
   
   Follow above instructions.

   Option B: Use Pre-generated Dataset (Recommended)

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
   ```python
   python scripts/result_verifier.py /LSPRAG/experiments/data/main_result/logrus
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
#    ```
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
   # <!-- **EXPECTED RESULT** -->
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


### Python Projects [ BLACK, CRAWL4AI]

   #### Prepare Unit Test Codes

   **Option A: Generate Unit Tests (Manual Method)**
   
   Follow above instructions.

   **Option B: Use Pre-generated Dataset (Recommended)**

   Download dataset by following **Prepare Unit Test Codes :: Option B**.

   Run below command to move dataset to target project
   ```bash
   mkdir -p /LSPRAG/experiments/projects
   cd /LSPRAG/experiments/projects/black # black should be substitue to crawl4ai if you proceed with crawl4ai projects
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

      # Copy dataset 
      cp -r /LSPRAG/experiments/data/black/* .
      ```

   ##### Reproduce Experiment Results

   Once the environment is set up, you can reproduce the experiments using the provided dataset. For Logrus, the following command can be used to perform coverage analysis:

   **BAK - LSPRAG - GPT4o**
   
   ```bash
   # BAK - LSPRAG - GPT4o
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/black \
      /LSPRAG/experiments/projects/black/results_gpt4o/gpt-4o
   
   # Expected Result
   # ...
   # src/blib2to3/pgen2/tokenize.py       610    378    38%
   # src/blib2to3/pygram.py               153      0   100%
   # src/blib2to3/pytree.py               475    251    47%
   # ------------------------------------------------------
   # TOTAL                               7578   3755    50%
   # Test Results Summary:
   # -------------------
   # Files: 269/467 passed (57.60%)
   # -------------------
   ```

   **BAK - NAIVE - GPT4o**

   ```bash
   # BAK - NAIVE - GPT4o
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/black \
      /LSPRAG/experiments/projects/black/results_gpt4o/naive_gpt-4o
   
   # Expected Result
   # ...
   # src/blib2to3/pgen2/token.py           77      3    96%
   # src/blib2to3/pgen2/tokenize.py       610    342    44%
   # src/blib2to3/pygram.py               153      0   100%
   # src/blib2to3/pytree.py               475    267    44%
   # ------------------------------------------------------
   # TOTAL                               7588   3945    48%
   # Test Results Summary:
   # -------------------
   # Files: 223/471 passed (47.35%)
   # -------------------
   ```

   **BAK - COPILOT - GPT4o**

   ```bash
   # BAK - COPILOT - GPT4o
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/black \
      /LSPRAG/experiments/projects/black/results_copilot/copilot
   
   # Expected Result
   # ...
   # src/blib2to3/pgen2/token.py           77      3    96%
   # src/blib2to3/pgen2/tokenize.py       610    393    36%
   # src/blib2to3/pygram.py               153      0   100%
   # src/blib2to3/pytree.py               475    356    25%
   # ------------------------------------------------------
   # TOTAL                               7588   5543    27%
   # Test Results Summary:
   # -------------------
   # Files: 469/577 passed (81.28%)
   # -------------------
   ```

   **BAK - LSPRAG - GPT4o-mini**
   ```bash
   # BAK - LSPRAG - GPT4o-mini
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/black \
      /LSPRAG/experiments/projects/black/results_gpt4o-mini/gpt-4o-mini
   
   # Expected Result
   # ...
   # src/blib2to3/pgen2/tokenize.py       610    327    46%
   # src/blib2to3/pygram.py               153      0   100%
   # src/blib2to3/pytree.py               475    318    33%
   # ------------------------------------------------------
   # TOTAL                               7588   4657    39%
   # Test Results Summary:
   # -------------------
   # Files: 228/439 passed (51.94%)
   # -------------------
   ```

   **BAK - NAIVE - GPT4o-mini**

   ```bash
   # BAK - NAIVE - GPT4o-mini
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/black \
      /LSPRAG/experiments/projects/black/results_gpt4o-mini/naive_gpt-4o-mini
   
   # Expected Result
   # src/blib2to3/pgen2/token.py           77      3    96%
   # src/blib2to3/pgen2/tokenize.py       610    343    44%
   # src/blib2to3/pygram.py               153      0   100%
   # src/blib2to3/pytree.py               475    298    37%
   # ------------------------------------------------------
   # TOTAL                               7588   4759    37%
   # Test Results Summary:
   # -------------------
   # Files: 262/440 passed (59.55%)
   # -------------------
   ```

   **BAK - LSPRAG - DeepSeek-V3**
   ```bash
   # BAK - LSPRAG - DeepSeek-V3
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/black \
      /LSPRAG/experiments/projects/black/results_deepseek/deepseek-chat
   
   # Expected Result
   # src/blib2to3/pgen2/token.py           77      3    96%
   # src/blib2to3/pgen2/tokenize.py       610    315    48%
   # src/blib2to3/pygram.py               153      0   100%
   # src/blib2to3/pytree.py               475    291    39%
   # ------------------------------------------------------
   # TOTAL                               7588   4463    41%
   # Test Results Summary:
   # -------------------
   # Files: 310/432 passed (71.76%)
   # -------------------
   ```

   **BAK - NAIVE - DeepSeek-V3**

   ```bash
   # BAK - NAIVE - DeepSeek-V3
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/black \
      /LSPRAG/experiments/projects/black/results_deepseek/naive_deepseek-chat
   
   # Expected Result
   # src/blib2to3/pgen2/tokenize.py       610    328    46%
   # src/blib2to3/pygram.py               153      0   100%
   # src/blib2to3/pytree.py               475    315    34%
   # ------------------------------------------------------
   # TOTAL                               7588   4534    40%
   # Test Results Summary:
   # -------------------
   # Files: 295/439 passed (67.20%)
   # -------------------
   ```

   #### Crawl4ai Project Setup

      ```bash
      mkdir -p /LSPRAG/experiments/projects
      cd /LSPRAG/experiments/projects
      git clone https://github.com/unclecode/crawl4ai.git
      cd crawl4ai
      git checkout 8878b3d032fb21ce3567b34db128bfa64687198a

      # Python Setup
      python3 -m venv venv
      source venv/bin/activate
      pip install coverage pytest selenium pytest-json-report

      # Install dependencies
      # Don\'nt forget to activate venv environment
      pip install -r requirements.txt

      cp -r /LSPRAG/experiments/data/crawl4ai/* .
      ```

   ##### Reproduce Experiment Results

   Once the environment is set up, you can reproduce the experiments using the provided dataset. For Logrus, the following command can be used to perform coverage analysis:

   **C4AI - LSPRAG - GPT4o**
   
   ```bash
   # C4AI - LSPRAG - GPT4o
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/crawl4ai \
      /LSPRAG/experiments/projects/crawl4ai/results_gpt-4o/gpt-4o
   
   # Expected Result
   # crawl4ai/utils.py                            689    359    48%
   # crawl4ai/version_manager.py                   21      1    95%
   # crawl4ai/web_crawler.py                      110     21    81%
   # --------------------------------------------------------------
   # TOTAL                                       5485   3235    41%
   # Test Results Summary:
   # -------------------
   # Files: 187/373 passed (50.13%)
   # -------------------
   ```

   **C4AI - NAIVE - GPT4o**

   ```bash
   # C4AI - NAIVE - GPT4o
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/crawl4ai \
      /LSPRAG/experiments/projects/crawl4ai/results_gpt-4o/naive_gpt-4o
   # Expected Result
   # crawl4ai/utils.py                            689    484    30%
   # crawl4ai/version_manager.py                   21      7    67%
   # crawl4ai/web_crawler.py                      110     25    77%
   # --------------------------------------------------------------
   # TOTAL                                       5751   3467    40%
   # Test Results Summary:
   # -------------------
   # Files: 186/376 passed (49.47%)
   # -------------------

   ```

   **C4AI - COPILOT - GPT4o**

   ```bash
   # C4AI - COPILOT - GPT4o
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/crawl4ai \
      /LSPRAG/experiments/projects/crawl4ai/results_copilot/copilot
   
   # Expected Result
   # crawl4ai/utils.py                            689    533    23%
   # crawl4ai/version_manager.py                   21     10    52%
   # crawl4ai/web_crawler.py                      110     87    21%
   # --------------------------------------------------------------
   # TOTAL                                       5751   4595    20%
   # Test Results Summary:
   # -------------------
   # Files: 417/493 passed (84.58%)
   # -------------------
   ```

   **C4AI - LSPRAG - GPT4o-mini**
   
   ```bash
   # C4AI - LSPRAG - GPT4o-mini
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/crawl4ai \
      /LSPRAG/experiments/projects/crawl4ai/results_gpt-4o-mini/gpt-4o-mini
   
   # Expected Result
   # crawl4ai/user_agent_generator.py              94     14    85%
   # crawl4ai/utils.py                            689    230    67%
   # crawl4ai/version_manager.py                   21      1    95%
   # crawl4ai/web_crawler.py                      110     26    76%
   # --------------------------------------------------------------
   # TOTAL                                       5751   3291    43%
   # Test Results Summary:
   # -------------------
   # Files: 203/373 passed (54.42%)
   # -------------------
   ```

   **C4AI - NAIVE - GPT4o-mini**

   ```bash
   # C4AI - NAIVE - GPT4o-mini
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/crawl4ai \
      /LSPRAG/experiments/projects/crawl4ai/results_deepseek/deepseek-chat
   # Expected Result
   # crawl4ai/user_agent_generator.py              94     18    81%
   # crawl4ai/utils.py                            689    466    32%
   # crawl4ai/version_manager.py                   21      4    81%
   # crawl4ai/web_crawler.py                      110     81    26%
   # --------------------------------------------------------------
   # TOTAL                                       5751   3534    39%
   # Test Results Summary:
   # -------------------
   # Files: 249/377 passed (66.05%)
   # -------------------

   ```

   **C4AI - LSPRAG - DeepSeek-V3**
   
   ```bash
   # C4AI - LSPRAG - DeepSeek-V3
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/crawl4ai \
      /LSPRAG/experiments/projects/crawl4ai/results_deepseek/deepseek-chat
   
   # Expected Result
   # crawl4ai/ssl_certificate.py                   80     31    61%
   # crawl4ai/user_agent_generator.py              94     16    83%
   # crawl4ai/utils.py                            689    334    52%
   # crawl4ai/version_manager.py                   21      1    95%
   # crawl4ai/web_crawler.py                      110     76    31%
   # --------------------------------------------------------------
   # TOTAL                                       5751   3287    43%
   # Test Results Summary:
   # -------------------
   # Files: 269/377 passed (71.35%)
   # -------------------
   ```

   **C4AI - NAIVE - DeepSeek-V3**

   ```bash
   # C4AI - NAIVE - DeepSeek-V3
   bash /LSPRAG/scripts/python_anal.bash \
      /LSPRAG/experiments/projects/crawl4ai \
      /LSPRAG/experiments/projects/crawl4ai/results_deepseek/naive_deepseek-chat
   # Expected Result
   # crawl4ai/user_agent_generator.py              94     14    85%
   # crawl4ai/utils.py                            689    349    49%
   # crawl4ai/version_manager.py                   21      1    95%
   # crawl4ai/web_crawler.py                      110     81    26%
   # --------------------------------------------------------------
   # TOTAL                                       5751   3354    42%
   # Test Results Summary:
   # -------------------
   # Files: 249/373 passed (66.76%)
   # -------------------

   ```

## Reproduce Experiment Results (Table 4)

In this section, we reproduce the experiment results of Table 4, focusing on the tokens used and the time taken. LSPRAG generates log files when generating test files, and based on these log files, we summarize and analyze the costs associated with LSPRAG's operations.

Before proceeding, make sure you have already downloaded the provided dataset as described in this section(#option-b-use-pre-generated-dataset-recommended).
To reproduce Table 4(CLI project with gpt-4o-mini), you should run below command :
```bash
python3 scripts/anal_cost.py experiments/log-data/commons-cli/results_gpt-4o/logs/gpt-4o experiments/log-data/commons-csv/results_gpt-4o/logs/gpt-4o

# Expected Result
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

python3 scripts/anal_cost.py experiments/log-data/cobra/results_gpt-4o/logs/gpt-4o experiments/log-data/logrus/results_gpt-4o/logs/gpt-4o

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

python3 scripts/anal_cost.py experiments/log-data/crawl4ai/results_gpt-4o/logs/gpt-4o experiments/log-data/black/results_gpt-4o/logs/gpt-4o

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

#### Inspect Othe Throuput Result

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

To summarize the overall cost of generating unit tests for Python projects (`torando` and `black`), use the following commands:

```bash 
# Python Projects
python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/black/logs/gpt-4o /LSPRAG/experiments/data/cost-data/tornado/logs/gpt-4o
# Expected Results 
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


# Go Projects
python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/logrus/logs/gpt-4o /LSPRAG/experiments/data/cost-data/cobra/logs/gpt-4o
# Expected Results 
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


# JAVa Projects
python scripts/anal_cost.py /LSPRAG/experiments/data/cost-data/commons-cli/logs/gpt-4o /LSPRAG/experiments/data/cost-data/commons-csv/logs/gpt-4o

# Expected Results 
# == Overall Statistics (across ALL directories) ===

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

```

and copy the last printed dictionary values and past to `scripts/plot_cost.py`'s variable `data`.
And then, run the plot_cost.py and you can see exactly same plot graph on paper.

#### Interpret Result


Since we perform 5 rounds for each FixWithLLM process, to get the average time and tokens used for fixing the code, refer to the values under `Average FixWithLLM Time per File` and `Average FixWithLLM Tokens per File`.

For other processes, such as collecting context information (`collectInfo`), generating diagnostic error messages (`getDiagnosticsForFilePath`), or saving files (`saveGeneratedCodeToFolder`), you can directly refer to the figures under the Process Avg Time (ms) Avg Tokens section.

## Conclusion 

Thank you for reading this experiment reproduction document! If you encounter any issues or errors, feel free to contact me by creating an issue or sending me an email at iejw1914@gmail.com.

We are dedicated to contributing to the open-source community and welcome any contributions or recommendations!

**Happy Testing with LSPRAG! 🎉**