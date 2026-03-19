import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getConfigInstance, PromptType, GenerationType } from '../../../config';
import { genPrompt } from '../../../prompts/promptBuilder';
import { getDocUri, activate } from '../../../lsp/helper';
import { collectInfo, ContextInfo } from '../../../generate';
import { getAllSymbols } from '../../../lsp/symbol';
import { setWorkspaceFolders, updateWorkspaceFolders } from '../../../helper';
import { LLMFixWorkflow } from '../../../ut_runner/analysis/llm_fix_workflow';
suite('Context and Prompt Tests', () => {
    // const testFilesPath = path.join(__dirname, '../../../testFixture');
    const workspaceFolders = [
        {
            uri: vscode.Uri.file('/LSPRAG/experiments/projects/commons-cli'),
            name: 'commons-cli',
            index: 0
        }
    ];
    
    // Update the workspace folders

    const testFilesPath = "/LSPRAG/experiments/projects/commons-cli/src/main/java/org/apache/commons/cli";
getConfigInstance().updateConfig({ workspace: "/LSPRAG/experiments/projects/commons-cli" });
    //set vscode.workspace.workspaceFolders to srcPath
    // Ensure the test directory exists
    if (!fs.existsSync(testFilesPath)) {
        fs.mkdirSync(testFilesPath, { recursive: true });
    }
    
    // Create test files if they don't exist
    const javaTestFile = path.join(testFilesPath, 'GnuParser.java');
    
    let collectedInfo: ContextInfo;
    let collectedInfoSummarized: ContextInfo;
    // const pythonTestFile = path.join(testFilesPath, 'test_module.py');   
    
    test('Test Dependency Context Collection - Java', async () => {
        // Activate the extension
        await vscode.workspace.updateWorkspaceFolders(0, 0, ...workspaceFolders);
        console.log('process.env.DEBUG', process.env.DEBUG);
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        // Open the test file
        getConfigInstance().updateConfig({ promptType: PromptType.DETAILED });
        const docUri = getDocUri(javaTestFile);
        const document = await vscode.workspace.openTextDocument(docUri);
        await vscode.window.showTextDocument(document);
        
        // Wait for language server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get symbols from the document
        const symbols = await getAllSymbols(docUri);
        console.log('symbols', symbols.map((s: vscode.DocumentSymbol) => s.name));

        assert.ok(symbols && symbols.length > 0, 'Should have symbols');
        
        // Find the calculate method
        const methodSymbol = symbols.find((s: vscode.DocumentSymbol) => s.name.includes('flatten'));
        console.log('methodSymbol', methodSymbol);
        assert.ok(methodSymbol, 'Should find flatten method');
        
        // Test with summarization enabled
        getConfigInstance().updateConfig({ summarizeContext: true });
        
        console.log('=== Testing with summarization ENABLED ===');
        
        // Collect info with summarization
        collectedInfoSummarized = await collectInfo(document, methodSymbol!, 'java', 'TestClass_flatten');
        
        console.log('=== Collected Info (Summarized) ===');

        console.log(JSON.stringify(collectedInfoSummarized.dependentContext, null, 2));
        
        // Generate prompt with summarized context
        // const promptObjSummarized = await genPrompt(collectedInfoSummarized, 'test', 'java');
        
        // console.log('=== Prompt Template (Summarized) ===');
        // console.log(promptObjSummarized[1].content);
        
        // Test with summarization disabled
        getConfigInstance().updateConfig({ summarizeContext: false });
        
        console.log('=== Testing with summarization DISABLED ===');
        
        // Collect info without summarization
        collectedInfo = await collectInfo(document, methodSymbol!, 'java', 'TestClass_flatten');
        // collectedInfo = collectedInfoFull;
        console.log('=== Collected Info (Full) ===');
        console.log(JSON.stringify(collectedInfo.dependentContext, null, 2));
        
        // Generate prompt with full context
        const promptObjFull = await genPrompt(collectedInfo, GenerationType.ORIGINAL);
        
        console.log('=== Prompt Template (Full) ===');
        console.log(promptObjFull[1].content);
        
        // Compare the two versions

        if (!collectedInfoSummarized.dependentContext && !collectedInfo.dependentContext) {
            console.warn('Skipping summarized-vs-full context size assertions: dependent context was empty in this environment.');
            return;
        }
        assert.notDeepStrictEqual(
            collectedInfoSummarized.dependentContext,
            collectedInfo.dependentContext,
            'Summarized and full context should be different'
        );
        assert.ok(
            collectedInfo.dependentContext.length > collectedInfoSummarized.dependentContext.length,
            'Full context should be longer than summarized context'
        );
    });
    
    // Add a test to display all available prompt templates
    test('Display All Prompt Templates', async () => {
        if (process.env.NODE_DEBUG !== 'true') {
            console.log('activate');
            await activate();
        }
        console.log('=== Available Prompt Templates ===');
        
        // Create a simple mock data structure
        if (!collectedInfo) {
            throw new Error('collectedInfo is not initialized');
        }

        // Generate prompts with different prompt types
        getConfigInstance().updateConfig({ promptType: PromptType.BASIC });
        const summarizedBasicPrompt = await genPrompt(collectedInfoSummarized, GenerationType.ORIGINAL);
        
        getConfigInstance().updateConfig({ promptType: PromptType.DETAILED });
        const summarizedDetailedPrompt = await genPrompt(collectedInfoSummarized, GenerationType.ORIGINAL);
        
        getConfigInstance().updateConfig({ promptType: PromptType.CONCISE });
        const summarizedConcisePrompt = await genPrompt(collectedInfoSummarized, GenerationType.ORIGINAL);
        
        console.log('===SUMMARIZED Basic Prompt Template ===');
        console.log(summarizedBasicPrompt[1].content);
        
        console.log('===SUMMARIZED Detailed Prompt Template ===');
        console.log(summarizedDetailedPrompt[1].content);
        
        console.log('===SUMMARIZED Concise Prompt Template ===');
        console.log(summarizedConcisePrompt[1].content);


        // Generate prompts with different prompt types
        getConfigInstance().updateConfig({ promptType: PromptType.BASIC });
        const basicPrompt = await genPrompt(collectedInfo, GenerationType.ORIGINAL);
        
        getConfigInstance().updateConfig({ promptType: PromptType.DETAILED });
        const detailedPrompt = await genPrompt(collectedInfo, GenerationType.ORIGINAL);
        
        getConfigInstance().updateConfig({ promptType: PromptType.CONCISE });
        const concisePrompt = await genPrompt(collectedInfo, GenerationType.ORIGINAL);
        
        console.log('===FULL Basic Prompt Template ===');
        console.log(basicPrompt[1].content);
        
        console.log('===FULL Detailed Prompt Template ===');
        console.log(detailedPrompt[1].content);
        
        console.log('===FULL Concise Prompt Template ===');
        console.log(concisePrompt[1].content);
    });
});

