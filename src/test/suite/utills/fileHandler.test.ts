import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { saveCode } from '../../../fileHandler';

test('saveCode should handle duplicate filenames correctly', async () => {
    // Setup: Create a temporary test directory
    const testDir = path.join(__dirname, 'temp_test_dir');
    const testFileName = 'test.txt';
    const testContent = 'Hello World';
    
    try {
        // Clean up any existing test directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }

        // Test Case 1: First file save
        const firstPath = await saveCode(testContent, testDir, testFileName);
        assert.strictEqual(fs.existsSync(firstPath), true);
        assert.strictEqual(path.basename(firstPath), 'test.txt');
        assert.strictEqual(fs.readFileSync(firstPath, 'utf8'), testContent);

        // Test Case 2: Second file save (should create test_1.txt)
        const secondPath = await saveCode(testContent, testDir, testFileName);
        assert.strictEqual(fs.existsSync(secondPath), true);
        assert.strictEqual(path.basename(secondPath), 'test_1.txt');

        // Test Case 3: Third file save (should create test_2.txt)
        const thirdPath = await saveCode(testContent, testDir, testFileName);
        assert.strictEqual(fs.existsSync(thirdPath), true);
        assert.strictEqual(path.basename(thirdPath), 'test_2.txt');

        // Test Case 4: Test with different file extension
        const pdfPath = await saveCode(testContent, testDir, 'document.pdf');
        assert.strictEqual(path.basename(pdfPath), 'document.pdf');

        // Test Case 5: Test nested directory creation
        const nestedPath = await saveCode(testContent, path.join(testDir, 'nested/folder'), testFileName);
        assert.strictEqual(fs.existsSync(nestedPath), true);
        assert.strictEqual(fs.existsSync(path.join(testDir, 'nested/folder')), true);

    } finally {
        // Cleanup: Remove test directory after tests
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    }
});

test('saveCode should handle invalid inputs', async () => {
    try {
        await saveCode('', '', '');
        assert.fail('Should have thrown an error');
    } catch (error) {
        assert.ok(error);
    }
});