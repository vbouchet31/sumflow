import { formatFull } from '../../core/format';
import { getLocale, t } from '../../i18n';
import { itemColor } from '../../render/itemColor';
import {
  extractableValues,
  findRecipes,
  leafCount,
  opCount,
  type Recipe,
  unlockedOps,
} from '../../sim/oracle';
import type { World } from '../../sim/world';
import { el } from '../dom';
import { Panel } from './panel';

/** Targets shown: the current level and the next ones. */
const TARGETS = 3;

/** Recipe as chips: numbers as coloured discs (like items on belts), operators in between. */
function recipeNode(r: Recipe, top = true): HTMLElement {
  if (r.kind === 'leaf') {
    const chip = el('span', 'oracle-num', String(r.value));
    chip.style.background = itemColor(r.value);
    return chip;
  }
  const box = el(
    'span',
    top ? 'oracle-expr' : 'oracle-group',
    recipeNode(r.a, false),
    el('span', 'oracle-op', r.op),
    recipeNode(r.b, false),
  );
  return box;
}

/**
 * Oracle panel (proposal 05): for the current target and the next ones, the shortest ways
 * to build them from the deposits that can be extracted, with the operators unlocked.
 */
export class OraclePanel extends Panel {
  private readonly list = el('div', 'oracle-list');
  private key = '';

  constructor(
    parent: HTMLElement,
    private readonly world: World,
  ) {
    super(parent, 'oracle.title', 'oracle-panel');
    this.content.append(el('p', 'oracle-intro', t('oracle.intro')), this.list);
  }

  update(force = false): void {
    if (!force && !this.isOpen) return;
    const { state } = this.world;
    const loc = getLocale();
    const targets: { level: number; value: number }[] = [];
    if (state.levelRequirement) {
      for (let n = state.level; n < state.level + TARGETS; n++) {
        const def = state.levels[n - 1];
        if (def) targets.push({ level: n, value: def.target });
      }
    }
    const ops = unlockedOps(state);
    const bases = extractableValues(state);
    const key = `${targets.map((x) => x.value).join(',')}|${ops.join('')}|${bases.length}|${loc}`;
    if (!force && key === this.key) return;
    this.key = key;
    const cards = targets.map(({ level, value }) => {
      const recipes = findRecipes(value, bases, ops);
      const head = el(
        'div',
        'oracle-head',
        el('span', 'oracle-level', t('hud.level', { n: level })),
        el('span', 'oracle-target', formatFull(value, loc)),
      );
      const body =
        recipes.length === 0
          ? [el('p', 'oracle-none', t('oracle.none'))]
          : recipes.map((r) =>
              el(
                'div',
                'oracle-row',
                recipeNode(r),
                el(
                  'span',
                  'oracle-cost',
                  t('oracle.cost', { ops: opCount(r), leaves: leafCount(r) }),
                ),
              ),
            );
      return el(
        'article',
        level === state.level ? 'oracle-card current' : 'oracle-card',
        head,
        ...body,
      );
    });
    if (cards.length === 0) cards.push(el('p', 'oracle-none', t('hub.freePlay')));
    this.list.replaceChildren(...cards);
  }
}
