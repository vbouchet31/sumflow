/**
 * Reports of a run (PLAN-objets §3.3): Markdown for the terminal, a detailed JSON for the
 * `sim-reports/` folder. Pure functions: the CLI prints and writes them.
 */
import { CARDS } from '../config/cards';
import { BAND_SIZE } from './config';
import {
  CRITERION_IDS,
  type CriterionResult,
  type Exposure,
  median,
  type ObjectEvaluation,
  quantile,
  socleInfo,
  thresholdsOf,
} from './criteria';
import type { RunResult, StrategyRun } from './run';

/** Level bands `[from, to]` of a run: 1–10, 11–20, …, the last one ending at `maxLevel`. */
export function bands(maxLevel: number): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 1; a <= maxLevel; a += BAND_SIZE)
    out.push([a, Math.min(maxLevel, a + BAND_SIZE - 1)]);
  return out;
}

export interface BandStats {
  from: number;
  to: number;
  median: number;
  p10: number;
  p90: number;
}

/** Index quantiles of a strategy, pooled over its games and the levels of each band. */
export function bandStats(run: StrategyRun, maxLevel: number): BandStats[] {
  return bands(maxLevel).map(([from, to]) => {
    const xs: number[] = [];
    for (const ix of run.index)
      for (let l = from; l <= to; l++) {
        const x = ix[l - 1];
        if (x !== undefined) xs.push(x);
      }
    return { from, to, median: quantile(xs, 0.5), p10: quantile(xs, 0.1), p90: quantile(xs, 0.9) };
  });
}

/** Median over the games of the median index after the first pick of `card` (null: never). */
export function indexAfterPick(run: StrategyRun, card: string): number | null {
  const per: number[] = [];
  run.games.forEach((g, i) => {
    const first = g.picks.find((p) => p.card === card)?.level;
    const after = first === undefined ? [] : (run.index[i] ?? []).slice(first);
    if (after.length > 0) per.push(median(after));
  });
  return per.length > 0 ? median(per) : null;
}

const fmt = (x: number, d = 2): string => (Number.isFinite(x) ? x.toFixed(d) : '∞');
const pct = (x: number): string => `${Math.round(x * 100)} %`;

