import sys
import os
import json
from collections import defaultdict
from typing import Dict, List, Set, Tuple, Any
import re

# Helper function to parse the input
def parse_error_data(raw_data_string):
    parsed_data = []
    lines = raw_data_string.strip().split('\n')
    for line in lines:
        if line.strip():
            match = re.match(r"Frequency: (\d+) - (.*)", line)
            if match:
                frequency = int(match.group(1))
                message = match.group(2).strip()
                parsed_data.append({"frequency": frequency, "message": message})
    return parsed_data

# Define categories and keywords
# Order matters: More specific categories/keywords should come first.
error_categories = {
    "Redeclaration/Duplicate Definition": {
        "keywords": [
            "redeclared in this block", "other declaration of", "already declared",
            "is already defined", "field and method with the same name", "duplicate field name"
        ],
        "description": "Indicates that a variable, function, type, or other identifier has been defined more than once in the same scope, or a name collision occurs.",
        "example_context_needed": "Code block where the redeclaration occurs, previous declarations of the same identifier, import statements if it's a package-level conflict."
    },
    "Import/Module Resolution Error": {
        "keywords": [
            "import", "could not be resolved", "no required module provides package",
            "expected module name", "does not match the expected package",
            "use of package .* not in selector", # Go specific
            "module", # General keyword
            "use of package .* not in selector", # For package usage without proper import
            "from \\.\\./.*_test\\.go" # For import/file resolution errors in test files，
            # Resolution Error (Type/Variable/Function Not Found)
            "cannot be resolved to a type", "is not defined", "undefined:", "cannot be resolved",
            "cannot find symbol", "missing type", "lambda expression refers to the missing type",
            "is not a type" # Go: pflag.Flag is not a type，
            # File/Structural Error (e.g., Java package)
            "must be defined in its own file", "declared package .* does not match",
            "should be declared in a file named", "implicitly declared class must have"
        ],
        "description": "Failures related to importing modules or packages, including modules not found, resolution issues, or structural mismatches like package names.",
        "example_context_needed": "Project structure (file paths, go.mod/pyproject.toml etc.), import statements, environment configuration (GOPATH, PYTHONPATH), version of external libraries."
    },
    "Syntax Error": {
        "keywords": [
            "syntax error", "misplaced construct", "expected", "unexpected token",
            "was not closed", "insert \"", "delete this token", "invalid compilationunit",
            "unexpected indentation", "unindent not expected", "invalid character constant",
            "statements must be separated", "no new variables on left side of :=",
            "positional argument cannot appear after keyword arguments", "unterminated",
            "illegal character", "await allowed only within async function", "expecting \"}\"",
            "invalid escape sequence", "not properly closed by a double-quote",
            "missing ',' in composite literal", "enum classes must not be local" # Java specific,
            "missing ',' before newline in composite literal", # For Go composite literal syntax
            # Import/Module Resolution Error,
            "import", "could not be resolved", "no required module provides package",
            "expected module name", "does not match the expected package",
            "use of package .* not in selector", # Go specific
            "module", # General keyword
            "use of package .* not in selector", # For package usage without proper import
            "from \\.\\./.*_test\\.go" # For import/file resolution errors in test files
            # Unused Identifier Error,
            "must implement the inherited abstract method", 
            "must override or implement a supertype method",
            "name clash", "does not override", "cannot override final method",
            "cannot reduce the visibility of the inherited method"
        ],
        "description": "Errors related to the grammatical structure of the code, such as incorrect punctuation, keywords, or statement formation.",
        "example_context_needed": "The line of code with the syntax error, surrounding lines for context, the specific language being used."
    },
    "Member Access/Usage Error (Field/Method/Visibility)": {
        "keywords": [
            "unknown field", "has no field or method", "is undefined for the type",
            "is not visible", "not a field", "no field or method",
            "undefined (type", # Go: c.name undefined (type *Command has no field or method name)
            "private access in", "cannot refer to unexported field",
            "Cannot override the final method", # Added for final method override attempts
            "Illegal enclosing instance specification", # Added for inner class instantiation errors
            "cannot subclass the final class" # Added for final class inheritance attempts,
            "Cannot invoke .* on the array type", # For array type method invocation errors
            "Error\\(\\) string" # For interface method implementation errors
        ],
        "description": "Attempting to access or use a field or method that does not exist on a given type/object, or is not accessible due to visibility rules (e.g., private/protected/unexported).",
        "example_context_needed": "The definition of the type/class, the line of code attempting the access, visibility modifiers (public, private, exported/unexported)."
    },
    "Type Mismatch/Compatibility Error": {
        "keywords": [
            "cannot use", "is not applicable for the arguments", "type mismatch",
            "incompatible with", "cannot convert", "cannot assign", "bound mismatch",
            "invalid operation:", # Go: invalid operation: cannot index commandFound.Args
            "incompatible types", "must be a functional interface",
            "invalid composite literal type", "cannot cast from", "assignment mismatch",
            "too many arguments in call", "not enough arguments in call", "non-boolean condition in if statement",
            "no value\\) used as value", # Escaped parenthesis for regex, or handle carefully
            "\\(type\\) is not an expression", # Escaped parenthesis
            "anonymous class cannot subclass", "first argument to append must be a slice",
            "cannot inherit from final", "is an invalid type for the variable",
            "no suitable method found", "argument mismatch", "cannot invoke .* on the array type", # e.g. cannot invoke size() on the array type String[]
            "cannot be parameterized with arguments", # e.g. Incorrect number of arguments for type Converter<T,E>; it cannot be parameterized with arguments <Integer>
            "return type .* is not compatible with", "cannot be converted to",
            "invalid argument" # Added for Go's type mismatch in built-in function calls,
            "Cannot infer type arguments", # Added for generic type inference errors
            "Cannot invoke .* on the primitive type", # Added for primitive type method invocation errors
            "Cannot invoke .* on the array type", # Added for array type method invocation errors
            "is not compatible with throws clause", # Added for exception compatibility
            "Return type for the method is missing", # Added for missing return type
            "does not define .* that is applicable here", # Added for method resolution errors
            "an exception type must be a subclass of" # Added for exception type constraints,
            "\\(no value\\) used as value", # For using void returns as values
            "multiple-value .* in single-value context", # For multiple return values in single value context
            "\\(value of type .* in single-value context", # Another form of multiple return values error
            "\\(value of type .* for built-in", # For built-in function argument type mismatches
            "missing ',' before newline in composite literal" # For composite literal syntax errors
        ],
        "description": "An operation is attempted with incompatible data types, or a value of one type is used where another is expected. Includes issues with function/method call arguments, return types, and assignments.",
        "example_context_needed": "The types involved in the operation, function signatures, variable declarations, the specific operation being performed."
    },
    "Constructor Call Error": {
        "keywords": ["constructor", "cannot instantiate the type"],
        "description": "Issues with creating new objects, such as calling a non-existent constructor or one with incorrect arguments.",
        "example_context_needed": "The class definition (especially constructors), the line of code attempting instantiation, arguments passed to the constructor."
    },

    "Unhandled Exception": {
        "keywords": ["unhandled exception type", "unreachable code", "unreachable catch block", "unreported exception", "must be caught or declared to be thrown"],
        "description": "The code may throw an exception that is not caught by a try-catch block or handled appropriately.",
        "example_context_needed": "The code that might throw the exception, call stack if available, type of exception."
    },
    # "Ambiguity Error": {
    #     "keywords": ["ambiguous", "reference to .* is ambiguous"],
    #     "description": "The compiler/interpreter cannot determine which specific variable, function, or method to use due to multiple possibilities.",
    #     "example_context_needed": "Code with the ambiguous reference, definitions of all potential candidates."
    # },
    # "Unreachable Code/Logic Error": {
    #     "keywords": [],
    #     "description": "Code that will provably never be executed, or catch blocks for exceptions that are never thrown in the try block.",
    #     "example_context_needed": "The try-catch block, the function containing the unreachable code."
    # },
    # "Language Version/Feature Error": {
    #     "keywords": [
    #         "requires go1\\.\\d+", "only available with source level", "is a restricted type name",
    #         "preview feature", "predeclared any requires",
    #         "cannot be used with anonymous classes", # Added for Java anonymous class restrictions
    #         "The annotation .* is disallowed for this location", # Added for Java annotation restrictions
    #         "requires go1\\.[0-9]+ or later" # Added for Go version requirements
    #     ],
    #     "description": "Code uses features or syntax not available in the configured/targeted language version or due to preview feature settings.",
    #     "example_context_needed": "Language version specified in build files (go.mod, pom.xml), code using the problematic feature."
    # },
    # Fallback category - should be last
    "Other Error": {
        "keywords": [],
        "description": "Errors that do not fit neatly into other predefined categories. May require more specific analysis.",
        "example_context_needed": "Full error message, surrounding code context, specific libraries or frameworks being used."
    }
}

