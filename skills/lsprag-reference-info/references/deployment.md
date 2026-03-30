# Deployment Guide (Agent Community)

This module exposes a portable `getReferenceInfo` in `src/lsp/referenceCore.ts`. The only runtime requirement is that you supply a `ReferenceProvider` implementation for your environment (VS Code, custom LSP client, MCP server, etc.).

## Skill Packaging (agentskills-style)

If you package this as an agent skill, follow the common skill layout:

```
skills/lsprag-reference-info/
├── SKILL.md
├── agents/openai.yaml
└── references/
    ├── deployment.md
    └── testing-plan.md
```

Install locations used by popular agents (mirroring the community skill layout):

- Claude Code: `~/.claude/skills/`
- Gemini: `~/.gemini/skills/`
- Codex: `~/.codex/skills/`
- OpenCode: `~/.config/opencode/skill/`

## Minimal Node Integration

1. Import the portable function:

```ts
import { getReferenceInfo, ReferenceProvider } from "./src/lsp/referenceCore";
```

2. Provide a `ReferenceProvider` that delegates to your LSP client:

```ts
const provider: ReferenceProvider = {
  getReferences: async (doc, pos) => lspClient.references(doc.uri, pos),
  openDocument: async (uri) => ({ uri, getText: () => fs.readFileSync(uri, "utf8") }),
  getSymbols: async (uri) => lspClient.documentSymbols(uri),
};
```

3. Call:

```ts
const info = await getReferenceInfo(document, range, provider, { refWindow: 60 });
```

## MCP Packaging (optional)

If you expose this as an MCP server, follow the standard `mcpServers` configuration flow:

1. Build a small MCP server binary (Node or Go) that wraps `getReferenceInfo`.
2. Add an MCP config entry pointing to the binary:

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

3. Restart your agent, then verify the tools are listed.

## References

- https://github.com/lsp-client/lsp-skill
- https://github.com/DeusData/codebase-memory-mcp
