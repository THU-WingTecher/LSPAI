class LanguageTemplateManager:
    @staticmethod
    def get_unit_test_template(language_id: str, file_name: str, package_string: str = "", import_string: str = "", paths: list = None) -> str:
        """
        Get unit test template based on language
        """
        # Remove file extension if present
        if "." in file_name:
            file_name = file_name.split(".")[0]
            
        # Remove path if present
        if "/" in file_name:
            file_name = file_name.split("/")[-1]

        if language_id == 'java':
            return LanguageTemplateManager.get_java_template(file_name, package_string, paths)
        elif language_id == 'go':
            return LanguageTemplateManager.get_go_template(file_name, package_string, paths)
        elif language_id == 'python':
            return LanguageTemplateManager.get_python_template(file_name, package_string, import_string, paths)
        else:
            raise ValueError(f"Unsupported language: {language_id}")
            # return LanguageTemplateManager.get_default_template()

    @staticmethod
    def get_java_template(file_name: str, package_string: str, paths: list = None) -> str:
        """Get Java unit test template"""
        test_functions = ""
        if paths:
            test_functions = "\n".join([
                f"""    @Test
    public void {file_name}_{idx}() {{
    /*
        {path}
    */
    }}
    """ for idx, path in enumerate(paths)
            ])

        return f"""
Based on the provided information, you need to generate a unit test using Junit5, and Mockito.
```
{package_string}

public class {file_name} {{
{test_functions}
    @Test
    public void {{write your test function name here}}() {{
        {{Write your test code here}}
    }}
}}
```
"""

    @staticmethod
    def get_go_template(file_name: str, package_string: str, paths: list = None) -> str:
        """Get Go unit test template"""
        # Capitalize first letter for Go convention
        return f"""
Based on the provided information, you need to generate a unit test using Go's testing package.
The generated test code will be located at the same directory with target code. Therefore, you don't have to import target project.
```
{package_string}

import (
    "testing"
    {{Replace with needed imports}}
)

func Test{file_name}(t *testing.T) {{
    {{Replace with needed setup}}
    {{Write your test function here}}
}}
```
"""

    @staticmethod
    def get_python_template(file_name: str, package_string: str = "", import_string: str = "", paths: list = None) -> str:
        """
        Generate a minimal Python unit test template.
        
        Args:
            file_name: Name of the file/class being tested
            package_string: Package statement (not used in Python)
            import_string: Import statements needed for the test
            
        Returns:
            str: The generated minimal test template
        """
        # Remove file extension if present
        return f"""
Based on the provided information, you need to generate a unit test using Python's unittest framework.
```
import unittest
{import_string}
from {{Replace with needed imports}}

class Test{file_name}(unittest.TestCase):
    
    def {{write your other test function here}}
        {{write your other test code here}}
if __name__ == '__main__':
    unittest.main()
```
"""

    @staticmethod
    def generate_system_prompt():
        return f"""
You are a powerful AI coding assistant, powered by Claude 3.7 Sonnet. You operate exclusively in LSPAI, the world's best tool for unit test generation. 

<test_generation>
1. Generate DIVERSE test cases so that maximize coverage of the given focal methods.
2. When generating test cases, you should consider the context of the source code.
3. After generating code, generate unit test case follow below unit test format. Final Code should be wrapped by ```.
</test_generation>
        """
    
    @staticmethod
    def generate_prompt(template, source_code, context):
        return f"""
        Source Code:
        {source_code}

        Context:
        {context}

        Template:
        {template}

        """