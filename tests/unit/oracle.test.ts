import { describe, expect, it } from 'vitest';
import { findRecipes, leafCount, type Recipe, recipeText } from '../../src/sim/oracle';

function evaluate(r: Recipe): number {
  if (r.kind === 'leaf') return r.value;
  const a = evaluate(r.a);
  const b = evaluate(r.b);
  return r.op === '+' ? a + b : r.op === '×' ? a * b : r.op === '−' ? a - b : NaN;
}

describe('oracle', () => {
  it('returns a deposit value as is', () => {
    expect(findRecipes(7, [1, 2, 7], ['+']).map(recipeText)).toEqual(['7']);
  });

  it('finds the shortest recipe first', () => {
    const r = findRecipes(48, [1, 2, 3, 4, 5, 6, 7, 8, 9], ['+', '×']);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => leafCount(x) === 2)).toBe(true);
    expect(r.map(recipeText)).toContain('6 × 8');
  });

  it('needs more leaves with fewer operators, and uses parentheses', () => {
    const r = findRecipes(47, [1, 2, 3, 4, 5, 6], ['+', '×']);
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(evaluate(x)).toBe(47);
    expect(recipeText(r[0] as Recipe)).toContain('(');
  });

  it('gives up beyond its limits', () => {
    expect(findRecipes(1_000_003, [1, 2], ['+'], { maxLeaves: 3 })).toEqual([]);
  });

  it('stays fast on a large search', () => {
    const t0 = performance.now();
    findRecipes(
      1_999_993,
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15],
      ['+', '×', '−', '÷', '%', '^'],
    );
    expect(performance.now() - t0).toBeLessThan(3_000);
  });
});
