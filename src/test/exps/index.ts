import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';
import { _experiment } from '../../experiment';
import { activate } from '../../lsp';
import { getConfigInstance } from '../../config';

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        timeout: 0,
        color: true
    });

    const testsRoot = path.resolve(__dirname, '..');

    try {
        // Wait for extensions to activate
        await new Promise(resolve => setTimeout(resolve, 5000));

        return new Promise((c, e) => {
            glob('**/**.exp.js', { cwd: testsRoot }, (err, files) => {
                if (err) {
                    return e(err);
                }

                files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

                try {
                    mocha.run(async failures => {
                        if (failures > 0) {
                            e(new Error(`${failures} tests failed.`));
                        } else {
                            console.log('\x1b[32m%s\x1b[0m', '✓ All tests completed successfully!');
                            console.log(`Total test files executed: ${files.length}`);
                            try {
								const srcPath = process.env.EXPERIMENT_SRC_PATH!;
								await activate();
								const language = "java";
								console.log("running experiment");
								const results = await _experiment(srcPath, language, [...getConfigInstance().methodsForExperiment]);
                                console.log("experiment results", results);
                            } catch (expError) {
                                e(expError);
                            }
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

