import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';
import { experiment } from '../../extension'

export async function run(): Promise<void> {
  // Create the mocha test
  console.log("index.ts")
  const result = await experiment("java")
  console.log(result)
  // const mocha = new Mocha({
  //   ui: 'tdd',                  // Test style
  //   color: true,                 // Enable color in output
  //   timeout: 50000               // Set timeout to 10000ms (10 seconds)
  // });


  // const testsRoot = path.resolve(__dirname, '..');

  // return new Promise((c, e) => {
  //   glob('**/**.test.js', { cwd: testsRoot })
  //     .then(files => {
  //       // Add files to the test suite
  //       files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  //       try {
  //         // Run the mocha test
  //         mocha.run(failures => {
  //           if (failures > 0) {
  //             e(new Error(`${failures} tests failed.`));
  //           } else {
  //             c();
  //           }
  //         });
  //       } catch (err) {
  //         e(err);
  //       }
  //     })
  //     .catch(err => {
  //       return e(err);
  //     });
  // });
}
