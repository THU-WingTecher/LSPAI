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
from dotenv import load_dotenv
import asyncio
from baseline import process_tasks_parallel
MAX_WORKERS = 10
SIMILARITY_THRESHOLD = 0
load_dotenv()
async def process_single_task(task, pipeline, generator, project_path, MODEL, language):
    print(f"Processing task: {task['symbolName']}")
    file_path = pipeline.generate_file_name(
        method_name=task['symbolName'],
        language=language
    )
    
    # Run the CPU-bound task in a thread pool
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, 
        generator.process_task,
        task, 
        language, 
        file_path
    )
    print(f"Result: {result}")
    
    additional_save_path = ""
    if project_path.endswith("commons-cli"):
        additional_save_path = os.path.dirname(task["relativeDocumentPath"]).replace("src/main/java/", "")
    if project_path.endswith("commons-csv"):
        additional_save_path = os.path.dirname(task["relativeDocumentPath"]).replace("src/main/java/", "")
    else :
        additional_save_path = os.path.dirname(task["relativeDocumentPath"])
    print(f"Additional save path: {additional_save_path}")
    
    # Add model name and project name to the file path to separate results
    await loop.run_in_executor(
        None,
        pipeline.save_result,
        result, 
        file_path, 
        additional_save_path
    )

async def process_tasks_parallel(task_list, pipeline, generator, project_path, MODEL, language, max_workers: int = 4):
    """
    Process tasks in parallel with controlled concurrency.
    
    Args:
        task_list: List of tasks to process
        pipeline: ExperimentPipeline instance
        generator: Generator instance
        project_path: Name of the project
        MODEL: Model name
        language: Programming language
        max_workers: Maximum number of concurrent tasks (default: 4)
    """
    # Create a semaphore to limit concurrent tasks
    semaphore = asyncio.Semaphore(max_workers)
    
    async def bounded_process_task(task):
        async with semaphore:  # This ensures only max_workers tasks run at once
            return await process_single_task(task, pipeline, generator, project_path, MODEL, language)
    
    # Create tasks for all items in task_list
    tasks = [
        bounded_process_task(task) for task in task_list
    ]
    
    # Run all tasks with controlled concurrency and wait for them to complete
    results = await asyncio.gather(*tasks)
    return results
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
            'dist', '.idea', '.vscode', 'venv', 'env', '.gradle',
            'lspai-workspace', 'lspai-tests', 'lspai'
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

def project_path_to_source_code_path(project_path: str) -> str:
    
    if project_path.endswith("commons-cli") or project_path.endswith("commons-csv"):
        source_code_path = os.path.join(project_path, "src/main/java")
    elif project_path.endswith("black"):
        source_code_path = os.path.join(project_path, "src")
    elif project_path.endswith("tornado"):
        source_code_path = os.path.join(project_path, "tornado")
    else : # logrus, cobra
        source_code_path = project_path
    return source_code_path

if __name__ == "__main__":
    from rag.config import PROJECT_CONFIGS

    MODELS = [
        "deepseek-chat",
        "gpt-4o",
        "gpt-4o-mini"
    ]
    # List of projects to run experiments on
    projects_to_run = [
        "black",
        "logrus", 
        "commons-cli",
        "commons-csv",
        "cobra",
        "tornado"
    ]  # Add or remove projects as needed

    # Run experiments for each project
    for project_name in projects_to_run:
        print(f"\n=== Starting experiments for project: {project_name} ===\n")
        
        config = PROJECT_CONFIGS[project_name]
        
        # Get configuration from the selected project
        language = config["language"]
        task_list_path = config["task_list_path"]
        project_path = config["project_path"]
        generationType = "standardRag"  # This is constant for all projects

        # Get the appropriate source code path
        source_code_path = project_path_to_source_code_path(project_path)

        # Iterate through each model
        for MODEL in MODELS:
            print(f"\n=== Testing {project_name} with model: {MODEL} ===\n")
            embedding_dir = os.path.join("/LSPAI/experiments/baselines/rag/embeddings", MODEL, project_name)
            output_dir = os.path.join("/LSPAI/experiments/baselines/rag/output", MODEL, project_name)
            pipeline = ExperimentPipeline(
                language=language,
                task_list_path=task_list_path,
                project_path=project_path,
                generationType=generationType,
                model=MODEL
            )
            task_list = pipeline.load_tasks()
            generator = StandardRAG(
                llm=MODEL,
                embedding_dir=embedding_dir,
                output_dir=output_dir
            )
            # Setup embeddings with your project
            generator.setup_embeddings(
                source_code_path=source_code_path,
                force_recompute=True  # Set to True to recompute embeddings
            )

            task_list = pipeline.load_tasks()
            asyncio.run(process_tasks_parallel(
                task_list, pipeline, generator, project_path, MODEL, language, max_workers=MAX_WORKERS
            ))
            # Process tasks
            # for task in task_list:
            #     print(f"Processing task: {task['symbolName']}")
            #     file_path = pipeline.generate_file_name(
            #         method_name=task['symbolName'],
            #         language=language
            #     )
                
            #     result = generator.process_task(task, language, file_path)
            #     print(f"Result: {result}")
                
            #     additional_save_path = ""
            #     if project_path.endswith("commons-cli"):
            #         additional_save_path = os.path.dirname(task["relativeDocumentPath"]).replace("src/main/java/", "")
            #     print(f"Additional save path: {additional_save_path}")
                
            #     # Add model name and project name to the file path to separate results
            #     model_specific_file_path = f"{project_name}_{MODEL}_{file_path}"
            #     pipeline.save_result(result, model_specific_file_path, additional_save_path=additional_save_path)

        print(f"\n=== Completed experiments for project: {project_name} ===\n")

    print("\n=== All experiments completed ===\n")

# if __name__ == "__main__":
#     MODEL = "gpt-4o-mini"
#     # ==== black ====
#     language = "python"
#     task_list_path = "/LSPAI/experiments/lsprag_data/black/taskList.json"
#     project_path = "/LSPAI/experiments/projects/black"
#     generationType = "standardRag"
#     # ==== black ====

#     # ==== commons-cli ====
#     # language = "java"
#     # task_list_path = "/LSPAI/experiments/lsprag_data/commons-cli/taskList.json"
#     # project_path = "/LSPAI/experiments/projects/commons-cli"
#     # generationType = "codeQA"
#     # ==== commons-cli ====


#     pipeline = ExperimentPipeline(
#         task_list_path=task_list_path,
#         project_path=project_path,
#         generationType=generationType,
#         model=MODEL
#     )
#     task_list = pipeline.load_tasks()
#     generator = StandardRAG(
#         llm="gpt-4",
#         embedding_dir="embeddings/black",
#         output_dir="output/black"
#     )
#     # Setup embeddings with your project
#     generator.setup_embeddings(
#         source_code_path=source_code_path,
#         force_recompute=False  # Set to True to recompute embeddings
#     )

#     # Process tasks
#     for task in task_list:
#         # Generate unique file name
#         print(f"Processing task: {task['symbolName']}")
#         file_path = pipeline.generate_file_name(
#             method_name=task['symbolName'],
#             language=language  # or other language
#         )
#         result = generator.retrieve_context(task)
#         result = generator.process_task(task, language, file_path)
#         additional_save_path=""
#         if project_path.endswith("commons-cli"):
#             additional_save_path = os.path.dirname(task["relativeDocumentPath"]).replace("src/main/java/", "")
#         print(f"Additional save path: {additional_save_path}")
#         pipeline.save_result(result, file_path, additional_save_path=additional_save_path)