def classify_error(message_obj, categories):
    msg_text = message_obj["message"].lower()
    freq = message_obj["frequency"]

    for category_name, cat_details in categories.items():
        if category_name == "Other Error": # Skip this for now, handle at end
            continue
        
        # Prioritize Constructor Call Error if "constructor" and "is undefined" are present
        if category_name == "Constructor Call Error":
            if "constructor" in msg_text and "is undefined" in msg_text:
                return category_name
            elif "cannot instantiate the type" in msg_text:
                 return category_name

        for keyword in cat_details["keywords"]:
            if keyword in msg_text:
                # Specific check for "Import ... could not be resolved" vs generic "could not be resolved"
                if keyword == "could not be resolved" and "import" not in msg_text and "module" not in msg_text:
                    # This is likely a Resolution Error, not Import Error
                    # Let it be caught by "Resolution Error (Type/Variable/Function Not Found)"
                    continue 
                return category_name
        for pattern in cat_details.get("patterns", []):
             if re.search(pattern, msg_text): # Use search for patterns within message
                return category_name
                
    # If no specific category matched, it's "Other Error"
    return "Other Error"
# def classify_error(message_obj, categories):
#     msg_text = message_obj["message"].lower()
#     freq = message_obj["frequency"]

#     # Handle Empty or Unclear Error first using its patterns
#     cat_details = categories["Empty or Unclear Error"]
#     if not msg_text: # Truly empty
#         return "Empty or Unclear Error"
#     for pattern in cat_details.get("patterns", []):
#         if re.match(pattern, message_obj["message"]): # Use original message for regex if needed
#              # Add a check for very short messages that are just code snippets often with newlines
#             if "\n" in message_obj["message"] and len(message_obj["message"]) < 150 : # Arbitrary length for snippets
#                  return "Empty or Unclear Error" # Treat code snippets as unclear for now
#             if not any(kw in msg_text for kw in ["error", "failed", "unable", "warning", "exception"]): # if no error-like keyword
#                 if len(msg_text.split()) < 5 : # and very few words
#                     return "Empty or Unclear Error"


