import re
from typing import Dict, List
import tiktoken
from pathlib import Path
from collections import Counter
import argparse

class FileTokenCounter:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.text = ""
        self.encoding = None
        
    def read_file(self) -> bool:
        """Read the file content"""
        try:
            with open(self.file_path, 'r', encoding='utf-8') as file:
                self.text = file.read()
            return True
        except Exception as e:
            print(f"Error reading file: {str(e)}")
            return False
    
    def setup_tiktoken(self):
        """Setup tiktoken encoding"""
        try:
            self.encoding = tiktoken.get_encoding("cl100k_base")
        except ImportError:
            print("Tiktoken not installed. Install with: pip install tiktoken")
            self.encoding = None
    
    def count_basic_stats(self) -> Dict[str, int]:
        """Count basic statistics"""
        words = self.text.strip().split()
        lines = self.text.splitlines()
        
        return {
            "word_count": len(words),
            "character_count": len(self.text.replace(" ", "")),
            "line_count": len(lines),
            "non_empty_lines": len([line for line in lines if line.strip()])
        }
    
    def count_advanced_stats(self) -> Dict[str, int]:
        """Count advanced statistics"""
        return {
            "special_chars": len(re.findall(r'[!@#$%^&*()_+\-=\[\]{};\'"\\|,.<>/?]', self.text)),
            "numbers": len(re.findall(r'\d+', self.text)),
            "sentences": len(re.split(r'[.!?]+', self.text)) - 1,
            "paragraphs": len(re.split(r'\n\s*\n', self.text))
        }
    
    def count_tiktoken(self) -> int:
        """Count tokens using tiktoken"""
        if self.encoding:
            return len(self.encoding.encode(self.text))
        return 0
    
    def get_word_frequency(self, top_n: int = 10) -> List[tuple]:
        """Get most common words"""
        words = re.findall(r'\b\w+\b', self.text.lower())
        return Counter(words).most_common(top_n)
    
    def analyze(self) -> Dict:
        """Perform complete analysis"""
        if not self.read_file():
            return {}
        
        self.setup_tiktoken()
        
        basic_stats = self.count_basic_stats()
        advanced_stats = self.count_advanced_stats()
        tiktoken_count = self.count_tiktoken()
        word_freq = self.get_word_frequency()
        
        return {
            "basic_stats": basic_stats,
            "advanced_stats": advanced_stats,
            "tiktoken_count": tiktoken_count,
            "word_frequency": word_freq
        }

def main():
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Count tokens in a text file')
    parser.add_argument('file_path', help='Path to the text file')
    parser.add_argument('--top-words', type=int, default=10, help='Number of top words to show')
    args = parser.parse_args()
    
    # Verify file exists
    if not Path(args.file_path).exists():
        print(f"Error: File '{args.file_path}' does not exist.")
        return
    
    # Create counter and analyze
    counter = FileTokenCounter(args.file_path)
    results = counter.analyze()
    
    if results:
        print("\nFile Analysis Results:")
        print("=" * 50)
        
        print("\nBasic Statistics:")
        print("-" * 20)
        for key, value in results["basic_stats"].items():
            print(f"{key.replace('_', ' ').title()}: {value}")
        
        print("\nAdvanced Statistics:")
        print("-" * 20)
        for key, value in results["advanced_stats"].items():
            print(f"{key.replace('_', ' ').title()}: {value}")
        
        print(f"\nTiktoken Count: {results['tiktoken_count']}")
        
        print(f"\nTop {args.top_words} Most Common Words:")
        print("-" * 20)
        for word, count in results["word_frequency"]:
            print(f"{word}: {count}")

if __name__ == "__main__":
    main()