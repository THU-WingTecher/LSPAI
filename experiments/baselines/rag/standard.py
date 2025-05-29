from typing import Dict, List
import os
from pathlib import Path
from datetime import datetime
import time
from langchain.embeddings import OpenAIEmbeddings
from langchain.docstore.document import Document
from langchain.vectorstores import FAISS
import json
from baseline import Baseline
from experiment import ExperimentPipeline
SIMILARITY_THRESHOLD = 0

class StandardRAG(Baseline):
    def __init__(self, llm: str, 
                 embedding_dir: str = "embeddings", 
                 output_dir: str = "output"
                 ):
        super().__init__(llm)
        self.embedding_dir = embedding_dir
        self.output_dir = output_dir
        self.embeddings = OpenAIEmbeddings()
        self.vector_store = None
        
        # Create directories if they don't exist
        os.makedirs(embedding_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        
        # Define supported code file extensions
        self.code_extensions = {
            '.java': 'Java',
            '.py': 'Python',
            '.js': 'JavaScript',
            '.ts': 'TypeScript',
            '.cpp': 'C++',
            '.c': 'C',
            '.h': 'C/C++ Header',
            '.cs': 'C#',
            '.go': 'Go',
            '.rb': 'Ruby',
            '.php': 'PHP',
            '.swift': 'Swift',
            '.kt': 'Kotlin',
            '.rs': 'Rust'
        }
        
        # Define directories to ignore
        self.ignore_dirs = {
            'node_modules', '.git', '__pycache__', 'target', 'build',
            'dist', '.idea', '.vscode', 'venv', 'env', '.gradle'
        }

    def find_code_files(self, project_path: str) -> List[Dict]:
        """Find all code files in the project directory."""
        code_files = []
        project_path = Path(project_path)
        
        for file_path in project_path.rglob('*'):
            if file_path.is_dir() or any(ignore in file_path.parts for ignore in self.ignore_dirs):
                continue
                
            if file_path.suffix in self.code_extensions:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    rel_path = file_path.relative_to(project_path)
                    code_files.append({
                        'path': str(rel_path),
                        'absolute_path': str(file_path),
                        'language': self.code_extensions[file_path.suffix],
                        'content': content,
                        'size': len(content)
                    })
                except Exception as e:
                    print(f"Error reading file {file_path}: {e}")
        
        return code_files

    def create_documents(self, code_files: List[Dict]) -> List[Document]:
        """Create Document objects from code files."""
        documents = []
        for file_info in code_files:
            metadata = {
                'file_path': file_info['path'],
                'language': file_info['language'],
                'size': file_info['size']
            }
            
            doc = Document(
                page_content=file_info['content'],
                metadata=metadata
            )
            documents.append(doc)
        
        return documents

    def setup_embeddings(self, source_code_path: str, force_recompute: bool = False):
        """Initialize the embeddings with project files."""
        if not force_recompute and self.load_embeddings():
            print("Loaded existing embeddings")
            return
        
        print("Finding code files...")
        code_files = self.find_code_files(source_code_path)
        print(f"Found {len(code_files)} code files")
        
        print("Creating documents...")
        documents = self.create_documents(code_files)
        
        print("Computing embeddings...")
        self.vector_store = FAISS.from_documents(documents, self.embeddings)
        
        # Save embeddings
        self.save_embeddings(documents)
        print("Embeddings setup complete!")

    def save_embeddings(self, documents: List[Document]):
        """Save embeddings and metadata to disk."""
        if self.vector_store:
            self.vector_store.save_local(self.embedding_dir)
        
        metadata = {
            'num_documents': len(documents),
            'timestamp': str(datetime.now()),
            'file_types': {}
        }
        
        # Count documents by language
        for doc in documents:
            lang = doc.metadata.get('language')
            if lang:
                metadata['file_types'][lang] = metadata['file_types'].get(lang, 0) + 1
        
        with open(os.path.join(self.embedding_dir, 'metadata.json'), 'w') as f:
            json.dump(metadata, f, indent=2)

    def load_embeddings(self) -> bool:
        """Load embeddings from disk."""
        try:
            if os.path.exists(self.embedding_dir):
                self.vector_store = FAISS.load_local(self.embedding_dir, self.embeddings)
                return True
            return False
        except Exception as e:
            print(f"Error loading embeddings: {e}")
            return False

    def retrieve_context(self, task: Dict) -> Dict:
        """
        Retrieve relevant code context for the given task using vector similarity search.
        
        Args:
            task: Dictionary containing task information
            
        Returns:
            Dictionary containing retrieved context and metadata
        """
        if not self.vector_store:
            raise ValueError("Embeddings not initialized. Call setup_embeddings first.")

        symbol_name = task['symbolName']
        source_code = task['sourceCode']
        query = f"Find code related to {symbol_name}, to comprehensively test the code, include all relevant code. Below is the source code of the file: \n{source_code}"

        # Measure retrieval time
        start_time = time.time()
        
        # Get similar documents
        results = self.vector_store.similarity_search_with_score(query, k=3)  # Get more results initially
        
        # Filter results based on similarity threshold
        filtered_results = [
            (doc, score) for doc, score in results 
            if score >= SIMILARITY_THRESHOLD
        ]
        
        # Prune context to fit token limit
        context, pruned_info = self.prune_context(filtered_results, source_code)
        
        retrieval_time = time.time() - start_time
        # Count tokens
        token_count = self.count_tokens(context)

        return {
            'context': context,
            'info': [
                {
                    'content': doc.page_content,
                    'metadata': doc.metadata,
                    'score': score
                } for doc, score in filtered_results
            ],
            'retrieval_time': retrieval_time,
            'token_count': token_count
        }
    
if __name__ == "__main__":
    MODEL = "gpt-4o-mini"
    # ==== black ====
    language = "python"
    task_list_path = "/LSPAI/experiments/lsprag_data/black/taskList.json"
    project_path = "/LSPAI/experiments/projects/black"
    generationType = "standardRag"
    # ==== black ====

    # ==== commons-cli ====
    # language = "java"
    # task_list_path = "/LSPAI/experiments/lsprag_data/commons-cli/taskList.json"
    # project_path = "/LSPAI/experiments/projects/commons-cli"
    # generationType = "codeQA"
    # ==== commons-cli ====

    if project_path.endswith("commons-cli"):
        source_code_path = os.path.join(project_path, "src/main/java")
    elif project_path.endswith("black"):
        source_code_path = os.path.join(project_path, "src")
    else :
        source_code_path = project_path

    pipeline = ExperimentPipeline(
        task_list_path=task_list_path,
        project_path=project_path,
        generationType=generationType,
        model=MODEL
    )
    task_list = pipeline.load_tasks()
    generator = StandardRAG(
        llm="gpt-4",
        embedding_dir="embeddings/black",
        output_dir="output/black"
    )
    # Setup embeddings with your project
    generator.setup_embeddings(
        source_code_path=source_code_path,
        force_recompute=False  # Set to True to recompute embeddings
    )

    # Process tasks
    for task in task_list:
        # Generate unique file name
        print(f"Processing task: {task['symbolName']}")
        file_path = pipeline.generate_file_name(
            method_name=task['symbolName'],
            language=language  # or other language
        )
        result = generator.retrieve_context(task)
        result = generator.process_task(task, language, file_path)
        additional_save_path=""
        if project_path.endswith("commons-cli"):
            additional_save_path = os.path.dirname(task["relativeDocumentPath"]).replace("src/main/java/", "")
        print(f"Additional save path: {additional_save_path}")
        pipeline.save_result(result, file_path, additional_save_path=additional_save_path)