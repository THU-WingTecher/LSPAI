import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';

export async function run(): Promise<void> {
	// Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        timeout: 0,  // Set timeout to 10 seconds
        color: true
    });
	// let testFilesReg = '**/**.test.js';
	// console.log('process.env.argv', process.argv);
	// console.log("process.env.npm_config_testfile", process.env.npm_config_testfile);
	// if (process.env.npm_config_testfile) {
	// 	testFilesReg = `**/${process.env.npm_config_testfile}.test.js`;
	// }
	let testFilesReg = '**/**.test.js';
	console.log('process.env.argv', process.argv);
	console.log("process.env.npm_config_testfile", process.env.npm_config_testfile);
	const testFilesFilter = process.env.npm_config_testfile;
	if (testFilesFilter) {
		console.log("Using filter string for tests:", testFilesFilter);
	}
	console.log("testFilesReg", testFilesReg);
    const testsRoot = path.resolve(__dirname, '..');

	// Setup test environment first
	// await setupTestEnvironment();
	
	// Wait for extensions to activate
	await new Promise(resolve => setTimeout(resolve, 5000));

	return new Promise((c, e) => {
		glob(testFilesReg, { cwd: testsRoot }, (err, files) => {
			if (err) {
				return e(err);
			}

			let selectedFiles = files;
			// Apply dot-path equivalence filter if provided
			if (testFilesFilter) {
				const rawTokens = testFilesFilter.split(',').map(s => s.trim()).filter(Boolean);
				const expandedTerms = Array.from(new Set<string>(rawTokens.flatMap(t => [
					t,
					t.replace(/\./g, '/'),
					t.replace(/[\\/]/g, '.'),
				])));
				selectedFiles = Array.from(new Set(selectedFiles.filter(f => {
					const noExt = f.replace(/\.test\.js$/, '');
					const candidates = [
						f,
						noExt,
						noExt.replace(/[\\/]/g, '.'),
						noExt.replace(/\./g, '/'),
					];
					return expandedTerms.some(term => candidates.some(c => c.includes(term)));
				})));
			}

			// Add files to the test suite
			selectedFiles.forEach(f => {
				console.log(`Running test file: ${f}`);
				mocha.addFile(path.resolve(testsRoot, f));
			});
			try {
				// Run the mocha test
				console.log(`Running ${selectedFiles.length} tests`);
				
				mocha.run(failures => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						console.log('\x1b[32m%s\x1b[0m', '✓ All tests completed successfully!');
						console.log(`Total test files executed: ${selectedFiles.length}`);
						console.log(`Total test files executed: ${selectedFiles.map(f => f.split('/').pop()).join(', ')}`);
						c();
					}
				});
			} catch (err) {
				console.error(err);
				e(err);
			}
		});
		});
	}
