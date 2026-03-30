import { tool } from "@opencode-ai/plugin"
import path from "path"

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Port of the LSPRAG LSP Tool Server (started by the VS Code extension).
 * When running, it provides richer LSP data (hover, dependencies, source)
 * by delegating to the VS Code language servers.
 */
const LSP_TOOL_SERVER_PORT = process.env.LSPRAG_TOOL_SERVER_PORT
  ? Number(process.env.LSPRAG_TOOL_SERVER_PORT)
  : 7777

const LSP_TOOL_SERVER_URL = `http://127.0.0.1:${LSP_TOOL_SERVER_PORT}`

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveFilePath(filePath: string, directory: string): string {
  if (filePath.startsWith("file://")) {
    return new URL(filePath).pathname
  }
  return path.isAbsolute(filePath) ? filePath : path.join(directory, filePath)
}

function toFileUri(filePath: string): string {
  if (filePath.startsWith("file://")) {
    return filePath
  }
  return `file://${filePath}`
}

function isEmptyLspOutput(output: string): boolean {
  const trimmed = output.trim()
  return trimmed === "" || trimmed === "[]" || trimmed === "null"
}

/**
 * Call the LSPRAG HTTP tool server. Returns parsed JSON or null if server is down.
 */
async function callLspToolServer(toolName: string, args: Record<string, string>): Promise<any | null> {
  try {
    const res = await fetch(`${LSP_TOOL_SERVER_URL}/tools/${toolName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Check if the LSPRAG tool server is running.
 */
async function isToolServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${LSP_TOOL_SERVER_URL}/health`)
    if (!res.ok) return false
    const data = await res.json()
    return data?.status === "ok"
  } catch {
    return false
  }
}

async function runBuiltInDocumentSymbols(filePath: string, directory: string): Promise<string> {
  const marker = "LSPRAG_DOC_SYMBOLS_DONE"
  const prompt = [
    "Use the built-in lsp tool exactly once.",
    `Operation must be documentSymbol for file path \"${filePath}\".`,
    `After the tool call, answer with exactly: ${marker}`,
  ].join(" ")

  const xdgConfigHome = (await Bun.$`mktemp -d`.text()).trim()

  try {
    const raw = await Bun.$`env -u OPENCODE_BASE_URL -u OPENCODE_SERVER_PASSWORD XDG_CONFIG_HOME=${xdgConfigHome} OPENCODE_EXPERIMENTAL_LSP_TOOL=true opencode run --agent build --format json --model deepseek/deepseek-chat --dir ${directory} ${prompt}`.text()

    const events = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)

    for (const event of events) {
      if (event.type !== "tool_use" || event.part?.tool !== "lsp") {
        continue
      }
      const stateOutput = event.part?.state?.output
      if (typeof stateOutput === "string" && stateOutput.trim() !== "") {
        return stateOutput.trim()
      }
      if (stateOutput && typeof stateOutput === "object") {
        return JSON.stringify(stateOutput)
      }
    }

    throw new Error("No built-in lsp tool output found in fallback run")
  } finally {
    await Bun.$`rm -rf ${xdgConfigHome}`.quiet()
  }
}

/**
 * Extract source code lines [startLine, endLine] (0-indexed, inclusive) from a file.
 */
async function extractSourceFromFile(filePath: string, startLine: number, endLine: number): Promise<string> {
  const content = await Bun.file(filePath).text()
  const lines = content.split("\n")
  return lines.slice(startLine, endLine + 1).join("\n")
}

/**
 * Find a symbol by name in the document-symbols JSON output.
 * Supports nested symbols (children).
 */
function findSymbolByName(symbols: any[], targetName: string): any | null {
  const target = targetName.toLowerCase()
  for (const sym of symbols) {
    if (sym.name?.toLowerCase() === target) return sym
    if (sym.children?.length) {
      const found = findSymbolByName(sym.children, targetName)
      if (found) return found
    }
  }
  return null
}

// ── Tools ──────────────────────────────────────────────────────────────────────

export const document_symbols = tool({
  description: "LSPRAG: fetch LSP document symbols for a file",
  args: {
    filePath: tool.schema.string().describe("Absolute path, relative path, or file:// URI"),
  },
  async execute(args, context) {
    const absolutePath = resolveFilePath(args.filePath, context.directory)
    const uri = toFileUri(absolutePath)

    // Try LSPRAG tool server first (more structured output)
    const serverResult = await callLspToolServer("getAllSymbols", { filePath: absolutePath })
    if (serverResult?.symbols) {
      return JSON.stringify(serverResult.symbols, null, 2)
    }

    // Fall back to opencode debug lsp
    const output = await Bun.$`opencode debug lsp document-symbols ${uri}`.text()
    const trimmed = output.trim()
    if (!isEmptyLspOutput(trimmed)) {
      return trimmed
    }

    return await runBuiltInDocumentSymbols(args.filePath, context.directory)
  },
})

export const diagnostics = tool({
  description: "LSPRAG: fetch LSP diagnostics (errors and warnings) for a file",
  args: {
    filePath: tool.schema.string().describe("Absolute path, relative path, or file:// URI"),
  },
  async execute(args, context) {
    const absolutePath = resolveFilePath(args.filePath, context.directory)

    // Try LSPRAG tool server first
    const serverResult = await callLspToolServer("getDiagnostics", { filePath: absolutePath })
    if (serverResult?.diagnostics) {
      return JSON.stringify(serverResult.diagnostics, null, 2)
    }

    // Fall back to opencode debug lsp
    const output = await Bun.$`opencode debug lsp diagnostics ${absolutePath}`.text()
    return output.trim()
  },
})

