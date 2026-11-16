import type { Page } from '@playwright/test';

export interface ContrastIssue {
  text: string;
  selector: string;
  ratio: number;
  color: string;
  background: string;
}

/**
 * Contrast of every visible piece of DOM text against its effective background (WCAG 2.1
 * relative luminance), with translucent layers composited over the canvas background.
 * Disabled controls are skipped, as WCAG does. Returns the texts under `min`.
 */
export async function contrastIssues(page: Page, min = 4.5): Promise<ContrastIssue[]> {
  // A fading toast would be measured half transparent: let animations finish first.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  return page.evaluate((minRatio) => {
    type Rgba = [number, number, number, number];
    const parse = (css: string): Rgba => {
      const m = css.match(/rgba?\(([^)]+)\)/);
      if (!m || !m[1]) return [0, 0, 0, 0];
      const p = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: 0 | 1 | 2): number =>
        (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const luminance = (c: Rgba): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const canvasBg = parse(getComputedStyle(document.body).backgroundColor);
    const issues: ContrastIssue[] = [];
    const root = document.getElementById('ui-root');
    if (!root) return issues;
    for (const node of root.querySelectorAll<HTMLElement>('*')) {
      const text = [...node.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!text || !node.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
        continue;
      if (node.closest(':disabled, [aria-disabled="true"]')) continue;
      // Background: every ancestor's colour, from the page up to the element.
      const chain: HTMLElement[] = [];
      for (let e: HTMLElement | null = node; e; e = e.parentElement) chain.unshift(e);
      let bg: Rgba = [canvasBg[0], canvasBg[1], canvasBg[2], 1];
      let opacity = 1;
      for (const e of chain) {
        const cs = getComputedStyle(e);
        opacity *= Number(cs.opacity);
        const c = parse(cs.backgroundColor);
        bg = over([c[0], c[1], c[2], c[3] * opacity], bg);
      }
      const fgRaw = parse(getComputedStyle(node).color);
      const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacity], bg);
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < minRatio) {
        issues.push({
          text: text.slice(0, 40),
          selector: `${node.tagName.toLowerCase()}.${node.className}`,
          ratio: Math.round(ratio * 100) / 100,
          color: getComputedStyle(node).color,
          background: `rgb(${bg.slice(0, 3).map(Math.round).join(', ')})`,
        });
      }
    }
    return issues;
  }, min);
}
