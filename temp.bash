# Check if the required parameters are provided
if [ -z "$1" ]; then
    echo "Error: Target project path is missing."
    echo "Usage: $0 <target_project_path> <test_save_dir> [report_dir]"
    exit 1
fi

if [ -z "$2" ]; then
    echo "Error: Test file save path is missing."
    echo "Usage: $0 <target_project_path> <test_save_dir> [report_dir]"
    exit 1
fi

# Input parameters
dirA=$1
dirB=$2
for file in $(find $dirA -name "*.java"); do
    filename=$(basename "$file")
    if [ -f "$dirB/$filename" ]; then
        echo "Found match: $filename"
        # Optionally, you can add commands here to do something with the matching files
    fi
    # delete if not matched 
    if [ ! -f "$dirB/$filename" ]; then
        echo "Not found: $filename"
        rm $file
    fi
done
