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
    "task_list_path": "/LSPRAG/experiments/config/black-taskList.json",
    "project_path": "/LSPRAG/experiments/projects/black",
    "codebase_path": "/LSPRAG/experiments/projects/black/src",

}

TORNADO_CONFIG = {
    "name": "tornado",
    "language": "python",
    "task_list_path": "/LSPRAG/experiments/config/tornado-taskList.json",
    "project_path": "/LSPRAG/experiments/projects/tornado",
    "codebase_path": "/LSPRAG/experiments/projects/tornado/tornado"
}

LOGRUS_CONFIG = {
    "name": "logrus",
    "language": "go",
    "task_list_path": "/LSPRAG/experiments/config/logrus-taskList.json",
    "project_path": "/LSPRAG/experiments/projects/logrus",
    "codebase_path": "/LSPRAG/experiments/projects/logrus"
}

COBRA_CONFIG = {
    "name": "cobra",
    "language": "go",
    "task_list_path": "/LSPRAG/experiments/config/cobra-taskList.json",
    "project_path": "/LSPRAG/experiments/projects/cobra",
    "codebase_path": "/LSPRAG/experiments/projects/cobra"
}

COMMONS_CLI_CONFIG = {
    "name": "commons-cli",
    "language": "java",
    "task_list_path": "/LSPRAG/experiments/config/commons-cli-taskList.json",
    "project_path": "/LSPRAG/experiments/projects/commons-cli",
    "codebase_path": "/LSPRAG/experiments/projects/commons-cli/src/main"
}

COMMONS_CSV_CONFIG = {
    "name": "commons-csv",
    "language": "java",
    "task_list_path": "/LSPRAG/experiments/config/commons-csv-taskList.json",
    "project_path": "/LSPRAG/experiments/projects/commons-csv",
    "codebase_path": "/LSPRAG/experiments/projects/commons-csv/src/main/java",
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