import * as assert from 'assert';
import { generateFileNameCore } from '../../../../experiment/utils/fileNameGenerator';

suite('fileNameGenerator - java rules', () => {
  test('java: preserves package directory structure from relativeDocumentPath', () => {
    const out = generateFileNameCore({
      sourceFileName: 'Option.java',
      symbolName: 'getOpt()',
      languageId: 'java',
      packageString: '',
      relativeFilePath: 'src/main/java/org/apache/commons/cli/Option.java'
    });
    
    assert.strictEqual(out, 'org/apache/commons/cli/Option_getOpt');
  });

  test('java: strips "(...)", "," and "-" from symbolName for file naming', () => {
    const out = generateFileNameCore({
      sourceFileName: 'CommandLine.java',
      symbolName: 'getOptionValue(),- (int)',
      languageId: 'java',
      packageString: '',
      relativeFilePath: 'src/main/java/org/apache/commons/cli/CommandLine.java'
    });

    assert.strictEqual(out, 'org/apache/commons/cli/CommandLine_getOptionValue');
  });
});


