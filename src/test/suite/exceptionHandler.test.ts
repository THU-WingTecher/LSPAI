import * as assert from 'assert';
import { ExceptionExtractorFactory } from '../../cfg/exceptionHandler';
// ... existing test case remains the same ...


test('Exception Type Extraction - Multiple Languages', function() {
    const testCases = [
        {
            language: 'python',
            input: 'except ValueError:',
            expected: 'ValueError'
        },
        {
            language: 'python',
            input: 'except Exception:',
            expected: 'Exception'
        },
        {
            language: 'java',
            input: 'catch (IllegalArgumentException e)',
            expected: 'IllegalArgumentException'
        },
        {
            language: 'cpp',
            input: 'catch (std::runtime_error& e)',
            expected: 'runtime_error'
        },
        {
            language: 'cpp',
            input: 'catch (...)',
            expected: 'Exception'
        }
    ];

    for (const testCase of testCases) {
        const extractor = ExceptionExtractorFactory.createExtractor(testCase.language);
        const result = extractor.extractExceptionType(testCase.input);
        assert.equal(
            result,
            testCase.expected,
            `${testCase.language}: Expected ${testCase.expected} but got ${result}`
        );
    }
});