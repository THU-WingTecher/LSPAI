# TypeScript API for Claude Code Router

The TypeScript implementation (`src/claudeCodeRouter.ts`) provides the same functionality as the bash scripts.

## Quick Comparison

### Bash
```bash
cd scripts/claude-code-router
./example-consistent-prompts.sh
```

### TypeScript
```bash
npm run compile
node out/examples/claudeCodeRouterExample.js 2
```

## TypeScript API

```typescript
import { ClaudeCodeRouterManager, generateUUID } from './src/claudeCodeRouter';

// Create manager
const manager = new ClaudeCodeRouterManager({
    sessionId: generateUUID(),
    outputDir: './outputs'
});

// Run single prompt
await manager.runPrompt('Generate a unit test');

// Run multiple prompts (same session)
await manager.runPrompts([
    'Generate factorial function',
    'Write unit test for it',
    'Add error handling'
]);

// Run batch
await manager.runBatch([
    { name: 'test1', prompt: 'Prompt 1' },
    { name: 'test2', prompt: 'Prompt 2' }
]);

// Run batch from file
await manager.runBatchFromFile('./batch-prompts-example.json');
```

## Key Features

- ✅ Auto-generates valid UUIDs
- ✅ Saves JSON + TXT outputs
- ✅ Session continuity
- ✅ Batch processing
- ✅ No LLM UI interaction

## Usage

```bash
# Compile
npm run compile

# Run examples
node out/examples/claudeCodeRouterExample.js [1|2|3|4|5|all]

# Run tests
node out/test/manual/cc_runner.js
```

## Files Created

- `src/claudeCodeRouter.ts` - Main TypeScript API
- `src/examples/claudeCodeRouterExample.ts` - Usage examples
- `src/test/manual/cc_runner.ts` - Test runner
- `docs/ClaudeCodeRouter.md` - Full documentation

## Documentation

See: `docs/ClaudeCodeRouter.md`
