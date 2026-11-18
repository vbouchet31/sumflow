/**
 * Screen layouts (PLAN-tactile §5.5). One place for the breakpoints: each query that
 * matches puts a class on `<html>`, and the style sheet is written against those classes.
 * - `ui-icons`: not wide enough for the build bar with its labels, icons only.
 * - `ui-compact`: a phone, either way up: one-line HUD, panels as sheets.
 * - `ui-narrow`: a phone held upright: the top bar folds its less used buttons away.
 * - `ui-rail`: a phone held sideways: height is what is short, so the top bar becomes a
 *   two-column rail on the right edge and the map gets the full height between the bars.
 */
export const LAYOUT_QUERIES = {
  icons: '(max-width: 1200px)',
  compact: '(max-height: 500px), (max-width: 600px)',
  narrow: '(max-width: 600px)',
  rail: '(max-height: 500px) and (min-width: 601px)',
} as const;

export type LayoutName = keyof typeof LAYOUT_QUERIES;
export type LayoutState = Record<LayoutName, boolean>;

/**
 * Keep the layout classes of `target` in sync with the screen (size, rotation). `onChange`
 * is called at once and after every change.
 */
export function watchLayout(target: HTMLElement, onChange?: (state: LayoutState) => void): void {
  const names = Object.keys(LAYOUT_QUERIES) as LayoutName[];
  const queries = names.map((name) => window.matchMedia(LAYOUT_QUERIES[name]));
  const apply = (): void => {
    const state = {} as LayoutState;
    names.forEach((name, i) => {
      state[name] = queries[i]?.matches ?? false;
      target.classList.toggle(`ui-${name}`, state[name]);
    });
    onChange?.(state);
  };
  for (const q of queries) q.addEventListener('change', apply);
  apply();
}
