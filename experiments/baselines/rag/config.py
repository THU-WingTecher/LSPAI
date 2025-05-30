"""
Project configurations for different codebases used in experiments.
Each configuration contains the necessary settings for running experiments
on different projects.
"""

# Available models for testing



# Project specific configurations
BLACK_CONFIG = {
    "name": "black",
    "language": "python",
    "task_list_path": "/LSPAI/experiments/lsprag_data/black/taskList.json",
    "project_path": "/LSPAI/experiments/projects/black",
}

TORNADO_CONFIG = {
    "name": "tornado",
    "language": "python",
    "task_list_path": "/LSPAI/experiments/lsprag_data/tornado/taskList.json",
    "project_path": "/LSPAI/experiments/projects/tornado",
}

LOGRUS_CONFIG = {
    "name": "logrus",
    "language": "go",
    "task_list_path": "/LSPAI/experiments/lsprag_data/logrus/taskList.json",
    "project_path": "/LSPAI/experiments/projects/logrus",
}

COBRA_CONFIG = {
    "name": "cobra",
    "language": "go",
    "task_list_path": "/LSPAI/experiments/lsprag_data/cobra/taskList.json",
    "project_path": "/LSPAI/experiments/projects/cobra",
}

COMMONS_CLI_CONFIG = {
    "name": "commons-cli",
    "language": "java",
    "task_list_path": "/LSPAI/experiments/lsprag_data/commons-cli/taskList.json",
    "project_path": "/LSPAI/experiments/projects/commons-cli",
}

COMMONS_CSV_CONFIG = {
    "name": "commons-csv",
    "language": "java",
    "task_list_path": "/LSPAI/experiments/lsprag_data/commons-csv/taskList.json",
    "project_path": "/LSPAI/experiments/projects/commons-csv",
}

# Dictionary of all available project configurations
PROJECT_CONFIGS = {
    "black": BLACK_CONFIG,
    "tornado": TORNADO_CONFIG,
    "logrus": LOGRUS_CONFIG,
    "cobra": COBRA_CONFIG,
    "commons-cli": COMMONS_CLI_CONFIG,
    "commons-csv": COMMONS_CSV_CONFIG,
}