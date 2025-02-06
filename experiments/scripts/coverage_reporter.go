package main

import (
	"bufio"
	"bytes"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
)

// Configuration holds the input parameters
type Configuration struct {
	TargetDir string
	ReportDir string
}

// CoverageData holds the coverage profiles from individual tests
type CoverageData struct {
	mu    sync.Mutex
	paths []string
}

func main() {
	// Parse command-line arguments
	config := parseArguments()

	// Ensure the target directory exists
	if _, err := os.Stat(config.TargetDir); os.IsNotExist(err) {
		log.Fatalf("Error: Target directory %s does not exist.", config.TargetDir)
	}

	// Ensure the report directory exists or create it
	if err := os.MkdirAll(config.ReportDir, os.ModePerm); err != nil {
		log.Fatalf("Error: Unable to create report directory %s: %v", config.ReportDir, err)
	}

	// Find all test suite directories under the target directory
	testSuites, err := findTestSuites(config.TargetDir)
	if err != nil {
		log.Fatalf("Error finding test suites: %v", err)
	}

	if len(testSuites) == 0 {
		log.Fatalf("No test suites found in directory: %s", config.TargetDir)
	}

	fmt.Printf("Found %d test suites.\n", len(testSuites))

	// Initialize coverage data
	coverageData := &CoverageData{}

	// Use WaitGroup to manage concurrency
	var wg sync.WaitGroup
	// Limit the number of concurrent goroutines to prevent resource exhaustion
	semaphore := make(chan struct{}, 4) // Adjust the buffer size as needed

	for _, suite := range testSuites {
		wg.Add(1)
		semaphore <- struct{}{}

		go func(suitePath string) {
			defer wg.Done()
			defer func() { <-semaphore }()

			log.Printf("Processing test suite: %s", suitePath)

			// Find the highest-numbered subdirectory
			numericDirs, err := getSubdirectories(suitePath)
			if err != nil {
				log.Printf("Error accessing subdirectories in %s: %v. Skipping.", suitePath, err)
				return
			}

			if len(numericDirs) == 0 {
				log.Printf("No numerical subdirectories found in %s. Skipping.", suitePath)
				return
			}

			// The last element is the highest-numbered directory after sorting
			highestDir := numericDirs[len(numericDirs)-1]
			log.Printf("Identified highest-numbered subdirectory: %s", highestDir)

			// Locate the test file within the highest-numbered directory
			testFilePath, err := findTestFile(highestDir)
			if err != nil {
				log.Printf("Error finding test file in %s: %v. Skipping.", highestDir, err)
				return
			}

			if testFilePath == "" {
				log.Printf("No test file found in %s. Skipping.", highestDir)
				return
			}

			log.Printf("Found test file: %s", testFilePath)

			// Define the coverage profile path
			coverageProfile := filepath.Join(config.ReportDir, fmt.Sprintf("coverage_%s.out", sanitizeFilename(testFilePath)))

			// Run the test with coverage
			err = runTestWithCoverage(highestDir, coverageProfile)
			if err != nil {
				log.Printf("Error running tests in %s: %v", highestDir, err)
				return
			}

			log.Printf("Successfully collected coverage for %s", testFilePath)
			coveragePercentage, err := calculateCoveragePercentage(coverageProfile)
			if err != nil {
				log.Printf("Error calculating coverage for %s: %v", coverageProfile, err)
				return
			}

			// Log the coverage percentage
			log.Printf("Coverage for %s: %.2f%%", testFilePath, coveragePercentage)
			// Verify coverage profile size
			info, err := os.Stat(coverageProfile)
			if err != nil {
				log.Printf("Unable to stat coverage profile %s: %v. Skipping.", coverageProfile, err)
				return
			}

			if info.Size() < 10 { // Adjust threshold as needed
				log.Printf("Coverage profile %s is too small (%d bytes). It might be empty or malformed.", coverageProfile, info.Size())
				return
			}

			// If successful, add the coverage profile path
			coverageData.mu.Lock()
			coverageData.paths = append(coverageData.paths, coverageProfile)
			coverageData.mu.Unlock()

			log.Printf("Collected coverage profile: %s", coverageProfile)
		}(suite)
	}

	wg.Wait()

	if len(coverageData.paths) == 0 {
		log.Fatalf("No coverage data collected from any tests.")
	}

	// Merge all coverage profiles
	mergedCoverageFile := filepath.Join(config.ReportDir, "merged_coverage.out")
	err = mergeCoverageProfiles(coverageData.paths, mergedCoverageFile)
	if err != nil {
		log.Fatalf("Error merging coverage profiles: %v", err)
	}

	log.Printf("Successfully merged coverage profiles into %s", mergedCoverageFile)

	// Generate the coverage report
	err = generateCoverageReport(mergedCoverageFile, config.ReportDir)
	if err != nil {
		log.Fatalf("Error generating coverage report: %v", err)
	}

	log.Printf("Coverage report generated at %s", config.ReportDir)

	// Display coverage statistics
	err = displayCoverageStatistics(mergedCoverageFile)
	if err != nil {
		log.Fatalf("Error displaying coverage statistics: %v", err)
	}
}

