package main

import (
	"bufio"
	"bytes"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

// Configuration holds the input parameters
type Configuration struct {
	TargetProjectPath string
	TestDir           string
	ReportDir         string
}

func main() {
	// Parse command-line arguments
	config := parseArguments()

	// Change to the target project directory
	if err := os.Chdir(config.TargetProjectPath); err != nil {
		log.Fatalf("Error: Unable to change directory to %s: %v", config.TargetProjectPath, err)
	}

	// Find all test files
	testFiles, err := findTestFiles(config.TestDir)
	if err != nil {
		log.Fatalf("Error finding test files: %v", err)
	}

	if len(testFiles) == 0 {
		log.Fatalf("No test files found in directory: %s", config.TestDir)
	}

	fmt.Printf("Found %d test files.\n", len(testFiles))

	// Compile test files in parallel
	compiledCount := compileTestFiles(testFiles, config)

	fmt.Printf("Compiled %d/%d test files successfully.\n", compiledCount, len(testFiles))

	// Run tests with coverage
	coverageFile := "coverage.out"
	if err := runTestsWithCoverage(config, coverageFile); err != nil {
		log.Fatalf("Error running tests with coverage: %v", err)
	}

	// Generate coverage report
	if err := generateCoverageReport(coverageFile, config.ReportDir); err != nil {
		log.Fatalf("Error generating coverage report: %v", err)
	}

	// Calculate and display coverage statistics
	if err := displayCoverageStatistics(coverageFile, config); err != nil {
		log.Fatalf("Error displaying coverage statistics: %v", err)
	}

	fmt.Printf("Coverage report generated at %s\n", config.ReportDir)
}

// parseArguments parses and validates the command-line arguments
func parseArguments() Configuration {
	targetProjectPath := flag.String("target", "", "Target project path (required)")
	testDir := flag.String("test", "", "Test directory path (required)")
	reportDir := flag.String("report", "", "Report directory path (optional)")
	flag.Parse()

	if *targetProjectPath == "" {
		log.Fatal("Error: Target project path is missing.\nUsage: coverage_reporter -target <target_project_path> -test <test_dir> [-report <report_dir>]")
	}

	if *testDir == "" {
		log.Fatal("Error: Test directory path is missing.\nUsage: coverage_reporter -target <target_project_path> -test <test_dir> [-report <report_dir>]")
	}

	// Set default report directory if not provided
	finalReportDir := *reportDir
	if finalReportDir == "" {
		finalReportDir = fmt.Sprintf("%s-report", *testDir)
	}

	return Configuration{
		TargetProjectPath: *targetProjectPath,
		TestDir:           *testDir,
		ReportDir:         finalReportDir,
	}
}

// findTestFiles searches for all *_test.go files in the specified test directory
func findTestFiles(testDir string) ([]string, error) {
	var testFiles []string
	err := filepath.Walk(testDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		// Check for Go test files
		if !info.IsDir() && strings.HasSuffix(info.Name(), "_test.go") {
			testFiles = append(testFiles, path)
		}
		return nil
	})
	return testFiles, err
}

// compileTestFiles compiles each test file in parallel
func compileTestFiles(testFiles []string, config Configuration) int {
	var wg sync.WaitGroup
	var mu sync.Mutex
	compiledCount := 0

	// Limit the number of concurrent goroutines
	semaphore := make(chan struct{}, 64) // Similar to GNU parallel -j 64

	for _, testFile := range testFiles {
		wg.Add(1)
		semaphore <- struct{}{}

		go func(file string) {
			defer wg.Done()
			defer func() { <-semaphore }()

			// Compile the test file
			cmd := exec.Command("go", "build", "-o", "/dev/null", file)
			var stderr bytes.Buffer
			cmd.Stderr = &stderr
			if err := cmd.Run(); err != nil {
				log.Printf("Failed to compile %s: %v\nStderr: %s", file, err, stderr.String())
				return
			}

			// Increment the compiled count safely
			mu.Lock()
			compiledCount++
			mu.Unlock()
		}(testFile)
	}

	wg.Wait()
	return compiledCount
}

// runTestsWithCoverage runs `go test` with coverage profiling
func runTestsWithCoverage(config Configuration, coverageFile string) error {
	fmt.Println("Running tests with coverage...")

	// Ensure the report directory exists
	if err := os.MkdirAll(config.ReportDir, os.ModePerm); err != nil {
		return fmt.Errorf("unable to create report directory: %v", err)
	}

	// Run `go test` with coverage
	cmd := exec.Command("go", "test", "./...", "-coverprofile", coverageFile, "-covermode", "atomic")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

// generateCoverageReport generates an HTML coverage report
func generateCoverageReport(coverageFile, reportDir string) error {
	fmt.Println("Generating coverage report...")

	// Use `go tool cover` to generate HTML report
	cmd := exec.Command("go", "tool", "cover", "-html", coverageFile, "-o", filepath.Join(reportDir, "coverage.html"))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

// displayCoverageStatistics calculates and displays coverage statistics
func displayCoverageStatistics(coverageFile string, config Configuration) error {
	fmt.Println("Calculating coverage statistics...")

	// Read the coverage profile
	file, err := os.Open(coverageFile)
	if err != nil {
		return fmt.Errorf("unable to open coverage file: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	totalStatements := 0
	coveredStatements := 0

	// Skip the first line (mode)
	if scanner.Scan() {
		// Skip
	}

	for scanner.Scan() {
		line := scanner.Text()
		// Each line has the format: path/to/file.go:line.column,line.column number_of_statements count
		// Example: example.go:10.34,12.2 1 1
		parts := strings.Fields(line)
		if len(parts) < 3 {
			continue
		}

		// parts[1] is the number of statements
		stmtCount := 0
		fmt.Sscanf(parts[1], "%d", &stmtCount)
		totalStatements += stmtCount

		// parts[2] is the count of how many times the block was executed
		execCount := 0
		fmt.Sscanf(parts[2], "%d", &execCount)
		if execCount > 0 {
			coveredStatements += stmtCount
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("error reading coverage file: %v", err)
	}

	// Calculate coverage percentage
	percentage := 0.0
	if totalStatements > 0 {
		percentage = (float64(coveredStatements) / float64(totalStatements)) * 100
	}

	// Display statistics
	fmt.Printf("Total statements: %d\n", totalStatements)
	fmt.Printf("Covered statements: %d\n", coveredStatements)
	fmt.Printf("Coverage Percentage: %.2f%%\n", percentage)

	return nil
}
