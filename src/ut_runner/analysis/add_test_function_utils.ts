function countLeadingWhitespace(s: string): number {
  const m = s.match(/^[ \t]+/);
  return m ? m[0].length : 0;
}

function deindentToColumn0(code: string): string {
  const lines = code.split('\n');
  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }
    minIndent = Math.min(minIndent, countLeadingWhitespace(line));
  }
  if (!Number.isFinite(minIndent) || minIndent <= 0) {
    return code.trim();
  }
  return lines
    .map(l => (l.trim() === '' ? '' : l.slice(Math.min(minIndent, l.length))))
    .join('\n')
    .trim();
}

function findMatchingBraceIndex(lines: string[], startLineIdx: number, startCharIdx: number): { endLineIdx: number; endCharIdx: number } | null {
  let balance = 0;
  let started = false;

  for (let i = startLineIdx; i < lines.length; i++) {
    const line = lines[i];
    const start = i === startLineIdx ? startCharIdx : 0;

    for (let j = start; j < line.length; j++) {
      const ch = line[j];
      if (ch === '{') {
        balance++;
        started = true;
      } else if (ch === '}') {
        balance--;
        if (started && balance === 0) {
          return { endLineIdx: i, endCharIdx: j };
        }
      }
    }
  }

  return null;
}

function extractJavaPrimaryTypeBody(javaSource: string, preferredTypeName?: string): string | null {
  const lines = javaSource.split('\n');
  const typeDeclRegex = preferredTypeName
    ? new RegExp(`^(\\s*)(?:public\\s+)?(?:abstract\\s+)?(?:class|interface|enum)\\s+${preferredTypeName}\\b`)
    : /^(\s*)(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)\b/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(typeDeclRegex);
    if (!m) {
      continue;
    }

    // Find first '{' starting from this line
    let braceLine = -1;
    let braceChar = -1;
    for (let j = i; j < lines.length; j++) {
      const idx = lines[j].indexOf('{');
      if (idx >= 0) {
        braceLine = j;
        braceChar = idx;
        break;
      }
    }
    if (braceLine < 0) {
      return null;
    }

    const end = findMatchingBraceIndex(lines, braceLine, braceChar);
    if (!end) {
      return null;
    }

    // Extract everything inside the outermost braces
    const bodyLines: string[] = [];
    // first line: after '{'
    bodyLines.push(lines[braceLine].slice(braceChar + 1));
    // middle lines
    for (let k = braceLine + 1; k < end.endLineIdx; k++) {
      bodyLines.push(lines[k]);
    }
    // last line: before matching '}'
    if (end.endLineIdx !== braceLine) {
      bodyLines.push(lines[end.endLineIdx].slice(0, end.endCharIdx));
    }

    const body = bodyLines.join('\n');
    return body;
  }

  return null;
}

/**
 * Java-specific cleanup: if the LLM returned a full Java file (package/import/class/etc),
 * extract only the class members and deindent to column 0 so we can safely insert into an existing class.
 */
export function sanitizeJavaFixedCodeForInsertion(testContent: string, fixedCode: string): string {
  const trimmed = fixedCode.trim();
  if (trimmed === '') {
    return trimmed;
  }

  const hasFileLevelStuff =
    /^\s*package\s+/m.test(trimmed) ||
    /^\s*import\s+/m.test(trimmed) ||
    /\b(class|interface|enum)\s+\w+/.test(trimmed);

  if (!hasFileLevelStuff) {
    return deindentToColumn0(trimmed);
  }

  const testTypeMatch = testContent.match(/(?:^|\n)\s*(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)\b/);
  const preferredTypeName = testTypeMatch?.[1];

  const body = extractJavaPrimaryTypeBody(trimmed, preferredTypeName);
  if (!body) {
    // Fallback: best-effort remove file-level directives and keep the rest.
    const filtered = trimmed
      .split('\n')
      .filter(l => !/^\s*package\s+/.test(l) && !/^\s*import\s+/.test(l))
      .join('\n');
    return deindentToColumn0(filtered);
  }

  const filteredBody = body
    .split('\n')
    .filter(l => !/^\s*package\s+/.test(l) && !/^\s*import\s+/.test(l))
    .join('\n');
  return deindentToColumn0(filteredBody);
}