// parseArguments parses and validates the command-line arguments
func parseArguments() Configuration {
	targetDir := flag.String("target", "", "Path to the 'gpt-4o-mini' directory (required)")
	reportDir := flag.String("report", "", "Path to the coverage report directory (optional)")
	flag.Parse()

	if *targetDir == "" {
		log.Fatal("Error: '-target' argument is required.\nUsage: coverage_collector -target <path_to_gpt-4o-mini> [-report <report_dir>]")
	}

	finalReportDir := *reportDir
	if finalReportDir == "" {
		finalReportDir = fmt.Sprintf("%s-coverage-report", *targetDir)
	}

	return Configuration{
		TargetDir: *targetDir,
		ReportDir: finalReportDir,
	}
}

// findTestSuites finds all immediate subdirectories under the target directory
func findTestSuites(targetDir string) ([]string, error) {
	entries, err := os.ReadDir(targetDir)
	if err != nil {
		return nil, err
	}

	var suites []string
	for _, entry := range entries {
		if entry.IsDir() {
			suitePath := filepath.Join(targetDir, entry.Name())
			suites = append(suites, suitePath)
		}
	}

	return suites, nil
}

// getSubdirectories returns a sorted list of numerical subdirectories within a given directory
func getSubdirectories(dirPath string) ([]string, error) {
	entries, err := filepath.Glob(filepath.Join(dirPath, "*"))
	if err != nil {
		return nil, err
	}

	var numericDirs []string
	for _, entry := range entries {
		info, err := os.Stat(entry)
		if err != nil {
			log.Printf("Warning: Unable to access %s: %v. Skipping.", entry, err)
			continue
		}
		if info.IsDir() {
			base := filepath.Base(entry)
			if _, err := strconv.Atoi(base); err == nil {
				numericDirs = append(numericDirs, entry)
			}
		}
	}

	// Sort directories numerically in ascending order
	sort.Slice(numericDirs, func(i, j int) bool {
		a, _ := strconv.Atoi(filepath.Base(numericDirs[i]))
		b, _ := strconv.Atoi(filepath.Base(numericDirs[j]))
		return a < b
	})

	return numericDirs, nil
}

// findTestFile locates the test file within a given directory
func findTestFile(dirPath string) (string, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return "", err
	}

	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), "_test.go") {
			return filepath.Join(dirPath, entry.Name()), nil
		}
	}

	return "", nil
}

// runTestWithCoverage runs `go test` in the specified directory and generates a coverage profile
func runTestWithCoverage(testDir, coverageProfilePath string) error {
	log.Printf("Running `go test` in %s", testDir)
	cmd := exec.Command("go", "test", "./...", "-coverprofile", coverageProfilePath, "-covermode=atomic")
	cmd.Dir = testDir

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("go test failed: %v\nStderr: %s", err, stderr.String())
	}

	return nil
}

// sanitizeFilename replaces path separators and non-alphanumeric characters with underscores for filename safety
func sanitizeFilename(filePath string) string {
	base := filepath.Base(filePath)
	ext := filepath.Ext(base)
	name := strings.TrimSuffix(base, ext)
	// Replace any remaining non-alphanumeric characters with underscores
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') {
			return r
		}
		return '_'
	}, name)
	return name + ext
}

