#!/bin/bash

# Extract plain text content from JSON output files

INPUT_FILE="$1"
OUTPUT_FILE="$2"

if [ -z "$INPUT_FILE" ]; then
    echo "Usage: $0 <input.json> [output.txt]"
    exit 1
fi

if [ -z "$OUTPUT_FILE" ]; then
    OUTPUT_FILE="${INPUT_FILE%.json}.txt"
fi

# Extract content from JSON (adjust jq query based on actual response structure)
jq -r '.content // .response // .text // .' "$INPUT_FILE" > "$OUTPUT_FILE"

echo "Extracted content to: $OUTPUT_FILE"
