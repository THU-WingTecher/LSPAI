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
	if (process.env.npm_config_testfile) {
		const testFiles = process.env.npm_config_testfile.split(',');
		testFilesReg = `**/{${testFiles.join(',')}}.test.js`;
	}
	console.log("testFilesReg", testFilesReg);
    const testsRoot = path.resolve(__dirname, '..');

	try {
		// Setup test environment first
		// await setupTestEnvironment();
		
		// Wait for extensions to activate
		await new Promise(resolve => setTimeout(resolve, 5000));

		return new Promise((c, e) => {
			glob(testFilesReg, { cwd: testsRoot }, (err, files) => {
				if (err) {
					return e(err);
				}

				// Add files to the test suite
				files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

				try {
					// Run the mocha test
					mocha.run(failures => {
						if (failures > 0) {
							e(new Error(`${failures} tests failed.`));
						} else {
							console.log('\x1b[32m%s\x1b[0m', '✓ All tests completed successfully!');
							console.log(`Total test files executed: ${files.length}`);
							c();
						}
					});
				} catch (err) {
					console.error(err);
					e(err);
				}
			});
			});
	} catch (error) {
		console.error('Failed to setup test environment:', error);
		throw error;
	}
}
