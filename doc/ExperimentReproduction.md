## Currently WIP

## 🛠️ Setup Guide

### 1. Install LSPAI Extension

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

3. Open the workspace with VSCode: this step is necessary since VSCode supports wonderful extension development environment.

4. Run in Development Mode
   - Open `/LSPAI/src/extension.ts`
   - Press `F5` to launch Extension Development Host
   - From the top, select `VS Code Extension Development`.
   - If A new VS Code window is opened, you are ready with LSPAI in development mode.

## Reproduce Experiment Results 

There are two ways to proceed with the experiments:

#### Option A: Generate Unit Tests (Manual Method)
If you want to generate unit tests yourself, follow these steps:

1. Complete the LSPAI Extension installation (see Setup Guide above)
2. Launch LSPAI in Development Mode:
   - Open `/LSPAI/src/extension.ts`
   - Press `F5` to launch Extension Development Host
   - Select "VS Code Extension Development" from the dropdown
   - A new VS Code window should open

3. Configure the workspace:
   - Open the target project: Navigate to `experiments/project/black` 
     (File -> Open Folder -> select experiments/project/black)
   - Select Python interpreter: In the bottom-right section, choose `venv/bin/python`

4. Run the experiment:
   - Press `CTRL+SHIFT+P`
   - For Python, you should first generate venv-python version, and install necessary libraries, and select python interpreter at righ-bottom section of vscode.
   - Run the command `LSPAI::Python-Experiment`
   - Monitor progress in the debug console

> Note: Generating unit tests for every function in real-world projects is time-consuming. We provide pre-generated experiment data as an alternative (see Option B).

#### Option B: Use Pre-generated Dataset (Recommended)

Download and extract the experiment dataset:
```bash
cd /LSPAI
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/0fad8b7869ba43d08486/?dl=1" -O experiments/experimentData.tar.gz
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
    ├── crawl4ai
    └── logrus
```

#### Python Projects [ BLACK, CRAWL4AI]

1. **Black Project Setup**

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
   mv /LSPAI/experiments/data/black/* .
   ```

2. **Reproduce Experiment for Black Project**

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
   
3. **Analysis of Results**

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


4. **Crawl4ai Project Setup**
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

5. **Reproduce Experiment for CRAWL4AI Project**

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

6. **Analysis of Results**

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

#### Go Projects
[WIP]
#### Java Projects
apt install -y maven
mvn install -DskipTests
mvn dependency:copy-dependencies
[WIP]

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
3. Table3 [WIP]

### Java Setup
0. Java Setup
  https://cloud.tsinghua.edu.cn/f/3e9f84c18e3d42c09960/?dl=1 
  put to /LSPAI/lib/*
0. git clone project

1. Directly Generate Unit Test
a. compile the project and install depnedencies
mvn install -DskipTests
mvn dependency:copy-dependencies
b. F5 -> Run development mode
c. Open project
d. choose model at settings.json
e. cntrl+shift+p -> LSPAI::Java-Experiment

2. Reproduce with provided dataset
a. download necessary libs
b. download compiled files (this is necessary since jacoco coverage report only work with the original binary files that is used when generating unit tests)
https://cloud.tsinghua.edu.cn/f/727023280c2f4ec2bbe9/?dl=1
put to projects/commons-cli/target/
c. reproduce : you should repeat below pipe line six times, NAIVE, LSPAI, for three base lines.
c. coverage analysis
   bash /LSPAI/experiments/scripts/java_coverage.bash /LSPAI/experiments/projects/commons-cli /LSPAI/experiments/data/commons-cli/results_deepseek/deepseek-chat
   
   after running above command, you can see the report at /LSPAI/experiments/data/commons-cli/results_deepseek/deepseek-chat-report/index.html
   ![JaCoCo Coverage Report Example](doc/assets/resultFig.png)

d. valid rate analysis
   bash /LSPAI/experiments/scripts/java_coverage.bash /LSPAI/experiments/projects/commons-cli /LSPAI/experiments/data/commons-cli/results_deepseek/deepseek-chat

   after running above command, you can checkout the direct result
   ```
   Total .java files: 207
Files with corresponding .class files: 119
Pass rate: 57.49%
```

### Project Setup Steps

1. **Compile Your Project**
   - Clone your repository
   - Run appropriate build command (`mvn install`, `go build`, etc.)
   - Install dependencies as needed

2. **Launch LSPAI**
   - Press F5 to start Extension Development Host
   - Open your project folder
   - Use Command Palette (`Ctrl+Shift+P`)
   - Select your language experiment (e.g., "Java Experiment")

3. **Generate Coverage Reports**
   
   For Java:
   ```bash
   bash java_coverage.bash <project-root> <test-output-dir>
   ```

   For Go:
   ```bash
   go build -o target/coverage_reporter coverage_reporter.go
   target/coverage_reporter -target <project-path> -test <test-dir> -report <report-dir>
   ```

   For Python:
   ```bash
   # Install prerequisites
   apt install python3-coverage python3-pytest python3-venv
   python3 -m venv venv
   source venv/bin/activate
   ```





Before publish
1. delete all data files under experiments
2. delete git information