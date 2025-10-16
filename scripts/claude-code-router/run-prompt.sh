#!/bin/bash

# Simple script to run claude-code-router with a prompt and save output

PROMPT="$1"
OUTPUT_FILE="$2"
SESSION_ID="${3:-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")}"

if [ -z "$PROMPT" ] || [ -z "$OUTPUT_FILE" ]; then
    echo "Usage: $0 '<prompt>' <output_file> [session_id]"
    echo "Example: $0 'Generate a unit test' output.json"
    exit 1
fi

# Run ccr with prompt and capture JSON output
ccr code -p "$PROMPT" --session-id "$SESSION_ID" --output-format json > "$OUTPUT_FILE"

echo "Output saved to: $OUTPUT_FILE"
echo "Session ID: $SESSION_ID"
