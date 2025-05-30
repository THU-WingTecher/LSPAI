import json
import os
from typing import List, Dict, Set, Tuple
from pathlib import Path
from datetime import datetime
from rag.languageTemplate import LanguageTemplateManager
import time
from langchain_deepseek import ChatDeepSeek
from langchain.chat_models import ChatOpenAI
import re
import tiktoken

SIMILARITY_THRESHOLD = 0
def parse_code(response: str) -> str:
    regex = r'```(?:\w+)?(?:~~)?\s*([\s\S]*?)\s*```'
    match = re.search(regex, response)
    if match:
        return match.group(1).strip()
    print("No code block found in the response!")
    return response

class Baseline:
    def __init__(self, llm: str):
        if llm.startswith("deepseek"):
            self.llm = ChatDeepSeek(model_name=llm, temperature=0, api_key=os.getenv("DEEPSEEK_API_KEY"))
        else:
            self.llm = ChatOpenAI(model_name=llm, temperature=0, openai_api_key=os.getenv("OPENAI_API_KEY"))
        # Get max tokens based on the model
        self.max_tokens = self._get_model_max_tokens()
        # Leave some buffer for prompts and responses (25% of max tokens)
        self.max_context_tokens = int(self.max_tokens * 0.75)
    def _get_model_max_tokens(self) -> int:
        """Get the maximum token limit for the current model."""
        # DeepSeek models
        if isinstance(self.llm, ChatDeepSeek):
            model_limits = {
                "deepseek-chat": 8192,
                "deepseek-coder": 8192,
                # Add other DeepSeek models as needed
            }
            for model_name, limit in model_limits.items():
                if model_name in self.llm.model_name:
                    return limit
            return 8192  # Default for DeepSeek models
        
        # OpenAI models
        elif isinstance(self.llm, ChatOpenAI):
            model_limits = {
                "gpt-4": 8192,
                "gpt-4-32k": 32768,
                "gpt-3.5-turbo": 4096,
                "gpt-3.5-turbo-16k": 16384,
            }
            for model_name, limit in model_limits.items():
                if model_name in self.llm.model_name:
                    return limit
            return 8192  # Default for unknown OpenAI models
        
        return 8192  # Default fallback
    
    def prune_context(self, context_items: List[Tuple[any, float]], 
                     source_code: str) -> Tuple[str, List[Dict]]:
        """
        Prune context to fit within token limit while keeping most relevant information.
        
        Args:
            context_items: List of (Document, score) tuples from similarity search
            source_code: The original source code being analyzed
            
        Returns:
            Tuple of (pruned context string, list of info dictionaries)
        """
        # First, count tokens in the source code as it's essential
        source_code_tokens = self.count_tokens(source_code)
        remaining_tokens = self.max_context_tokens - source_code_tokens

        if remaining_tokens <= 0:
            print("Warning: Source code alone exceeds token limit")
            return "", []

        # Sort context items by score (higher score = more relevant)
        sorted_items = sorted(context_items, key=lambda x: x[1], reverse=True)
        
        pruned_contexts = []
        pruned_infos = []
        current_tokens = 0

        for doc, score in sorted_items:
            # Count tokens in this context
            context_tokens = self.count_tokens(doc.page_content)
            
            # If adding this context would exceed the limit, skip it
            if current_tokens + context_tokens > remaining_tokens:
                # If this is the first context and it's too large, take a portion
                if not pruned_contexts:
                    # Take as much as we can fit
                    text = doc.page_content
                    while current_tokens + context_tokens > remaining_tokens and text:
                        # Cut the text in half until it fits
                        text = text[:len(text)//2]
                        context_tokens = self.count_tokens(text)
                    
                    if text:
                        pruned_contexts.append(text)
                        pruned_infos.append({
                            'content': text,
                            'metadata': doc.metadata,
                            'score': score,
                            'truncated': True
                        })
                        current_tokens += context_tokens
                continue
            
            # Add this context as it fits within the limit
            pruned_contexts.append(doc.page_content)
            pruned_infos.append({
                'content': doc.page_content,
                'metadata': doc.metadata,
                'score': score,
                'truncated': False
            })
            current_tokens += context_tokens

        # Join contexts with clear separators
        final_context = "\n\n---\n\n".join(pruned_contexts)
        
        return final_context, pruned_infos
    
    def retrieve_context(self, task: Dict) -> Dict:
        """
        Retrieve relevant code context for the given task.
        
        Args:
            task: Dictionary containing task information
            
        Returns:
            Dictionary containing retrieved context and metadata
        """
        symbol_name = task['symbolName']
        source_code = task['sourceCode']
        query = f"Find code related to {symbol_name}, to comprehensively test the code, include all relevant code. Below is the source code of the file: \n{source_code}"

        # Measure retrieval time
        start_time = time.time()
        source_nodes = self.retriever.retrieve(query)
        filtered_nodes = [node for node in source_nodes if getattr(node, "score", 1.0) >= SIMILARITY_THRESHOLD]
        retrieval_time = time.time() - start_time

        context = "" if not filtered_nodes else "\n\n".join(node.text for node in filtered_nodes)
        token_count = self.count_tokens(context)

        return {
            'context': context,
            'info': filtered_nodes,  # Changed 'info' to 'nodes' to be more descriptive
            'retrieval_time': retrieval_time,
            'token_count': token_count
        }
    
    def count_tokens(self, text: str) -> int:
        """Count the number of tokens in the text."""
        try:
            # Initialize tokenizer for GPT-4
            encoding = tiktoken.encoding_for_model("gpt-4")
            
            # If text is None or empty, return 0
            if not text:
                return 0
                
            # Count tokens
            tokens = encoding.encode(text)
            return len(tokens)
            
        except Exception as e:
            print(f"Error counting tokens: {e}")
            return 0
    
    def generate_unit_test(self, task: Dict, retrieval_result: Dict, language: str, file_path: str) -> Dict:
        """
        Generate unit test using the retrieved context.
        
        Args:
            task: Dictionary containing task information
            retrieval_result: Dictionary containing retrieved context and metadata
            language: Programming language
            file_path: Path to save the test file
            
        Returns:
            Dictionary containing the final results
        """
        template = LanguageTemplateManager.get_unit_test_template(language, file_path, task['package'], task['imports'])
        system_prompt = LanguageTemplateManager.generate_system_prompt()
        prompt = LanguageTemplateManager.generate_prompt(template, task['sourceCode'], retrieval_result['context'])
        
        # Create messages array with system prompt and user prompt
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        
        # Invoke LLM with both system and user messages
        response = self.llm.invoke(messages)
        code = parse_code(response.content if hasattr(response, 'content') else str(response))

        return {
            'symbol_name': task['symbolName'],
            'original_source': {
                'code': task['sourceCode'],
                'line_num': task['lineNum'],
                'doc_path': task['relativeDocumentPath']
            },
            'retrieved_sources': [
                {
                    'content': node.text if hasattr(node, 'text') else node.get('text', ''),
                    'metadata': node.metadata if hasattr(node, 'metadata') else node.get('metadata', ''),
                    'score': getattr(node, "score", None)
                } for node in retrieval_result['info']
            ],
            'prompt': prompt,
            'system_prompt': system_prompt,  # Added system prompt to result for logging
            'final_response': str(code),
            'save_path': file_path,
            'retrieval_time_sec': retrieval_result['retrieval_time'],
            'retrieved_context_token_count': retrieval_result['token_count']
        }

    def process_task(self, task: Dict, language: str, file_path: str) -> Dict:
        retrieval_result = self.retrieve_context(task)
        return self.generate_unit_test(task, retrieval_result, language, file_path)

    def run_tests(self, force_recompute: bool = False):
        """
        Run the test pipeline on all tasks.
        
        Args:
            force_recompute: If True, recompute embeddings even if they exist
        """
        # Load tasks
        tasks = self.load_tasks()
        
        # Process each task
        for task in tasks:
            result = self.process_task(task)
            self.results.append(result)
            
            # Save individual result
            output_file = os.path.join(
                self.output_dir,
                f"{task['symbolName'].replace('(', '_').replace(')', '_')}.json"
            )
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
        
        # Generate summary report
        self.generate_report()

    def generate_report(self):
        """Generate a summary report of the test results."""
        report = {
            'total_tasks': len(self.results),
            'results': self.results
        }
        
        # Save report
        report_path = os.path.join(self.output_dir, 'test_report.json')
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
    # ... (rest of the methods remain the same)

# Example usage
if __name__ == "__main__":
    pipeline = RAGTestPipeline(
        task_list_path="path/to/task_list.json",
        output_dir="test_results",
        embedding_dir="embeddings"
    )
    
    # Setup RAG with project path
    project_path = "/absolute/path/to/your/project"
    pipeline.setup_rag(project_path)
    
    # Run tests
    pipeline.run_tests()