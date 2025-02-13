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

### 2. Download and Setup Real-World Projects

#### Python Projects

1. **Setup Python Environment**
   ```bash
   cd /LSPAI
   python3 -m venv venv
   source venv/bin/activate
   ```

2. **Black Project Setup**
   ```bash
   # Clone and checkout specific version
   cd /LSPAI/experiments/projects
   git clone https://github.com/psf/black.git
   cd black
   git checkout 8dc912774e322a2cd46f691f19fb91d2237d06e2

   # Install dependencies
   pip install -r docs/requirements.txt
   pip install click mypy_extensions packaging urllib3 pathspec platformdirs

   # Configure project
   echo "version = '00.0.0'" > src/black/_black_version.py
   rm pyproject.toml
   mv /LSPAI/experiments/data/black/* .
   ```

3. **Reproduce Experiment for Black Project**
   We have three base lines - gpt-4o, gpt-4o-mini, deepseek-chat. 
   To completely reproduce our experiment, you should repeat below pipeline three times(deepseek, gpt-4o, and gpt-4o-mini)
   a. Coverage Analysis
   ```bash
   # Run coverage analysis for LSPAI approach
   bash /LSPAI/experiments/scripts/python_coverage.bash \
       /LSPAI/experiments/projects/black \
       /LSPAI/experiments/data/black/results_deepseek/deepseek-chat \
       //LSPAI

   # Run coverage analysis for naive approach
   bash /LSPAI/experiments/scripts/python_coverage.bash \
       /LSPAI/experiments/projects/black \
       /LSPAI/experiments/projects/black/results_deepseek/naive_deepseek-chat \
       //Naive
   ```

   Expected output will look like:
   ```
   src/blib2to3/pytree.py               475    315    34%
   ------------------------------------------------------
   TOTAL                               7588   4534    40%
   ```
   Note: While exact numbers may vary by environment, LSPAI typically shows 1-2% better coverage than the naive approach.
  
   b. Passrate Analysis
   From the test execution results, you will see output similar to:
   ```
   ============================================================================================================ 506 failed, 208 passed, 4 warnings, 144 errors in 7.34s =============================================================================================================
   ```
   
   The passrate is calculated by:
   1. Total functions to test for Black project = 440 (predetermined)
   2. Subtract number of errors from total: (440 - 144)
   3. Divide by total functions: (440 - 144) / 440 = 0.673


4. **Crawl4ai Project Setup**
   ```bash
   cd /LSPAI/experiments/projects
   git clone https://github.com/unclecode/crawl4ai.git
   cd crawl4ai
   git checkout 8878b3d032fb21ce3567b34db128bfa64687198a
   ```
    [WIP]
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