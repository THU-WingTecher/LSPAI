# Testing Plan

## 1) Unit tests (portable core)

Target: `src/lsp/referenceCore.ts`

Create a small fake `ReferenceProvider` with:

- In-memory documents (strings).
- Deterministic symbol lists.
- Synthetic references pointing to the same or different files.

Validate:

- No references -> empty string.
- `skipTestCode=true` filters test-path URIs.
- `refWindow` stops after line budget.
- Original symbol location is skipped.
- Single-line reference blocks are ignored.

## 2) VS Code adapter integration

Target: `src/lsp/reference.ts` (adapter uses VS Code + LSPRAG LSP APIs).

Reuse existing tests and add a small regression if needed:

- `src/test/suite/lsp/token.test.ts`
- `src/test/suite/lsp/context.test.ts`

Confirm `getReferenceInfo` still returns usable snippets.

## 3) End-to-end (OpenCode)

Use the existing OpenCode flows to ensure tool calls work:

- Smoke test: `node out/experiment/opencodeLspToolSmoke.js`
- Full opencode tool test: `src/test/suite/lsp/opencodeToolTest.ts`

Success criteria:

- LSP tool call shows up (`lsprag_lsp_*` or `lsp`).
- Response contains expected symbol info.
