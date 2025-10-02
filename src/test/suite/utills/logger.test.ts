import * as fs from 'fs';
import * as assert from 'assert';
import { PromptLogger } from '../../../prompts/logger';

test('PromptLogger should properly log prompts', function() {
    const testData = {
        timestamp: new Date().toISOString(),
        sourceFile: 'test.py',
        systemPrompt: 'Test system prompt',
        userPrompt: 'Test user prompt',
        paths: [
            { code: 'code1', path: 'path1' },
            { code: 'code2', path: 'path2' }
        ],
        finalPrompt: 'Final prompt'
    };

    const logFile = PromptLogger.logPrompt('test.py', testData);

    // Verify log file was created
    assert.ok(fs.existsSync(logFile), 'Log file should exist');

    // Read and verify log content
    const logContent = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    console.log(JSON.stringify(logContent, null, 2));
    assert.equal(logContent.sourceFile, testData.sourceFile);
    assert.equal(logContent.systemPrompt, testData.systemPrompt);
    assert.equal(logContent.userPrompt, testData.userPrompt);
    assert.deepStrictEqual(logContent.paths, testData.paths);
    assert.equal(logContent.finalPrompt, testData.finalPrompt);

    // Clean up test log file
    fs.unlinkSync(logFile);
});