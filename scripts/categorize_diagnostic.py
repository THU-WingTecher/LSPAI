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
    "Empty or Unclear Error": {
        "keywords": [], # Special handling for empty or very short messages
        "patterns": [
            r"^$",  # Exactly empty message
            r"^[a-zA-Z0-9_.,;:(){}\[\]<>\"'*/&|\s-]{1,20}$" # Very short, possibly code snippets
        ],
        "description": "Error messages that are empty, or too short/generic to provide clear diagnostic information. Often indicates incomplete error reporting.",
        "example_context_needed": "Full error message, surrounding code, LLM prompt and full response."
    },
    "Redeclaration/Duplicate Definition": {
        "keywords": ["redeclared in this block", "other declaration of", "already declared"],
        "description": "Indicates that a variable, function, type, or other identifier has been defined more than once in the same scope.",
        "example_context_needed": "Code block where the redeclaration occurs, previous declarations of the same identifier, import statements if it's a package-level conflict."
    },
    "Import/Module Resolution Error": {
        "keywords": [
            "import", "could not be resolved", "no required module provides package",
            "imported and not used", "expected module name",
            "does not match the expected package" # Often related to file/package structure after an import
        ],
        "description": "Failures related to importing modules or packages, including modules not found, or modules imported but not utilized.",
        "example_context_needed": "Project structure (file paths, go.mod/pyproject.toml etc.), import statements, environment configuration (GOPATH, PYTHONPATH), version of external libraries."
    },
    "Syntax Error": {
        "keywords": [
            "syntax error", "misplaced construct", "expected", "unexpected token",
            "was not closed", "insert \"", "delete this token", "invalid compilationunit",
            "unexpected indentation", "unindent not expected", "invalid character constant"
        ],
        # "expected" is broad, so ensure it's checked after more specific categories
        "description": "Errors related to the grammatical structure of the code, such as incorrect punctuation, keywords, or statement formation.",
        "example_context_needed": "The line of code with the syntax error, surrounding lines for context, the specific language being used."
    },
    "Resolution Error (Type/Variable/Function Not Found)": {
        "keywords": [
            "cannot be resolved to a type", "is not defined", "undefined:", "cannot be resolved",
            "cannot find symbol" # Common Java variant
        ],
        "description": "The compiler/interpreter cannot find the definition for a type, variable, or function name being used.",
        "example_context_needed": "The code where the unresolved identifier is used, relevant import statements, declarations of the supposed identifier, scope information."
    },
    "Member Access/Usage Error (Field/Method/Visibility)": {
        "keywords": [
            "unknown field", "has no field or method", "is undefined for the type",
            "is not visible", "not a field", "no field or method",
            "undefined (type", # Go: c.name undefined (type *Command has no field or method name)
            "cannot assign to" # Go: cannot assign to cmd.findNext (neither addressable nor a map index expression)
        ],
        "description": "Attempting to access or use a field or method that does not exist on a given type/object, or is not accessible due to visibility rules (e.g., private/protected).",
        "example_context_needed": "The definition of the type/class, the line of code attempting the access, visibility modifiers (public, private, exported/unexported)."
    },
    "Type Mismatch/Compatibility Error": {
        "keywords": [
            "cannot use", "is not applicable for the arguments", "type mismatch",
            "incompatible with", "cannot convert", "cannot assign", "bound mismatch",
            "invalid operation:", # Go: invalid operation: cannot index commandFound.Args
            "incompatible types"
        ],
        "description": "An operation is attempted with incompatible data types, or a value of one type is used where another is expected.",
        "example_context_needed": "The types involved in the operation, function signatures, variable declarations, the specific operation being performed."
    },
    "Constructor Call Error": {
        "keywords": ["constructor", "cannot instantiate the type"],
        # "is undefined" is often part of this, but handled by "Member Access/Usage Error" if "constructor" isn't present.
        # So, if "constructor" AND "is undefined" are present, it's this.
        "description": "Issues with creating new objects, such as calling a non-existent constructor or one with incorrect arguments.",
        "example_context_needed": "The class definition (especially constructors), the line of code attempting instantiation, arguments passed to the constructor."
    },
    "File/Structural Error (e.g., Java package)": {
        "keywords": ["must be defined in its own file", "declared package .* does not match"],
        "description": "Errors related to how code is organized in files or packages, common in languages like Java (e.g., public class name must match filename).",
        "example_context_needed": "Filename, package declaration in the file, directory structure, class/type definition."
    },
    "Unhandled Exception": {
        "keywords": ["unhandled exception type"],
        "description": "The code may throw an exception that is not caught by a try-catch block or handled appropriately.",
        "example_context_needed": "The code that might throw the exception, call stack if available, type of exception."
    },
    # Fallback category - should be last
    "Other Error": {
        "keywords": [], # No specific keywords, acts as a catch-all
        "patterns": [],
        "description": "Errors that do not fit neatly into other predefined categories. May require more specific analysis.",
        "example_context_needed": "Full error message, surrounding code context, specific libraries or frameworks being used."
    }
}

