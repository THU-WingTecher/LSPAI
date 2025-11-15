import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface DiffInfo {
    file: string;
    before: string;
    after: string;
    additions: number;
    deletions: number;
}

interface SessionMessage {
    info: {
        summary?: {
            diffs?: DiffInfo[];
        };
    };
}

interface OpenCodeJSON {
    prompt: string;
    name: string;
    response: string;
    opencodeSessionDetails: {
        data: SessionMessage[];
    };
    model?: string;
    durationMs?: number;
}

interface TestRound {
    round: number;
    prompt: string;
    response: string;
    fixedCode: string;
    testResult: 'pass' | 'fail';
    errorMessage?: string;
    assertionErrors?: string;
    symbolName?: string;
}

interface TestResultJSON {
    [testName: string]: TestRound[];
}

function extractCodeFromResponse(response: string): string {
    // Try to extract code blocks from markdown
    const codeBlockRegex = /```(?:python|typescript|javascript|java|go|cpp)?\n([\s\S]*?)```/g;
    const matches = [];
    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
        matches.push(match[1]);
    }
    return matches.join('\n\n---\n\n') || response;
}

function extractAnalysisFromResponse(response: string): string {
    // Extract the analysis/explanation part (text before code blocks)
    // Look for the first code block marker
    const codeBlockRegex = /```/;
    const codeBlockIndex = response.search(codeBlockRegex);
    
    if (codeBlockIndex > 0) {
        // Return text before the first code block, removing any trailing newlines
        const analysis = response.substring(0, codeBlockIndex).trim();
        // Remove any trailing markdown formatting or extra whitespace
        return analysis.replace(/\n{3,}/g, '\n\n').trim();
    }
    
    // If no code blocks found, return the full response (might be just text)
    return response.trim();
}

function parsePromptJSON(promptStr: string): { sourceCode?: string; testCode?: string; assertionErrors?: string; symbolName?: string } | null {
    try {
        return JSON.parse(promptStr);
    } catch {
        return null;
    }
}

function detectJSONFormat(jsonData: any): 'opencode' | 'testresult' | 'unknown' {
    // Check for OpenCode format
    if (jsonData.prompt && jsonData.name && jsonData.response && jsonData.opencodeSessionDetails) {
        return 'opencode';
    }
    
    // Check for TestResult format
    if (typeof jsonData === 'object' && !Array.isArray(jsonData)) {
        const firstKey = Object.keys(jsonData)[0];
        if (firstKey && Array.isArray(jsonData[firstKey])) {
            const firstRound = jsonData[firstKey][0];
            if (firstRound && firstRound.round && firstRound.prompt && firstRound.response && firstRound.fixedCode) {
                return 'testresult';
            }
        }
    }
    
    return 'unknown';
}

function visualizeTestResultAnalysis(data: TestResultJSON): void {
    console.log('\n' + '='.repeat(80));
    console.log('Test Result JSON Analysis Visualization');
    console.log('='.repeat(80));

    for (const [testName, rounds] of Object.entries(data)) {
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`Test: ${testName}`);
        console.log(`Total Rounds: ${rounds.length}`);
        console.log('═'.repeat(80));

        for (const round of rounds) {
            console.log(`\n${'─'.repeat(80)}`);
            console.log(`Round ${round.round} - Result: ${round.testResult.toUpperCase()}`);
            console.log('─'.repeat(80));

            // Parse prompt to extract wrong code
            const promptData = parsePromptJSON(round.prompt);
            
            if (promptData) {

                if (promptData.sourceCode) {
                    console.log(`\n📄 SOURCE CODE (Function Under Test):`);
                    console.log('─'.repeat(80));
                    const sourceLines = promptData.sourceCode.split('\n');
                    sourceLines.forEach((line, idx) => {
                        console.log(`${(idx + 1).toString().padStart(4, ' ')} | ${line}`);
                    });
                    console.log('─'.repeat(80));
                }

                if (promptData.assertionErrors || round.assertionErrors) {
                    console.log(`\n⚠️  ASSERTION ERROR:`);
                    console.log('─'.repeat(80));
                    console.log(promptData.assertionErrors || round.assertionErrors);
                    console.log('─'.repeat(80));
                }

                if (promptData.testCode) {
                    console.log(`\n❌ WRONG CODE (Original Test Code):`);
                    console.log('─'.repeat(80));
                    const wrongLines = promptData.testCode.split('\n');
                    wrongLines.forEach((line, idx) => {
                        console.log(`${(idx + 1).toString().padStart(4, ' ')} | ${line}`);
                    });
                    console.log('─'.repeat(80));
                }
            }

            console.log(`\n✅ FIXED CODE (After Patch):`);
            console.log('─'.repeat(80));
            const fixedLines = round.fixedCode.split('\n');
            fixedLines.forEach((line, idx) => {
                console.log(`${(idx + 1).toString().padStart(4, ' ')} | ${line}`);
            });
            console.log('─'.repeat(80));

            if (round.errorMessage) {
                console.log(`\n❌ ERROR MESSAGE:`);
                console.log('─'.repeat(80));
                console.log(round.errorMessage);
                console.log('─'.repeat(80));
            }

            console.log(`\n📝 ANALYSIS RESULT (Explanation):`);
            console.log('─'.repeat(80));
            const analysis = extractAnalysisFromResponse(round.response);
            console.log(analysis);
            console.log('─'.repeat(80));

            console.log(`\n💻 FIXED CODE FROM RESPONSE:`);
            console.log('─'.repeat(80));
            const extractedCode = extractCodeFromResponse(round.response);
            if (extractedCode) {
                const codeLines = extractedCode.split('\n');
                codeLines.forEach((line, idx) => {
                    console.log(`${(idx + 1).toString().padStart(4, ' ')} | ${line}`);
                });
            } else {
                console.log('(No code blocks found in response)');
            }
            console.log('─'.repeat(80));
        }

        // Summary for this test
        const lastRound = rounds[rounds.length - 1];
        const finalResult = lastRound.testResult === 'pass' ? '✅ SUCCEEDED' : '❌ FAILED';
        
        console.log(`\n${'═'.repeat(80)}`);
        console.log(`SUMMARY FOR ${testName}`);
        console.log('═'.repeat(80));
        console.log(`Final Result: ${finalResult}`);
        console.log(`Total Rounds: ${rounds.length}`);
        
        // List error messages for each round
        console.log(`\nError Messages by Round:`);
        for (const round of rounds) {
            const promptData = parsePromptJSON(round.prompt);
            const errorMsg = round.errorMessage || 
                           round.assertionErrors || 
                           promptData?.assertionErrors || 
                           'None';
            const status = round.testResult === 'pass' ? '✅' : '❌';
            const errorPreview = errorMsg.length > 100 ? errorMsg.substring(0, 100) + '...' : errorMsg;
            console.log(`  ${status} Round ${round.round}: ${errorPreview}`);
        }
        console.log('═'.repeat(80));
    }
}

function visualizeAnalysis(data: OpenCodeJSON): void {
    // Extract all diffs from the session
    const allDiffs: DiffInfo[] = [];
    for (const message of data.opencodeSessionDetails.data) {
        const diffs = message.info?.summary?.diffs || [];
        allDiffs.push(...diffs);
    }

    // Visualize the analysis
    console.log('\n' + '='.repeat(80));
    console.log('JSON Analysis Visualization');
    console.log('='.repeat(80));
    console.log(`\nTest Name: ${data.name}`);
    if (data.model) {
        console.log(`Model: ${data.model}`);
    }
    if (data.durationMs) {
        console.log(`Duration: ${data.durationMs}ms`);
    }
    
    console.log(`\n--- Prompt (first 300 chars) ---`);
    console.log(data.prompt.substring(0, 300) + (data.prompt.length > 300 ? '...' : ''));

    // Show wrong code vs fixed code from diffs
    if (allDiffs.length > 0) {
        for (const diff of allDiffs) {
            console.log(`\n${'─'.repeat(80)}`);
            console.log(`File: ${diff.file}`);
            console.log('─'.repeat(80));
            
            console.log(`\n❌ WRONG CODE (Before):`);
            console.log('─'.repeat(80));
            if (diff.before.trim()) {
                const beforeLines = diff.before.split('\n');
                beforeLines.forEach((line, idx) => {
                    console.log(`${(idx + 1).toString().padStart(4, ' ')} | ${line}`);
                });
            } else {
                console.log('(Empty file or new file)');
            }
            console.log('─'.repeat(80));

            console.log(`\n✅ FIXED CODE (After):`);
            console.log('─'.repeat(80));
            const afterLines = diff.after.split('\n');
            afterLines.forEach((line, idx) => {
                console.log(`${(idx + 1).toString().padStart(4, ' ')} | ${line}`);
            });
            console.log('─'.repeat(80));
            console.log(`\nChanges: +${diff.additions} additions, -${diff.deletions} deletions`);
        }
    } else {
        console.log('\n⚠️  No diffs found in session data');
    }

    // Show the response (analysis result with fixed code)
    console.log(`\n${'─'.repeat(80)}`);
    console.log('Analysis Result (Response)');
    console.log('─'.repeat(80));
    const extractedCode = extractCodeFromResponse(data.response);
    console.log(extractedCode);
    console.log('─'.repeat(80));
}

suite('JSON Analysis Test Suite', () => {
    const jsonFilePath = '/LSPRAG/results/openCode-4o/gpt-4o/logs/insert_str_child_factory_1761365899228.json';

    // test('Parse and visualize JSON analysis data', () => {
    //     if (!fs.existsSync(jsonFilePath)) {
    //         assert.fail(`JSON file not found: ${jsonFilePath}`);
    //     }

    //     const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
    //     const data: OpenCodeJSON = JSON.parse(jsonContent);

    //     // Visualize the analysis
    //     visualizeAnalysis(data);

    //     // Assertions to verify data structure
    //     assert.ok(data.name, 'Name should exist');
    //     assert.ok(data.response, 'Response should exist');
    //     assert.ok(data.prompt, 'Prompt should exist');
    //     assert.ok(Array.isArray(data.opencodeSessionDetails.data), 'Session data should be an array');
        
    //     console.log('\n✅ All assertions passed!\n');
    // });

    // test('Extract code comparison details', () => {
    //     const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
    //     const data: OpenCodeJSON = JSON.parse(jsonContent);

    //     // Extract all diffs
    //     const allDiffs: DiffInfo[] = [];
    //     for (const message of data.opencodeSessionDetails.data) {
    //         const diffs = message.info?.summary?.diffs || [];
    //         allDiffs.push(...diffs);
    //     }

    //     // Create comparison object
    //     const comparison = {
    //         testName: data.name,
    //         wrongCode: allDiffs.map(d => ({
    //             file: d.file,
    //             code: d.before,
    //             description: 'Original code that had errors'
    //         })),
    //         fixedCode: allDiffs.map(d => ({
    //             file: d.file,
    //             code: d.after,
    //             description: 'Fixed code after patch'
    //         })),
    //         analysisResult: {
    //             response: data.response,
    //             description: 'LLM analysis and generated test code'
    //         }
    //     };

    //     // Verify structure
    //     assert.ok(comparison.testName, 'Test name should exist');
    //     assert.ok(comparison.wrongCode.length > 0 || comparison.fixedCode.length > 0, 'Should have code comparisons');
    //     assert.ok(comparison.analysisResult.response, 'Analysis result should exist');

    //     console.log('\n=== Code Comparison Summary ===');
    //     console.log(`Test: ${comparison.testName}`);
    //     console.log(`Wrong code files: ${comparison.wrongCode.length}`);
    //     console.log(`Fixed code files: ${comparison.fixedCode.length}`);
    //     console.log(`Analysis result length: ${comparison.analysisResult.response.length} characters\n`);
    // });

    // test('Parse and visualize test result JSON format', () => {
    //     // Example JSON structure for test result format
    //     const exampleTestResultJSON: TestResultJSON = {
    //         "test_invalid_version": [
    //             {
    //                 "round": 1,
    //                 "prompt": "{\"sourceCode\":\"def infer_target_version(...)\",\"testCode\":\"def test_invalid_version(self):...\",\"assertionErrors\":\"AssertionError: InvalidVersion not raised\",\"symbolName\":\"infer_target_version\"}",
    //                 "response": "The root cause...",
    //                 "fixedCode": "def test_invalid_version(self):\n    ...",
    //                 "testResult": "pass"
    //             }
    //         ]
    //     };

    //     // Check if we can parse the structure
    //     assert.ok(Object.keys(exampleTestResultJSON).length > 0, 'Should have test entries');
        
    //     for (const [testName, rounds] of Object.entries(exampleTestResultJSON)) {
    //         assert.ok(Array.isArray(rounds), `Test ${testName} should have rounds array`);
    //         assert.ok(rounds.length > 0, `Test ${testName} should have at least one round`);
            
    //         for (const round of rounds) {
    //             assert.ok(round.round, 'Round should have round number');
    //             assert.ok(round.prompt, 'Round should have prompt');
    //             assert.ok(round.response, 'Round should have response');
    //             assert.ok(round.fixedCode, 'Round should have fixedCode');
    //             assert.ok(['pass', 'fail'].includes(round.testResult), 'Round should have valid testResult');
    //         }
    //     }

    //     console.log('\n✅ Test result JSON structure validated!\n');
    // });

    // test('Visualize test result JSON from file', () => {
    //     // This test can be used with actual test result JSON files
    //     // For now, we'll demonstrate with the example structure
    //     const exampleData: TestResultJSON = {
    //         "test_invalid_version": [
    //             {
    //                 "round": 1,
    //                 "prompt": "{\"sourceCode\":\"def infer_target_version(\\n    pyproject_toml: dict[str, Any],\\n) -> Optional[list[TargetVersion]]:\\n    \\\"\\\"\\\"Infer Black's target version from the project metadata in pyproject.toml.\\n\\n    Supports the PyPA standard format (PEP 621):\\n    https://packaging.python.org/en/latest/specifications/declaring-project-metadata/#requires-python\\n\\n    If the target version cannot be inferred, returns None.\\n    \\\"\\\"\\\"\\n    project_metadata = pyproject_toml.get(\\\"project\\\", {})\\n    requires_python = project_metadata.get(\\\"requires-python\\\", None)\\n    if requires_python is not None:\\n        try:\\n            return parse_req_python_version(requires_python)\\n        except InvalidVersion:\\n            pass\\n        try:\\n            return parse_req_python_specifier(requires_python)\\n        except (InvalidSpecifier, InvalidVersion):\\n            pass\\n\\n    return None\",\"testCode\":\"    def test_invalid_version(self):\\n        \\\"\\\"\\\"\\n        Test handling of 'requires-python' with an invalid version string.\\n        \\\"\\\"\\\"\\n        pyproject_toml = {\\\"project\\\": {\\\"requires-python\\\": \\\"3.x\\\"}}\\n        with self.assertRaises(InvalidVersion):\\n            infer_target_version(pyproject_toml)\\n\",\"assertionErrors\":\"AssertionError: InvalidVersion not raised\",\"symbolName\":\"infer_target_version\"}",
    //                 "response": "The root cause of the assertion error is that the `infer_target_version` function catches `InvalidVersion` exceptions internally and continues to try alternative parsing methods, rather than propagating the exception to the caller. When an invalid version like \"3.x\" is provided, the function handles the exception and returns `None` instead of raising it.\n\n```\ndef test_invalid_version(self):\n    \"\"\"\n    Test handling of 'requires-python' with an invalid version string.\n    \"\"\"\n    pyproject_toml = {\"project\": {\"requires-python\": \"3.x\"}}\n    result = infer_target_version(pyproject_toml)\n    self.assertIsNone(result)\n```",
    //                 "fixedCode": "def test_invalid_version(self):\n    \"\"\"\n    Test handling of 'requires-python' with an invalid version string.\n    \"\"\"\n    pyproject_toml = {\"project\": {\"requires-python\": \"3.x\"}}\n    result = infer_target_version(pyproject_toml)\n    self.assertIsNone(result)",
    //                 "testResult": "pass"
    //             }
    //         ]
    //     };

    //     visualizeTestResultAnalysis(exampleData);
    //     console.log('\n✅ Test result visualization completed!\n');
    // });

    test('Load and visualize test result JSON from file path', () => {
        // This test can load an actual JSON file
        // You can specify the path to your test result JSON file here
        const testResultJsonPath = '/LSPRAG/experiments/motiv/assertion/gpt-4o/results/final-final-report/fix-output/fix_history.json';
        
        if (testResultJsonPath && fs.existsSync(testResultJsonPath)) {
            const jsonContent = fs.readFileSync(testResultJsonPath, 'utf-8');
            const rawData = JSON.parse(jsonContent);
            
            // Auto-detect format
            const format = detectJSONFormat(rawData);
            console.log(`\nDetected format: ${format}\n`);
            
            if (format === 'testresult') {
                const data = rawData as TestResultJSON;
                visualizeTestResultAnalysis(data);
                
                // Verify structure
                assert.ok(Object.keys(data).length > 0, 'Should have test entries');
                
                let totalRounds = 0;
                let passedRounds = 0;
                let failedRounds = 0;
                
                for (const [testName, rounds] of Object.entries(data)) {
                    assert.ok(Array.isArray(rounds), `Test ${testName} should have rounds array`);
                    totalRounds += rounds.length;
                    
                    for (const round of rounds) {
                        if (round.testResult === 'pass') {
                            passedRounds++;
                        } else {
                            failedRounds++;
                        }
                    }
                }
                
                console.log(`\n📊 Overall Summary:`);
                console.log(`Total Tests: ${Object.keys(data).length}`);
                console.log(`Total Rounds: ${totalRounds}`);
                console.log(`Passed: ${passedRounds}`);
                console.log(`Failed: ${failedRounds}`);
                console.log(`Success Rate: ${((passedRounds / totalRounds) * 100).toFixed(2)}%\n`);

                // Show final results per test
                console.log(`\n📋 Final Results by Test:`);
                for (const [testName, rounds] of Object.entries(data)) {
                    const lastRound = rounds[rounds.length - 1];
                    const finalResult = lastRound.testResult === 'pass' ? '✅ SUCCEEDED' : '❌ FAILED';
                    console.log(`  ${finalResult} - ${testName} (${rounds.length} round${rounds.length > 1 ? 's' : ''})`);
                }
                console.log('');
                
                assert.ok(totalRounds > 0, 'Should have at least one round');
            } else if (format === 'opencode') {
                const data = rawData as OpenCodeJSON;
                visualizeAnalysis(data);
                assert.ok(data.name, 'Name should exist');
            } else {
                console.log('\n⚠️  Unknown JSON format. Expected OpenCode or TestResult format.\n');
            }
        } else {
            console.log('\n⚠️  No test result JSON file path provided or file not found.');
            console.log('Set TEST_RESULT_JSON_PATH environment variable to load a file.\n');
            // Don't fail the test if no file is provided
        }
    });
});

