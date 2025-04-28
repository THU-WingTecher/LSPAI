import * as fs from 'fs';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { generatePathBasedTests } from '../../prompts/promptBuilder';
import { PromptLogger } from '../../prompts/logger';


test('generatePathBasedTests should create separate chat messages for each Python path', function() {
    const mockDocument = {
        languageId: 'python',
        getText: () => 'def test_method(): pass'
    } as unknown as vscode.TextDocument;
    
    const sourcecode = `def calculate_value(x, y):
        if x > 10:
            if y > 5:
                return x + y
            else:
                return x - y
        else:
            return x * y`;
    
    const paths = [
        {
            code: 'return x + y',
            path: 'x > 10 && y > 5'
        },
        {
            code: 'return x - y',
            path: 'x > 10 && !(y > 5)'
        },
        {
            code: 'return x * y',
            path: '!(x > 10)'
        }
    ];
    
    const mockTemplate = {
        system_prompt: 'Test system prompt',
        user_prompt: 'Test user prompt {source_code} {path_count} {path_data} {unit_test_template}'
    };

    const results = generatePathBasedTests(mockDocument, sourcecode, paths, 'test.py', mockTemplate);
    
    // Test the structure of results
    assert.equal(results.length, 3, 'Should return three sets of messages (one for each path)');
    
    // Test each set of messages
    results.forEach((result, index) => {
        // Each result should have system and user messages
        assert.equal(result.length, 2, `Result ${index} should have two messages`);
        assert.equal(result[0].content, mockTemplate.system_prompt, `Result ${index} should use provided system prompt`);
        
        // Test user message content
        const userPrompt = result[1].content;
        assert.ok(userPrompt.includes(sourcecode), `Result ${index} should include source code`);
        assert.ok(userPrompt.includes('1'), `Result ${index} should include path count of 1`);
        assert.ok(userPrompt.includes(paths[index].path), `Result ${index} should include its specific path condition`);
        assert.ok(userPrompt.includes(paths[index].code), `Result ${index} should include its specific path code`);
        
        // Log each prompt separately
        const logFile = PromptLogger.logPrompt('test.py', {
            timestamp: new Date().toISOString(),
            sourceFile: 'test.py',
            systemPrompt: result[0].content,
            userPrompt: result[1].content,
            paths: paths, // Now logging single path instead of array
            finalPrompt: result[1].content
        });

        console.log(`Prompt ${index + 1} logged to: ${logFile}`);
    });
});

// test('generatePathBasedTests should create proper chat messages for Python paths', function() {
//     const mockDocument = {
//         languageId: 'python',
//         getText: () => 'def test_method(): pass'
//     } as unknown as vscode.TextDocument;
    
//     const sourcecode = `def calculate_value(x, y):
//         if x > 10:
//             if y > 5:
//                 return x + y
//             else:
//                 return x - y
//         else:
//             return x * y`;
    
//     const paths = [
//         {
//             code: 'return x + y',
//             path: 'x > 10 && y > 5'
//         },
//         {
//             code: 'return x - y',
//             path: 'x > 10 && !(y > 5)'
//         },
//         {
//             code: 'return x * y',
//             path: '!(x > 10)'
//         }
//     ];
    
//     const mockTemplate = {
//         system_prompt: 'Test system prompt',
//         user_prompt: 'Test user prompt {source_code} {path_count} {path_data} {unit_test_template}'
//     };

//     const result = generatePathBasedTests(mockDocument, sourcecode, paths, 'test.py', mockTemplate);
    
//     // Log the generated prompts
//     const logFile = PromptLogger.logPrompt('test.py', {
//         timestamp: new Date().toISOString(),
//         sourceFile: 'test.py',
//         systemPrompt: result[0].content,
//         userPrompt: result[1].content,
//         paths: paths,
//         finalPrompt: result[1].content
//     });

//     console.log(`Prompt logged to: ${logFile}`);
    
//     // Original assertions
//     assert.equal(result.length, 2, 'Should return two messages');
//     assert.equal(result[0].content, mockTemplate.system_prompt, 'Should use provided system prompt');
//     assert.ok(result[1].content.includes(sourcecode), 'Should include source code');
//     assert.ok(result[1].content.includes('3'), 'Should include path count');
    
//     paths.forEach(path => {
//         assert.ok(result[1].content.includes(path.path), `Should include path condition: ${path.path}`);
//         assert.ok(result[1].content.includes(path.code), `Should include path code: ${path.code}`);
//     });
// });
