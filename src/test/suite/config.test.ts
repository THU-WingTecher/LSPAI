// src/test/suite/config.test.ts

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { Configuration, GenerationType, PromptType } from '../../config';

test('paths should exist after configuration update', () => {
    // Setup
    const config = Configuration.getInstance();
    const initialWorkspace = '/tmp/test-workspace';
    
    // Create initial paths
    config.updateConfig({ workspace: initialWorkspace });
    const initialSavePath = config.savePath;
    const initialHistoryPath = config.historyPath;
    const initialLogPath = config.logSavePath;
    
    // Verify initial paths exist
    assert.strictEqual(fs.existsSync(path.join(initialWorkspace, initialSavePath)), true, 'Initial save path should exist');
    assert.strictEqual(fs.existsSync(initialHistoryPath), true, 'Initial history path should exist');
    assert.strictEqual(fs.existsSync(initialLogPath), true, 'Initial log path should exist');
    
    // Update configuration
    config.updateConfig({
        model: 'gpt-4',
        promptType: PromptType.DETAILED,
        generationType: GenerationType.AGENT
    });
    
    // Verify paths still exist after update
    assert.strictEqual(fs.existsSync(path.join(initialWorkspace, config.savePath)), true, 'Save path should exist after update');
    assert.strictEqual(fs.existsSync(config.historyPath), true, 'History path should exist after update');
    assert.strictEqual(fs.existsSync(config.logSavePath), true, 'Log path should exist after update');
    
    // Clean up
    try {
        fs.rmSync(initialWorkspace, { recursive: true, force: true });
    } catch (error) {
        console.error('Error cleaning up test directories:', error);
    }
});

test('paths should exist after workspace update', () => {
    // Setup
    Configuration.resetInstance();
    const config = Configuration.getInstance();
    const initialWorkspace = '/tmp/test-workspace-1';
    const newWorkspace = '/tmp/test-workspace-2';
    
    // Create initial paths
    config.updateConfig({ workspace: initialWorkspace });
    const initialSavePath = config.savePath;
    const initialHistoryPath = config.historyPath;
    const initialLogPath = config.logSavePath;
    
    // Verify initial paths exist
    assert.strictEqual(fs.existsSync(path.join(initialWorkspace, initialSavePath)), true, 'Initial save path should exist');
    assert.strictEqual(fs.existsSync(initialHistoryPath), true, 'Initial history path should exist');
    assert.strictEqual(fs.existsSync(initialLogPath), true, 'Initial log path should exist');
    
    // Update workspace
    config.updateConfig({ 
        workspace: newWorkspace,
        model: 'gpt-4' // Adding model change to test combined updates
    });
    
    // Verify new paths exist
    assert.strictEqual(fs.existsSync(path.join(newWorkspace, config.savePath)), true, 'Save path should exist in new workspace');
    assert.strictEqual(fs.existsSync(config.historyPath), true, 'History path should exist in new workspace');
    assert.strictEqual(fs.existsSync(config.logSavePath), true, 'Log path should exist in new workspace');
    
    // Verify paths contain new workspace
    assert.strictEqual(config.historyPath.includes(newWorkspace), true, 'History path should contain new workspace');
    assert.strictEqual(config.logSavePath.includes(newWorkspace), true, 'Log path should contain new workspace');
    
    // Clean up both workspaces
    try {
        fs.rmSync(initialWorkspace, { recursive: true, force: true });
        fs.rmSync(newWorkspace, { recursive: true, force: true });
    } catch (error) {
        console.error('Error cleaning up test directories:', error);
    }
});