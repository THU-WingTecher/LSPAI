import json
import os
import pathlib
from typing import List, Dict
from datetime import datetime
import re
from standardRag import standardRag

class ExperimentPipeline:
    def __init__(self, 
                 task_list_path: str,
                 project_path: str,
                 generationType: str,
                 model: str):
        """
        Initialize the Experiment Pipeline.
        
        Args:
            task_list_path: Path to the JSON file containing the task list
            output_dir: Directory to save the experiment results
        """
        self.task_list_path = task_list_path
        self.project_path = project_path
        self.output_dir = os.path.join(
            self.project_path,
            "lspai-workspace",
            f"{generationType}_{model}_{self.generate_timestamp_string()}"
        )
        self.results = []
        
        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)
        
    def load_tasks(self) -> List[Dict]:
        """
        Load and organize tasks from the JSON file.
        
        Returns:
            List of task dictionaries containing task information
        """
        with open(self.task_list_path, 'r') as f:
            tasks = json.load(f)
        return tasks
        # Organize tasks into a standardized format
        organized_tasks = []
        for task in tasks:
            organized_task = {
                'symbol_name': task.get('symbolName'),
                'source_code': task.get('sourceCode'),
                'line_num': task.get('lineNum'),
                'relative_doc_path': task.get('relativeDocumentPath')
            }
            organized_tasks.append(organized_task)
            
        return organized_tasks

    def generate_file_name(self, method_name: str, language: str) -> str:
        """
        Generate a unique file name for results based on method name and language.
        
        Args:
            method_name: Name of the method being tested
            language: Programming language of the code
            
        Returns:
            str: Generated file name with path
        """
        # Clean up method name
        file_sig = method_name.replace("(", "_").replace(")", "_")
        file_sig = re.sub(r'<[^>]*>', '', file_sig)  # Remove generics
        file_sig = file_sig.split(",")[0]  # Take first part if multiple parameters
        # suffix corresponding to language 

        # Add appropriate test suffix based on language
        if language == "java":
            test_suffix = "Test"
            file_name = f"{file_sig}{test_suffix}.java"
            base_name = file_name.replace("Test.java", "")
            disposable_suffix = "Test.java"
        elif language == "python":
            test_suffix = "_test"
            file_name = f"{file_sig}{test_suffix}.py"
            base_name = file_name.replace("_test.py", "")
            disposable_suffix = "_test.py"
        elif language == "go":
            test_suffix = "_test"
            file_name = f"{file_sig}{test_suffix}.go"
            base_name = file_name.replace("_test.go", "")
            disposable_suffix = "_test.go"
            
        # Ensure unique file name
        counter = 1
        final_name = file_name
        while os.path.exists(os.path.join(self.output_dir, final_name)):
            final_name = f"{base_name}_{counter}{disposable_suffix}"
            counter += 1
            
        return os.path.join(self.output_dir, final_name)

    def save_result(self, result: Dict, file_path: str, additional_save_path: str = None) -> None:
        """
        result = {
            'symbol_name': symbol_name,
            'original_source': {
                'code': source_code,
                'line_num': line_num,
                'doc_path': doc_path
            },
            'retrieved_sources': [
                {
                    'content': node.text,
                    'metadata': node.metadata,
                    'score': getattr(node, "score", None)
                } for node in filtered_nodes
            ],
            'final_response': str(code),
            'save_path': file_path,
            'retrieval_time_sec': retrieval_time,
            'retrieved_context_token_count': token_count
        }      
        """
        if additional_save_path is None:
            additional_save_path = ""
        code_save_folder_name = os.path.join("codes", additional_save_path)
        log_save_folder_name = os.path.join("logs", additional_save_path)
        file_name = os.path.basename(file_path)
        # Create directory if it doesn't exist
        code_save_path = os.path.join(os.path.dirname(file_path), code_save_folder_name, file_name)
        log_save_path = os.path.join(os.path.dirname(file_path), log_save_folder_name, file_name+".json")
        print(f"Code save path: {code_save_path}")
        print(f"Log save path: {log_save_path}")
        os.makedirs(os.path.dirname(code_save_path), exist_ok=True)
        os.makedirs(os.path.dirname(log_save_path), exist_ok=True)
        
        # Save the result
        with open(code_save_path, 'w') as f:
            f.write(result['final_response'])
        with open(log_save_path, 'w') as f:
            json.dump(result, f, indent=2)
            
        print(f"Result saved to {file_path}")

    def generate_timestamp_string(self) -> str:
        """
        Generate a timestamp string for unique file naming.
        
        Returns:
            str: Formatted timestamp string
        """
        return datetime.now().strftime("%Y%m%d_%H%M%S")

    def get_experiment_save_path(self, base_name: str) -> str:
        """
        Generate a full save path for experiment results.
        
        Args:
            base_name: Base name for the experiment
            
        Returns:
            str: Full path where experiment results should be saved
        """
        timestamp = self.generate_timestamp_string()
        return os.path.join(
            self.output_dir,
            f"{base_name}_{timestamp}"
        )

if __name__ == "__main__":
    MODEL = "gpt-4o-mini"
    language = "java"
    task_list_path = "/LSPAI/experiments/projects/commons-cli/lspai-workspace/5_12_2025__05_29_28/commons-cli/experimental_withcontext_original/gpt-4o-mini/results/taskList.json"
    project_path = "/LSPAI/experiments/projects/commons-cli"
    generationType = "standardRag"

    if project_path.endswith("commons-cli"):
        source_code_path = os.path.join(project_path, "src/main/java")
    else :
        source_code_path = project_path

    pipeline = ExperimentPipeline(
        task_list_path=task_list_path,
        project_path=project_path,
        generationType=generationType,
        model=MODEL
    )
    task_list = pipeline.load_tasks()

    generator = None 
    if generationType == "standardRag":
        generator = standardRag(
            llm_model=MODEL,
            embedding_dir="embeddings"
        )
        generator.setup_rag(project_path=project_path, force_recompute=True)
    # elif generationType == "cfg":
    #     generator = CFGGenerator(MODEL)
    # elif generationType == "naive":
    #     generator = NaiveGenerator(MODEL)

    # Process tasks
    for task in task_list:
        # Generate unique file name
        print(f"Processing task: {task['symbolName']}")
        file_path = pipeline.generate_file_name(
            method_name=task['symbolName'],
            language=language  # or other language
        )
        result = generator.process_task(task, language, file_path)
        print(f"Result: {result}")
        # result = {
        #     "task": task,
        #     "output": "some output",
        #     "timestamp": pipeline.generate_timestamp_string()
        # }
        if project_path.endswith("commons-cli"):
            additional_save_path = os.path.dirname(task["relativeDocumentPath"]).replace("src/main/java/", "")
        print(f"Additional save path: {additional_save_path}")
        pipeline.save_result(result, file_path, additional_save_path=additional_save_path)
        # Save results
        # result = {
        #     "task": task,
        #     "output": "some output",
        #     "timestamp": pipeline.generate_timestamp_string()
        # }