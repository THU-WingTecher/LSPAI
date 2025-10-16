#!/bin/bash

# Batch runner for claude-code-router using CLI
# Reads prompts from JSON file and executes them with consistent session

set -e

BATCH_FILE="${1:-batch-prompts-example.json}"
OUTPUT_DIR="${2:-outputs}"
SESSION_ID="${3:-$(uuidgen || cat /proc/sys/kernel/random/uuid)}"

if [ ! -f "$BATCH_FILE" ]; then
    echo "Error: Batch file not found: $BATCH_FILE"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "=== Claude Code Router - Batch Processing ==="
echo "Batch file: $BATCH_FILE"
echo "Output directory: $OUTPUT_DIR"
echo "Session ID: $SESSION_ID"
echo ""

# Read the JSON array and process each prompt
jq -c '.[]' "$BATCH_FILE" | while read -r item; do
    NAME=$(echo "$item" | jq -r '.name')
    PROMPT=$(echo "$item" | jq -r '.prompt')
    
    echo "Processing: $NAME"
    
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    OUTPUT_FILE="$OUTPUT_DIR/${NAME}_${TIMESTAMP}.json"
    
    # Run ccr with the prompt
    ccr code -p "$PROMPT" --session-id "$SESSION_ID" --output-format json > "$OUTPUT_FILE" 2>&1
    
    echo "  ✓ Saved to: $OUTPUT_FILE"
    echo ""
    
    # Small delay to avoid rate limiting
    sleep 1
done

echo "Batch processing completed!"
echo "All outputs saved to: $OUTPUT_DIR"
