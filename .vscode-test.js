// .vscode-test.js
const { defineConfig } = require('@vscode/test-cli');
console.log('.vscode-test.js Running test configuration');
module.exports = defineConfig([
    {
      label: 'unitTests',
      files: 'out/test/**/*.test.js',
      version: 'insiders',
      workspaceFolder: './vscode-llm-ut',
      mocha: {
        ui: 'tdd',
        timeout: 20000
      }
    }
    // you can specify additional test configurations, too
  ]);