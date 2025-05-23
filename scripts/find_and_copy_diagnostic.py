import os
import sys
import shutil
from datetime import datetime

def find_and_copy_diagnostic_items(start_path='.', dest_path=None):
    """
    Recursively find files containing 'diagnostic' in their names and copy them to destination folder.
    
    Args:
        start_path (str): The directory to start searching from. Defaults to current directory.
        dest_path (str): The directory where files will be copied to.
    
    Returns:
        list: List of tuples containing (source_path, dest_path, status) for copied files
    """
    if not dest_path:
        # Create a default destination folder with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest_path = f"diagnostic_files_{timestamp}"
    
    # Create destination directory if it doesn't exist
    os.makedirs(dest_path, exist_ok=True)
    
    copied_items = []
    
    try:
        for root, dirs, files in os.walk(start_path):
            # Check files
            for file_name in files:
                if 'diagnostic' in file_name.lower():
                    source_path = os.path.join(root, file_name)
                    
                    # Create a unique destination filename to avoid conflicts
                    base_name, ext = os.path.splitext(file_name)
                    dest_file = os.path.join(dest_path, file_name)
                    
                    # If file already exists, add a number to make it unique
                    counter = 1
                    while os.path.exists(dest_file):
                        dest_file = os.path.join(dest_path, f"{base_name}_{counter}{ext}")
                        counter += 1
                    
                    try:
                        shutil.copy2(source_path, dest_file)
                        copied_items.append((source_path, dest_file, "success"))
                    except Exception as e:
                        copied_items.append((source_path, dest_file, f"error: {str(e)}"))
                    
    except Exception as e:
        print(f"Error occurred during search: {e}", file=sys.stderr)
        return []
    
    return copied_items

def main():
    # Get the start path and destination path from command line arguments
    if len(sys.argv) < 2:
        print("Usage: python find_and_copy_diagnostic.py [source_path] [destination_path]")
        print("If destination_path is not provided, a new folder will be created with timestamp")
        sys.exit(1)
    
    start_path = sys.argv[1]
    dest_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    print(f"Searching for diagnostic files in: {os.path.abspath(start_path)}")
    if dest_path:
        print(f"Files will be copied to: {os.path.abspath(dest_path)}")
    print("-" * 80)
    
    results = find_and_copy_diagnostic_items(start_path, dest_path)
    
    if not results:
        print("No diagnostic files found.")
    else:
        print(f"\nFound and copied {len(results)} files:")
        for source, dest, status in results:
            print(f"Source: {source}")
            print(f"Destination: {dest}")
            print(f"Status: {status}")
            print("-" * 40)

if __name__ == "__main__":
    main() 