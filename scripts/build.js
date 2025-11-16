const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Clean out directory first - remove all old .js files (but keep .map files for debugging)
function cleanOutDir(dir) {
  if (!fs.existsSync(dir)) return;
  
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      cleanOutDir(filePath);
    } else if (file.endsWith('.js') && file !== 'extension.js') {
      // Remove old compiled .js files, but keep the bundled extension.js
      fs.unlinkSync(filePath);
    }
  });
}

cleanOutDir(path.join(__dirname, '..', 'out'));

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: [
    'vscode',
    // Keep tree-sitter packages external as they have native bindings
    'tree-sitter',
    'tree-sitter-python',
    'tree-sitter-java',
    'tree-sitter-go',
    'tree-sitter-cpp',
    'tree-sitter-c',
    '@github/copilot-language-server',
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
  // All dependencies not in 'external' will be bundled automatically
}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
