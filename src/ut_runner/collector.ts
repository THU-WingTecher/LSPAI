// src/ut_runner/collector.ts
import * as fs from 'fs';
import * as path from 'path';
import { TestFile } from './types';

function globToRegExp(glob: string): RegExp {
  // Very small glob: only supports '*' wildcard, matches file name only
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function* walk(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(p);
    } else if (e.isFile()) {
      yield p;
    }
  }
}

export class Collector {
  private language: string;
  private includePatterns: string[];

  constructor(language: string = 'python', includePatterns?: string[] | null) {
    this.language = language;
    this.includePatterns =
      includePatterns && includePatterns.length
        ? includePatterns
        : language === 'python'
        ? ['*_test.py', 'test_*.py']
        : [];
  }

  collect(testsDir: string): TestFile[] {
    const absDir = path.resolve(testsDir);
    const regs = this.includePatterns.map(globToRegExp);
    const files: string[] = [];
    const seen = new Set<string>();

    for (const filePath of walk(absDir)) {
      const base = path.basename(filePath);
      if (regs.some((r) => r.test(base))) {
        const real = fs.realpathSync(filePath);
        if (!seen.has(real)) {
          seen.add(real);
          files.push(real);
        }
      }
    }

    files.sort((a, b) => a.localeCompare(b));
    return files.map((f) => ({ path: f, language: this.language }));
  }
}