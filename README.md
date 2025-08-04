# LSPRAG - Language-Agnostic Real-Time Unit Test Generation

<div align="center">

<!-- ![LSPRAG Logo](doc/assets/lsprag_image_v2.jpg) -->

**VS Code Extension for AI-Powered Unit Test Generation**

[![VS Code Version](https://img.shields.io/badge/VS%20Code-1.95.0+-blue.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-0db7ed-blue.svg?logo=docker&logoColor=white)](https://hub.docker.com/repository/docker/gwihwan/lsprag/tags)
</div>

##  Overview

LSPRAG (Language Server Protocol-based AI Generation) is a cutting-edge VS Code extension that leverages Language Server Protocol (LSP) integration and Large Language Models (LLMs) to automatically generate high-quality unit tests in real-time. By combining semantic code analysis with AI-powered generation, LSPRAG delivers contextually accurate and comprehensive test suites across multiple programming languages.

## ✨ Key Features

### 🚀 **Real-Time Generation**
- Generate unit tests instantly as you code
- Context-aware test creation based on function semantics
- Intelligent test case generation with edge case coverage

### 🌍 **Multi-Language Support**
- **Java**: Full support with JUnit framework
- **Python**: Comprehensive pytest integration
- **Go**: Native Go testing framework support
- **C++**: Google Test framework compatibility
- **TypeScript**: Jest and Mocha framework support
- **Extensible**: Easy to add support for additional languages

### 🎯 **Advanced Capabilities**
- **Semantic Analysis**: Deep code understanding through LSP
- **Dependency Resolution**: Automatic import and mock generation
- **Coverage Optimization**: Generate tests for maximum code coverage
- **Multiple LLM Providers**: Support for OpenAI, DeepSeek, and Ollama
- **Customizable Prompts**: Multiple generation strategies available

## 🎯 Project Status

| Language | Status | Framework | Features |
|----------|--------|-----------|----------|
| **Java** | ✅ Production Ready | JUnit 4/5 | Full semantic analysis, mock generation |
| **Python** | ✅ Production Ready | pytest | Type hints, async support, fixtures |
| **Go** | ✅ Production Ready | Go testing | Package management, benchmarks |
| **C++** | ✅ Production Ready | Google Test | Header analysis, template support |
| **TypeScript** | ✅ Production Ready | Jest/Mocha | Type safety, decorators |
| **JavaScript** | ✅ Production Ready | Jest/Mocha | ES6+ features, async/await |

## 🛠️ Installation & Setup

### Prerequisites

- **VS Code**: Version 1.95.0 or higher
- **Node.js**: Version 20 or higher
- **Language Servers**: Appropriate language extensions for your target languages

### Quick Start

1. **Install LSPRAG Extension**

2. **Install Language Server Extensions**
   
   **For Java:**
   - Install "Oracle Java Extension Pack" from VS Code Marketplace
   
   **For Python:**
   - Install "Pylance" and "Python" extensions
   
   **For Go:**
   - Install "Go" extension
   - Enable semantic tokens in settings:
   ```json
   {
     "gopls": {
       "ui.semanticTokens": true
     }
   }
   ```

3. **Configure LLM Provider**
   
   Open VS Code Settings (`Ctrl/Cmd + ,`) and configure your preferred LLM:

   **Option A: VS Code Settings UI**
   - Search for "LSPRAG" settings
   - Configure provider, model, and API keys

   **Option B: Direct JSON Configuration**
   ```json
   {
     "LSPRAG": {
       "provider": "deepseek",
       "model": "deepseek-chat",
       "deepseekApiKey": "your-api-key",
       "openaiApiKey": "your-openai-key",
       "localLLMUrl": "http://localhost:11434",
       "savePath": "lsprag-tests",
       "promptType": "detailed",
       "generationType": "original",
       "maxRound": 3
     }
   }
   ```

## 🚀 Usage

### Basic Workflow

1. **Open Your Project**
   - Open your workspace in VS Code
   - Ensure language servers are active for your target language

2. **Generate Tests**
   - Navigate to any function or method
   - Right-click within the function definition
   - Select **"LSPRAG: Generate Unit Test"** from the context menu

3. **Review & Deploy**
   - Generated tests appear in the specified output directory
   - Review and customize as needed
   - Run tests to verify functionality

### Advanced Features

#### Multiple Generation Strategies

LSPRAG supports various generation approaches:

- **`naive`**: Basic test generation without semantic analysis
- **`original`**: Standard LSP-aware generation (recommended)
- **`agent`**: Multi-step reasoning with iterative refinement
- **`cfg`**: Control flow graph-based generation
- **`experimental`**: Latest experimental features
- **`fastest`**: Optimized for speed
- **`best`**: Highest quality generation

#### Prompt Types

- **`basic`**: Minimal context, fast generation
- **`detailed`**: Comprehensive context analysis
- **`concise`**: Balanced approach
- **`fastest`**: Speed-optimized prompts
- **`best`**: Quality-optimized prompts

### Command Palette Commands

- `LSPRAG: Generate Unit Test` - Generate tests for selected function
- `LSPRAG: Show Current Settings` - Display current configuration
- `LSPRAG: Test LLM` - Test LLM connectivity and configuration

## 🛠️ Configuration

### Core Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `LSPRAG.provider` | string | `"deepseek"` | LLM provider (deepseek, openai, ollama) |
| `LSPRAG.model` | string | `"deepseek-chat"` | Model name for generation |
| `LSPRAG.savePath` | string | `"lsprag-tests"` | Output directory for generated tests |
| `LSPRAG.promptType` | string | `"basic"` | Prompt strategy for generation |
| `LSPRAG.generationType` | string | `"original"` | Generation approach |
| `LSPRAG.maxRound` | number | `3` | Maximum refinement rounds |

### API Configuration

#### DeepSeek
```json
{
  "LSPRAG.provider": "deepseek",
  "LSPRAG.model": "deepseek-chat",
  "LSPRAG.deepseekApiKey": "your-api-key"
}
```

#### OpenAI
```json
{
  "LSPRAG.provider": "openai",
  "LSPRAG.model": "gpt-4o-mini",
  "LSPRAG.openaiApiKey": "your-api-key"
}
```

#### Ollama (Local)
```json
{
  "LSPRAG.provider": "ollama",
  "LSPRAG.model": "llama3-70b",
  "LSPRAG.localLLMUrl": "http://localhost:11434"
}
```

### Hardware Requirements

- **Minimum**: 8GB RAM, 4 CPU cores
- **Recommended**: 16GB RAM, 8 CPU cores
- **GPU**: Optional but recommended for local LLM inference

## 🐛 Troubleshooting

### Common Issues

#### 1. Language Server Not Active
