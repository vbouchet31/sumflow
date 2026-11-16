import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every `.ts` file under a directory. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** A string literal holding a word of two letters or more (icons and symbols are fine). */
const WORDY = String.raw`(['"\`])(?=[^'"\`]*[A-Za-zÀ-ÿ]{2})[^'"\`]*\1`;

/** Places where a visible text ends up in the DOM. */
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`\.(?:textContent|innerText|title|placeholder|alt)\s*=\s*` + WORDY),
  new RegExp(String.raw`setAttribute\(\s*'(?:aria-label|title|placeholder|alt)'\s*,\s*` + WORDY),
  new RegExp(String.raw`\binnerHTML\s*=`),
  // el('tag', 'class', 'Some text')
  new RegExp(String.raw`\bel\(\s*'[a-z0-9]+'\s*,\s*[^,()]+,\s*` + WORDY),
  new RegExp(String.raw`\.(?:append|prepend|replaceChildren)\(\s*` + WORDY),
];

describe('UI texts', () => {
  it('no hard-coded visible text in src/ui (everything goes through t())', () => {
    const offenders: string[] = [];
    for (const file of files('src/ui')) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((raw, i) => {
          // Interpolations are code, not text: `${n}${tag}` is fine.
          const line = raw.replace(/\$\{[^}]*\}/g, '');
          if (PATTERNS.some((re) => re.test(line)))
            offenders.push(`${file}:${i + 1}: ${raw.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('the check catches a hard-coded text', () => {
    const bad = [
      "btn.textContent = 'Save';",
      "el('button', 'primary-btn', 'Continue')",
      "input.setAttribute('aria-label', 'Search')",
    ];
    for (const line of bad) expect(PATTERNS.some((re) => re.test(line))).toBe(true);
    expect(PATTERNS.some((re) => re.test("el('button', 'top-btn', icon)"))).toBe(false);
    expect(PATTERNS.some((re) => re.test("btn.textContent = '✕';"))).toBe(false);
  });
});