/** "12 s", "8 min", "2,5 h". */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1).replace('.', ',')} h`;
}

function cell(c: CriterionResult): string {
  if (c.status === 'n/a') return 'n/a';
  return `${c.status === 'pass' ? '✓' : '✗'} ${pct(c.value)}`;
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (r: readonly string[]): string => `| ${r.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

const KIND: Record<string, string> = {
  value: 'valeur',
  unlock: 'déblocage',
  feature: 'fonction',
  special: 'bâtiment spécial',
  edition: 'édition',
  passive: 'passif',
  meta: 'méta',
};

/** Median index after the first pick of `card` with the strategy `name`, or null. */
function afterPick(result: RunResult, name: string, card: string): number | null {
  const run = result.runs.get(name);
  return run ? indexAfterPick(run, card) : null;
}

/** Notes explaining a verdict, readable by the author. */
export function objectNotes(e: ObjectEvaluation, result: RunResult): string[] {
  const notes: string[] = [];
  if (e.placeholder) notes.push('objet factice : hors verdict, signalé à part');
  if (e.unmodeled) notes.push(`critère 2 n/a (non modélisé : ${e.unmodeled})`);
  const once = afterPick(result, `once:${e.card}`, e.card);
  const every = afterPick(result, `object:${e.card}`, e.card);
  const useful = e.criteria.useful;
  if (once !== null && useful.status === 'fail' && once > 1) {
    notes.push(
      `le prendre au lieu de la carte qu’il remplace coûte plus qu’il ne rapporte dans le modèle (indice médian ${fmt(once)} après la prise, \`once\`)`,
    );
  } else if (once !== null && useful.status === 'fail') {
    notes.push(
      `effet faible ou nul dans le modèle : indice médian ${fmt(once)} après la prise (\`once\` ; 1 = la référence)`,
    );
  } else if (once !== null && useful.status === 'pass' && once > 0.97) {
    notes.push(
      `utile mais de peu : indice médian ${fmt(once)} après la prise (\`once\` ; le critère 2 demande seulement un indice sous ${thresholdsOf(e.card).useful.below})`,
    );
  }
  if (once !== null && every !== null && every > once + 0.05)
    notes.push(
      `le prendre à chaque offre coûte des cartes du fil rouge (indice médian ${fmt(every)} avec \`object\`, ${fmt(once)} avec \`once\`)`,
    );
  for (const k of CRITERION_IDS) {
    const c = e.criteria[k];
    if (c.note && !(k === 'useful' && e.unmodeled))
      notes.push(`critère ${CRITERION_IDS.indexOf(k) + 1} : ${c.note}`);
  }
  const visible = e.criteria.visible;
  if (visible.status === 'fail')
    notes.push(
      `critère 3 : offert ${visible.value > 0.5 ? 'trop souvent' : 'trop rarement'} avant le niveau ${e.benchmark} (le bouton \`weightScale\` agit sur ce critère)`,
    );
  return notes;
}

export interface ReportHeader {
  title: string;
  /** Extra lines under the title (tuning values, command). */
  lines?: readonly string[];
}

/** Markdown report of a run and its object evaluations. */
export function markdownReport(
  result: RunResult,
  evals: readonly ObjectEvaluation[],
  header: ReportHeader,
): string {
  const out: string[] = [];
  const nGames = [...result.runs.values()].reduce((s, r) => s + r.games.length, 0);
  const first = result.seeds[0] ?? 0;
  const last = result.seeds[result.seeds.length - 1] ?? 0;
  out.push(`# ${header.title}`, '');
  out.push(
    `Graines ${first} à ${last} (${result.seeds.length} par stratégie), niveaux 1 à ${result.maxLevel}, ` +
      `${result.runs.size} stratégies, ${nGames} parties. ` +
      `Temps : ${(result.ms / 1000).toFixed(1)} s (${result.tables} tables de coût pour ${result.levels} niveaux).`,
  );
  for (const l of header.lines ?? []) out.push('', l);
  out.push('');

  const natural = result.runs.get('natural');
  const bs = bands(result.maxLevel);
  if (natural) {
    out.push('## Référence (`natural`) : temps d’un niveau dans le modèle (médiane)', '');
    const times = bs.map(([from, to]) => {
      const xs: number[] = [];
      for (const g of natural.games)
        for (let l = from; l <= to; l++) {
          const t = g.times[l - 1];
          if (t !== undefined) xs.push(t);
        }
      return duration(median(xs));
    });
    out.push(
      table(
        bs.map(([a, b]) => `${a}–${b}`),
        [times],
      ),
      '',
    );
  }

  out.push(
    '## Indice de difficulté par stratégie',
    '',
    'Temps du niveau / temps de la partie `natural` de même graine, au même niveau : médiane (p10–p90) par tranche de niveaux. Sous 1, la partie est plus facile que la référence.',
    '',
  );
  const rows = [...result.runs.values()].map((run) => [
    `\`${run.strategy}\``,
    ...bandStats(run, result.maxLevel).map((b) => `${fmt(b.median)} (${fmt(b.p10)}–${fmt(b.p90)})`),
  ]);
  out.push(table(['Stratégie', ...bs.map(([a, b]) => `${a}–${b}`)], rows), '');

  const head = [
    'Objet',
    'Genre',
    'Repère',
    'Offert',
    '1re offre',
    'Pris (nat. / rand. / new / objet / once)',
    'Indice après prise (once / objet)',
    '1. Pas indispensable',
    '2. Pas inutile',
    '3. Visible',
    'Verdict',
  ];
  const picked = (ex: Record<string, Exposure>, names: readonly string[]): string =>
    names
      .map((name) => {
        const x = ex[name];
        return x ? pct(x.picked) : '–';
      })
      .join(' / ');
  const objectRow = (e: ObjectEvaluation): string[] => {
    const def = CARDS.find((c) => c.id === e.card);
    const obj = e.exposure[`object:${e.card}`];
    const once = afterPick(result, `once:${e.card}`, e.card);
    const every = afterPick(result, `object:${e.card}`, e.card);
    return [
      `\`${e.card}\``,
      KIND[def?.effect.kind ?? ''] ?? '',
      String(e.benchmark),
      obj ? pct(obj.offered) : '–',
      obj?.firstOffer != null ? `niv. ${Math.round(obj.firstOffer)}` : '–',
      picked(e.exposure, ['natural', 'random', 'new', `object:${e.card}`, `once:${e.card}`]),
      `${once === null ? '–' : fmt(once)} / ${every === null ? '–' : fmt(every)}`,
      cell(e.criteria.essential),
      cell(e.criteria.useful),
      cell(e.criteria.visible),
      e.pass ? '**OK**' : '**à revoir**',
    ];
  };
  const real = evals.filter((e) => !e.placeholder);
  const fake = evals.filter((e) => e.placeholder);
  if (real.length > 0) {
    out.push('## Objets du catalogue : critères du §4', '');
    out.push(table(head, real.map(objectRow)), '');
  }
  if (fake.length > 0) {
    out.push('## Objets factices (signalés à part, hors verdict)', '');
    out.push(table(head, fake.map(objectRow)), '');
  }
  const socle = socleInfo(result);
  if (socle.length > 0) {
    out.push(
      '## Socle (fil rouge), pour information',
      '',
      'Les cartes de la suite naturelle (`naturalSequence()`) sont le chemin de référence du jeu : les critères ne s’y appliquent pas, elles ne comptent ni dans le verdict ni comme régression.',
      '',
    );
    out.push(
      table(
        [
          'Carte',
          'Genre',
          'Fil rouge',
          'Offert (natural)',
          '1re offre (natural)',
          'Pris (nat. / rand. / new / minimal)',
        ],
        socle.map((x) => {
          const def = CARDS.find((c) => c.id === x.card);
          const nat = x.exposure.natural;
          return [
            `\`${x.card}\``,
            KIND[def?.effect.kind ?? ''] ?? '',
            `niv. ${x.naturalLevel}`,
            nat ? pct(nat.offered) : '–',
            nat?.firstOffer != null ? `niv. ${Math.round(nat.firstOffer)}` : '–',
            picked(x.exposure, ['natural', 'random', 'new', 'minimal']),
          ];
        }),
      ),
      '',
    );
  }
  const notes = evals.flatMap((e) => {
    const n = objectNotes(e, result);
    return n.length > 0 ? [`- \`${e.card}\` : ${n.join(' ; ')}.`] : [];
  });
  if (notes.length > 0) out.push('## Notes', '', ...notes, '');
  const failed = real.filter((e) => !e.pass).map((e) => `\`${e.card}\``);
  out.push(
    '## Légende',
    '',
    '- **Stratégies** : `object:<id>` prend l’objet à chaque offre (critères 1 et 3), `once:<id>` la première fois seulement, puis joue `natural` (critère 2).',
    '- **Offert** : parties où l’objet apparaît au moins une fois dans une offre (stratégie `object`) ; **1re offre** : niveau médian de sa première apparition ; **Pris** : parties où il est pris au moins une fois, par stratégie ; **Indice après prise** : médiane des parties de la médiane de l’indice après la 1re prise.',
    `- **1. Pas indispensable** : ${real[0]?.criteria.essential.target ?? 'voir config.ts'}. **2. Pas inutile** : ${real[0]?.criteria.useful.target ?? ''}. **3. Visible** : part des parties où il est offert avant son niveau repère, attendue entre les bornes (seuils dans \`src/simtools/config.ts\`).`,
    '',
    failed.length > 0
      ? `**Verdict** : ${real.length - failed.length} objets sur ${real.length} respectent les critères ; à revoir : ${failed.join(', ')}.`
      : `**Verdict** : les ${real.length} objets respectent les critères.`,
  );
  return `${out.join('\n')}\n`;
}

/** Detailed JSON of a run (games, indices, picks) and its evaluations. */
export function jsonReport(
  result: RunResult,
  evals: readonly ObjectEvaluation[],
  extra: Record<string, unknown> = {},
): unknown {
  const runs = [...result.runs.values()].map((run) => ({
    strategy: run.strategy,
    bands: bandStats(run, result.maxLevel),
    games: run.games.map((g, i) => ({
      seed: g.seed,
      index: (run.index[i] ?? []).map((x) => Number(x.toFixed(4))),
      times: g.times.map((t) => Number(t.toFixed(1))),
      targets: g.targets,
      picks: g.picks.map((p) => [p.level, p.card, p.edition]),
      firstOffered: g.firstOffered,
    })),
  }));
  return {
    ...extra,
    seeds: result.seeds,
    maxLevel: result.maxLevel,
    ms: Math.round(result.ms),
    tables: result.tables,
    objects: evals,
    socle: socleInfo(result),
    runs,
  };
}
