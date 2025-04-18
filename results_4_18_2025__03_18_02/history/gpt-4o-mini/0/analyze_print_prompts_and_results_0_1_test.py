import unittest
from unittest.mock import patch
from io import StringIO
from scripts.analyze import print_prompts_and_results

class Testanalyze_print_prompts_and_results_0_1_test(unittest.TestCase):
    
    def setUp(self):
        self.data_with_prompts_and_results = [
            {'llmInfo': {'prompt': 'What is the capital of France?', 'result': 'Paris'}},
            {'llmInfo': {'prompt': 'What is the square root of 4?', 'result': '2'}},
            {'llmInfo': {'prompt': '', 'result': ''}},
            {'llmInfo': None},  # No llmInfo present
            {'llmInfo': {'prompt': 'What is the color of the sky?', 'result': ''}},
        ]
        self.file_name = "test_file.json"

    @patch('sys.stdout', new_callable=StringIO)
    def test_print_prompts_and_results(self, mock_stdout):
        print_prompts_and_results(self.data_with_prompts_and_results, self.file_name)
        output = mock_stdout.getvalue()

        expected_output = (
            f"\n=== Prompts and Results for '{self.file_name}' ===\n\n"
            "--- Entry 1 ---\n"
            "Prompt:\n"
            "What is the capital of France?\n"
            "\nResult:\n"
            "Paris\n"
            "\n\n"
            "--- Entry 2 ---\n"
            "Prompt:\n"
            "What is the square root of 4?\n"
            "\nResult:\n"
            "2\n"
            "\n\n"
            "--- Entry 3 ---\n"
            "Prompt:\n"
            "No prompt available.\n"
            "\nResult:\n"
            "No result available.\n"
            "\n\n"
            "--- Entry 4 ---\n"
            "Prompt:\n"
            "No prompt available.\n"
            "\nResult:\n"
            "No result available.\n"
            "\n\n"
            "--- Entry 5 ---\n"
            "Prompt:\n"
            "What is the color of the sky?\n"
            "\nResult:\n"
            "No result available.\n"
            "\n\n"
        )
        
        self.assertEqual(output, expected_output)

if __name__ == '__main__':
    unittest.main()