// mergeCoverageProfiles merges multiple coverage profiles into one, enforcing a single coverage mode
func mergeCoverageProfiles(profiles []string, mergedProfile string) error {
	if len(profiles) == 0 {
		return fmt.Errorf("no coverage profiles to merge")
	}

	outFile, err := os.Create(mergedProfile)
	if err != nil {
		return fmt.Errorf("unable to create merged coverage file: %v", err)
	}
	defer outFile.Close()

	writer := bufio.NewWriter(outFile)
	defer writer.Flush()

	var coverageMode string
	headerWritten := false

	for _, profile := range profiles {
		file, err := os.Open(profile)
		if err != nil {
			log.Printf("Unable to open coverage profile %s: %v. Skipping.", profile, err)
			continue
		}

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "mode:") {
				if !headerWritten {
					coverageMode = strings.TrimSpace(strings.TrimPrefix(line, "mode:"))
					_, err := writer.WriteString(line + "\n")
					if err != nil {
						file.Close()
						return fmt.Errorf("error writing to merged coverage file: %v", err)
					}
					headerWritten = true
				} else {
					// Ensure all profiles have the same coverage mode
					currentMode := strings.TrimSpace(strings.TrimPrefix(line, "mode:"))
					if currentMode != coverageMode {
						log.Printf("Coverage mode mismatch in profile %s: %s vs %s. Skipping.", profile, currentMode, coverageMode)
						break
					}
				}
				continue
			}
			_, err = writer.WriteString(line + "\n")
			if err != nil {
				file.Close()
				return fmt.Errorf("error writing to merged coverage file: %v", err)
			}
		}
		if err := scanner.Err(); err != nil {
			log.Printf("Error reading coverage profile %s: %v. Skipping.", profile, err)
		}
		file.Close()
	}

	return nil
}

// generateCoverageReport generates an HTML coverage report from the merged coverage profile
func generateCoverageReport(mergedProfile, reportDir string) error {
	reportPath := filepath.Join(reportDir, "coverage.html")
	log.Printf("Generating HTML coverage report at %s", reportPath)
	cmd := exec.Command("go", "tool", "cover", "-html", mergedProfile, "-o", reportPath)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("failed to generate coverage report: %v", err)
	}

	return nil
}

// displayCoverageStatistics calculates and displays coverage statistics from the merged profile
func displayCoverageStatistics(mergedProfile string) error {
	log.Println("Calculating coverage statistics...")

	file, err := os.Open(mergedProfile)
	if err != nil {
		return fmt.Errorf("unable to open merged coverage file: %v", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	totalStatements := 0
	coveredStatements := 0

	// Skip the first line (mode)
	if scanner.Scan() {
		// Do nothing
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
		return fmt.Errorf("error reading merged coverage file: %v", err)
	}

	// Calculate coverage percentage
	coveragePercentage := 0.0
	if totalStatements > 0 {
		coveragePercentage = (float64(coveredStatements) / float64(totalStatements)) * 100
	}

	// Display statistics
	fmt.Printf("Total Statements: %d\n", totalStatements)
	fmt.Printf("Covered Statements: %d\n", coveredStatements)
	fmt.Printf("Coverage Percentage: %.2f%%\n", coveragePercentage)

	return nil
}
func calculateCoveragePercentage(coverageProfile string) (float64, error) {
	file, err := os.Open(coverageProfile)
	if err != nil {
		return 0.0, fmt.Errorf("unable to open coverage profile %s: %v", coverageProfile, err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	totalStatements := 0
	coveredStatements := 0

	// Skip the first line (mode)
	if scanner.Scan() {
		// Optional: Verify the coverage mode if needed
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
		_, err := fmt.Sscanf(parts[1], "%d", &stmtCount)
		if err != nil {
			return 0.0, fmt.Errorf("unable to parse statement count in %s: %v", coverageProfile, err)
		}
		totalStatements += stmtCount

		// parts[2] is the count of how many times the block was executed
		execCount := 0
		_, err = fmt.Sscanf(parts[2], "%d", &execCount)
		if err != nil {
			return 0.0, fmt.Errorf("unable to parse execution count in %s: %v", coverageProfile, err)
		}
		if execCount > 0 {
			coveredStatements += stmtCount
		}
	}

	if err := scanner.Err(); err != nil {
		return 0.0, fmt.Errorf("error reading coverage profile %s: %v", coverageProfile, err)
	}

	// Calculate coverage percentage
	coveragePercentage := 0.0
	if totalStatements > 0 {
		coveragePercentage = (float64(coveredStatements) / float64(totalStatements)) * 100
	}

	return coveragePercentage, nil
}

// copyFile copies a single file from src to dst
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	if err != nil {
		return err
	}

	// Copy file permissions
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	return os.Chmod(dst, info.Mode())
}