def classify_error(message_obj, categories):
    msg_text = message_obj["message"].lower()
    freq = message_obj["frequency"]

    # Handle Empty or Unclear Error first using its patterns
    cat_details = categories["Empty or Unclear Error"]
    if not msg_text: # Truly empty
        return "Empty or Unclear Error"
    for pattern in cat_details.get("patterns", []):
        if re.match(pattern, message_obj["message"]): # Use original message for regex if needed
             # Add a check for very short messages that are just code snippets often with newlines
            if "\n" in message_obj["message"] and len(message_obj["message"]) < 150 : # Arbitrary length for snippets
                 return "Empty or Unclear Error" # Treat code snippets as unclear for now
            if not any(kw in msg_text for kw in ["error", "failed", "unable", "warning", "exception"]): # if no error-like keyword
                if len(msg_text.split()) < 5 : # and very few words
                    return "Empty or Unclear Error"


    for category_name, cat_details in categories.items():
        if category_name == "Empty or Unclear Error" or category_name == "Other Error": # Skip these for now, handle at end
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

def print_breif_category_statistics(parsed_data, categories):
    # Initialize frequency counter for each category
    category_stats = {category: 0 for category in categories.keys()}
    
    # Classify each error and count frequencies
    for data in parsed_data:
        category = classify_error(data, categories)
        category_stats[category] += data["frequency"]
    
    # Print table header
    print("\n{:<40} | {:<10}".format("Category", "Frequency"))
    print("-" * 52)
    
    # Print each category's statistics
    total_freq = 0
    for category, freq in category_stats.items():
        if freq > 0:  # Only show categories with non-zero frequency
            print("{:<40} | {:<10}".format(category, freq))
            total_freq += freq
    
    # Print total
    print("-" * 52)
    print("{:<40} | {:<10}".format("Total", total_freq))

def print_category_statistics(parsed_data, categories):
    # Initialize dictionaries to store both frequencies and messages
    category_stats = {category: {"frequency": 0, "messages": []} for category in categories.keys()}
    
    # Classify each error and collect frequencies and messages
    for data in parsed_data:
        category = classify_error(data, categories)
        category_stats[category]["frequency"] += data["frequency"]
        category_stats[category]["messages"].append({
            "message": data["message"],
            "frequency": data["frequency"]
        })
    
    # Print detailed statistics for each category
    total_freq = 0
    
    for category, stats in category_stats.items():
        if stats["frequency"] > 0:  # Only show categories with non-zero frequency
            # Print category header
            print("\n" + "=" * 80)
            print(f"Category: {category}")
            print(f"Total Frequency: {stats['frequency']}")
            print("-" * 80)
            print("{:<10} | {:<68}".format("Frequency", "Error Message"))
            print("-" * 80)
            
            # Print individual messages for this category
            for msg_data in stats["messages"]:
                # Truncate long messages to fit in the table
                message = msg_data["message"]
                if len(message) > 65:
                    message = message[:62] + "..."
                
                print("{:<10} | {:<68}".format(
                    msg_data["frequency"],
                    message.replace("\n", " ")  # Replace newlines with spaces
                ))
            
            total_freq += stats["frequency"]
    
    # Print grand total
    print("\n" + "=" * 80)
    print(f"Total Errors Across All Categories: {total_freq}")
    print("=" * 80)


if __name__ == "__main__":
    # Read and parse the data
    with open("/LSPRAG/diagnostic_analysis_report.txt", "r") as file:
        raw_data = file.read()
    parsed_data = parse_error_data(raw_data)
    
    # Print the categorization statistics
    print_breif_category_statistics(parsed_data, error_categories)
    print_category_statistics(parsed_data, error_categories)