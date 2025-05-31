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
    "task_list_path": "/LSPAI/experiments/config/black-taskList.json",
    "project_path": "/LSPAI/experiments/projects/black",
    "codebase_path": "/LSPAI/experiments/projects/black/src",

}

TORNADO_CONFIG = {
    "name": "tornado",
    "language": "python",
    "task_list_path": "/LSPAI/experiments/config/tornado-taskList.json",
    "project_path": "/LSPAI/experiments/projects/tornado",
    "codebase_path": "/LSPAI/experiments/projects/tornado/tornado"
}

LOGRUS_CONFIG = {
    "name": "logrus",
    "language": "go",
    "task_list_path": "/LSPAI/experiments/config/logrus-taskList.json",
    "project_path": "/LSPAI/experiments/projects/logrus",
    "codebase_path": "/LSPAI/experiments/projects/logrus"
}

COBRA_CONFIG = {
    "name": "cobra",
    "language": "go",
    "task_list_path": "/LSPAI/experiments/config/cobra-taskList.json",
    "project_path": "/LSPAI/experiments/projects/cobra",
    "codebase_path": "/LSPAI/experiments/projects/cobra"
}

COMMONS_CLI_CONFIG = {
    "name": "commons-cli",
    "language": "java",
    "task_list_path": "/LSPAI/experiments/config/commons-cli-taskList.json",
    "project_path": "/LSPAI/experiments/projects/commons-cli",
    "codebase_path": "/LSPAI/experiments/projects/commons-cli/src/main"
}

COMMONS_CSV_CONFIG = {
    "name": "commons-csv",
    "language": "java",
    "task_list_path": "/LSPAI/experiments/config/commons-csv-taskList.json",
    "project_path": "/LSPAI/experiments/projects/commons-csv",
    "codebase_path": "/LSPAI/experiments/projects/commons-csv/src/main/java",
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