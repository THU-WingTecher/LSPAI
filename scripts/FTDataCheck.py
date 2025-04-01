# https://cookbook.openai.com/examples/chat_finetuning_data_prep
import json
import tiktoken # for token counting
import numpy as np
from collections import defaultdict
import argparse
import os
import glob
from typing import List

class FineTuneDataChecker:
    def __init__(self, data_path):
        self.data_path = data_path
        self.encoding = tiktoken.get_encoding("cl100k_base")
        self.dataset = self.load_dataset()
        self.format_errors = defaultdict(int)
        
    def load_dataset(self):
        """Load and return the dataset from jsonl file"""
        with open(self.data_path, 'r', encoding='utf-8') as f:
            dataset = [json.loads(line) for line in f]
        print(f"Num examples: {len(dataset)}")
        return dataset

    def check_format_errors(self):
        """Check for format errors in the dataset"""
        for ex in self.dataset:
            if not isinstance(ex, dict):
                self.format_errors["data_type"] += 1
                continue
            
            self._check_messages(ex)
        
        self._print_format_errors()

    def _check_messages(self, example):
        """Check message format and content"""
        messages = example.get("messages", None)
        if not messages:
            self.format_errors["missing_messages_list"] += 1
            return

        for message in messages:
            self._validate_message(message)
        
        if not any(message.get("role", None) == "assistant" for message in messages):
            self.format_errors["example_missing_assistant_message"] += 1

    def _validate_message(self, message):
        """Validate individual message format"""
        if "role" not in message or "content" not in message:
            self.format_errors["message_missing_key"] += 1
        
        if any(k not in ("role", "content", "name", "function_call", "weight") for k in message):
            self.format_errors["message_unrecognized_key"] += 1
        
        if message.get("role", None) not in ("system", "user", "assistant", "function"):
            self.format_errors["unrecognized_role"] += 1
        
        print(message)
        content = message.get("content", None)
        function_call = message.get("function_call", None)
        
        if (not content and not function_call) or not isinstance(content, str):
            self.format_errors["missing_content"] += 1

    def _print_format_errors(self):
        """Print any format errors found"""
        if self.format_errors:
            print("\nFound errors:")
            for k, v in self.format_errors.items():
                print(f"{k}: {v}")
        else:
            print("\nNo format errors found")

    def analyze_token_distribution(self):
        """Analyze token distribution in the dataset"""
        n_missing_system = 0
        n_missing_user = 0
        n_messages = []
        convo_lens = []
        assistant_message_lens = []

        for ex in self.dataset:
            messages = ex["messages"]
            if not any(message["role"] == "system" for message in messages):
                n_missing_system += 1
            if not any(message["role"] == "user" for message in messages):
                n_missing_user += 1
            
            n_messages.append(len(messages))
            convo_lens.append(self._num_tokens_from_messages(messages))
            assistant_message_lens.append(self._num_assistant_tokens(messages))

        self._print_token_statistics(n_missing_system, n_missing_user, 
                                   n_messages, convo_lens, assistant_message_lens)
        
        return convo_lens

    def _calculate_epochs(self, target_epochs, min_target_examples, 
                         max_target_examples, min_default_epochs, 
                         max_default_epochs):
        """Calculate the optimal number of epochs based on dataset size"""
        n_train_examples = len(self.dataset)
        
        n_epochs = target_epochs
        if n_train_examples * target_epochs < min_target_examples:
            n_epochs = min(max_default_epochs, min_target_examples // n_train_examples)
        elif n_train_examples * target_epochs > max_target_examples:
            n_epochs = max(min_default_epochs, max_target_examples // n_train_examples)
        
        return n_epochs

    def estimate_training_cost(self, convo_lens):
        """Estimate training cost based on token count"""
        MAX_TOKENS_PER_EXAMPLE = 16385
        TARGET_EPOCHS = 3
        MIN_TARGET_EXAMPLES = 100
        MAX_TARGET_EXAMPLES = 25000
        MIN_DEFAULT_EPOCHS = 1
        MAX_DEFAULT_EPOCHS = 25

        n_epochs = self._calculate_epochs(TARGET_EPOCHS, MIN_TARGET_EXAMPLES, 
                                        MAX_TARGET_EXAMPLES, MIN_DEFAULT_EPOCHS, 
                                        MAX_DEFAULT_EPOCHS)

        n_billing_tokens = sum(min(MAX_TOKENS_PER_EXAMPLE, length) for length in convo_lens)
        
        print(f"\nTraining Cost Estimation:")
        print(f"Dataset has ~{n_billing_tokens} tokens that will be charged for during training")
        print(f"Default training epochs: {n_epochs}")
        print(f"Total tokens to be charged: ~{n_epochs * n_billing_tokens}")

    def _num_tokens_from_messages(self, messages, tokens_per_message=3, tokens_per_name=1):
        """Calculate number of tokens in messages"""
        num_tokens = 0
        for message in messages:
            num_tokens += tokens_per_message
            for key, value in message.items():
                num_tokens += len(self.encoding.encode(value))
                if key == "name":
                    num_tokens += tokens_per_name
        return num_tokens + 3

    def _num_assistant_tokens(self, messages):
        """Calculate number of tokens in assistant messages"""
        return sum(len(self.encoding.encode(message["content"]))
                  for message in messages
                  if message["role"] == "assistant")

    @staticmethod
    def _print_distribution(values, name):
        """Print statistical distribution of values"""
        print(f"\nDistribution of {name}:")
        print(f"min / max: {min(values)}, {max(values)}")
        print(f"mean / median: {np.mean(values):.1f}, {np.median(values):.1f}")
        print(f"p5 / p95: {np.quantile(values, 0.1):.1f}, {np.quantile(values, 0.9):.1f}")

    def _print_token_statistics(self, n_missing_system, n_missing_user, 
                              n_messages, convo_lens, assistant_message_lens):
        """Print token statistics"""
        print(f"\nMessage Statistics:")
        print(f"Examples missing system message: {n_missing_system}")
        print(f"Examples missing user message: {n_missing_user}")
        
        self._print_distribution(n_messages, "messages per example")
        self._print_distribution(convo_lens, "total tokens per example")
        self._print_distribution(assistant_message_lens, "assistant tokens per example")
        
        n_too_long = sum(l > 16385 for l in convo_lens)
        print(f"\n{n_too_long} examples exceed the 16,385 token limit (will be truncated)")

    def filter_and_save_data(self, output_path=None):
        """Filter out unqualified examples and merge duplicates"""
        if output_path is None:
            base, ext = os.path.splitext(self.data_path)
            output_path = f"{base}_refined{ext}"

        qualified_data = []
        MAX_TOKENS = 16385
        
        # Dictionary to group examples by user content
        grouped_examples = {}

        for example in self.dataset:
            if not self._is_qualified_example(example):
                continue

            messages = example["messages"]
            # Find the user message content
            user_content = None
            assistant_content = None
            for msg in messages:
                if msg["role"] == "user":
                    user_content = msg["content"]
                elif msg["role"] == "assistant":
                    assistant_content = msg["content"]

            if user_content and assistant_content:
                if user_content not in grouped_examples:
                    grouped_examples[user_content] = {
                        "messages": messages,
                        "assistant_responses": [assistant_content]
                    }
                else:
                    # Add this assistant response to the group
                    if assistant_content not in grouped_examples[user_content]["assistant_responses"]:
                        grouped_examples[user_content]["assistant_responses"].append(assistant_content)

        # Create merged examples
        for user_content, group in grouped_examples.items():
            messages = group["messages"].copy()
            # Find and update the assistant message with merged content
            for i, msg in enumerate(messages):
                if msg["role"] == "assistant":
                    # Join all unique assistant responses
                    merged_response = "\n".join(group["assistant_responses"])
                    messages[i]["content"] = merged_response
                    break
            
            # Check token limit
            if self._num_tokens_from_messages(messages) > MAX_TOKENS:
                messages = self._truncate_messages(messages, MAX_TOKENS)
            
            qualified_data.append({"messages": messages})

        # Save filtered and merged data
        with open(output_path, 'w', encoding='utf-8') as f:
            for example in qualified_data:
                f.write(json.dumps(example, ensure_ascii=False) + '\n')

        print(f"\nRefined Dataset Statistics:")
        print(f"Original examples: {len(self.dataset)}")
        print(f"Unique user queries: {len(grouped_examples)}")
        print(f"Average assistant responses per query: {sum(len(g['assistant_responses']) for g in grouped_examples.values()) / len(grouped_examples):.2f}")
        print(f"Saved to: {output_path}")
        
        return output_path

    def _is_qualified_example(self, example):
        """Check if an example meets all quality criteria"""
        if not isinstance(example, dict):
            return False

        messages = example.get("messages", [])
        if not messages:
            return False

        # Check if has both user and assistant messages
        has_user = False
        has_assistant = False
        for message in messages:
            if not isinstance(message, dict):
                return False
            if "role" not in message or "content" not in message:
                return False
            if message["role"] == "user":
                has_user = True
            elif message["role"] == "assistant":
                has_assistant = True
            
            # Check content validity
            content = message.get("content")
            if not content or not isinstance(content, str):
                return False
            
            # Check role validity
            if message["role"] not in ("system", "user", "assistant", "function"):
                return False

        return has_user and has_assistant

    def _truncate_messages(self, messages, max_tokens):
        """Truncate messages to fit within token limit while maintaining structure"""
        truncated = []
        current_tokens = 0
        
        # Always keep system message if present
        if messages and messages[0]["role"] == "system":
            system_msg = messages[0]
            system_tokens = self._num_tokens_from_messages([system_msg])
            truncated.append(system_msg)
            current_tokens += system_tokens
            messages = messages[1:]

        # Keep essential conversation pairs from the end
        # (assuming most recent/relevant pairs are at the end)
        for i in range(len(messages)-1, -1, -2):
            if i > 0:  # Check if we have a pair
                assistant_msg = messages[i]
                user_msg = messages[i-1]
                pair_tokens = self._num_tokens_from_messages([user_msg, assistant_msg])
                
                if current_tokens + pair_tokens <= max_tokens:
                    truncated.insert(1, user_msg)
                    truncated.insert(2, assistant_msg)
                    current_tokens += pair_tokens
                else:
                    break

        return truncated

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description='Check and analyze fine-tuning data format'
    )
    parser.add_argument(
        '--input', '-i',
        type=str,
        nargs='+',  # Accept one or more arguments
        required=True,
        help='One or more paths to JSONL files or folders containing JSONL files'
    )
    return parser.parse_args()

def get_jsonl_files(input_paths: List[str]) -> List[str]:
    """Get list of JSONL files from multiple input paths"""
    jsonl_files = []
    
    for path in input_paths:
        if os.path.isfile(path):
            if path.endswith('.jsonl'):
                jsonl_files.append(path)
            else:
                print(f"Warning: Skipping non-JSONL file: {path}")
        
        elif os.path.isdir(path):
            # Find all .jsonl files in the directory
            found_files = glob.glob(os.path.join(path, "**/*.jsonl"), recursive=True)
            if not found_files:
                print(f"Warning: No .jsonl files found in directory: {path}")
            jsonl_files.extend(found_files)
        
        else:
            print(f"Warning: Input path does not exist: {path}")
    
    if not jsonl_files:
        raise ValueError("No valid JSONL files found in any of the input paths")
    
    return sorted(set(jsonl_files))  # Remove duplicates and sort

def main():
    args = parse_arguments()
    
    # Get list of JSONL files to process
    jsonl_files = get_jsonl_files(args.input)
    print(f"Found {len(jsonl_files)} JSONL files to process")
    # Process each file
    for file_path in jsonl_files:
        print(f"\n=== Processing {file_path} ===")
        checker = FineTuneDataChecker(file_path)
        
        # Check format and analyze
        checker.check_format_errors()
        convo_lens = checker.analyze_token_distribution()
        checker.estimate_training_cost(convo_lens)
        
        # Filter and save refined data
        refined_path = checker.filter_and_save_data()
        print(f"Refined data saved to: {refined_path}")

if __name__ == "__main__":
    main()