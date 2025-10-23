LSPRAG is designed by a goal "Minimum effort for supporting other language."
Therefore, it is quite easy to support other programming language. 
The specific step follows below :
1. [Optional, but Recommended] Unit Test Template
   - Every language has its unit test template and trandition. 
   - For example, for Golang, test file should ends with `_test` and test Function should start with big letter. 
   - Therefore, it is recommended to configure the template for programming language. 
   - You can edit language-agnostic template at [here](../src/prompts/languageTemplateManager.ts)
   - For file name trandition, please see here(?).

2. [Optional, but Recommended] CFG path collection
   1. Refering go.path.test.ts, and *.cfg.test.ts, generate test file 
   2. AST keyword matching 
   
3. Check Language Server usable
   1. Diagnosis checking
   2. Semantic Token checking 