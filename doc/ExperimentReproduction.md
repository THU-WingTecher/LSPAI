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

3. **Evaluate Black Project**
   
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
    [WIP]
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
1. Add these dependencies to your `pom.xml`:
```xml
<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-core</artifactId>
    <version>3.11.0</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter-api</artifactId>
    <version>5.7.2</version>  <!-- Added version -->
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter-engine</artifactId>
    <version>5.7.2</version>  <!-- Added version -->
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.junit.jupiter</groupId>
    <artifactId>junit-jupiter-params</artifactId>
    <version>5.7.2</version>  <!-- Added version -->
    <scope>test</scope>
</dependency>
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