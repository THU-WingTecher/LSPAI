const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: [
    'vscode',
    'tree-sitter',
    'tree-sitter-python',
    'tree-sitter-java',
    'tree-sitter-go',
    'tree-sitter-cpp',
    'tree-sitter-c',
    '@github/copilot-language-server',
    '@langchain/core',
    '@langchain/openai',
    '@opencode-ai/sdk',
    'openai',
    'ollama'
  ],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
  loader: {
    '.node': 'file'
  }
}).catch(() => process.exit(1));