#     for category_name, cat_details in categories.items():
#         if category_name == "Empty or Unclear Error" or category_name == "Other Error": # Skip these for now, handle at end
#             continue
        
#         # Prioritize Constructor Call Error if "constructor" and "is undefined" are present
#         if category_name == "Constructor Call Error":
#             if "constructor" in msg_text and "is undefined" in msg_text:
#                 return category_name
#             elif "cannot instantiate the type" in msg_text:
#                  return category_name


#         for keyword in cat_details["keywords"]:
#             if keyword in msg_text:
#                 # Specific check for "Import ... could not be resolved" vs generic "could not be resolved"
#                 if keyword == "could not be resolved" and "import" not in msg_text and "module" not in msg_text:
#                     # This is likely a Resolution Error, not Import Error
#                     # Let it be caught by "Resolution Error (Type/Variable/Function Not Found)"
#                     continue 
#                 return category_name
#         for pattern in cat_details.get("patterns", []):
#              if re.search(pattern, msg_text): # Use search for patterns within message
#                 return category_name
                
#     # If no specific category matched, it's "Other Error"
#     return "Other Error"

class DiagnosticAnalyzer:
    def __init__(self, diagnostic_dir: str, verbose: bool):
        self.diagnostic_dir = diagnostic_dir
        self.diagnostic_files = []
        # Track messages by round for each file
        self.messages_by_round = defaultdict(lambda: defaultdict(set))
        # Track global frequency of messages
        self.global_message_frequency = defaultdict(int)
        # Track message persistence (how many rounds a message appears)
        self.message_persistence = defaultdict(int)
        # Track which messages were eventually fixed
        self.fixed_messages = set()
        self.unfixed_messages = set()
        self.verbose = verbose
        # Messages to ignore
        self.ignored_messages = {"The error messages are:", "```"}
        
    def should_ignore_message(self, message: str) -> bool:
        """Check if a message should be ignored."""
        # Check for exact matches
        if message in self.ignored_messages:
            return True
        # Check if message starts with any of the ignored messages
        return any(message.startswith(ignored) for ignored in self.ignored_messages)
        
    # def load_diagnostic_files(self):
    #     """Load all diagnostic JSON files from the directory."""
    #     for filename in os.listdir(self.diagnostic_dir):
    #         if filename.endswith('.json'):
    #             file_path = os.path.join(self.diagnostic_dir, filename)
    #             try:
    #                 with open(file_path, 'r') as f:
    #                     data = json.load(f)
    #                     self.diagnostic_files.append(data)
    #                     self.analyze_file_messages(data, filename)
    #             except Exception as e:
    #                 print(f"Error reading {filename}: {e}")
    def load_diagnostic_files(self):
        """
        Recursively load all diagnostic JSON files from the directory and its subdirectories.
        
        Returns:
            int: Number of successfully loaded files
        """
        if not os.path.exists(self.diagnostic_dir):
            print(f"Warning: Directory {self.diagnostic_dir} does not exist")
            return 0
            
        loaded_count = 0
        
        # Walk through directory and subdirectories
        for root, _, files in os.walk(self.diagnostic_dir):
            for filename in files:
                if not filename.lower().endswith('.json'):
                    continue
                    
                file_path = os.path.join(root, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if not isinstance(data, dict):
                            print(f"Warning: {file_path} does not contain valid diagnostic data")
                            continue
                            
                        self.diagnostic_files.append(data)
                        # Pass relative path from diagnostic_dir for better identification
                        rel_path = os.path.relpath(file_path, self.diagnostic_dir)
                        self.analyze_file_messages(data, rel_path)
                        loaded_count += 1
                        
                except json.JSONDecodeError as je:
                    print(f"JSON parsing error in {file_path}: {je}")
                except UnicodeDecodeError as ue:
                    print(f"Unicode decode error in {file_path}: {ue}")
                except Exception as e:
                    print(f"Unexpected error reading {file_path}: {e}")
                    
        if loaded_count == 0:
            print(f"No JSON files found in {self.diagnostic_dir} and its subdirectories")
        else:
            print(f"Successfully loaded {loaded_count} JSON files")
            
        return loaded_count

    def analyze_file_messages(self, file_data: dict, filename: str):
        """Analyze messages in a single file across rounds."""
        round_history = file_data.get('roundHistory', [])
        if not round_history:
            return

        # Track messages for each round
        all_messages = set()
        for round_data in round_history:
            round_num = round_data.get('round', 0)
            # Filter out ignored messages
            messages = [msg for msg in round_data.get('diagnosticMessages', []) 
                       if not self.should_ignore_message(msg)]
            
            # Add messages to round tracking
            self.messages_by_round[filename][round_num] = set(messages)
            
            # Update global frequency
            for message in messages:
                self.global_message_frequency[message] += 1
                all_messages.add(message)
        
        # Determine which messages were fixed and which weren't
        last_round = max(self.messages_by_round[filename].keys())
        last_round_messages = self.messages_by_round[filename][last_round]
        
        # Messages that appeared in any round but not in the last round were fixed
        self.fixed_messages.update(all_messages - last_round_messages)
        # Messages that appeared in the last round were not fixed
        self.unfixed_messages.update(last_round_messages)
        
        # Calculate persistence for each message
        for message in all_messages:
            persistence = sum(1 for round_num in self.messages_by_round[filename] 
                            if message in self.messages_by_round[filename][round_num])
            self.message_persistence[message] = max(self.message_persistence[message], persistence)
    
    def analyze_difficulty(self) -> Dict[str, List[Tuple[str, int]]]:
        """Analyze the difficulty of fixing messages based on persistence."""
        # Sort messages by persistence (higher persistence = harder to fix)
        sorted_by_persistence = sorted(
            self.message_persistence.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        # Group messages by difficulty level
        difficulty_levels = {
            'very_hard': [],    # Appears in 4+ rounds
            'hard': [],         # Appears in 3 rounds
            'moderate': [],     # Appears in 2 rounds
            'easy': []          # Appears in 1 round
        }
        
        for message, persistence in sorted_by_persistence:
            if persistence >= 4:
                difficulty_levels['very_hard'].append((message, persistence))
            elif persistence == 3:
                difficulty_levels['hard'].append((message, persistence))
            elif persistence == 2:
                difficulty_levels['moderate'].append((message, persistence))
            else:
                difficulty_levels['easy'].append((message, persistence))
        
        return difficulty_levels
    
    def generate_report(self) -> str:
        """Generate a comprehensive report of the analysis."""
        report = []
        report.append("=== Diagnostic Analysis Report ===")
        
        # Global message frequency
        report.append("\n=== Most Common Error Messages ===")
        sorted_frequency = sorted(
            self.global_message_frequency.items(),
            key=lambda x: x[1],
            reverse=True
        )
        if not self.verbose:
            for message, frequency in sorted_frequency[:10]:  # Top 10 most common
                report.append(f"Frequency: {frequency} - {message}")
        else:
            for message, frequency in sorted_frequency:
                report.append(f"Frequency: {frequency} - {message}")
        
        # Difficulty analysis
        report.append("\n=== Message Difficulty Analysis ===")
        difficulty_levels = self.analyze_difficulty()
        if not self.verbose:
            for level, messages in difficulty_levels.items():
                report.append(f"\n{level.upper()} to fix ({len(messages)} messages):")
                for message, persistence in messages[:5]:  # Show top 5 for each level
                    report.append(f"  Persistence: {persistence} rounds - {message}")
        else:
            for level, messages in difficulty_levels.items():
                report.append(f"\n{level.upper()} to fix ({len(messages)} messages):")
                for message, persistence in messages:
                    report.append(f"  Persistence: {persistence} rounds - {message}")
        
        # Fixed vs Unfixed statistics
        report.append("\n=== Fix Success Statistics ===")
        report.append(f"Total unique messages: {len(self.global_message_frequency)}")
        report.append(f"Successfully fixed messages: {len(self.fixed_messages)}")
        report.append(f"Unfixed messages: {len(self.unfixed_messages)}")
        if self.verbose:
            report.append("\n=== Unfixed Messages ===")
            for message in self.unfixed_messages:
                report.append(f"{message}")
        return "\n".join(report)


def print_category_statistics(message_frequency: Dict[str, int], categories: Dict[str, Any]):
    # Convert message frequency data to our analysis format
    parsed_data = prepare_diagnostic_data(message_frequency)
    
    # Initialize dictionaries to store both frequencies and messages
    category_stats = {category: {"frequency": 0, "messages": []} for category in categories.keys()}
    
    # Classify each error and collect frequencies and messages
    for data in parsed_data:
        # Skip empty messages
        if not data["message"].strip():
            continue
        category = classify_error(data, categories)
        category_stats[category]["frequency"] += data["frequency"]
        category_stats[category]["messages"].append({
            "message": data["message"],
            "frequency": data["frequency"]
        })
    
    # First print brief summary
    print("\nSummary Statistics:")
    print("=" * 80)
    print("{:<40} | {:<10}".format("Category", "Frequency"))
    print("-" * 52)
    
    total_freq = 0
    other_freq = 0
    for category, stats in category_stats.items():
        if stats["frequency"] > 0:
            if category == "Other Error":
                other_freq += stats["frequency"]
            else :
                print("{:<40} | {:<10}".format(category, stats["frequency"]))
                total_freq += stats["frequency"]
    print("-" * 52)
    print("{:<40} | {:<10}".format("Total", total_freq))
    
    # Then print detailed breakdown
    print("\nDetailed Breakdown:")
    
    # First print Other Error category
    if category_stats["Other Error"]["frequency"] > 0:
        print("\n" + "=" * 80)
        print(f"Category: Other Error")
        print(f"Total Frequency: {category_stats['Other Error']['frequency']}")
        print("-" * 80)
        print("{:<10} | {:<68}".format("Frequency", "Error Message"))
        print("-" * 80)
        
        sorted_messages = sorted(
            [msg for msg in category_stats["Other Error"]["messages"] 
            #  if msg["message"].strip()],
            if msg["message"].strip() and not msg["message"].strip().lower().startswith("func")],
            key=lambda x: x["frequency"],
            reverse=True
        )
        
        for msg_data in sorted_messages:
            message = msg_data["message"].strip()
            # if len(message) > 65:
            #     message = message[:62] + "..."
            # Replace actual newlines with "\n" string
            message = message.replace("\n", "\\n")
            print("{:<10} | {:<68}".format(
                msg_data["frequency"],
                message.replace("\n", " ")
            ))

    # Then print all other categories
    for category, stats in category_stats.items():
        if category != "Other Error" and stats["frequency"] > 0:
            print("\n" + "=" * 80)
            print(f"Category: {category}")
            print(f"Total Frequency: {stats['frequency']}")
            print("-" * 80)
            print("{:<10} | {:<68}".format("Frequency", "Error Message"))
            print("-" * 80)
            
            sorted_messages = sorted(
                [msg for msg in stats["messages"] if msg["message"].strip()],
                key=lambda x: x["frequency"],
                reverse=True
            )
            
            for msg_data in sorted_messages:
                message = msg_data["message"].strip()
                if len(message) > 65:
                    message = message[:62] + "..."
                
                print("{:<10} | {:<68}".format(
                    msg_data["frequency"],
                    message.replace("\n", " ")
                ))

def analyze_diagnostics(analyzer_instance):
    """Analyze diagnostic messages using the analyzer instance data."""
    print_category_statistics(
        analyzer_instance.global_message_frequency,
        error_categories
    )
    
def prepare_diagnostic_data(message_frequency: Dict[str, int]) -> List[dict]:
    """Convert message frequency dictionary to list of diagnostic data objects."""
    return [
        {
            "message": message,
            "frequency": frequency
        }
        for message, frequency in message_frequency.items()
    ]

def main():
    # USE CASE 
    # python scripts/analyze_diagnostics.py diagnostic_data verbose 
    # The raw data string from the prompt
    diagnostic_dir = sys.argv[1]
    verbose = sys.argv[2] == "verbose"
    analyzer = DiagnosticAnalyzer(diagnostic_dir, verbose)
    analyzer.load_diagnostic_files()
    
    # Generate and print the report
    report = analyzer.generate_report()
    # parsed_data = parse_error_data(report)
    print_category_statistics(
        analyzer.global_message_frequency,
        error_categories
    )
    # # Save the report to a file
    # with open('diagnostic_analysis_report.txt', 'w') as f:
    #     f.write(report)
    print(report)
    

if __name__ == "__main__":
    main() 