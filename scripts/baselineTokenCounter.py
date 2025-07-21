import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Tuple
import tiktoken

def count_tokens(text: str, model: str = "gpt-4") -> int:
    """
    Count tokens in text using tiktoken.
    
    Args:
        text: The text to count tokens for
        model: The model to use for tokenization (default: gpt-4)
    
    Returns:
        Number of tokens in the text
    """
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except Exception as e:
        print(f"Warning: Could not count tokens with tiktoken: {e}")
        # Fallback: rough estimation (1 token ≈ 4 characters)
        return len(text) // 4

def process_json_files(directory_path: str) -> Tuple[List[Dict], float]:
    """
    Process all JSON files in the given directory and subdirectories recursively, 
    and count tokens in their 'prompt' fields.
    
    Args:
        directory_path: Path to the directory containing JSON files
    
    Returns:
        Tuple of (list of file results, average token count)
    """
    directory = Path(directory_path)
    
    if not directory.exists():
        raise FileNotFoundError(f"Directory not found: {directory_path}")
    
    if not directory.is_dir():
        raise NotADirectoryError(f"Path is not a directory: {directory_path}")
    
    # Find all JSON files recursively (including subdirectories)
    json_files = list(directory.rglob("*.json"))
    
    if not json_files:
        print(f"No JSON files found in directory or subdirectories: {directory_path}")
        return [], 0.0
    
    results = []
    total_tokens = 0
    
    print(f"Found {len(json_files)} JSON files to process (including subdirectories)...")
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Extract the prompt field
            if 'prompt' not in data:
                print(f"Warning: No 'prompt' field found in {json_file.relative_to(directory)}")
                continue
            system_prompt = """You are a powerful AI coding assistant, powered by Claude 3.7 Sonnet. You operate exclusively in LSPRAG, the world's best tool for unit test generation. 

<test_generation>
1. Generate DIVERSE test cases so that maximize coverage of the given focal methods.2. When generating test cases, you should consider the context of the source code.3. After generating code, generate unit test case follow below unit test format. Final Code should be wrapped by ```.
</test_generation>"""
            prompt = data['prompt']
            token_count = count_tokens(system_prompt + prompt)
            
            result = {
                'filename': json_file.name,
                'relative_path': str(json_file.relative_to(directory)),
                'prompt_length': len(prompt),
                'token_count': token_count,
                'file_path': str(json_file)
            }
            
            results.append(result)
            total_tokens += token_count
            
            print(f"Processed {json_file.relative_to(directory)}: {token_count} tokens")
            
        except json.JSONDecodeError as e:
            print(f"Error reading JSON file {json_file.relative_to(directory)}: {e}")
        except Exception as e:
            print(f"Error processing {json_file.relative_to(directory)}: {e}")
    
    # Calculate average
    average_tokens = total_tokens / len(results) if results else 0.0
    
    return results, average_tokens

def save_results(results: List[Dict], output_file: str = "token_counts.json"):
    """
    Save the token count results to a JSON file.
    
    Args:
        results: List of result dictionaries
        output_file: Output file path
    """
    output_data = {
        'total_files_processed': len(results),
        'total_tokens': sum(r['token_count'] for r in results),
        'average_tokens': sum(r['token_count'] for r in results) / len(results) if results else 0,
        'file_results': results
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    print(f"Results saved to: {output_file}")

def process_single_file(file_path: str, model: str = "gpt-4") -> Dict:
    """
    Process a single file and count tokens in its content.
    
    Args:
        file_path: Path to the file to process
        model: The model to use for tokenization
    
    Returns:
        Dictionary with file information and token count
    """
    file_path_obj = Path(file_path)
    
    if not file_path_obj.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    if not file_path_obj.is_file():
        raise NotADirectoryError(f"Path is not a file: {file_path}")
    
    try:
        # Read file content
        with open(file_path_obj, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Count tokens
        token_count = count_tokens(content, model)
        
        result = {
            'filename': file_path_obj.name,
            'file_path': str(file_path_obj.absolute()),
            'file_size_bytes': file_path_obj.stat().st_size,
            'content_length': len(content),
            'token_count': token_count,
            'file_extension': file_path_obj.suffix.lower()
        }
        
        print(f"Processed {file_path_obj.name}: {token_count} tokens")
        
        return result
        
    except UnicodeDecodeError as e:
        print(f"Error reading file {file_path_obj.name}: {e}")
        return {
            'filename': file_path_obj.name,
            'file_path': str(file_path_obj.absolute()),
            'error': f"Unicode decode error: {e}",
            'token_count': 0
        }
    except Exception as e:
        print(f"Error processing {file_path_obj.name}: {e}")
        return {
            'filename': file_path_obj.name,
            'file_path': str(file_path_obj.absolute()),
            'error': str(e),
            'token_count': 0
        }

def main():
    """
    Main function to run the token counting script.
    """
    if len(sys.argv) < 2:
        print("Usage: python baselineTokenCounter.py <file_or_directory_path1> [file_or_directory_path2] ...")
        print("Examples:")
        print("  python baselineTokenCounter.py test.py")
        print("  python baselineTokenCounter.py /path/to/directory")
        print("  python baselineTokenCounter.py file1.py file2.py /path/to/directory")
        sys.exit(1)
    
    paths = sys.argv[1:]
    all_results = []
    total_files_processed = 0
    total_tokens_all = 0
    
    try:
        for path in paths:
            path_obj = Path(path)
            
            if path_obj.is_file():
                # Process single file
                print(f"Processing file: {path}")
                print("-" * 50)
                
                result = process_single_file(path)
                all_results.append(result)
                total_files_processed += 1
                total_tokens_all += result['token_count']
                
                print(f"File {path} complete!")
                print(f"Tokens: {result['token_count']:,}")
                print()
                
            elif path_obj.is_dir():
                # Process directory (JSON files only for backward compatibility)
                print(f"Processing JSON files in directory: {path}")
                print("-" * 50)
                
                results, average_tokens = process_json_files(path)
                
                if not results:
                    print(f"No valid JSON files with 'prompt' fields were found in {path}.")
                    continue
                
                # Add directory info to results
                for result in results:
                    result['directory'] = path
                
                all_results.extend(results)
                total_files_processed += len(results)
                total_tokens_all += sum(r['token_count'] for r in results)
                
                print(f"Directory {path} complete!")
                print(f"Files processed: {len(results)}")
                print(f"Total tokens: {sum(r['token_count'] for r in results):,}")
                print(f"Average tokens per file: {average_tokens:.2f}")
                print()
            else:
                print(f"Warning: Path does not exist: {path}")
                continue
        
        if not all_results:
            print("No valid files were processed.")
            return
        
        print("=" * 50)
        print(f"ALL PROCESSING COMPLETE!")
        print(f"Total files processed: {total_files_processed}")
        print(f"Total tokens across all files: {total_tokens_all:,}")
        print(f"Average tokens per file: {total_tokens_all / total_files_processed:.2f}")
        
        # Save results
        save_results(all_results)
        
        # Display detailed results
        print("\nDetailed results:")
        print("-" * 50)
        for result in all_results:
            if 'directory' in result:
                print(f"{result['directory']}/{result['filename']}: {result['token_count']:,} tokens")
            else:
                print(f"{result['filename']}: {result['token_count']:,} tokens")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()