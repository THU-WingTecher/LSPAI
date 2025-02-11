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

### 2. Download Dataset
1. Download Experiment Dataset
```bash
cd /LSPAI
wget --no-check-certificate "https://cloud.tsinghua.edu.cn/f/0fad8b7869ba43d08486/?dl=1" -O experiments/experimentData.tar.gz
cd experiments/projects
tar xvf ../experimentData.tar.gz
```
now you can see the downloaded dataset as
```
/LSPAI/experiments
|-- experimentData.tar.gz
|-- projects
|   |-- black
|   |-- cobra
|   |-- commons-cli
|   |-- commons-csv
|   |-- crawl4ai
|   `-- logrus
```
2. Download Real-World Project
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