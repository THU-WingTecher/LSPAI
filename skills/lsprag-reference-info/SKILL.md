---
name: lsprag-reference-info
description: Use when exporting LSPRAG reference analysis (getReferenceInfo) as a standalone module or wiring it to custom LSP/MCP clients.
---

# LSPRAG Reference Info (Portable)

This skill packages the portable `getReferenceInfo` implementation so it can run outside VS Code.

## Install + Use

- See `skills/lsprag-reference-info/references/deployment.md` for step-by-step install and usage.

## Core Module

- Portable API: `src/lsp/referenceCore.ts`
- Exported function: `getReferenceInfo(document, range, provider, options)`
- You must provide a `ReferenceProvider` that connects to your LSP client or MCP server.

## Quick Wiring Guide

1. Implement `ReferenceProvider` for your environment:
   - `getReferences` (LSP references)
   - `openDocument` (text retrieval)
   - `getSymbols` (document symbols)
2. Call `getReferenceInfo` with your document and range.

## Deployment + Tests

- Deployment guide: `skills/lsprag-reference-info/references/deployment.md`
- Testing plan: `skills/lsprag-reference-info/references/testing-plan.md`
