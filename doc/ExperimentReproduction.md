## Currently WIP


download experiment dataset : 

wget --no-check-certificate "https://drive.google.com/file/d/1_yzbcPCVC0820IyRbKzcMikiZKXpxHGB/view?usp=sharing" -O experimentData.tar.gz
tar xvf experimentData.tar.gz

move to the directory where Dockerfile is located, 
and run 

docker build -t lspai -f Dockerfile.dev .
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