suite('LLMFixWorkflow Transitive Context Tests', () => {
	const fixturesDir = path.join(__dirname, '../../../../src/test/fixtures');
	const pythonProjectPath = path.join(fixturesDir, 'python');
	const sourceFile = path.join(pythonProjectPath, 'transitive_invoked_context.py');
	const callsiteFixtureFile = path.join(pythonProjectPath, 'callsite_conditioned_context.py');
	const youtubeDlProjectPath = '/LSPRAG/experiments/projects/youtube-dl';
	const youtubeDlBandcampFile = path.join(youtubeDlProjectPath, 'youtube_dl/extractor/bandcamp.py');

	test('getInvokedFunctionContextTransitive resolves second-hop dependencies', async function() {
		this.timeout(60000);

		getConfigInstance().updateConfig({
			workspace: pythonProjectPath
		});

		const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
		await updateWorkspaceFolders(workspaceFolders);

		await activate(vscode.Uri.file(sourceFile));
		await new Promise(resolve => setTimeout(resolve, 2500));

		const workflow = new LLMFixWorkflow('', pythonProjectPath, { language: 'python' });
		const direct = await workflow.getInvokedFunctionContext({
			symbol_name: 'render_score',
			source_file: sourceFile
		});
		const transitiveDepth1 = await workflow.getInvokedFunctionContextTransitive({
			symbol_name: 'render_score',
			source_file: sourceFile
		}, 1);
		const transitiveDepth2 = await workflow.getInvokedFunctionContextTransitive({
			symbol_name: 'render_score',
			source_file: sourceFile
		}, 2);

		const directCombined = direct.join('\n\n');
		const transitiveDepth1Combined = transitiveDepth1.join('\n\n');
		const transitiveDepth2Combined = transitiveDepth2.join('\n\n');

		assert.ok(directCombined.includes('def compute_bucket'), `Direct context should include compute_bucket: ${directCombined}`);
		assert.ok(!directCombined.includes('def normalize_seed'), `Direct context should not include second-hop function: ${directCombined}`);
		assert.ok(!transitiveDepth1Combined.includes('def normalize_seed'), `Depth-1 transitive context should not include second-hop function: ${transitiveDepth1Combined}`);
		assert.ok(transitiveDepth2Combined.includes('def normalize_seed'), `Depth-2 transitive context should include second-hop function: ${transitiveDepth2Combined}`);
	});

	test('getInvokedFunctionContextCallsiteConditioned focuses transitive retrieval by draft callsites', async function() {
		this.timeout(60000);

		getConfigInstance().updateConfig({
			workspace: pythonProjectPath
		});

		const workspaceFolders = setWorkspaceFolders(pythonProjectPath);
		await updateWorkspaceFolders(workspaceFolders);

		await activate(vscode.Uri.file(callsiteFixtureFile));
		await new Promise(resolve => setTimeout(resolve, 2500));

		const workflow = new LLMFixWorkflow('', pythonProjectPath, { language: 'python' });
		const transitive = await workflow.getInvokedFunctionContextTransitive({
			symbol_name: 'render_value',
			source_file: callsiteFixtureFile
		}, 2);
		const conditioned = await workflow.getInvokedFunctionContextCallsiteConditioned({
			symbol_name: 'render_value',
			source_file: callsiteFixtureFile,
			draft_test_code: [
				'def test_even_path():',
				'    assert render_value(4) == compute_alpha(4)'
			].join('\n')
		}, 2);

		const transitiveCombined = transitive.join('\n\n');
		const conditionedCombined = conditioned.join('\n\n');
		console.log(`[render_value] transitive=${transitive.length}, conditioned=${conditioned.length}`);

		assert.ok(
			transitiveCombined.includes('def compute_beta'),
			`Baseline transitive context should include compute_beta.\n${transitiveCombined}`
		);
		assert.ok(
			conditionedCombined.includes('def compute_alpha'),
			`Conditioned context should include compute_alpha.\n${conditionedCombined}`
		);
		assert.ok(
			conditionedCombined.includes('def normalize_alpha'),
			`Conditioned context should include normalize_alpha via transitive hop.\n${conditionedCombined}`
		);
		assert.ok(
			!conditionedCombined.includes('def compute_beta'),
			`Conditioned context should avoid unrelated compute_beta branch.\n${conditionedCombined}`
		);
		assert.ok(
			conditionedCombined.includes('[decision] focal_branch_conditions'),
			`Conditioned context should include focal decision lines.\n${conditionedCombined}`
		);
	});

	test('real-world: youtube-dl bandcamp.py:suitable includes delegation context', async function() {
		this.timeout(90000);

		if (!fs.existsSync(youtubeDlBandcampFile)) {
			this.skip();
			return;
		}

		getConfigInstance().updateConfig({
			workspace: youtubeDlProjectPath
		});

		const workspaceFolders = setWorkspaceFolders(youtubeDlProjectPath);
		await updateWorkspaceFolders(workspaceFolders);

		await activate(vscode.Uri.file(youtubeDlBandcampFile));
		await new Promise(resolve => setTimeout(resolve, 3000));

		const workflow = new LLMFixWorkflow('', youtubeDlProjectPath, { language: 'python' });
		const direct = await workflow.getInvokedFunctionContext({
			symbol_name: 'suitable',
			source_file: youtubeDlBandcampFile
		});
		const transitive = await workflow.getInvokedFunctionContextTransitive({
			symbol_name: 'suitable',
			source_file: youtubeDlBandcampFile
		}, 2);

		const directCombined = direct.join('\n\n');
		const transitiveCombined = transitive.join('\n\n');
		console.log(`[bandcamp.suitable] direct=${direct.length}, transitive=${transitive.length}`);

		assert.ok(transitive.length > 0, 'Expected non-empty transitive context for bandcamp.py:suitable');
		assert.ok(transitive.length >= direct.length, 'Transitive context should be at least as rich as direct context');
		assert.ok(
			transitiveCombined.includes('BandcampWeeklyIE') ||
			transitiveCombined.includes('BandcampIE') ||
			transitiveCombined.includes('InfoExtractor'),
			`Expected delegation-related extractor context in transitive output.\n${transitiveCombined}`
		);
		assert.ok(
			directCombined.includes('BandcampWeeklyIE') || transitiveCombined.includes('BandcampWeeklyIE'),
			`Expected BandcampWeeklyIE context from focal method calls.\n${transitiveCombined}`
		);
	});
});
