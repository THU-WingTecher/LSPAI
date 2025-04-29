import * as assert from 'assert';
import { CPPLoopHeaderExtractor, ExceptionExtractorFactory, GoLoopHeaderExtractor, JavaLoopHeaderExtractor, LoopHeaderExtractorFactory, PythonLoopHeaderExtractor } from "../../cfg/languageAgnostic";
// ... existing test case remains the same ...

function mockSyntaxNode(text: string): any {
    return { text };
}


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

// Test for Python loop header extraction
test('PythonLoopHeaderExtractor extracts only the loop header', function() {
    const extractor = new PythonLoopHeaderExtractor();

    // Simple for loop
    let node = mockSyntaxNode('for i in range(10):\n    print(i)\n    x = i');
    assert.equal(extractor.extractLoopHeader(node), 'for i in range(10):');

    // While loop
    node = mockSyntaxNode('while x > 0:\n    x -= 1');
    assert.equal(extractor.extractLoopHeader(node), 'while x > 0:');

    // Edge case: no colon
    node = mockSyntaxNode('for i in range(10)');
    assert.equal(extractor.extractLoopHeader(node), 'for i in range(10)');
});
// Java
test('JavaLoopHeaderExtractor extracts only the loop header', function() {
    const extractor = new JavaLoopHeaderExtractor();

    // for loop
    let node = mockSyntaxNode('for (int i = 0; i < 10; i++) {\n    System.out.println(i);\n}');
    assert.equal(extractor.extractLoopHeader(node), 'for (int i = 0; i < 10; i++) {');

    // while loop
    node = mockSyntaxNode('while (x > 0) {\n    x--;\n}');
    assert.equal(extractor.extractLoopHeader(node), 'while (x > 0) {');

    // fallback: no brace
    node = mockSyntaxNode('for (int i = 0; i < 10; i++)');
    assert.equal(extractor.extractLoopHeader(node), 'for (int i = 0; i < 10; i++)');
});

// C++
test('CPPLoopHeaderExtractor extracts only the loop header', function() {
    const extractor = new CPPLoopHeaderExtractor();

    // for loop
    let node = mockSyntaxNode('for (int i = 0; i < 10; ++i) {\n    std::cout << i << std::endl;\n}');
    assert.equal(extractor.extractLoopHeader(node), 'for (int i = 0; i < 10; ++i) {');

    // while loop
    node = mockSyntaxNode('while (ptr != nullptr) {\n    ptr = ptr->next;\n}');
    assert.equal(extractor.extractLoopHeader(node), 'while (ptr != nullptr) {');

    // fallback: no brace
    node = mockSyntaxNode('while (true)');
    assert.equal(extractor.extractLoopHeader(node), 'while (true)');
});

// Go
test('GoLoopHeaderExtractor extracts only the loop header', function() {
    const extractor = new GoLoopHeaderExtractor();

    // for loop
    let node = mockSyntaxNode('for i := 0; i < 10; i++ {\n    fmt.Println(i)\n}');
    assert.equal(extractor.extractLoopHeader(node), 'for i := 0; i < 10; i++ {');

    // infinite for loop
    node = mockSyntaxNode('for {\n    doSomething()\n}');
    assert.equal(extractor.extractLoopHeader(node), 'for {');

    // fallback: no brace
    node = mockSyntaxNode('for i := range arr');
    assert.equal(extractor.extractLoopHeader(node), 'for i := range arr');
});

// Test the factory
test('LoopHeaderExtractorFactory returns correct extractor', function() {
    const pyExtractor = LoopHeaderExtractorFactory.createExtractor('python');
    assert.ok(pyExtractor instanceof PythonLoopHeaderExtractor);

    // Uncomment and implement these when you add other languages
    // const javaExtractor = LoopHeaderExtractorFactory.createExtractor('java');
    // assert.ok(javaExtractor instanceof JavaLoopHeaderExtractor);
});