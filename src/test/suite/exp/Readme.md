## Experiment Test Suite

The test scripts in the `exp` folder are designed to run large-scale experiments for automated test generation. These tests leverage VSCode modules and the npm test framework to execute experiments in a CLI (command-line interface) environment.

### Purpose

These experiment tests serve as the primary mechanism for running comprehensive evaluations of the LSPRAG system. They enable:

- **Large-scale testing** across multiple projects, languages, and configurations
- **Automated experiment execution** without requiring manual VSCode UI interaction
- **Reproducible results** through standardized test configurations
- **Batch processing** of multiple test generation scenarios

### Why Test Suite Format?

The test suite format is used because it provides the **only reliable way** to run large-scale experiments in a CLI environment while still having access to VSCode's language server protocol (LSP) capabilities. This approach allows us to:

1. Leverage VSCode's extension API and LSP integration
2. Run experiments programmatically without GUI interaction
3. Integrate with CI/CD pipelines for automated testing
4. Execute multiple experiments in parallel or sequentially
5. Collect and report results systematically

### Test Files Overview

The experiment suite includes tests for:

- **Language-specific experiments** (`python.test.ts`, `java.test.ts`, `go.test.ts`, `cpp.test.ts`) - Test generation for specific programming languages
- **Full experiments** (`fullexp.test.ts`) - Comprehensive experiments across multiple models, generation types, and projects
- [deprecated]**Comparison experiments** (`compareExp.test.ts`) - Comparing different approaches and configurations
- [deprecated]**Chat-based experiments** (`chatTestExp.test.ts`) - Testing chat-based test generation workflows
- [deprecated]**Copilot integration** (`copilot.test.ts`) - Testing GitHub Copilot integration scenarios

### Running Experiments

To run these experiments, use the standard npm test command:

```bash
npm run test --testFile=suite.exp.fullexp
```

Each test file can be configured with different models, generation types, prompt types, and project paths to evaluate various aspects of the test generation system.