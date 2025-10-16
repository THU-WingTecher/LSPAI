#!/bin/bash

# Run multiple prompts in the same session (conversation mode)

set -e

SESSION_ID="${1:-$(uuidgen || cat /proc/sys/kernel/random/uuid)}"
OUTPUT_DIR="${2:-outputs}"

mkdir -p "$OUTPUT_DIR"

echo "=== Claude Code Router - Conversation Mode ==="
echo "Session ID: $SESSION_ID"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Function to send a prompt and save response
send_prompt() {
    local prompt="$1"
    local name="$2"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_file="$OUTPUT_DIR/${name}_${timestamp}.json"
    
    echo "Sending: $name"
    ccr code -p "$prompt" --session-id "$SESSION_ID" --output-format json > "$output_file" 2>&1
    echo "  ✓ Response saved to: $output_file"
    echo ""
}

# Example conversation: multiple prompts in same session
send_prompt "Generate a simple function to add two numbers in Python" "01_generate_function"
send_prompt "Now write a unit test for that function using pytest" "02_unit_test"
send_prompt "Add error handling for non-numeric inputs" "03_error_handling"

echo "Conversation completed!"
echo "Session ID: $SESSION_ID (use this to resume later)"
