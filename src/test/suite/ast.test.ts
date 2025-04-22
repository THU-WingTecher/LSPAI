import { ASTParser, SupportedLanguage } from '../../ast';
import { strict as assert } from 'assert';

suite('Control Flow Parsing', () => {
    let parser: ASTParser;

    setup(() => {
        parser = ASTParser.getInstance();
        parser.clearLanguageCache();
    });

    async function testLanguage(language: SupportedLanguage): Promise<boolean> {
        try {
            await parser.setLanguage(language);
            return true;
        } catch (e) {
            return false;
        }
    }

    suite('Python Control Flow', () => {
        test('should parse if-elif-else statement', async function() {
            if (!await testLanguage('python')) {
                this.skip();
            }
            const code = `
                if x > 0:
                    print("positive")
                elif x < 0:
                    print("negative")
                else:
                    print("zero")
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'if_statement');
        });

        test('should parse for loop', async function() {
            if (!await testLanguage('python')) {
                this.skip();
            }
            const code = `
                for i in range(10):
                    print(i)
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'for_statement');
        });

        test('should parse while loop', async function() {
            if (!await testLanguage('python')) {
                this.skip();
            }
            const code = `
                while count > 0:
                    count -= 1
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'while_statement');
        });

        test('should parse try-except-finally', async function() {
            if (!await testLanguage('python')) {
                this.skip();
            }
            const code = `
                try:
                    risky_operation()
                except ValueError as e:
                    handle_error(e)
                finally:
                    cleanup()
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'try_statement');
        });
    });

    suite('Go Control Flow', () => {
        test('should parse if-else statement', async function() {
            if (!await testLanguage('go')) {
                this.skip();
            }
            const code = `
                if x > 0 {
                    fmt.Println("positive")
                } else if x < 0 {
                    fmt.Println("negative")
                } else {
                    fmt.Println("zero")
                }
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'if_statement');
        });

        test('should parse for loop variations', async function() {
            if (!await testLanguage('go')) {
                this.skip();
            }
            const code = `
                // Traditional for
                for i := 0; i < 10; i++ {
                    fmt.Println(i)
                }
                // Range-based for
                for index, value := range items {
                    fmt.Println(index, value)
                }
                // While-style for
                for count > 0 {
                    count--
                }
            `;
            const tree = parser.parse(code);
            const forStatements = tree.rootNode.children.filter(node => node.type === 'for_statement');
            assert(forStatements.length >= 3);
        });

        test('should parse switch statement', async function() {
            if (!await testLanguage('go')) {
                this.skip();
            }
            const code = `
                switch value {
                case 1:
                    fmt.Println("one")
                case 2:
                    fmt.Println("two")
                default:
                    fmt.Println("other")
                }
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'expression_switch_statement');
        });
    });

    suite('C++ Control Flow', () => {
        test('should parse if-else statement', async function() {
            if (!await testLanguage('cpp')) {
                this.skip();
            }
            const code = `
                if (x > 0) {
                    cout << "positive";
                } else if (x < 0) {
                    cout << "negative";
                } else {
                    cout << "zero";
                }
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'if_statement');
        });

        test('should parse various loops', async function() {
            if (!await testLanguage('cpp')) {
                this.skip();
            }
            const code = `
                // For loop
                for (int i = 0; i < 10; i++) {
                    cout << i;
                }
                // While loop
                while (count > 0) {
                    count--;
                }
                // Do-while loop
                do {
                    process();
                } while (condition);
                // Range-based for
                for (const auto& item : items) {
                    process(item);
                }
            `;
            const tree = parser.parse(code);
            const loops = tree.rootNode.children.filter(node => 
                ['for_statement', 'while_statement', 'do_statement'].includes(node.type)
            );
            assert(loops.length >= 3);  
        });

        test('should parse switch statement', async function() {
            if (!await testLanguage('cpp')) {
                this.skip();
            }
            const code = `
                switch (value) {
                    case 1:
                        cout << "one";
                        break;
                    case 2:
                        cout << "two";
                        break;
                    default:
                        cout << "other";
                }
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'switch_statement');
        });

        test('should parse try-catch', async function() {
            if (!await testLanguage('cpp')) {
                this.skip();
            }
            const code = `
                try {
                    riskyOperation();
                } catch (const std::exception& e) {
                    handleError(e);
                } catch (...) {
                    handleUnknownError();
                }
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'try_statement');
        });
    });

    suite('Java Control Flow', () => {
        test('should parse if-else statement', async function() {
            if (!await testLanguage('java')) {
                this.skip();
            }
            const code = `
                if (x > 0) {
                    System.out.println("positive");
                } else if (x < 0) {
                    System.out.println("negative");
                } else {
                    System.out.println("zero");
                }
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'if_statement');
        });

        test('should parse various loops', async function() {
            if (!await testLanguage('java')) {
                this.skip();
            }
            const code = `
                // For loop
                for (int i = 0; i < 10; i++) {
                    System.out.println(i);
                }
                // Enhanced for
                for (String item : items) {
                    process(item);
                }
                // While loop
                while (count > 0) {
                    count--;
                }
                // Do-while loop
                do {
                    process();
                } while (condition);
            `;
            const tree = parser.parse(code);
            const loops = tree.rootNode.children.filter(node => 
                ['for_statement', 'enhanced_for_statement', 'while_statement', 'do_statement'].includes(node.type)
            );
            assert(loops.length >= 4);
        });

        test('should parse switch statement', async function() {
            if (!await testLanguage('java')) {
                this.skip();
            }
            const code = `
                switch (value) {
                    case 1:
                        System.out.println("one");
                        break;
                    case 2:
                        System.out.println("two");
                        break;
                    default:
                        System.out.println("other");
                }
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'switch_expression');
        });

        test('should parse try-catch-finally', async function() {
            if (!await testLanguage('java')) {
                this.skip();
            }
            const code = `
                try {
                    riskyOperation();
                } catch (Exception e) {
                    handleError(e);
                } finally {
                    cleanup();
                }
            `;
            const tree = parser.parse(code);
            assert.equal(tree.rootNode.children[0].type, 'try_statement');
        });
    });
});