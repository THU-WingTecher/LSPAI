import {
    ProjectConfigName,
    getProjectLanguage,
    getProjectPythonExe,
    getProjectPythonPath,
    getProjectWorkspace,
} from '../../../config';

export function getPythonProjectInfo(projectName: ProjectConfigName): {
    pythonInterpreterPath: string;
    pythonExtraPaths: string[];
    projectPath: string;
    languageId: string;
} {
    const pythonInterpreterPath = getProjectPythonExe(projectName) as string;
    const pythonExtraPaths = getProjectPythonPath(projectName);
    const projectPath = getProjectWorkspace(projectName);
    const languageId = getProjectLanguage(projectName);

    return {
        pythonInterpreterPath,
        pythonExtraPaths,
        projectPath,
        languageId,
    };
}


