#!/bin/bash

# Example: Run consistent prompts and save outputs without LLM interaction
# This demonstrates the exact use case from the forum post

set -e

# Generate a proper UUID for session ID
SESSION_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s)-fallback")
OUTPUT_DIR="outputs/consistent_run_$(date +%Y%m%d_%H%M%S)"

mkdir -p "$OUTPUT_DIR"

echo "==================================="
echo "Consistent Prompt Execution Demo"
echo "==================================="
echo "Session ID: $SESSION_ID"
echo "Output Dir: $OUTPUT_DIR"
echo ""

# Define your consistent prompts
PROMPTS=(
    "Generate a Python function that calculates factorial"
    "Write a unit test for the factorial function using pytest"
    "Add docstrings to the factorial function"
    "Create error handling for negative inputs"
)

# Run each prompt with the same session ID
for i in "${!PROMPTS[@]}"; do
    PROMPT="${PROMPTS[$i]}"
    STEP=$((i+1))
    OUTPUT_FILE="$OUTPUT_DIR/step${STEP}_$(date +%s).json"
    
    echo "[$STEP/${#PROMPTS[@]}] Running prompt..."
    echo "Prompt: $PROMPT"
    
    # Execute with ccr using session-id for consistency
    ccr code -p "$PROMPT" \
        --session-id "$SESSION_ID" \
        --output-format json \
        > "$OUTPUT_FILE" 2>&1
    
    echo "✓ Saved to: $OUTPUT_FILE"
    
    # Extract content to plain text
    jq -r '.content // .response // .text // .' "$OUTPUT_FILE" > "${OUTPUT_FILE%.json}.txt" 2>/dev/null || true
    
    echo ""
    sleep 1
done

echo "==================================="
echo "All prompts completed!"
echo "Results saved to: $OUTPUT_DIR"
echo "Session ID: $SESSION_ID"
echo ""
echo "To resume this session later, use:"
echo "  ccr code -p 'Your prompt' --session-id $SESSION_ID --output-format json"
