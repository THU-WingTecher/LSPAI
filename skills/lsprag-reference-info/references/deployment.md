# Deployment Guide (Agent Community)

This module exposes a portable `getReferenceInfo` in `src/lsp/referenceCore.ts`. It runs anywhere as long as you provide a `ReferenceProvider` that talks to your LSP client or MCP server.

## Install the Skill

Pick your agent and install the skill folder:

1. Copy or symlink `skills/lsprag-reference-info/` into your agent’s skills directory.
2. Restart your agent.

Common install locations (community convention):

- Claude Code: `~/.claude/skills/`
- Gemini: `~/.gemini/skills/`
- Codex: `~/.codex/skills/`
- OpenCode: `~/.config/opencode/skill/`

Example for Codex:

```bash
mkdir -p ~/.codex/skills
ln -s /absolute/path/to/skills/lsprag-reference-info ~/.codex/skills/lsprag-reference-info
```

## Use from Code (Minimal Node Integration)

1. Import the portable function:

```ts
import { getReferenceInfo, ReferenceProvider } from "./src/lsp/referenceCore";
```

2. Provide a `ReferenceProvider` backed by your LSP client:

```ts
const provider: ReferenceProvider = {
  getReferences: async (doc, pos) => lspClient.references(doc.uri, pos),
  openDocument: async (uri) => ({ uri, getText: () => fs.readFileSync(uri, "utf8") }),
  getSymbols: async (uri) => lspClient.documentSymbols(uri),
};
```

3. Call the function:

```ts
const info = await getReferenceInfo(document, range, provider, { refWindow: 60 });
```

## Use from MCP (Optional)

Wrap `getReferenceInfo` in a small MCP server and register it in your agent config:

```json
{
  "mcpServers": {
    "lsprag-reference-info": {
      "command": "/path/to/lsprag-reference-info",
      "args": []
    }
  }
}
```

Restart your agent, then confirm the tools show up.

## References

- https://github.com/lsp-client/lsp-skill
- https://github.com/DeusData/codebase-memory-mcp
