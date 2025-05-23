import sys
import os
import json
from collections import defaultdict
from typing import Dict, List, Set, Tuple

class DiagnosticAnalyzer:
    def __init__(self, diagnostic_dir: str, verbose: bool):
        self.diagnostic_dir = diagnostic_dir
        self.diagnostic_files = []
        # Track messages by round for each file
        self.messages_by_round = defaultdict(lambda: defaultdict(set))
        # Track global frequency of messages
        self.global_message_frequency = defaultdict(int)
        # Track message persistence (how many rounds a message appears)
        self.message_persistence = defaultdict(int)
        # Track which messages were eventually fixed
        self.fixed_messages = set()
        self.unfixed_messages = set()
        self.verbose = verbose
        # Messages to ignore
        self.ignored_messages = {"The error messages are:", "```"}
        
    def should_ignore_message(self, message: str) -> bool:
        """Check if a message should be ignored."""
        # Check for exact matches
        if message in self.ignored_messages:
            return True
        # Check if message starts with any of the ignored messages
        return any(message.startswith(ignored) for ignored in self.ignored_messages)
        
    def load_diagnostic_files(self):
        """Load all diagnostic JSON files from the directory."""
        for filename in os.listdir(self.diagnostic_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(self.diagnostic_dir, filename)
                try:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                        self.diagnostic_files.append(data)
                        self.analyze_file_messages(data, filename)
                except Exception as e:
                    print(f"Error reading {filename}: {e}")
    
    def analyze_file_messages(self, file_data: dict, filename: str):
        """Analyze messages in a single file across rounds."""
        round_history = file_data.get('roundHistory', [])
        if not round_history:
            return

        # Track messages for each round
        all_messages = set()
        for round_data in round_history:
            round_num = round_data.get('round', 0)
            # Filter out ignored messages
            messages = [msg for msg in round_data.get('diagnosticMessages', []) 
                       if not self.should_ignore_message(msg)]
            
            # Add messages to round tracking
            self.messages_by_round[filename][round_num] = set(messages)
            
            # Update global frequency
            for message in messages:
                self.global_message_frequency[message] += 1
                all_messages.add(message)
        
        # Determine which messages were fixed and which weren't
        last_round = max(self.messages_by_round[filename].keys())
        last_round_messages = self.messages_by_round[filename][last_round]
        
        # Messages that appeared in any round but not in the last round were fixed
        self.fixed_messages.update(all_messages - last_round_messages)
        # Messages that appeared in the last round were not fixed
        self.unfixed_messages.update(last_round_messages)
        
        # Calculate persistence for each message
        for message in all_messages:
            persistence = sum(1 for round_num in self.messages_by_round[filename] 
                            if message in self.messages_by_round[filename][round_num])
            self.message_persistence[message] = max(self.message_persistence[message], persistence)
    
    def analyze_difficulty(self) -> Dict[str, List[Tuple[str, int]]]:
        """Analyze the difficulty of fixing messages based on persistence."""
        # Sort messages by persistence (higher persistence = harder to fix)
        sorted_by_persistence = sorted(
            self.message_persistence.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        # Group messages by difficulty level
        difficulty_levels = {
            'very_hard': [],    # Appears in 4+ rounds
            'hard': [],         # Appears in 3 rounds
            'moderate': [],     # Appears in 2 rounds
            'easy': []          # Appears in 1 round
        }
        
        for message, persistence in sorted_by_persistence:
            if persistence >= 4:
                difficulty_levels['very_hard'].append((message, persistence))
            elif persistence == 3:
                difficulty_levels['hard'].append((message, persistence))
            elif persistence == 2:
                difficulty_levels['moderate'].append((message, persistence))
            else:
                difficulty_levels['easy'].append((message, persistence))
        
        return difficulty_levels
    
    def generate_report(self) -> str:
        """Generate a comprehensive report of the analysis."""
        report = []
        report.append("=== Diagnostic Analysis Report ===")
        
        # Global message frequency
        report.append("\n=== Most Common Error Messages ===")
        sorted_frequency = sorted(
            self.global_message_frequency.items(),
            key=lambda x: x[1],
            reverse=True
        )
        if not self.verbose:
            for message, frequency in sorted_frequency[:10]:  # Top 10 most common
                report.append(f"Frequency: {frequency} - {message}")
        else:
            for message, frequency in sorted_frequency:
                report.append(f"Frequency: {frequency} - {message}")
        
        # Difficulty analysis
        report.append("\n=== Message Difficulty Analysis ===")
        difficulty_levels = self.analyze_difficulty()
        if not self.verbose:
            for level, messages in difficulty_levels.items():
                report.append(f"\n{level.upper()} to fix ({len(messages)} messages):")
                for message, persistence in messages[:5]:  # Show top 5 for each level
                    report.append(f"  Persistence: {persistence} rounds - {message}")
        else:
            for level, messages in difficulty_levels.items():
                report.append(f"\n{level.upper()} to fix ({len(messages)} messages):")
                for message, persistence in messages:
                    report.append(f"  Persistence: {persistence} rounds - {message}")
        
        # Fixed vs Unfixed statistics
        report.append("\n=== Fix Success Statistics ===")
        report.append(f"Total unique messages: {len(self.global_message_frequency)}")
        report.append(f"Successfully fixed messages: {len(self.fixed_messages)}")
        report.append(f"Unfixed messages: {len(self.unfixed_messages)}")
        if self.verbose:
            report.append("\n=== Unfixed Messages ===")
            for message in self.unfixed_messages:
                report.append(f"{message}")
        return "\n".join(report)


def main():
    diagnostic_dir = sys.argv[1]
    verbose = sys.argv[2] == "verbose"
    analyzer = DiagnosticAnalyzer(diagnostic_dir, verbose)
    analyzer.load_diagnostic_files()
    
    # Generate and print the report
    report = analyzer.generate_report()
    print(report)
    
    # Save the report to a file
    with open('diagnostic_analysis_report.txt', 'w') as f:
        f.write(report)

if __name__ == "__main__":
    main() 