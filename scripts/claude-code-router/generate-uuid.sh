#!/bin/bash

# Generate a valid UUID for use as session ID

# Try different methods to generate UUID
if command -v uuidgen &> /dev/null; then
    uuidgen
elif [ -f /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid
else
    # Fallback: generate a pseudo-UUID
    python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || \
    node -e "console.log(require('crypto').randomUUID())" 2>/dev/null || \
    echo "Error: Cannot generate UUID. Install uuidgen or python3"
fi
