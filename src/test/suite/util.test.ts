import * as assert from 'assert';
import { formatToJSON } from '../../utils';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, setWorkspaceFolders } from '../../helper';
import { loadPrivateConfig } from '../../config';

import { getConfigInstance } from '../../config';
import path from 'path';
suite('Utils Test Suite', () => {
    const projectPath = "/LSPAI/experiments/projects/commons-cli";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    let testFilesPath = "/LSPAI/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
    const privateConfig = loadPrivateConfig(path.join(__dirname, '../../../test-config.json'));
    getConfigInstance().updateConfig({
        ...privateConfig
    });
    test('JSON Formatter Tests', () => {
        const testCases = [
            {
                input: '{"key": "value"}',
                description: 'Regular JSON',
                expected: { key: 'value' }
            },
            {
                input: '```json\n{"key": "value"}\n```',
                description: 'Markdown code block',
                expected: { key: 'value' }
            },
            {
                input: '{\\"key\\": \\"value\\"}',
                description: 'Escaped string',
                expected: { key: 'value' }
            },
            {
                input: "{'key': 'value'}",
                description: 'Single quotes',
                expected: { key: 'value' }
            },
            {
                input: '{\n  "key": "value"\n}',
                description: 'Literal string representation',
                expected: { key: 'value' }
            },
            {
                input: `{
                    "array": [1, 2, 3],
                    "nested": {
                        "key": "value"
                    },
                    "string": "text with \\n newline"
                }`,
                description: 'Complex nested structure',
                expected: {
                    array: [1, 2, 3],
                    nested: { key: 'value' },
                    string: 'text with \n newline'
                }
            }
        ];

        testCases.forEach(({ input, description, expected }) => {
            test(`should handle ${description}`, () => {
                const result = formatToJSON(input);
                assert.deepStrictEqual(result, expected, 
                    `Failed to correctly parse ${description}`);
            });
        });
    });

    test('should throw error for invalid JSON', () => {
        const invalidCases = [
            { 
                input: '{invalid json}',
                description: 'Malformed JSON'
            },
            { 
                input: '',
                description: 'Empty string'
            },
            { 
                input: 'not json at all',
                description: 'Non-JSON string'
            }
        ];

        invalidCases.forEach(({ input, description }) => {
            assert.throws(() => formatToJSON(input),
                Error,
                `Should throw error for ${description}`);
        });
    });
    test('Real-world JSON', () => {
        const input = "```json\n[\n    {\n        \"term\": \"Util.stripLeadingHyphens(arg)\",\n        \"need_context_reason\": \"The behavior of Util.stripLeadingHyphens() is critical to how options are parsed. Without knowing its implementation, it's unclear how many hyphens are stripped or if it handles edge cases like multiple hyphens.\",\n        \"need_example_reason\": \"An example of the output of Util.stripLeadingHyphens() for inputs like \\\"--opt\\\" or \\\"-D\\\" would clarify how the method normalizes arguments.\",\n        \"need_context\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"DefaultParser.indexOfEqual(opt)\",\n        \"need_context_reason\": \"The implementation of DefaultParser.indexOfEqual() determines how option-value pairs (e.g., --key=value) are split. Without context, we cannot verify edge cases like escaped equal signs or values containing equal signs.\",\n        \"need_example_reason\": \"An example showing how indexOfEqual() handles strings like \\\"key=value=123\\\" or \\\"key\\\\=part=value\\\" would help define test cases.\",\n        \"need_context\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"Char.EQUAL\",\n        \"need_context_reason\": \"The value of Char.EQUAL (e.g., '=' or another character) directly affects how option-value pairs are split. Tests must account for this constant's actual value.\",\n        \"need_example_reason\": \"An example confirming Char.EQUAL is '=' (or another symbol) is required to validate tokenization logic.\",\n        \"need_context\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"options.hasOption(opt)\",\n        \"need_context_reason\": \"The behavior of Options.hasOption() determines whether the parser recognizes valid options. Without knowing if it checks short/long names or handles aliases, tests may miss false positives/negatives.\",\n        \"need_example_reason\": \"An example of how an Options instance is configured (e.g., with short \\\"-D\\\" vs. long \\\"--debug\\\") would clarify validation logic.\",\n        \"need_context\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"stopAtNonOption\",\n        \"need_context_reason\": \"The stopAtNonOption flag controls whether parsing stops at non-option arguments. Tests need to validate both modes, but the exact conditions for stopping require context from parent Parser classes.\",\n        \"need_example_reason\": \"An example of a command-line sequence where stopAtNonOption=true/false would demonstrate how the rest of the arguments are processed.\",\n        \"need_context\": true,\n        \"need_example\": false\n    }\n]\n```";
        const jsonFile = formatToJSON(input);
        console.log(`#### JSON file: ${JSON.stringify(jsonFile, null, 2)}`);
        const input2 = "[\n    {\n        \"term\": \"matchingOptions\",\n        \"need_context_reason\": \"The origin and mutation logic of matchingOptions collection is required to understand how results are populated\",\n        \"need_example_reason\": \"Examples of contents would help verify correct filtering behavior\",\n        \"need_context\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"partial name\",\n        \"need_context_reason\": \"Matching criteria (exact prefix, substring, case sensitivity) must be defined to create validation tests\",\n        \"need_example_reason\": \"Example patterns needed to test boundary conditions\",\n        \"need_context\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"Collection<String>\",\n        \"need_context_reason\": \"Concrete collection type (List/Set) impacts iteration order and uniqueness requirements\",\n        \"need_example_reason\": null,\n        \"need_context\": true,\n        \"need_example\": false\n    },\n    {\n        \"term\": \"getMatchingOptions() parameters\",\n        \"need_context_reason\": \"Implied filtering input (name fragment) source not shown in signature\",\n        \"need_example_reason\": null,\n        \"need_context\": true,\n        \"need_example\": false\n    },\n    {\n        \"term\": \"options\",\n        \"need_context_reason\": \"Source of base options collection (configuration, database) needed for test setup\",\n        \"need_example_reason\": null,\n        \"need_context\": true,\n        \"need_example\": false\n    }\n]";
        const jsonFile2 = formatToJSON(input2);
        console.log(`#### JSON file2: ${JSON.stringify(jsonFile2, null, 2)}`);
        // check whether jsonFile is valid json
        // const jsonObject = JSON.parse(jsonFile);
        // assert.ok(jsonObject.length > 0, 'jsonObject should not be empty');
    });

    // test('experiment helper functions', async () => {
    //     getConfigInstance().updateConfig({
    //         expProb: 0.1
    //     });
    //     console.log(`#### Workspace path: ${workspaceFolders[0].uri.fsPath}`);
    //     const oneFile = randomlySelectOneFileFromWorkspace('java');
    //     console.log(`#### One file: ${oneFile}`);

    //     const symbols = await loadAllTargetSymbolsFromWorkspace('java');
    //     assert.ok(symbols.length > 0, 'symbols should not be empty');
    // });
});