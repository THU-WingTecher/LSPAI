# Claude Code Router - Programmatic Usage

Shell scripts to run claude-code-router programmatically with consistent input/output.

## Prerequisites

```bash
npm install -g @musistudio/claude-code-router
sudo apt-get install jq uuid-runtime
export DEEPSEEK_API_KEY="your-api-key"
```

## Essential Scripts

| Script | Purpose |
|--------|---------|
| `example-consistent-prompts.sh` | Main example - consistent prompts with auto UUID |
| `run-prompt.sh` | Single prompt: `./run-prompt.sh "prompt" output.json [uuid]` |
| `run-batch-cli.sh` | Batch: `./run-batch-cli.sh batch-file.json [output-dir] [uuid]` |
| `run-conversation.sh` | Multi-turn conversation: `./run-conversation.sh [uuid] [output-dir]` |
| `generate-uuid.sh` | Generate UUID: `./generate-uuid.sh` |
| `extract-content.sh` | Extract text: `./extract-content.sh input.json [output.txt]` |

## Quick Start

```bash
# Run main example
./example-consistent-prompts.sh

# Single prompt
./run-prompt.sh "Generate a unit test" output.json

# Batch processing
./run-batch-cli.sh batch-prompts-example.json
```

## Key Points

- **Session ID must be valid UUID** (auto-generated in scripts)
- Command format: `ccr code -p "prompt" --session-id <UUID> --output-format json`
- All outputs saved as JSON + TXT with timestamps
- Use same UUID for conversation continuity

## Manual Usage

```bash
SESSION=$(./generate-uuid.sh)
ccr code -p "Your prompt" --session-id "$SESSION" --output-format json > output.json
jq -r '.content' output.json > output.txt
```
