#!/bin/bash
# Convert PDF to PNG using ImageMagick
# Requires: sudo apt-get install imagemagick

convert_pdf_to_png() {
    local pdf_file="$1"
    local output_dir="${2:-$(dirname "$pdf_file")}"
    local dpi="${3:-200}"
    
    if [ ! -f "$pdf_file" ]; then
        echo "Error: PDF file not found: $pdf_file"
        exit 1
    fi
    
    # Create output directory if it doesn't exist
    mkdir -p "$output_dir"
    
    # Get base filename without extension
    local base_name=$(basename "$pdf_file" .pdf)
    
    echo "Converting $pdf_file to PNG..."
    echo "Output directory: $output_dir"
    echo "Base name: $base_name"
    convert -density "$dpi" "$pdf_file" "$output_dir/${base_name}_page_%02d.png"
    
    echo "Conversion complete!"
}

# Usage
if [ $# -lt 1 ]; then
    echo "Usage: $0 <pdf_file> [output_dir] [dpi]"
    exit 1
fi

convert_pdf_to_png "$@"