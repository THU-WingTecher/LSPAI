---
name: lsprag-opencode-lsp
description: Use when wiring OpenCode to LSPRAG LSP tools, running the LSP smoke test, or verifying LSP tool calls in OpenCode experiment logs.
---

# LSPRAG OpenCode LSP Tooling

Use this skill to set up and validate OpenCode LSP tool usage for this repo.

## Quick Start

1. Ensure provider auth is available (`DEEPSEEK_API_KEY` or `OPENAI_API_KEY`).
2. Install the opencode tool plugin if needed:
   - Run `scripts/install_opencode_lsp_tool.sh` to place `lsprag_lsp.ts` into `~/.config/opencode/tools/`.
3. Run the smoke test:
   - `npm run compile`
   - `node out/experiment/opencodeLspToolSmoke.js`
   - Expect: `Smoke test passed.`

## Experiment Usage

- Use the CLI with LSP tooling enabled (default):
  - `npm run experiment -- --type opencode ... --enable-lsp-tool true`
- To disable LSP tooling:
  - `--enable-lsp-tool false` or `OPENCODE_ENABLE_LSP_TOOL=false`
- The generator injects `LSP_TOOL_REQUIREMENT` guidance automatically.

## Verification Checklist

- Smoke test shows at least one tool call: `lsprag_lsp_*` or `lsp`.
- Tool output contains the expected symbol (e.g., `compute`).
- Experiment log JSON includes `toolCalls` and `lspToolCalls` arrays.

## Troubleshooting

- If opencode exits non-zero but tool output is valid, the smoke test still passes.
- If no tool calls appear:
  - Ensure `OPENCODE_EXPERIMENTAL_LSP_TOOL=true`.
  - Confirm `~/.config/opencode/tools/lsprag_lsp.ts` exists.
- If you see `fetch failed`, check network/proxy and provider keys.

## Key Files

- Smoke test: `src/experiment/opencodeLspToolSmoke.ts`
- Tool template: `skills/lsprag-opencode-lsp/assets/lsprag_lsp.ts`
- Installer: `skills/lsprag-opencode-lsp/scripts/install_opencode_lsp_tool.sh`
