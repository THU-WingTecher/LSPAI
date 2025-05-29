// Summary Statistics:
// ================================================================================
// Category                                 | Frequency 
// ----------------------------------------------------
// Redeclaration/Duplicate Definition       | 28300     
// Import/Module Resolution Error           | 13517     
// Syntax Error                             | 5467      
// Member Access/Usage Error (Field/Method/Visibility) | 13387     
// Type Mismatch/Compatibility Error        | 4388      
// Constructor Call Error                   | 1670      
// Unhandled Exception                      | 179       
// ----------------------------------------------------
// Total                                    | 66908     

// return diagnosticReport;

// Inferring Context Needs by Error Category:
// Redeclaration/Duplicate Definition (28300 - Highest Frequency):
// Problem: The LLM generates code that declares a variable, function, class, or method that already exists in the current scope or an imported scope.
// Context Needed:
// Symbols in the current scope: A list of all identifiers (variables, functions, classes, methods) already defined or imported into the current file/module before the LLM generates new code.
// Symbols in imported modules: If import * is used or specific items are imported, the LLM needs to know what names are being brought into the namespace.
// Class structure (for methods/fields): If generating code within a class, it needs to know existing members (fields and methods) of that class and its parent classes.
// Test structure awareness: For test files, knowing the names of other test methods, setup/teardown methods (e.g., setUp, tearDown, @BeforeEach, @AfterEach), and helper functions defined within the test class/file.
// Import/Module Resolution Error (13517):
// Problem: The LLM tries to import a module/package that doesn't exist, is misspelled, or uses an incorrect path. It might also try to import specific members from a module that don't exist.
// Context Needed:
// Project directory structure: Knowledge of how files and folders are organized, especially the location of the code under test (CUT) and the test file itself, to resolve relative imports.
// List of available modules/packages:
// Standard library modules for the target language version.
// Installed third-party libraries (e.g., from requirements.txt, pom.xml, package.json).
// Project-specific modules/packages and their correct import paths.
// Public API of modules: For from module import X, the LLM needs to know if X is an exportable member of module.
// Location of the Code Under Test (CUT): Crucial for generating correct import statements to access the CUT from the test file.
// Member Access/Usage Error (Field/Method/Visibility) (13387):
// Problem: The LLM tries to access a field or call a method that doesn't exist on an object, or that is not accessible due to visibility rules (e.g., private, protected).
// Context Needed:
// Full class definitions of objects being used: This includes:
// All fields (instance and static) with their types and visibility.
// All methods (instance and static) with their signatures (name, parameters + types, return type) and visibility.
// Inheritance hierarchy: Knowledge of parent classes and interfaces, as members can be inherited.
// Type information of variables: The LLM needs to know or infer the type of a variable to understand what members can be accessed on it (e.g., my_object.do_something() requires knowing the type of my_object).
// API documentation snippets: For library code, relevant parts of the API docs.
// Syntax Error (5467):
// Problem: The generated code violates the grammatical rules of the programming language (e.g., missing colons, mismatched parentheses, incorrect keywords).
// Context Needed:
// Target language and version: E.g., "Python 3.9", "Java 11", "JavaScript ES2020". Subtle syntax differences exist between versions.
// Surrounding code context: Often, syntax errors are due to local inconsistencies. Providing a few lines before and after the point of generation helps.
// (Implicit) Language grammar: While LLMs are trained on this, providing specific examples or constraints for complex syntax structures might help.
// Linting rules/style guides: If a project uses specific linters (like ESLint, Pylint) or style guides, knowledge of these can prevent syntax-adjacent errors.
// Type Mismatch/Compatibility Error (4388):
// Problem: Assigning a value of one type to a variable of an incompatible type, or passing an argument of the wrong type to a function/method.
// Context Needed:
// Type definitions of variables: Explicit types where available.
// Function/method signatures: Parameter types and return types for both the CUT and any utility functions/library calls.
// Constructor signatures: Parameter types for class instantiation.
// Type inference rules: For dynamically typed languages, or where types are inferred.
// Allowed type coercions/conversions: Understanding how the language handles implicit type conversions.
// Generics information (if applicable): E.g., List<String> vs List<Integer>.
// Constructor Call Error (1670):
// Problem: Calling a class constructor with the wrong number, order, or types of arguments, or trying to instantiate an abstract class/interface directly.
// Context Needed:
// Full class definition, specifically the constructor(s) signature(s):
// Parameter names, types, order.
// Default values for parameters.
// Presence of overloaded constructors.
// Information about whether a class is abstract or an interface.
// Dependency Injection (DI) framework awareness: If DI is used, instantiation might be handled differently.
// Unhandled Exception (179):
// Problem: Code calls a method that can throw a checked exception (in languages like Java) without a try-catch block or declaring it in the throws clause. Or, for any language, it doesn't anticipate runtime exceptions that are likely given the inputs.
// Context Needed:
// Method signatures of called functions/methods: Specifically, information about which exceptions they are declared to throw (e.g., @throws in Javadoc, throws clause in Java/C#).
// Project's error handling strategy: Are specific exceptions expected to be caught and handled, or propagated?
// Test intent: Is the test supposed to verify that an exception is thrown? (e.g., pytest.raises, JUnit's assertThrows).
// Common runtime exceptions: For certain operations (e.g., division by zero, null pointer access, file not found), awareness of potential issues.