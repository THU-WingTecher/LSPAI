import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { testFunc } from '../../utils'
// import * as myExtension from '../extension';
import { parseCode } from '../../utils'

suite('Extension Test Suite', () => {
  suiteTeardown(() => {
    vscode.window.showInformationMessage('All tests done!');
  });

  test('parse code test', () => {
    const codeToParse = ` \`\`\`java hello world \`\`\` `;
    assert.strictEqual(parseCode(codeToParse), 'hello world');
  });

  let language = "java";

  // Asynchronous test
  // describe('Extension Test Suite', () => {
  //   it('should run experiment with language', function(done) {
  //     experiment(language).then(() => {
  //         done();
  //       })
  //       // const results = await experiment(language);
  //       // // Add assertions to verify the behavior of your experiment function
  //       // console.log(results);
  //       // Example: assert(result === expectedValue);
  //   });
  // });
});
