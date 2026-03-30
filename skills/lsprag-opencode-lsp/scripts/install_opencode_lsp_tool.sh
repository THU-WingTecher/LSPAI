#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_FILE="${SKILL_DIR}/assets/lsprag_lsp.ts"
DEST_DIR="${HOME}/.config/opencode/tools"
DEST_FILE="${DEST_DIR}/lsprag_lsp.ts"

if [[ ! -f "${SRC_FILE}" ]]; then
  echo "Source tool file not found: ${SRC_FILE}" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"
cp "${SRC_FILE}" "${DEST_FILE}"

echo "Installed LSPRAG LSP tool to ${DEST_FILE}"