export const workspace_symbols = tool({
  description: "LSPRAG: search LSP workspace symbols",
  args: {
    query: tool.schema.string().describe("Workspace symbol query"),
  },
  async execute(args) {
    const output = await Bun.$`opencode debug lsp symbols ${args.query}`.text()
    return output.trim()
  },
})

export const symbol_source = tool({
  description:
    "LSPRAG: get the source code of a specific function, method, or class from a file. " +
    "Uses LSP to find the symbol's range and returns its exact source code.",
  args: {
    filePath: tool.schema.string().describe("Absolute path or relative path to the source file"),
    symbolName: tool.schema.string().describe("Name of the function, method, or class to retrieve"),
  },
  async execute(args, context) {
    const absolutePath = resolveFilePath(args.filePath, context.directory)

    // Try LSPRAG tool server (VS Code extension must be running)
    const serverResult = await callLspToolServer("getSymbolSource", {
      filePath: absolutePath,
      symbolName: args.symbolName,
    })
    if (serverResult?.source) {
      return `// ${args.symbolName} (${serverResult.kind}, lines ${serverResult.startLine + 1}–${serverResult.endLine + 1})\n${serverResult.source}`
    }
    if (serverResult?.error) {
      return `Error: ${serverResult.error}`
    }

    // Fallback: get document symbols and extract range manually
    const uri = toFileUri(absolutePath)
    let symbolsJson = await Bun.$`opencode debug lsp document-symbols ${uri}`.text()
    if (isEmptyLspOutput(symbolsJson.trim())) {
      try {
        symbolsJson = await runBuiltInDocumentSymbols(args.filePath, context.directory)
      } catch {
        return `Could not retrieve symbols for ${absolutePath}`
      }
    }

    let symbols: any[]
    try {
      symbols = JSON.parse(symbolsJson.trim())
    } catch {
      return `Could not parse document symbols: ${symbolsJson.substring(0, 100)}`
    }

    const symbol = findSymbolByName(Array.isArray(symbols) ? symbols : [], args.symbolName)
    if (!symbol) {
      return `Symbol '${args.symbolName}' not found in ${absolutePath}`
    }

    const startLine: number = symbol.range?.start?.line ?? symbol.location?.range?.start?.line ?? 0
    const endLine: number = symbol.range?.end?.line ?? symbol.location?.range?.end?.line ?? startLine

    const source = await extractSourceFromFile(absolutePath, startLine, endLine)
    return `// ${args.symbolName} (lines ${startLine + 1}–${endLine + 1})\n${source}`
  },
})

export const hover_info = tool({
  description:
    "LSPRAG: get hover documentation and type signature for a symbol. " +
    "Returns the type information and docstring from the language server.",
  args: {
    filePath: tool.schema.string().describe("Absolute path or relative path to the source file"),
    symbolName: tool.schema.string().describe("Name of the symbol to get hover information for"),
  },
  async execute(args, context) {
    const absolutePath = resolveFilePath(args.filePath, context.directory)

    // Requires LSPRAG tool server (VS Code extension)
    const serverResult = await callLspToolServer("getHover", {
      filePath: absolutePath,
      symbolName: args.symbolName,
    })
    if (serverResult?.hover) {
      return serverResult.hover
    }
    if (serverResult?.error) {
      return `Error: ${serverResult.error}`
    }

    return `Hover info not available. Ensure the LSPRAG VS Code extension is running (tool server at port ${LSP_TOOL_SERVER_PORT}).`
  },
})

export const symbol_dependencies = tool({
  description:
    "LSPRAG: analyze dependencies of a function or method — what external symbols it calls, " +
    "what types it uses, and its parent class context. Useful for understanding what to mock in tests.",
  args: {
    filePath: tool.schema.string().describe("Absolute path or relative path to the source file"),
    symbolName: tool.schema.string().describe("Name of the function or method to analyze"),
  },
  async execute(args, context) {
    const absolutePath = resolveFilePath(args.filePath, context.directory)

    // Requires LSPRAG tool server (VS Code extension)
    const serverResult = await callLspToolServer("getDependencies", {
      filePath: absolutePath,
      symbolName: args.symbolName,
    })
    if (serverResult && !serverResult.error) {
      return JSON.stringify(serverResult, null, 2)
    }
    if (serverResult?.error) {
      return `Error: ${serverResult.error}`
    }

    return `Dependency analysis not available. Ensure the LSPRAG VS Code extension is running (tool server at port ${LSP_TOOL_SERVER_PORT}).`
  },
})

export const tool_server_status = tool({
  description:
    "LSPRAG: check whether the LSPRAG LSP tool server is running. " +
    "The server provides richer symbol_source, hover_info, and symbol_dependencies tools. " +
    "It is started by the LSPRAG VS Code extension.",
  args: {},
  async execute() {
    const running = await isToolServerRunning()
    if (running) {
      return `LSPRAG tool server is running at ${LSP_TOOL_SERVER_URL}. ` +
        `Enhanced tools available: symbol_source, hover_info, symbol_dependencies.`
    }
    return `LSPRAG tool server is NOT running (expected at ${LSP_TOOL_SERVER_URL}). ` +
      `Basic tools (document_symbols, diagnostics, workspace_symbols, symbol_source fallback) still work. ` +
      `Start it via the LSPRAG VS Code extension.`
  },
})
