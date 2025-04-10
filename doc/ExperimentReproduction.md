# LSPAI Experiment Reproduction Guide
<!-- <p align="center">
    <!-- <a href="https://arxiv.org/abs/2302.02261"><img src="https://img.shields.io/badge/arXiv-2302.02261-b31b1b.svg?style=for-the-badge"> -->
    <!-- <a href="https://doi.org/10.5281/zenodo.12669927"><img src="https://img.shields.io/badge/DOI-10.5281%2Fzenodo.8319975-8A2BE2?style=for-the-badge"> -->
    <a href="https://github.com/THU-WingTecher/DeepConstr/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge"></a>
    <a href="https://hub.docker.com/repository/docker/gwihwan/lspai/general"><img src="https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white"></a>
</p> -->

## Table of Contents
- [LSPAI Experiment Reproduction Guide](#lspai-experiment-reproduction-guide)
  - [Table of Contents](#table-of-contents)
  - [🛠️ Setup Guide](#️-setup-guide)
    - [1. Install LSPAI from Source](#1-install-lspai-from-source)
  - [Generate Unit Test Codes by LSPAI](#generate-unit-test-codes-by-lspai)
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

### 1. Install LSPAI from Source

1. Pull the image and run
   ```bash
   docker pull gwihwan/lspai:latest
   docker run -it --name lspai gwihwan/lspai:latest /bin/bash
   ```

2. Clone and Build
   ```bash
   # Clone the repository
   cd ..
   git clone https://github.com/Gwihwan-Go/LSPAI.git
   cd LSPAI
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

## Generate Unit Test Codes by LSPAI

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

1. Download the IDE plugin from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=LSPAI.lspai)
2. Install the plugin
3. SetUp LLM Configuration
   - Open the settings.json file
   - Add the following configuration:
   ```json
   {
     "lspAi": {
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
6. Press right-click and select `LSPAI: Generate Unit Test Codes`
7. Wait for the unit test codes to be generated

### Option B: Build from Source
Each programming language has slightly different steps. 
Overall, you can follow these steps:

If you followed the **Setup Guide :: Option A**, you can directly proceed with step 4.

1. Complete the LSPAI Extension installation (see Setup Guide above)
2. Launch LSPAI in Development Mode:
   - Open `/LSPAI/src/extension.ts`
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

Table 3 claims that LSPAI outperforms other baselines in terms of coverage, and part of valid rate compared to baselines.
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
   cd /LSPAI
   npm install 
   npm run compile
   ```
3. Launch LSPAI in Development Mode:
   - Open `/LSPAI/src/extension.ts`
   - Press `F5` to launch Extension Development Host
   - Select "VS Code Extension Development" from the dropdown
   - A new VS Code window should open

4. Run the experiment:
   - Press `CTRL+SHIFT+P`
   - For Python, you should first generate venv-python version, and install necessary libraries, and select python interpreter at righ-bottom section of vscode.
   - Run one of folloing commands: `LSPAI::Python-Experiment`; `LSPAI::Java-Experiment`; `LSPAI::Go-Experiment`;  
   - Monitor progress in the debug console
   - After the experiment ended, you can find out the result_${current_time} folder at your workspace.
   ![Final Result](assets/python-experiment-result.png)

#### Option B: Use Pre-generated Dataset (Recommended)

Download and extract the experiment dataset:
```bash
cd /LSPAI
mkdir -p experiments 
cd experiments
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/c51bd7b4bb894033ac82/?dl=1" -O experimentData.tar.gz
tar xvfz experimentData.tar.gz
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/f22b98398e7c46d7b4cf/?dl=1" -O logData.tar.gz
tar xvfz logData.tar.gz
```

The extracted dataset will have this structure:
```
/LSPAI/experiments
├── experimentData.tar.gz
├── logData.tar.gz
├── data
│   ├── black
│   ├── cobra
│   ├── commons-cli
│   ├── commons-csv
│   ├── crawl4ai
│   └── logrus
├── log-data
│   ├── black
│   ├── cobra
│   ├── commons-cli
│   ├── commons-csv
│   ├── crawl4ai
│   └── logrus
└── projects
    ├── black
    ├── cobra
    ├── commons-cli
    ├── commons-csv
    ├── crawl4ai
    └── logrus
```

### Java Projects [Commons-Cli, Commons-Csv]

   #### Java Setup

   Ensure that you download the necessary libraries from the provided link:
   ```bash
   # Download required libraries
   cd /LSPAI/scripts
   wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/efade5fc56a54ee59ed1/?dl=1" -O ../javaLib.tar.gz
   tar xvf ../javaLib.tar.gz
   ```

   After running above commands, you can observe that jar files are located at `/LSPAI/experiments/lib/`.
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
   Ctrl + Shift + P -> LSPAI::Java-Experiment
   ```

   If you are reproducing the experiment, by commandline interface, not debuggin mode. 
   The java language server cannot automatically add the test file to class path, therefore you need to manually add test path in the pom.xml file. 
   For example, 
   // We should move file to the 
    // ${project.basedir}/src/lspai/test/java --> to get the correct and fast diagnostics
    // <plugin>
    //     <groupId>org.codehaus.mojo</groupId>
    //     <artifactId>build-helper-maven-plugin</artifactId>
    //     <version>3.5.0</version>
    //     <executions>
    //         <execution>
    //             <id>add-test-source</id>
    //             <phase>generate-test-sources</phase>
    //             <goals>
    //                 <goal>add-test-source</goal>
    //             </goals>
    //             <configuration>
    //                 <sources>
    //                     <!-- Add your additional test source directory -->
    //                     <source>${project.basedir}/src/test/java</source>
    //                     <source>${project.basedir}/src/lspai/test/java</source>
    //                 </sources>
    //             </configuration>
    //         </execution>
    //     </executions>
    // </plugin>

   ##### B. Reproduce with Provided Dataset ( Table 3 )

   Once the environment is set up and the unit tests are prepared, you can proceed to reproduce experiments using the provided dataset.

   #### Commons-Cli Project Setup

   To set up the CLI project, follow these steps:
   ```bash
   # Clone and checkout a specific version
   mkdir -p /LSPAI/experiments/projects
   cd /LSPAI/experiments/projects
   git clone https://github.com/apache/commons-cli.git
   cd commons-cli

   # Java Setup - This step is required for coverage analysis
   mvn install -DskipTests -Drat.skip=true
   mvn dependency:copy-dependencies
   ```

   ##### Reproduce Experiment Results

   Run the following commands one at a time, and checkout results. 
   You have to run six different commands for each baseline (NAIVE, LSPAI) and each model (DeepSeek, GPT4o, etc.):
   For easier reproduction, we provide the expected results corresponding to each command.

   **CLI - LSPAI - GPT4o**
   ```bash
   # CLI - LSPAI - GPT4o
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o/gpt-4o
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1965
   # Missed Lines 653
   # Line Coverages are 66.77%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-cli/results_gpt-4o/gpt-4o
   # ============================
   # Total .java files: 150
   # Files with corresponding .class files: 116
   # Pass rate: 77.33%
   # ============================
   ```

   **CLI - NAIVE - GPT4o**
   ```bash
   # CLI - NAIVE - GPT4o
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o/NOFIX_naive_gpt-4o
   # Expected Result 
   # ============================
   # Total lines 1965
   # Missed Lines 1174
   # Line Coverages are 40.25%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-cli/results_gpt-4o/NOFIX_naive_gpt-4o
   # ============================
   # Total .java files: 150
   # Files with corresponding .class files: 82
   # Pass rate: 54.67%
   # ============================
   ```

   **CLI - Copilot - GPT4o**
   ```bash
   # CLI - Copilot - GPT4o
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_copilot/copilot
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1954
   # Missed Lines 1476
   # Line Coverages are 24.46%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-cli/results_copilot/copilot
   # ============================
   # Total .java files: 150
   # Files with corresponding .class files: 39
   # Pass rate: 26.00%
   # ============================
   ```

   **CLI - LSPAI - GPT4o-mini**
   ```bash
   # CLI - LSPAI - GPT4o-mini
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o-mini/gpt-4o-mini
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1965
   # Missed Lines 817
   # Line Coverages are 58.42%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-cli/results_gpt-4o-mini/gpt-4o-mini
   # ============================
   # Total .java files: 150
   # Files with corresponding .class files: 89
   # Pass rate: 59.33%
   # ============================
   ```

   **CLI - NAIVE - GPT4o-mini**
   ```bash
   # CLI - NAIVE - GPT4o-mini
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o-mini/NOFIX_naive_gpt-4o-mini
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1954
   # Missed Lines 1587
   # Line Coverages are 18.78%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-cli/results_gpt-4o-mini/NOFIX_naive_gpt-4o-mini
   # ============================
   # Total .java files: 150
   # Files with corresponding .class files: 36
   # Pass rate: 24.00%
   # ============================
   ```

   **CLI - LSPAI - DeepSeek-V3**
   ```bash
   # CLI - LSPAI - DeepSeek-V3
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_deepseek/deepseek-chat
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1954
   # Missed Lines 744
   # Line Coverages are 61.92%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-cli/results_deepseek/deepseek-chat
   # ============================
   # Total .java files: 150
   # Files with corresponding .class files: 119
   # Pass rate: 79.33%
   # ============================
   ```

   **CLI - NAIVE - DeepSeek-V3**
   ```bash
   # CLI - NAIVE - DeepSeek-V3
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_deepseek/NOFIX_deepseek-chat
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1954
   # Missed Lines 1023
   # Line Coverages are 47.65%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-cli/results_deepseek/NOFIX_deepseek-chat
   # ============================
   # Total .java files: 150
   # Files with corresponding .class files: 65
   # Pass rate: 43.33%
   ```

   #### Commons-Csv Project Setup

   To set up the CSV project, follow these steps:
   ```bash
   # Clone and checkout a specific version
   mkdir -p /LSPAI/experiments/projects
   cd /LSPAI/experiments/projects
   git clone https://github.com/apache/commons-csv.git
   cd commons-csv

   # Java Setup
   mvn install -DskipTests -Drat.skip=true
   mvn dependency:copy-dependencies
   ```

   ##### Reproduce Experiment Results

   Run the following commands one at a time, and checkout results. 
   You have to run six different commands for each baseline (NAIVE, LSPAI) and each model (DeepSeek, GPT4o, etc.):
   For easier reproduction, we provide the expected results corresponding to each command.

   **CSV - LSPAI - GPT4o**
   ```bash
   # CSV - LSPAI - GPT4o
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o/gpt-4o
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1257
   # Missed Lines 606
   # Line Coverages are 51.79%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-csv/results_gpt-4o/gpt-4o
   # ============================
   # Total .java files: 74
   # Files with corresponding .class files: 47
   # Pass rate: 63.51%
   # ============================
   ```

   **CSV - NAIVE - GPT4o**
   ```bash
   # CSV - NAIVE - GPT4o
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o/naive_gpt-4o
   # Expected Result 
   # Printing final result
   # =============================
   # Total lines 1257
   # Missed Lines 981
   # Line Coverages are 21.96%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-csv/results_gpt-4o/naive_gpt-4o
   # ============================
   # Total .java files: 74
   # Files with corresponding .class files: 19
   # Pass rate: 25.68%
   # ============================
   ```

   **CSV - Copilot - GPT4o**
   ```bash
   # CSV - Copilot - GPT4o
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_copilot/copilot
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1257
   # Missed Lines 956
   # Line Coverages are 23.95%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-csv/results_copilot/copilot
   # ============================
   # Total .java files: 74
   # Files with corresponding .class files: 11
   # Pass rate: 14.86%
   # ============================
   ```

   **CSV - LSPAI - GPT4o-mini**
   ```bash
   # CSV - LSPAI - GPT4o-mini
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o-mini/gpt-4o-mini
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1257
   # Missed Lines 555
   # Line Coverages are 55.85%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-csv/results_gpt-4o-mini/gpt-4o-mini
   # ============================
   # Total .java files: 74
   # Files with corresponding .class files: 25
   # Pass rate: 33.78%
   # ============================
   ```

   **CSV - NAIVE - GPT4o-mini**
   ```bash
   # CSV - NAIVE - GPT4o-mini
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o-mini/naive_gpt-4o-mini
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1257
   # Missed Lines 1048
   # Line Coverages are 16.63%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-csv/results_gpt-4o-mini/naive_gpt-4o-mini
   # ============================
   # Total .java files: 74
   # Files with corresponding .class files: 9
   # Pass rate: 12.16%
   # ============================
   ```

   If measuring process hainging too long, press CTRL+C one time
   **CSV - LSPAI - DeepSeek-V3**
   ```bash
   # CSV - LSPAI - DeepSeek-V3
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_deepseek/deepseek-chat
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1257
   # Missed Lines 495
   # Line Coverages are 60.62%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-csv/results_deepseek/deepseek-chat
   # ============================
   # Total .java files: 74
   # Files with corresponding .class files: 60
   # Pass rate: 81.08%
   # ============================

   ```

   If measuring process hainging too long, press CTRL+C one time
   **CSV - NAIVE - DeepSeek-V3**
   ```bash
   # CSV - NAIVE - DeepSeek-V3
   bash /LSPAI/scripts/java_anal.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_deepseek/NOFIX_deepseek-chat
   # Expected Result 
   # Printing final result
   # ============================
   # Total lines 1257
   # Missed Lines 762
   # Line Coverages are 39.38%
   # ============================
   # Printing valid rate
   # Pass rate for /LSPAI/experiments/data/commons-csv/results_deepseek/naive_deepseek-chat
   # ============================
   # Total .java files: 74
   # Files with corresponding .class files: 15
   # Pass rate: 20.27%
   # ============================
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
   mkdir -p /LSPAI/experiments/projects
   cd /LSPAI/experiments/projects
   git clone https://github.com/sirupsen/logrus.git
   cd logrus
   # Optional: Checkout specific commit (if applicable)
   # git checkout <specific_version>

   # Go Setup
   go env -w GOPROXY=https://goproxy.io,direct
   go mod tidy
   ```

   ##### Reproduce Experiment Results

   Once the environment is set up, you can reproduce the experiments using the provided dataset. For Logrus, the following command can be used to perform coverage analysis:

   **LOG - LSPAI - GPT4o**
   ```bash
   # LOG - LSPAI - GPT4o
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/logrus \
      /LSPAI/experiments/data/logrus/results_gpt-4o/gpt-4o
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/logrus/results_gpt-4o/gpt-4o-report/coverage.out
   # Total Statements: 431
   # Covered Statements: 142
   # Coverage Percentage: 32.95%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 69
   # Valid Files: 15
   # Pass rate: 21.74
   # =====================
   ```

   **LOG - NAIVE - GPT4o**
   ```bash
   # LOG - NAIVE - GPT4o
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/logrus \
      /LSPAI/experiments/data/logrus/results_gpt-4o/naive_gpt-4o
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/logrus/results_gpt-4o/naive_gpt-4o-report/coverage.out
   # Total Statements: 431
   # Covered Statements: 5
   # Coverage Percentage: 1.16%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 70
   # Valid Files: 3
   # Pass rate: 4.29
   # =====================
   ```

   **LOG - Copilot - GPT4o**
   ```bash
   # LOG - Copilot - GPT4o
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/logrus \
      /LSPAI/experiments/data/logrus/results_copilot/copilot
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/logrus/results_copilot/copilot-report/coverage.out
   # Total Statements: 431
   # Covered Statements: 8
   # Coverage Percentage: 1.86%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 70
   # Valid Files: 2
   # Pass rate: 2.86
   # =====================
   ```

   **LOG - LSPAI - GPT4o-mini**
   ```bash
   # LOG - LSPAI - GPT4o-mini
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/logrus \
      /LSPAI/experiments/data/logrus/results_gpt-4o-mini/gpt-4o-mini
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/logrus/results_gpt-4o-mini/gpt-4o-mini-report/coverage.out
   # Total Statements: 431
   # Covered Statements: 131
   # Coverage Percentage: 30.39%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 69
   # Valid Files: 10
   # Pass rate: 14.49
   # =====================
   ```

   **LOG - NAIVE - GPT4o-mini**
   ```bash
   # LOG - NAIVE - GPT4o-mini
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/logrus \
      /LSPAI/experiments/data/logrus/results_gpt-4o-mini/naive_gpt-4o-mini
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/logrus/results_gpt-4o-mini/naive_gpt-4o-mini-report/coverage.out
   # Total Statements: 431
   # Covered Statements: 12
   # Coverage Percentage: 2.78%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 70
   # Valid Files: 3
   # Pass rate: 4.29
   # =====================
   ```

   **LOG - LSPAI - DeepSeek-V3**
   ```bash
   # LOG - LSPAI - DeepSeek-V3
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/logrus \
      /LSPAI/experiments/data/logrus/results_deepseek/deepseek-chat
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/logrus/results_deepseek/deepseek-chat-report/coverage.out
   # Total Statements: 431
   # Covered Statements: 236
   # Coverage Percentage: 54.76%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 69
   # Valid Files: 28
   # Pass rate: 40.58
   # =====================
   ```

   **LOG - NAIVE - DeepSeek-V3**
   ```bash
   # LOG - NAIVE - DeepSeek-V3
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/logrus \
      /LSPAI/experiments/data/logrus/results_deepseek/naive_deepseek-chat
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/logrus/results_deepseek/naive_deepseek-chat-report/coverage.out
   # Total Statements: 431
   # Covered Statements: 147
   # Coverage Percentage: 34.11%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 70
   # Valid Files: 15
   # Pass rate: 21.43
   # =====================
   ```

   #### Cobra Project Setup

   To set up the Cobra project, follow these steps:
   ```bash
   # Clone and checkout a specific version
   mkdir -p /LSPAI/experiments/projects
   cd /LSPAI/experiments/projects
   git clone https://github.com/spf13/cobra.git
   cd cobra
   # Optional: Checkout specific commit (if applicable)
   # git checkout <specific_version>

   # Go Setup
   go env -w GOPROXY=https://goproxy.io,direct
   go mod tidy
   ```

   ##### Reproduce Experiment Results

   Once the environment is set up, you can reproduce the experiments using the provided dataset. For Logrus, the following command can be used to perform coverage analysis:

   **COB - LSPAI - GPT4o**
   ```bash
   # COB - LSPAI - GPT4o
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/cobra \
      /LSPAI/experiments/data/cobra/results_gpt4o/gpt-4o
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/cobra/results_gpt4o/gpt-4o-report/coverage.out
   # Total Statements: 984
   # Covered Statements: 155
   # Coverage Percentage: 15.75%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 154
   # Valid Files: 27
   # Pass rate: 17.53
   # =====================
   ```

   **COB - NAIVE - GPT4o**
   ```bash
   # COB - NAIVE - GPT4o
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/cobra \
      /LSPAI/experiments/data/cobra/results_gpt4o/naive_gpt-4o
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/cobra/results_gpt4o/naive_gpt-4o-report/coverage.out
   # Total Statements: 984
   # Covered Statements: 2
   # Coverage Percentage: 0.20%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 155
   # Valid Files: 16
   # Pass rate: 10.32
   # =====================
   ```

   **COB - Copilot - GPT4o**
   ```bash
   # COB - Copilot - GPT4o
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/cobra \
      /LSPAI/experiments/data/cobra/results_copilot/copilot
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/cobra/results_copilot/copilot-report/coverage.out
   # Total Statements: 984
   # Covered Statements: 53
   # Coverage Percentage: 5.39%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 155
   # Valid Files: 11
   # Pass rate: 7.10
   # =====================
   ```

   **COB - LSPAI - GPT4o-mini**
   ```bash
   # COB - LSPAI - GPT4o-mini
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/cobra \
      /LSPAI/experiments/data/cobra/results_gpt-4o-mini/gpt-4o-mini
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/cobra/results_gpt-4o-mini/gpt-4o-mini-report/coverage.out
   # Total Statements: 984
   # Covered Statements: 74
   # Coverage Percentage: 7.52%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 154
   # Valid Files: 17
   # Pass rate: 11.04
   # =====================
   ```

   **COB - NAIVE - GPT4o-mini**
   ```bash
   # COB - NAIVE - GPT4o-mini
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/cobra \
      /LSPAI/experiments/data/cobra/results_gpt-4o-mini/naive_gpt-4o-mini
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/cobra/results_gpt-4o-mini/naive_gpt-4o-mini-report/coverage.out
   # Total Statements: 984
   # Covered Statements: 23
   # Coverage Percentage: 2.34%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 155
   # Valid Files: 13
   # Pass rate: 8.39
   # =====================
   ```

   **COB - LSPAI - DeepSeek-V3**
   ```bash
   # COB - LSPAI - DeepSeek-V3
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/cobra \
      /LSPAI/experiments/data/cobra/results_deepseek/deepseek-chat
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/cobra/results_deepseek/deepseek-chat-report/coverage.out
   # Total Statements: 984
   # Covered Statements: 529
   # Coverage Percentage: 53.76%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 112
   # Valid Files: 51
   # Pass rate: 45.54
   # =====================
   ```

   **COB - NAIVE - DeepSeek-V3**
   ```bash
   # COB - NAIVE - DeepSeek-V3
   bash /LSPAI/scripts/go_anal.bash \
      /LSPAI/experiments/projects/cobra \
      /LSPAI/experiments/data/cobra/results_deepseek/naive_deepseek-chat
   
   # Expected Result
   # =====================
   # Coverage Report: /LSPAI/experiments/data/cobra/results_deepseek/naive_deepseek-chat-report/coverage.out
   # Total Statements: 984
   # Covered Statements: 161
   # Coverage Percentage: 16.36%
   # =====================
   # Printing valid rate:
   # =====================
   # Total Files: 147
   # Valid Files: 23
   # Pass rate: 15.65
   # =====================
   ```

### Python Projects [ BLACK, CRAWL4AI]

   #### Prepare Unit Test Codes

   **Option A: Generate Unit Tests (Manual Method)**
   
   Follow above instructions.

   **Option B: Use Pre-generated Dataset (Recommended)**

   Download dataset by following **Prepare Unit Test Codes :: Option B**.

   Run below command to move dataset to target project
   ```bash
   mkdir -p /LSPAI/experiments/projects
   cd /LSPAI/experiments/projects/black # black should be substitue to crawl4ai if you proceed with crawl4ai projects
   cp -r /LSPAI/experiments/data/black/* .
   ```


   #### Black Project Setup

      To set up the Black project, follow these steps:
      ```bash
      # Clone and checkout specific version
      mkdir -p /LSPAI/experiments/projects
      cd /LSPAI/experiments/projects
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
      cp -r /LSPAI/experiments/data/black/* .
      ```

   ##### Reproduce Experiment Results

   Once the environment is set up, you can reproduce the experiments using the provided dataset. For Logrus, the following command can be used to perform coverage analysis:

   **BAK - LSPAI - GPT4o**
   
   ```bash
   # BAK - LSPAI - GPT4o
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/black \
      /LSPAI/experiments/projects/black/results_gpt4o/gpt-4o
   
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
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/black \
      /LSPAI/experiments/projects/black/results_gpt4o/naive_gpt-4o
   
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
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/black \
      /LSPAI/experiments/projects/black/results_copilot/copilot
   
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

   **BAK - LSPAI - GPT4o-mini**
   ```bash
   # BAK - LSPAI - GPT4o-mini
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/black \
      /LSPAI/experiments/projects/black/results_gpt4o-mini/gpt-4o-mini
   
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
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/black \
      /LSPAI/experiments/projects/black/results_gpt4o-mini/naive_gpt-4o-mini
   
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

   **BAK - LSPAI - DeepSeek-V3**
   ```bash
   # BAK - LSPAI - DeepSeek-V3
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/black \
      /LSPAI/experiments/projects/black/results_deepseek/deepseek-chat
   
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
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/black \
      /LSPAI/experiments/projects/black/results_deepseek/naive_deepseek-chat
   
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
      mkdir -p /LSPAI/experiments/projects
      cd /LSPAI/experiments/projects
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

      cp -r /LSPAI/experiments/data/crawl4ai/* .
      ```

   ##### Reproduce Experiment Results

   Once the environment is set up, you can reproduce the experiments using the provided dataset. For Logrus, the following command can be used to perform coverage analysis:

   **C4AI - LSPAI - GPT4o**
   
   ```bash
   # C4AI - LSPAI - GPT4o
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/crawl4ai \
      /LSPAI/experiments/projects/crawl4ai/results_gpt-4o/gpt-4o
   
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
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/crawl4ai \
      /LSPAI/experiments/projects/crawl4ai/results_gpt-4o/naive_gpt-4o
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
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/crawl4ai \
      /LSPAI/experiments/projects/crawl4ai/results_copilot/copilot
   
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

   **C4AI - LSPAI - GPT4o-mini**
   
   ```bash
   # C4AI - LSPAI - GPT4o-mini
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/crawl4ai \
      /LSPAI/experiments/projects/crawl4ai/results_gpt-4o-mini/gpt-4o-mini
   
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
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/crawl4ai \
      /LSPAI/experiments/projects/crawl4ai/results_deepseek/deepseek-chat
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

   **C4AI - LSPAI - DeepSeek-V3**
   
   ```bash
   # C4AI - LSPAI - DeepSeek-V3
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/crawl4ai \
      /LSPAI/experiments/projects/crawl4ai/results_deepseek/deepseek-chat
   
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
   bash /LSPAI/scripts/python_anal.bash \
      /LSPAI/experiments/projects/crawl4ai \
      /LSPAI/experiments/projects/crawl4ai/results_deepseek/naive_deepseek-chat
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

In this section, we reproduce the experiment results of Table 4, focusing on the tokens used and the time taken. LSPAI generates log files when generating test files, and based on these log files, we summarize and analyze the costs associated with LSPAI's operations.

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
│   │   ├── results_deepseek-chat
│   │   │   ├── history
│   │   │   ├── logs
│   │   │   │   ├── deepseek-chat <-- COPY the PATH of this folder!
│   │   │   │   │   └── ... json files
```
Copy the absolute path of the folder marked as `<-- COPY the PATH of this folder!`, and then run the prewritten Python scripts below.

To summarize the overall cost of generating unit tests for Python projects (`crawl4ai` and `black`), use the following commands:

```bash 
# Python - DS-V3 ( Remember we moved dataset files from data/ folder to project/ folder)
python3 scripts/anal_cost.py /LSPAI/experiments/projects/black/results_deepseek/logs/deepseek-chat /LSPAI/experiments/projects/crawl4ai/results_deepseek/logs/deepseek-chat

# Go - DS-V3 
python3 scripts/anal_cost.py /LSPAI/experiments/data/logrus/results_deepseek/logs/deepseek-chat /LSPAI/experiments/data/cobra/results_deepseek/logs/deepseek-chat

# Java - DS-V3 
python3 scripts/anal_cost.py /LSPAI/experiments/data/commons-cli/results_deepseek/logs/deepseek-chat /LSPAI/experiments/data/commons-csv/results_deepseek/logs/deepseek-chat
```

#### Interpret Result

After running the above commands, you will get summarized results in the following format:

```bash
=== Overall Statistics (across ALL directories) ===

Total Files Processed: 435
Total Time Used (ms): 50501186
Total Tokens Used: 766972
Total FixWithLLM Tokens Used: 79256
Total FixWithLLM Processes Run: 54
Average Time per File (ms): 116094.68
Average Tokens per File: 1763.15
Average FixWithLLM Time per File (ms): 1674.84
Average FixWithLLM Tokens per File: 182.20

=== Average Time and Token Usage per Process ===

Process                          Avg Time (ms)      Avg Tokens
-----------------------------------------------------------------
End                                   59194.80            0.00
FixWithLLM_1                          11358.20         1306.88
FixWithLLM_2                          17819.57         1805.29
FixWithLLM_3                          20662.75         1981.25
FixWithLLM_4                          26029.50         2466.00
FixWithLLM_5                          14779.00         1487.00
collectInfo                           36167.88            0.00
getDiagnosticsForFilePath              6681.67            0.00
invokeLLM                             12374.62         1580.96
saveGeneratedCodeToFolder                 0.88            0.00
start                                     0.00            0.00

```

Since we perform 5 rounds for each FixWithLLM process, to get the average time and tokens used for fixing the code, refer to the values under `Average FixWithLLM Time per File` and `Average FixWithLLM Tokens per File`.

For other processes, such as collecting context information (`collectInfo`), generating diagnostic error messages (`getDiagnosticsForFilePath`), or saving files (`saveGeneratedCodeToFolder`), you can directly refer to the figures under the Process Avg Time (ms) Avg Tokens section.

## Conclusion 

Thank you for reading this experiment reproduction document! If you encounter any issues or errors, feel free to contact me by creating an issue or sending me an email at iejw1914@gmail.com.

We are dedicated to contributing to the open-source community and welcome any contributions or recommendations!

**Happy Testing with LSPAI! 🎉**