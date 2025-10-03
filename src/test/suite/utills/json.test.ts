import * as assert from 'assert';
import { extractArrayFromJSON, formatToJSON } from '../../../utils';
import { loadAllTargetSymbolsFromWorkspace, randomlySelectOneFileFromWorkspace, setWorkspaceFolders } from '../../../helper';
import { getConfigInstance } from '../../../config';
import path from 'path';
suite('Utils Test Suite', () => {
    const projectPath = "/LSPRAG/experiments/projects/commons-cli";
    const workspaceFolders = setWorkspaceFolders(projectPath);
    let testFilesPath = "/LSPRAG/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";  
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
        const input = "```json\n[\n    {\n        \"term\": \"Util.stripLeadingHyphens(arg)\",\n        \"need_definition_reason\": \"The behavior of Util.stripLeadingHyphens() is critical to how options are parsed. Without knowing its implementation, it's unclear how many hyphens are stripped or if it handles edge cases like multiple hyphens.\",\n        \"need_example_reason\": \"An example of the output of Util.stripLeadingHyphens() for inputs like \\\"--opt\\\" or \\\"-D\\\" would clarify how the method normalizes arguments.\",\n        \"need_definition\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"DefaultParser.indexOfEqual(opt)\",\n        \"need_definition_reason\": \"The implementation of DefaultParser.indexOfEqual() determines how option-value pairs (e.g., --key=value) are split. Without context, we cannot verify edge cases like escaped equal signs or values containing equal signs.\",\n        \"need_example_reason\": \"An example showing how indexOfEqual() handles strings like \\\"key=value=123\\\" or \\\"key\\\\=part=value\\\" would help define test cases.\",\n        \"need_definition\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"Char.EQUAL\",\n        \"need_definition_reason\": \"The value of Char.EQUAL (e.g., '=' or another character) directly affects how option-value pairs are split. Tests must account for this constant's actual value.\",\n        \"need_example_reason\": \"An example confirming Char.EQUAL is '=' (or another symbol) is required to validate tokenization logic.\",\n        \"need_definition\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"options.hasOption(opt)\",\n        \"need_definition_reason\": \"The behavior of Options.hasOption() determines whether the parser recognizes valid options. Without knowing if it checks short/long names or handles aliases, tests may miss false positives/negatives.\",\n        \"need_example_reason\": \"An example of how an Options instance is configured (e.g., with short \\\"-D\\\" vs. long \\\"--debug\\\") would clarify validation logic.\",\n        \"need_definition\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"stopAtNonOption\",\n        \"need_definition_reason\": \"The stopAtNonOption flag controls whether parsing stops at non-option arguments. Tests need to validate both modes, but the exact conditions for stopping require context from parent Parser classes.\",\n        \"need_example_reason\": \"An example of a command-line sequence where stopAtNonOption=true/false would demonstrate how the rest of the arguments are processed.\",\n        \"need_definition\": true,\n        \"need_example\": false\n    }\n]\n```";
        const jsonFile = formatToJSON(input);
        console.log(`#### JSON file: ${JSON.stringify(jsonFile, null, 2)}`);
        const input2 = "[\n    {\n        \"term\": \"matchingOptions\",\n        \"need_definition_reason\": \"The origin and mutation logic of matchingOptions collection is required to understand how results are populated\",\n        \"need_example_reason\": \"Examples of contents would help verify correct filtering behavior\",\n        \"need_definition\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"partial name\",\n        \"need_definition_reason\": \"Matching criteria (exact prefix, substring, case sensitivity) must be defined to create validation tests\",\n        \"need_example_reason\": \"Example patterns needed to test boundary conditions\",\n        \"need_definition\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"Collection<String>\",\n        \"need_definition_reason\": \"Concrete collection type (List/Set) impacts iteration order and uniqueness requirements\",\n        \"need_example_reason\": null,\n        \"need_definition\": true,\n        \"need_example\": false\n    },\n    {\n        \"term\": \"getMatchingOptions() parameters\",\n        \"need_definition_reason\": \"Implied filtering input (name fragment) source not shown in signature\",\n        \"need_example_reason\": null,\n        \"need_definition\": true,\n        \"need_example\": false\n    },\n    {\n        \"term\": \"options\",\n        \"need_definition_reason\": \"Source of base options collection (configuration, database) needed for test setup\",\n        \"need_example_reason\": null,\n        \"need_definition\": true,\n        \"need_example\": false\n    }\n]";
        const jsonFile2 = formatToJSON(input2);
        console.log(`#### JSON file2: ${JSON.stringify(jsonFile2, null, 2)}`);
        // check whether jsonFile is valid json
        // const jsonObject = JSON.parse(jsonFile);
        // assert.ok(jsonObject.length > 0, 'jsonObject should not be empty');
    });

    test('Real-world JSON2', () => {
        const input = "To analyze the provided focal method `flatten`, we will follow the instructions step by step to identify the key variables for unit testing.\n\n1. **Unique Control Flow**:\n   - The method executes a loop that processes an array of arguments. Several branches lead to different outcomes based on the value of each argument.\n\n2. **Key Terms Leading to Different Control Flows**:\n   - `--`\n   - `-`\n   - `arg.startsWith(\"-\")`\n   - `options.hasOption(opt)`\n   - `equalPos != -1`\n   - `stopAtNonOption`\n\n3. **Pruning**:\n   - Since there are more than 5 terms, we will prune them. This leads us to consider only the most impactful terms:\n     - `--`\n     - `-`\n     - `arg.startsWith(\"-\")`\n     - `options.hasOption(opt)`\n     - `equalPos != -1`\n\n4. **Additional Information Needed**:\n   - For each of these terms, we assess what additional information may be useful for unit test generation.\n     - For `--`: \n       - `need_definition`: true (to clarify its purpose in argument parsing)\n       - `need_example`: true (to provide an example of its usage)\n     - For `-`: \n       - `need_definition`: true (to explain its role as a short option)\n       - `need_example`: true (to show examples of short options)\n     - For `arg.startsWith(\"-\")`: \n       - `need_definition`: true (to understand its role in identifying options)\n       - `need_example`: true (to display common usages of this check)\n     - For `options.hasOption(opt)`:\n       - `need_definition`: true (to clarify how options are validated)\n       - `need_example`: true (to provide examples of options)\n     - For `equalPos != -1`:\n       - `need_definition`: true (to explain its use in detecting '=' character)\n       - `need_example`: true (to illustrate with examples)\n\n5. **JSON Output Generation**:\nThe collected information can now be summarized in the following JSON format:\n\n```json\n{\n  \"terms\": [\n    {\n      \"term\": \"--\",\n      \"need_definition\": true,\n      \"need_example\": true\n    },\n    {\n      \"term\": \"-\",\n      \"need_definition\": true,\n      \"need_example\": true\n    },\n    {\n      \"term\": \"arg.startsWith(\\\"-\\\")\",\n      \"need_definition\": true,\n      \"need_example\": true\n    },\n    {\n      \"term\": \"options.hasOption(opt)\",\n      \"need_definition\": true,\n      \"need_example\": true\n    },\n    {\n      \"term\": \"equalPos != -1\",\n      \"need_definition\": true,\n      \"need_example\": true\n    }\n  ]\n}\n```";
        const jsonFile = formatToJSON(input);
        console.log(`#### JSON file: ${JSON.stringify(jsonFile, null, 2)}`);
        const input2 = "[\n    {\n        \"term\": \"matchingOptions\",\n        \"need_definition_reason\": \"The origin and mutation logic of matchingOptions collection is required to understand how results are populated\",\n        \"need_example_reason\": \"Examples of contents would help verify correct filtering behavior\",\n        \"need_definition\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"partial name\",\n        \"need_definition_reason\": \"Matching criteria (exact prefix, substring, case sensitivity) must be defined to create validation tests\",\n        \"need_example_reason\": \"Example patterns needed to test boundary conditions\",\n        \"need_definition\": true,\n        \"need_example\": true\n    },\n    {\n        \"term\": \"Collection<String>\",\n        \"need_definition_reason\": \"Concrete collection type (List/Set) impacts iteration order and uniqueness requirements\",\n        \"need_example_reason\": null,\n        \"need_definition\": true,\n        \"need_example\": false\n    },\n    {\n        \"term\": \"getMatchingOptions() parameters\",\n        \"need_definition_reason\": \"Implied filtering input (name fragment) source not shown in signature\",\n        \"need_example_reason\": null,\n        \"need_definition\": true,\n        \"need_example\": false\n    },\n    {\n        \"term\": \"options\",\n        \"need_definition_reason\": \"Source of base options collection (configuration, database) needed for test setup\",\n        \"need_example_reason\": null,\n        \"need_definition\": true,\n        \"need_example\": false\n    }\n]";
        const jsonFile2 = formatToJSON(input2);
        console.log(`#### JSON file2: ${JSON.stringify(jsonFile2, null, 2)}`);
        // check whether jsonFile is valid json
        const jsonObject = extractArrayFromJSON(jsonFile);
        assert.ok(jsonObject.length > 0, 'jsonObject should not be empty');
    });

    test('Real-world JSON3', () => {
        const input = "To analyze the provided `flatten` method and determine key variables for comprehensive unit test coverage, we can break down the control flow and identify the unique paths and branches based on variables and conditions.\n\n### Step 1: Analyze Unique Control Flow\nThe method `flatten` is responsible for processing command-line arguments represented as an array of strings. The control flow can diverge based on several conditions surrounding the argument’s value. The unique control flows can be categorized as:\n1. **Null Checking**: Each argument is checked if it is `null`.\n2. **Argument Type Identification**:\n   - If the argument equals `\"--\"`, it triggers a specific behavior.\n   - If the argument equals `\"-\"`, it is handled differently.\n   - If the argument starts with `\"-\"`, it implies it may be an option.\n   - If the argument doesn't start with `\"-\"`, it is considered a regular argument.\n3. **Option Validation**: The method checks if the arguments match a valid option using the `options` parameter, which changes the flow significantly by adding to the tokens list or setting flags.\n4. **Eat The Rest Logic**: The method allows \"eating\" the remaining arguments based on the `stopAtNonOption` flag.\n\n### Step 2: Extract Key Variables\nPotentially key variables that influence control flow:\n- `options`: An instance of `Options`, which manages valid options.\n- `arguments`: An array of strings representing command-line arguments.\n- `stopAtNonOption`: A boolean flag indicating whether to stop processing at the first non-option argument.\n- `tokens`: A list that stores the processed arguments.\n- `eatTheRest`: A boolean flag that changes behavior based on the encountered arguments.\n\n### Step 3: List Terms and Prune\nThe unique terms that drive the logic in the function:\n1. `options`\n2. `arguments`\n3. `stopAtNonOption`\n4. `tokens`\n5. `eatTheRest`\n\nGiven that this is already 5 terms, we will proceed without pruning.\n\n### Step 4: Additional Information Needed\nFor thorough unit tests, definitions and examples for the following terms would be helpful:\n- **options**: \n  - `need_definition`: true\n  - `need_example`: true\n- **arguments**: \n  - `need_definition`: true\n  - `need_example`: true\n- **stopAtNonOption**: \n  - `need_definition`: false (boolean is straightforward)\n  - `need_example`: false (doesn't require specific usage)\n- **tokens**: \n  - `need_definition`: false (a list is straightforward)\n  - `need_example`: false (its usage is clear in context)\n- **eatTheRest**: \n  - `need_definition`: false\n  - `need_example`: false\n\n### Final JSON Output\nBased on the extracted variables and the accompanying needs for definitions and examples, here is the structured output:\n\n```json\n{\n  \"key_variables\": [\n    {\n      \"name\": \"options\",\n      \"need_definition\": true,\n      \"need_example\": true\n    },\n    {\n      \"name\": \"arguments\",\n      \"need_definition\": true,\n      \"need_example\": true\n    },\n    {\n      \"name\": \"stopAtNonOption\",\n      \"need_definition\": false,\n      \"need_example\": false\n    },\n    {\n      \"name\": \"tokens\",\n      \"need_definition\": false,\n      \"need_example\": false\n    },\n    {\n      \"name\": \"eatTheRest\",\n      \"need_definition\": false,\n      \"need_example\": false\n    }\n  ]\n}\n```";
        const jsonFile = formatToJSON(input);
        console.log(`#### JSON file3: ${JSON.stringify(jsonFile, null, 2)}`);
        // check whether jsonFile is valid json
        const jsonObject = extractArrayFromJSON(jsonFile);
        assert.ok(jsonObject.length > 0, 'jsonObject should not be empty');
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
