## Currently WIP

## Table of Contents
- [Currently WIP](#currently-wip)
- [Table of Contents](#table-of-contents)
- [🛠️ Setup Guide](#️-setup-guide)
  - [1. Install LSPAI Extension](#1-install-lspai-extension)
    - [Option A: VS Code Marketplace (Coming Soon!)](#option-a-vs-code-marketplace-coming-soon)
    - [Option B: Build from Source](#option-b-build-from-source)
- [Reproduce Experiment Results](#reproduce-experiment-results)
  - [Prepare Unit Test Codes](#prepare-unit-test-codes)
    - [Option A: Generate Unit Tests (Manual Method)](#option-a-generate-unit-tests-manual-method)
    - [Option B: Use Pre-generated Dataset (Recommended)](#option-b-use-pre-generated-dataset-recommended)
  - [Python Projects \[ BLACK, CRAWL4AI\]](#python-projects--black-crawl4ai)
    - [Option A: Generate Unit Tests (Manual Method)](#option-a-generate-unit-tests-manual-method-1)
    - [Option B: Use Pre-generated Dataset (Recommended)](#option-b-use-pre-generated-dataset-recommended-1)
    - [Go Projects \[LOGRUS, COBRA\]](#go-projects-logrus-cobra)
  - [Java Projects \[Commons-Cli, commons-csv\]](#java-projects-commons-cli-commons-csv)
    - [**Java Setup**](#java-setup)
  - [Throuput Experiment  \[WIP\]](#throuput-experiment--wip)
  - [Prerequisites](#prerequisites)
  - [Prerequisites](#prerequisites-1)


## 🛠️ Setup Guide

### 1. Install LSPAI Extension

#### Option A: VS Code Marketplace (Coming Soon!)

Download the extension from this [link](https://marketplace.visualstudio.com/items?itemName=GwihwanGo.lspAi) or search "LSPAI" in VS Code extension market.

#### Option B: Build from Source
1. Pull the image and run
   ```bash
   docker pull lspai:latest
   docker run -it --name lspai lspai:latest /bin/bash
   ```

2. Clone and Build
   ```bash
   # Clone the repository
   git clone https://github.com/your-repo/lspai.git
   cd lspai

   # Install dependencies
   npm install

   # Build the extension
   npm run compile
   ```

After installing the extension, please configure your language servers and LLM settings by following the 🛠️ Setup Guide in the [README](../README.md).

## Reproduce Experiment Results 

There are two ways to proceed with the experiments:

### Prepare Unit Test Codes 

#### Option A: Generate Unit Tests (Manual Method)

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

4. Run the experiment:
   - Press `CTRL+SHIFT+P`
   - For Python, you should first generate venv-python version, and install necessary libraries, and select python interpreter at righ-bottom section of vscode.
   - Run one of folloing commands: `LSPAI::Python-Experiment`; `LSPAI::Java-Experiment`; `LSPAI::Go-Experiment`;  
   - Monitor progress in the debug console
   - After the experiment ended, you can find out the result_${current_time} folder at your workspace.
   ![Final Result](assets/python-experiment-result.png)

> Note: Generating unit tests for every function in real-world projects is time-consuming. We provide pre-generated experiment data as an alternative (see Option B).

#### Option B: Use Pre-generated Dataset (Recommended)

Download and extract the experiment dataset:
```bash
cd /LSPAI
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/b2fb4d2da958401d8005/?dl=1" -O experiments/experimentData.tar.gz
mkdir experiments/data
cd experiments/data
tar xvf ../experimentData.tar.gz
```

The extracted dataset will have this structure:
```
/LSPAI/experiments
├── experimentData.tar.gz
└── data
    ├── black
    ├── cobra
    ├── commons-cli
    ├── commons-csv
    └── logrus
```

### Python Projects [ BLACK, CRAWL4AI]

   0. #### **Prepare Unit Test Codes** 

   #### Option A: Generate Unit Tests (Manual Method)
   
   Follow above instructions.

   #### Option B: Use Pre-generated Dataset (Recommended)

   Download dataset by following **Prepare Unit Test Codes :: Option B**.

   Run below command to move dataset to target project
   ```bash
   cd /LSPAI/experiments/projects/black # black should be substitue to crawl4ai if you proceed with crawl4ai projects
   mv /LSPAI/experiments/data/black/* .
   ```


   1. #### **Black Project Setup**

      To set up the Black project, follow these steps:
      ```bash
      # Clone and checkout specific version
      cd /LSPAI/experiments/projects
      git clone https://github.com/psf/black.git
      cd black
      git checkout 8dc912774e322a2cd46f691f19fb91d2237d06e2

      # Python Setup
      python3 -m venv venv
      source venv/bin/activate
      pip install coverage pytest

      # Install dependencies
      pip install -r docs/requirements.txt
      pip install -r test_requirements.txt
      pip install click mypy_extensions packaging urllib3 pathspec platformdirs

      # Configure project
      echo "version = '00.0.0'" > src/black/_black_version.py
      rm pyproject.toml

      ```

   2. #### **Reproduce Experiment for Black Project**

      To reproduce the experiments, run the following commands for each baseline (GPT-4o, GPT-4o-mini, DeepSeek):

      ```bash
      # LSPAI - DS-V3
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/black \
         /LSPAI/experiments/data/black/results_deepseek/deepseek-chat

      # NAIVE - DS-V3
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/black \
         /LSPAI/experiments/projects/black/results_deepseek/naive_deepseek-chat

      # LSPAI - GPT4o
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/black \
         /LSPAI/experiments/data/black/results_gpt-4o/gpt-4o

      # NAIVE - GPT4o
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/black \
         /LSPAI/experiments/projects/black/results_gpt-4o/naive_gpt-4o

      # LSPAI - GPT4o-mini
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/black \
         /LSPAI/experiments/projects/black/results_gpt-4o-mini/gpt-4o-mini

      # NAIVE - GPT4o-mini
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/black \
         /LSPAI/experiments/projects/black/results_gpt-4o-mini/naive_gpt-4o-mini
      ```
      
   3. #### **Analysis of Results**

      After running any of the above commands, you'll get output for Coverage Analysis and Passrate Analysis.

      a. Coverage Analysis ( e.g., deepseek)

      The printed output will show coverage results for various files. Here's an example:
      ```
      ...
      src/blib2to3/pytree.py               475    315    34%
      ------------------------------------------------------
      TOTAL                               7588   4534    40%
      ```
      The **TOTAL** row represents the final coverage percentage. In this case, 40%.
      > Note: Coverage numbers may vary based on the environment, but LSPAI typically shows a 1-2% higher coverage compared to the naive approach.
   
      b. Valid Rate Analysis ( The number of total functions : 440 )

      The printed output also show summarized results for whole unit test code files. Here's an example:

      ```
      ...
      ============================================================================================================ ... failed, ... passed, ... warnings, 144 errors in 7.34s =============================================================================================================
      ...
      ```
      From the given the number of errors, we can calculate the Valid Rate. 
      
      In this case, 67.3% ((440 - 144) / 440 )


   4. #### **Crawl4ai Project Setup**
      ```bash
      cd /LSPAI/experiments/projects
      git clone https://github.com/unclecode/crawl4ai.git
      cd crawl4ai
      git checkout 8878b3d032fb21ce3567b34db128bfa64687198a

      # Python Setup
      python3 -m venv venv
      source venv/bin/activate
      pip install coverage pytest

      # Install dependencies
      # Don\'nt forget to activate venv environment
      pip install -r requirements.txt

      mv /LSPAI/experiments/data/crawl4ai/* .
      ```

   5. #### **Reproduce Experiment for CRAWL4AI Project**

      To reproduce the experiments, run the following commands for each baseline (GPT-4o, GPT-4o-mini, DeepSeek):

      ```bash
      # LSPAI - DS-V3
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/crawl4ai \
         /LSPAI/experiments/data/crawl4ai/results_deepseek/deepseek-chat

      # NAIVE - DS-V3
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/crawl4ai \
         /LSPAI/experiments/projects/crawl4ai/results_deepseek/naive_deepseek-chat

      # LSPAI - GPT4o
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/crawl4ai \
         /LSPAI/experiments/data/crawl4ai/results_gpt-4o/gpt-4o

      # NAIVE - GPT4o
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/crawl4ai \
         /LSPAI/experiments/projects/crawl4ai/results_gpt-4o/naive_gpt-4o

      # LSPAI - GPT4o-mini
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/crawl4ai \
         /LSPAI/experiments/data/crawl4ai/results_gpt-4o-mini/gpt-4o-mini

      # NAIVE - GPT4o-mini
      bash /LSPAI/experiments/scripts/python_coverage.bash \
         /LSPAI/experiments/projects/crawl4ai \
         /LSPAI/experiments/projects/crawl4ai/results_gpt-4o-mini/naive_gpt-4o-mini
      ```

   6. #### **Analysis of Results**

      After running any of the above commands, you'll get output for Coverage Analysis and Passrate Analysis.

      a. Coverage Analysis ( e.g., deepseek)

      The printed output will show coverage results for various files. Here's an example:
      ```
         ...
      crawl4ai/utils.py                            689    334    52%
      crawl4ai/version_manager.py                   21      1    95%
      crawl4ai/web_crawler.py                      110     80    27%
      --------------------------------------------------------------
      TOTAL                                       5751   3304    43%
         ```
      The TOTAL row represents the overall coverage percentage (43% in this case).
         > Note: Coverage numbers may vary based on the environment, but LSPAI typically shows a 1-2% higher coverage compared to the naive approach.
      
         b. Valid Rate Analysis ( The number of total functions : 377 )

      The passrate analysis will summarize the number of total functions and the number of errors. Here's an example of the printed output:
      ```
      ...
      ============================================================================================================ ... failed, ... passed, ... warnings, 108 errors in 20.98s =============================================================================================================
      ...
      ```
      From the given the number of errors, we can calculate the Valid Rate. 
      
      In this case, 71.3% ((377 - 108) / 377 )

#### Go Projects [LOGRUS, COBRA]

cd /LSPAI/experiments/projects
git clone https://github.com/sirupsen/logrus.git
cd logrus
go env -w GOPROXY=https://goproxy.io,direct
go mod tidy

bash experiments/scripts/go_coverage.bash  /vscode-llm-ut/experiments/projects/logrus /vscode-llm-ut/experiments/data/results_deepseek/deepseek-chat

```bash
...
github.com/sirupsen/logrus/writer.go:96.2,96.16 1 1
github.com/sirupsen/logrus/writer.go:100.45,102.2 1 0
Total Statements: 588
Covered Statements: 174
Coverage Percentage: 29.59%
```

pass rate analysis 
```bash
bash /LSPAI/experiments/scripts/go_coverage.bash  /LSPAI/experiments/projects/logrus /LSPAI/experiments/data/logrus/results_deepseek/deepseek-chat
```

```bash
Total test files: 30
Pass rate: 21.428571428571427
```

- cobra

cd /LSPAI/experiments/projects
git clone https://github.com/spf13/cobra.git
cd cobra
go env -w GOPROXY=https://goproxy.io,direct
go mod tidy

bash experiments/scripts/go_coverage.bash  /vscode-llm-ut/experiments/projects/cobra /vscode-llm-ut/experiments/data/cobra/results_deepseek/deepseek-chat_clean

### Java Projects [Commons-Cli, commons-csv]


   #### **Java Setup**

   Ensure that you download the necessary libraries from the provided link:
   ```bash
   cd /LSPAI/experiments/scripts
   mvn install
   ```

   Ensure that you download the necessary libraries from the provided link:
   ```bash
   # Download required libraries
   cd /LSPAI/experiments/scripts
   wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/efade5fc56a54ee59ed1/?dl=1" -O ../javaLib.tar.gz
   tar xvf ../javaLib.tar.gz
   ```

   After running above commands, you can observe that jar files are located at `/LSPAI/lib/`.
   ```bash
   |-- lib`
   |   |-- jacocoagent.jar
   |   |-- jacococli.jar
   |   |-- junit-jupiter-api-5.11.2.jar
   |   |-- junit-jupiter-engine-5.11.2.jar
   |   |-- junit-platform-console-standalone-1.8.2.jar
   |   `-- junit-platform-launcher-1.8.2.jar
```

   <!-- 0. **Prepare Unit Test Codes** 

   #### Option A: Generate Unit Tests (Manual Method)
   
   Follow above instructions.

   #### Option B: Use Pre-generated Dataset (Recommended)

   Download dataset by following **Prepare Unit Test Codes :: Option B**. -->

   1. #### **Commons-Cli Project Setup**

   To set up the CLI project, follow these steps:
   ```bash
   # Clone and checkout a specific version
   cd /LSPAI/experiments/projects
   git clone https://github.com/apache/commons-cli.git
   cd commons-cli

   # Java Setup
   mvn install -DskipTests
   mvn dependency:copy-dependencies
   ```

   **[OPTIONAL] 2-1. Reproduce by Generating New Test Codes**

   Next, open your development environment, configure settings, and ensure the correct setup by following the steps below:
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

   **2-2. Reproduce with Provided Dataset**

   Once the environment is set up and the unit tests are prepared, you can proceed to reproduce experiments using the provided dataset.
<!-- 
   **a. Download Compiled Files**

   Download the compiled files, which are necessary for JaCoCo coverage reports. These files must match the binaries used when generating unit tests:
   ```bash
   # Download required libraries
   cd /LSPAI/experiments
   wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/727023280c2f4ec2bbe9/?dl=1" -O cliClasses.tar.gz
   tar xvf cliClasses.tar.gz
   mv classes projects/commons-cli/target
   ```

   After running above commands, you can observe that class files are located at `commons-cli/target/classes`.
   
   ```bash
   projects/commons-cli/target
   |-- antrun
   |   `-- build-main.xml
   |-- apidocs
   |   `-- META-INF
   |-- classes
   |   |-- META-INF
   |   `-- org
   ``` -->

   **3. Reproduce Experiment Results :: Coverage**

   Run the following commands one at a time, and checkout results. 
   You have to run six different commands for each baseline (NAIVE, LSPAI) and each model (DeepSeek, GPT4o, etc.):

   ```bash
   # LSPAI - DS-V3
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_deepseek/deepseek-chat

   # NAIVE - DS-V3
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_deepseek/naive_deepseek-chat

   # LSPAI - GPT4o
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o/gpt-4o

   # NAIVE - GPT4o
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o/naive_gpt-4o

   # LSPAI - GPT4o-mini
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o-mini/gpt-4o-mini

   # NAIVE - GPT4o-mini
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o-mini/naive_gpt-4o-mini
   ```

   **4. Coverage Analysis**
   
   After running the above commands, you can view the coverage results by navigating to the generated report.

   **Example: JaCoCo Coverage Report (LSPAI, deepseek-V3):**
   ```
   # View report
   open /LSPAI/experiments/data/commons-cli/results_deepseek/deepseek-chat-report/index.html
   ```
   You can see the coverage report like below figure.
   
   Checkout **Missed** and **Lines** columns for line coverage.
   
   ![JaCoCo Coverage Report Example](assets/javaCovFig.png)

   **e. Reproduce Experiment Results :: Valid Rate**

   Run the following commands one at a time, and checkout results. 
   You have to run six different commands for each baseline (NAIVE, LSPAI) and each model (DeepSeek, GPT4o, etc.):

   ```bash
   # LSPAI - DS-V3
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_deepseek/deepseek-chat

   # NAIVE - DS-V3
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_deepseek/naive_deepseek-chat

   # LSPAI - GPT4o
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o/gpt-4o

   # NAIVE - GPT4o
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o/naive_gpt-4o

   # LSPAI - GPT4o-mini
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o-mini/gpt-4o-mini

   # NAIVE - GPT4o-mini
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-cli \
      /LSPAI/experiments/data/commons-cli/results_gpt-4o-mini/naive_gpt-4o-mini
   ```

   **6. Valid Rate Analysis**
   
   After running the above commands, valid rate is printed as below (LSPAI, deepseek):
   ```
   Total .java files: 207
   Files with corresponding .class files: 119
   Pass rate: 57.49%
   ```

   7. #### **Commons-Csv Project Setup**

   To set up the CSV project, follow these steps:
   ```bash
   # Clone and checkout a specific version
   cd /LSPAI/experiments/projects
   git clone https://github.com/apache/commons-csv.git
   cd commons-csv

   # Java Setup
   mvn install -DskipTests
   mvn dependency:copy-dependencies
   ```

   **[OPTIONAL] 7-1. Reproduce by Generating New Test Codes**

   Next, open your development environment, configure settings, and ensure the correct setup by following the steps below:
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
   For more information, please refer the instruction of **Prepare Unit Test Codes :: Option A**

   **7-2. Reproduce with Provided Dataset**

   Once the environment is set up and the unit tests are prepared, you can proceed to reproduce experiments using the provided dataset.

   <!-- **A. Download Compiled Files**

   Download the compiled files, which are necessary for JaCoCo coverage reports. These files must match the binaries used when generating unit tests:
   ```bash
   # Download required libraries
   cd /LSPAI/experiments
   wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/80c9bac1a6e14f7ab9da/?dl=1" -O csvClasses.tar.gz
   tar xvf csvClasses.tar.gz
   rm -r projects/commons-csv/target/classes
   mv classes projects/commons-csv/target
   ```

   After running above commands, you can observe that class files are located at `commons-csv/target/classes`.
   
   ```bash
   projects/commons-csv/target
   |-- antrun
   |   `-- build-main.xml
   |-- apidocs
   |   `-- META-INF
   |-- classes
   |   |-- META-INF
   |   `-- org
   ``` -->

   **8. Reproduce Experiment Results :: Coverage**

   Run the following commands one at a time, and checkout results. 
   You have to run six different commands for each baseline (NAIVE, LSPAI) and each model (DeepSeek, GPT4o, etc.):

   ```bash
   # LSPAI - DS-V3
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_deepseek/deepseek-chat

   # NAIVE - DS-V3
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_deepseek/naive_deepseek-chat

   # LSPAI - GPT4o
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o/gpt-4o

   # NAIVE - GPT4o
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o/naive_gpt-4o

   # LSPAI - GPT4o-mini
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o-mini/gpt-4o-mini

   # NAIVE - GPT4o-mini
   bash /LSPAI/experiments/scripts/java_coverage.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o-mini/naive_gpt-4o-mini
   ```

   **9. Coverage Analysis**
   
   After running the above commands, you can view the coverage results by navigating to the generated report.

   **Example: JaCoCo Coverage Report (LSPAI, deepseek-V3):**
   ```
   # View report
   open /LSPAI/experiments/data/commons-csv/results_deepseek/deepseek-chat-report/index.html
   ```
   You can see the coverage report like below figure.
   
   Checkout **Missed** and **Lines** columns for line coverage.
   
   ![JaCoCo Coverage Report Example](assets/javaCovFig.png)

   **10. Reproduce Experiment Results :: Valid Rate**

   Run the following commands one at a time, and checkout results. 
   You have to run six different commands for each baseline (NAIVE, LSPAI) and each model (DeepSeek, GPT4o, etc.):

   ```bash
   # LSPAI - DS-V3
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_deepseek/deepseek-chat

   # NAIVE - DS-V3
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/projects/commons-csv/results_deepseek/naive_deepseek-chat

   # LSPAI - GPT4o
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o/gpt-4o

   # NAIVE - GPT4o
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o/naive_gpt-4o

   # LSPAI - GPT4o-mini
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/data/commons-csv/results_gpt-4o-mini/gpt-4o-mini

   # NAIVE - GPT4o-mini
   bash /LSPAI/experiments/scripts/java_passrate.bash \
      /LSPAI/experiments/projects/commons-csv \
      /LSPAI/experiments/projects/commons-csv/results_gpt-4o-mini/naive_gpt-4o-mini
   ```

   **11. Valid Rate Analysis**
   
   After running the above commands, valid rate is printed as below (LSPAI, deepseek):
   ```
   Total .java files: 207
   Files with corresponding .class files: 119
   Pass rate: 57.49%
   ```




### Throuput Experiment  [WIP]
### Prerequisites

1. **Docker Setup** [WIP]
   ```bash
   # Pull the LSPAI experiment image
   docker pull lspai/experiment:latest
   
   # Run the container
   docker run -it lspai/experiment:latest
   ```
[WIP]
### Prerequisites

1. **Docker Setup** [WIP]
   ```bash
   # Pull the LSPAI experiment image
   docker pull lspai/experiment:latest
   
   # Run the container
   docker run -it lspai/experiment:latest
   ```

1. Build Docker Container : for consistent experiment reproduction we provide docker image
2. Table2 [WIP]







Before publish
1. delete all data files under experiments
2. delete git information
3. delete key of deepseek apikey
4. delete vscode server, .cache, .cursor-server .ssh