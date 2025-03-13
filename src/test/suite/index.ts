import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';


export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd'
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
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
}
