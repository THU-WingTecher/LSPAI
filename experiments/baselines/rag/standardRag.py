import json
import os
from typing import List, Dict, Set
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

class standardRag:
    def __init__(self, llm: str):
        if llm.startswith("deepseek"):
            self.llm = ChatDeepSeek(model_name=llm, temperature=0, api_key=os.getenv("DEEPSEEK_API_KEY"))
        else:
            self.llm = ChatOpenAI(model_name=llm, temperature=0, openai_api_key=os.getenv("OPENAI_API_KEY"))
        
    # def find_code_files(self, project_path: str) -> List[Dict]:
    #     """
    #     Find all code files in the project directory.
        
    #     Args:
    #         project_path: Absolute path to the project directory
            
    #     Returns:
    #         List of dictionaries containing file information
    #     """
    #     code_files = []
    #     project_path = Path(project_path)
        
    #     for file_path in project_path.rglob('*'):
    #         # Skip directories and ignored paths
    #         if file_path.is_dir() or any(ignore in file_path.parts for ignore in self.ignore_dirs):
    #             continue
                
    #         # Check if file has a supported extension
    #         if file_path.suffix in self.code_extensions:
    #             try:
    #                 with open(file_path, 'r', encoding='utf-8') as f:
    #                     content = f.read()
                        
    #                 # Get relative path from project root
    #                 rel_path = file_path.relative_to(project_path)
                    
    #                 code_files.append({
    #                     'path': str(rel_path),
    #                     'absolute_path': str(file_path),
    #                     'language': self.code_extensions[file_path.suffix],
    #                     'content': content,
    #                     'size': len(content)
    #                 })
    #             except Exception as e:
    #                 print(f"Error reading file {file_path}: {e}")
        
    #     return code_files
    
    # def create_documents(self, code_files: List[Dict]) -> List[Document]:
    #     """
    #     Create Document objects from code files.
        
    #     Args:
    #         code_files: List of code file information
            
    #     Returns:
    #         List of Document objects
    #     """
    #     documents = []
    #     for file_info in code_files:
    #         # Create metadata
    #         metadata = {
    #             'file_path': file_info['path'],
    #             'language': file_info['language'],
    #             'size': file_info['size']
    #         }
            
    #         # Create document
    #         doc = Document(
    #             text=file_info['content'],
    #             metadata=metadata
    #         )
    #         documents.append(doc)
        
    #     return documents
    
    # def setup_rag(self, project_path: str, force_recompute: bool = False):
    #     """
    #     Initialize the RAG system with project files.
        
    #     Args:
    #         project_path: Absolute path to the project directory
    #         force_recompute: If True, recompute embeddings even if they exist
    #     """
    #     self.embedding_dir = embedding_dir
    #     self.results = []
        
    #     # Create output and embedding directories if they don't exist
    #     os.makedirs(output_dir, exist_ok=True)
    #     os.makedirs(embedding_dir, exist_ok=True)
        
    #     # Initialize embedding model
    #     self.embed_model = OpenAIEmbedding()
        
    #     # Define supported code file extensions
    #     self.code_extensions = {
    #         '.java': 'Java',
    #         '.py': 'Python',
    #         '.js': 'JavaScript',
    #         '.ts': 'TypeScript',
    #         '.cpp': 'C++',
    #         '.c': 'C',
    #         '.h': 'C/C++ Header',
    #         '.cs': 'C#',
    #         '.go': 'Go',
    #         '.rb': 'Ruby',
    #         '.php': 'PHP',
    #         '.swift': 'Swift',
    #         '.kt': 'Kotlin',
    #         '.rs': 'Rust'
    #     }
        
    #     # Define directories to ignore
    #     self.ignore_dirs = {
    #         'node_modules', '.git', '__pycache__', 'target', 'build',
    #         'dist', '.idea', '.vscode', 'venv', 'env', '.gradle'
    #     }

    #     # Check if embeddings exist and load them if they do
    #     if not force_recompute and self.load_embeddings():
    #         print("Loaded existing embeddings")
    #         return
        
    #     print("Finding code files...")
    #     code_files = self.find_code_files(project_path)
    #     print(f"Found {len(code_files)} code files")
        
    #     print("Creating documents...")
    #     documents = self.create_documents(code_files)
        
    #     print("Computing embeddings...")
    #     # Create storage context
    #     storage_context = StorageContext.from_defaults(
    #         persist_dir=self.embedding_dir
    #     )
        
    #     # Create the graph store
    #     self.graph_store = SimplePropertyGraphStore()
        
    #     # Create nodes from documents
    #     node_parser = SimpleNodeParser()
    #     nodes = node_parser.get_nodes_from_documents(documents)
        
    #     # Create the property graph index
    #     self.index = PropertyGraphIndex(
    #         nodes=nodes,
    #         property_graph_store=self.graph_store,
    #         storage_context=storage_context,
    #         show_progress=True
    #     )
        
    #     # Create a retriever that combines graph and vector search
    #     self.retriever = VectorIndexRetriever(
    #         index=self.index,
    #         similarity_top_k=3,
    #         include_metadata=True
    #     )
        
    #     # Create the query engine
    #     self.query_engine = RetrieverQueryEngine(
    #         retriever=self.retriever
    #     )
        
    #     # Save the embeddings
    #     self.save_embeddings(documents, nodes)
        
    #     print("RAG setup complete!")
    
    # def save_embeddings(self, documents, nodes):
    #     """Save embeddings and index to disk."""
    #     # Create storage context
    #     storage_context = StorageContext.from_defaults(
    #         persist_dir=self.embedding_dir
    #     )
        
    #     # Save the index
    #     self.index.storage_context.persist(persist_dir=self.embedding_dir)
        
    #     # Save metadata about the embeddings
    #     metadata = {
    #         'num_documents': len(documents),
    #         'num_nodes': len(nodes),
    #         'embedding_model': self.embed_model.model_name,
    #         'timestamp': str(datetime.now()),
    #         'file_types': {
    #             ext: len([d for d in documents if d.metadata.get('language') == lang])
    #             for ext, lang in self.code_extensions.items()
    #         }
    #     }
        
    #     with open(os.path.join(self.embedding_dir, 'metadata.json'), 'w') as f:
    #         json.dump(metadata, f, indent=2)
    
    # def load_embeddings(self):
    #     """Load embeddings and index from disk."""
    #     try:
    #         # Load storage context
    #         storage_context = StorageContext.from_defaults(
    #             persist_dir=self.embedding_dir
    #         )
            
    #         # Load the index
    #         self.index = PropertyGraphIndex.load_from_disk(
    #             storage_context=storage_context,
    #             persist_dir=self.embedding_dir
    #         )
            
    #         # Create the graph store
    #         self.graph_store = SimplePropertyGraphStore()
            
    #         # Create a retriever that combines graph and vector search
    #         self.retriever = VectorIndexRetriever(
    #             index=self.index,
    #             similarity_top_k=3,
    #             include_metadata=True
    #         )
            
    #         # Create the query engine
    #         self.query_engine = RetrieverQueryEngine(
    #             retriever=self.retriever
    #         )
            
    #         return True
    #     except Exception as e:
    #         print(f"Error loading embeddings: {e}")
    #         return False

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
        template = LanguageTemplateManager.get_unit_test_template(language, file_path)
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