/**
 * Command line of the simulator and the tuner (PLAN-objets §3, §5), run by
 * `scripts/run-ts.mjs`:
 *
 *   npm run sim -- [--seeds N] [--seed-offset N] [--max-level N] [--object id,id]
 *                  [--strategies s,s] [--json file | --no-json]
 *   npm run tune -- <cardId> [--seeds N] [--seed-offset N] [--control-offset N]
 *                  [--max-level N] [--apply] [--json file | --no-json]
 *
 * The Markdown report goes to stdout, progress to stderr, the JSON to `sim-reports/`.
 * Exit code: 0, 1 when the tuner finds no value satisfying the criteria, 2 on bad usage.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CARDS } from '../config/cards';
import { KNOBS, serializeTuning, TUNED, TUNING_FILE, validateTuning } from '../config/tuning';
import { REPORT_DIR, RUN_DEFAULTS, TUNER } from './config';
import {
  CRITERION_IDS,
  type CriterionId,
  evaluateCatalogue,
  type ObjectEvaluation,
} from './criteria';
import { CostCache } from './cost';
import { defaultWorkers, WorkerPool } from './pool';
import { playGame } from './game';
import { bandStats, jsonReport, markdownReport } from './report';
import {
  defaultStrategies,
  drawableCards,
  localRunner,
  runSimulation,
  type SeedRunner,
} from './run';
import { BASE_STRATEGIES, parseStrategy, type Strategy } from './strategies';
import { type KnobValues, tune, type TuneResult, withKnobs } from './tune';

const CRITERION_NAMES: Record<CriterionId, string> = {
  essential: '1. Pas indispensable',
  useful: '2. Pas inutile',
  visible: '3. Visible',
};

export interface CliArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

/** `--name value`, `--name=value` and bare `--flag`; the rest is positional. */
export function parseArgs(args: readonly string[], booleans: readonly string[]): CliArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? '';
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (eq >= 0) flags.set(name, a.slice(eq + 1));
    else if (booleans.includes(name)) flags.set(name, true);
    else {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--'))
        throw new UsageError(`--${name} attend une valeur`);
      flags.set(name, v);
      i++;
    }
  }
  return { positional, flags };
}

export class UsageError extends Error {}

function intFlag(args: CliArgs, name: string, fallback: number, min = 1): number {
  const v = args.flags.get(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (v === true || !Number.isInteger(n) || n < min)
    throw new UsageError(`--${name} attend un entier ≥ ${min}`);
  return n;
}

function checkFlags(args: CliArgs, known: readonly string[]): void {
  for (const k of args.flags.keys())
    if (!known.includes(k)) throw new UsageError(`option inconnue --${k}`);
}

/** Strategies of `npm run sim` from `--strategies` and `--object`. */
export function simStrategies(args: CliArgs): Strategy[] {
  const list = args.flags.get('strategies');
  const objects = args.flags.get('object');
  if (list === true || objects === true)
    throw new UsageError('--strategies et --object attendent une liste');
  if (list !== undefined) {
    return list.split(',').map((s) => {
      const st = parseStrategy(s, CARDS);
      if (!st) throw new UsageError(`stratégie inconnue : ${s}`);
      return st;
    });
  }
  if (objects !== undefined) {
    return [
      ...BASE_STRATEGIES,
      ...objects.split(',').map((id): Strategy => {
        if (!drawableCards().some((c) => c.id === id))
          throw new UsageError(`objet inconnu : ${id}`);
        return { kind: 'object', card: id };
      }),
    ];
  }
  return defaultStrategies();
}

function writeJson(args: CliArgs, fallback: string, data: unknown): string | null {
  if (args.flags.get('no-json') === true) return null;
  const v = args.flags.get('json');
  const file = resolve(typeof v === 'string' ? v : resolve(REPORT_DIR, fallback));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
  return file;
}

const out = (s: string): void => void process.stdout.write(s);
const err = (s: string): void => void process.stderr.write(`${s}\n`);

/** Run `body` with a worker pool of `--workers` threads (1: this process). */
async function withRunner<T>(args: CliArgs, body: (runner: SeedRunner) => Promise<T>): Promise<T> {
  const workers = intFlag(args, 'workers', defaultWorkers());
  if (workers === 1) return body(localRunner());
  const pool = await WorkerPool.start(workers);
  try {
    return await body(pool.run);
  } finally {
    await pool.close();
  }
}

export async function simMain(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, ['no-json']);
  checkFlags(args, [
    'seeds',
    'seed-offset',
    'max-level',
    'object',
    'strategies',
    'json',
    'no-json',
    'workers',
  ]);
  if (args.positional.length > 0)
    throw new UsageError(`argument inattendu : ${args.positional[0]}`);
  const seeds = intFlag(args, 'seeds', RUN_DEFAULTS.seeds);
  const seedOffset = intFlag(args, 'seed-offset', RUN_DEFAULTS.seedOffset, 0);
  const maxLevel = intFlag(args, 'max-level', RUN_DEFAULTS.maxLevel, 3);
  const strategies = simStrategies(args);
  err(
    `npm run sim : ${seeds} graines × ${strategies.length + (strategies.some((s) => s.kind === 'natural') ? 0 : 1)} stratégies, niveaux 1 à ${maxLevel}…`,
  );
  const result = await withRunner(args, (runner) =>
    runSimulation({ seeds, seedOffset, maxLevel, strategies }, runner),
  );
  const evals = evaluateCatalogue(result);
  const partial = strategies.length < defaultStrategies().length;
  const md = markdownReport(result, evals, {
    title: 'Simulation Sumflow',
    lines: [
      `Valeurs réglées : \`${TUNING_FILE}\` (actuelles).${partial ? ' Catalogue partiel (options `--object` ou `--strategies`).' : ''}`,
    ],
  });
  const recipes = playGame({
    seed: seedOffset,
    strategy: { kind: 'natural' },
    maxLevel,
    cache: new CostCache(),
    explain: true,
  });
  const file = writeJson(args, 'sim.json', {
    ...(jsonReport(result, evals, { command: ['npm run sim --', ...argv].join(' ') }) as object),
    referenceRecipes: recipes.targets.map((t, i) => ({
      level: i + 1,
      target: t,
      recipe: recipes.recipes?.[i],
    })),
  });
  out(md);
  if (file) out(`\nJSON détaillé : \`${file}\`\n`);
  return 0;
}

function knobText(values: KnobValues): string {
  return Object.entries(values)
    .map(([k, v]) => `\`${k}\` = ${v}`)
    .join(', ');
}

function verdictRow(before: ObjectEvaluation | undefined, after: ObjectEvaluation): string[] {
  const c = (e: ObjectEvaluation | undefined, k: CriterionId): string => {
    const r = e?.criteria[k];
    if (!r) return '–';
    return r.status === 'n/a'
      ? 'n/a'
      : `${r.status === 'pass' ? '✓' : '✗'} ${Math.round(r.value * 100)} %`;
  };
  const v = (e: ObjectEvaluation | undefined): string => (e ? (e.pass ? 'OK' : 'à revoir') : '–');
  return [
    `\`${after.card}\`${after.placeholder ? ' (factice)' : ''}`,
    ...CRITERION_IDS.map((k) => `${c(before, k)} → ${c(after, k)}`),
    `${v(before)} → ${v(after)}`,
  ];
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (r: readonly string[]): string => `| ${r.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

/** Markdown of a tuner run. */
export function tuneReport(
  r: TuneResult,
  opts: { seeds: number; seedOffset: number; controlSeedOffset: number },
): string {
  const o: string[] = [];
  const def = CARDS.find((c) => c.id === r.card);
  o.push(`# Réglage de \`${r.card}\`${def?.placeholder ? ' (objet factice)' : ''}`, '');
  o.push(
    `Recherche sur les graines ${opts.seedOffset} à ${opts.seedOffset + opts.seeds - 1} (stratégies \`natural\` et \`object:${r.card}\`), ` +
      `${r.tried.length} points essayés ; contrôle sur les graines ${opts.controlSeedOffset} à ${opts.controlSeedOffset + opts.seeds - 1}, tout le catalogue. ` +
      `Temps : ${(r.ms / 1000).toFixed(1)} s.`,
    '',
  );
  o.push('## Valeurs', '');
  o.push(
    table(
      ['Bouton', 'Bornes', 'Actuel', 'Proposé'],
      Object.entries(r.knobs).map(([k, s]) => [
        `\`${k}\``,
        `${s.min} à ${s.max}`,
        String(r.current[k as keyof KnobValues] ?? s.default),
        String(r.best.values[k as keyof KnobValues] ?? '–'),
      ]),
    ),
    '',
  );
  o.push('Points essayés (écart aux critères, 0 = tout passe) :', '');
  const tried = [...r.tried].sort((a, b) => a.distance - b.distance || a.deviation - b.deviation);
  o.push(
    tried
      .slice(0, 12)
      .map((t) => `- ${knobText(t.values)} : ${t.distance.toFixed(3)}`)
      .join('\n'),
  );
  if (tried.length > 12) o.push(`- … ${tried.length - 12} autres`);
  o.push('');
  const target = r.control.after.evals.find((e) => e.card === r.card);
  const targetBefore = r.control.before.evals.find((e) => e.card === r.card);
  o.push(`## Critères de \`${r.card}\``, '');
  o.push(
    table(
      ['Critère', 'Attendu', 'Actuel (contrôle)', 'Proposé (réglage)', 'Proposé (contrôle)'],
      CRITERION_IDS.map((k) => {
        const cell = (e: ObjectEvaluation | null | undefined): string => {
          const c = e?.criteria[k];
          if (!c) return '–';
          return c.status === 'n/a'
            ? `n/a${c.note ? ` (${c.note})` : ''}`
            : `${c.status === 'pass' ? '✓' : '✗'} ${Math.round(c.value * 100)} %`;
        };
        return [
          CRITERION_NAMES[k],
          target?.criteria[k].target ?? '',
          cell(targetBefore),
          cell(r.bestEvaluation),
          cell(target),
        ];
      }),
    ),
    '',
  );
  const bandsOf = (res: TuneResult['control']['before']['result'], s: string): string => {
    const run = res.runs.get(s);
    return run
      ? bandStats(run, res.maxLevel)
          .map((b) => b.median.toFixed(2))
          .join(' · ')
      : '–';
  };
  o.push(
    `Indice médian de \`object:${r.card}\` par tranche de 10 niveaux (contrôle) : avant ${bandsOf(r.control.before.result, `object:${r.card}`)} ; après ${bandsOf(r.control.after.result, `object:${r.card}`)}.`,
    '',
  );
  o.push('## Tout le catalogue (contrôle) : avant → après', '');
  o.push(
    table(
      ['Objet', ...CRITERION_IDS.map((k) => CRITERION_NAMES[k]), 'Verdict'],
      r.control.after.evals.map((e) =>
        verdictRow(
          r.control.before.evals.find((b) => b.card === e.card),
          e,
        ),
      ),
    ),
    '',
  );
  if (r.regressions.length > 0)
    o.push(
      `**Régressions** (OK avant, à revoir après) : ${r.regressions.map((c) => `\`${c}\``).join(', ')}.`,
      '',
    );
  return o.join('\n');
}

/** One line per failing criterion of `e`, on the `where` seeds. */
function failingLines(e: ObjectEvaluation | null | undefined, where: string): string[] {
  return CRITERION_IDS.flatMap((k) => {
    const c = e?.criteria[k];
    if (!c || c.status !== 'fail') return [];
    const note = c.note ? ` (${c.note})` : '';
    return [
      `- ${CRITERION_NAMES[k]} échoue sur les graines ${where} : mesuré ${Math.round(c.value * 100)} %, attendu ${c.target}${note}.`,
    ];
  });
}

/** The conclusion of a tuner run, and whether `--apply` may write. */
export function conclusion(r: TuneResult, card: string): string {
  const best = knobText(r.best.values);
  const regressions = r.regressions.map((c) => `\`${c}\``).join(', ');
  const tail =
    'Rien n’est écrit : c’est à l’auteur et à l’agent de revoir l’objet (effet, bornes, critères de sa fiche).';
  switch (r.outcome) {
    case 'no-solution':
      return [
        `**Aucune valeur dans les bornes ne respecte les critères.** Meilleure valeur trouvée : ${best} (écart ${r.best.distance.toFixed(3)}).`,
        '',
        ...failingLines(r.bestEvaluation, 'de réglage'),
        '',
        tail,
      ].join('\n');
    case 'overfit':
      return [
        `**Les valeurs trouvées (${best}) ne tiennent pas sur les graines de contrôle** (surapprentissage).`,
        '',
        ...failingLines(
          r.control.after.evals.find((e) => e.card === card),
          'de contrôle',
        ),
        '',
        tail,
      ].join('\n');
    case 'regression':
      return [
        `**Les valeurs trouvées (${best}) respectent les critères de \`${card}\` mais font régresser d’autres objets** : ${regressions} (OK avant, à revoir après, sur les graines de contrôle).`,
        '',
        `${tail} Si l’auteur accepte ces régressions : \`npm run tune -- ${card} --apply --accept-regressions\`.`,
      ].join('\n');
    case 'unchanged':
      return `Les valeurs actuelles (${knobText(r.current)}) respectent déjà les critères : rien à changer.`;
    case 'proposed':
      return `Valeurs proposées : ${best}${r.regressions.length > 0 ? ` (régressions acceptées : ${regressions})` : ''}.`;
  }
}

export async function tuneMain(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, ['apply', 'accept-regressions', 'no-json']);
  checkFlags(args, [
    'accept-regressions',
    'seeds',
    'seed-offset',
    'control-offset',
    'max-level',
    'apply',
    'json',
    'no-json',
    'workers',
  ]);
  const card = args.positional[0];
  if (!card || args.positional.length > 1)
    throw new UsageError('usage : npm run tune -- <cardId> [--apply]');
  if (!KNOBS[card]) {
    throw new UsageError(
      `${card} : pas un objet réglable (objets : ${Object.keys(KNOBS).join(', ')})`,
    );
  }
  const seeds = intFlag(args, 'seeds', TUNER.seeds);
  const seedOffset = intFlag(args, 'seed-offset', TUNER.seedOffset, 0);
  const controlSeedOffset = intFlag(args, 'control-offset', TUNER.controlSeedOffset, 0);
  const maxLevel = intFlag(args, 'max-level', RUN_DEFAULTS.maxLevel, 3);
  if (controlSeedOffset < seedOffset + seeds && seedOffset < controlSeedOffset + seeds)
    throw new UsageError('les graines de contrôle doivent être différentes des graines de réglage');
  err(`npm run tune -- ${card} : recherche…`);
  const r = await withRunner(args, (runner) =>
    tune({
      card,
      seeds,
      seedOffset,
      controlSeedOffset,
      maxLevel,
      runner,
      acceptRegressions: args.flags.get('accept-regressions') === true,
      log: err,
    }),
  );
  const opts = { seeds, seedOffset, controlSeedOffset };
  out(tuneReport(r, opts));
  const proposed = withKnobs(TUNED, card, r.best.values);
  const file = writeJson(args, `tune-${card}.json`, {
    command: ['npm run tune --', ...argv].join(' '),
    card,
    knobs: r.knobs,
    current: r.current,
    proposed: r.best.values,
    outcome: r.outcome,
    tried: r.tried,
    regressions: r.regressions,
    search: r.bestEvaluation,
    controlBefore: jsonReport(r.control.before.result, r.control.before.evals),
    controlAfter: jsonReport(r.control.after.result, r.control.after.evals),
  });
  out(`\n## Conclusion\n\n${conclusion(r, card)}\n`);
  if (r.outcome === 'proposed') {
    if (args.flags.get('apply') === true) {
      const errors = validateTuning(proposed);
      if (errors.length > 0) throw new Error(`valeurs invalides : ${errors.join('; ')}`);
      writeFileSync(resolve(TUNING_FILE), serializeTuning(proposed));
      out(`\nÉcrites dans \`${TUNING_FILE}\` (seul fichier modifié).\n`);
    } else {
      out(
        `\nRien n’est écrit. Après l’accord de l’auteur : \`npm run tune -- ${card} --apply\`${r.regressions.length > 0 ? ' --accept-regressions' : ''}.\n`,
      );
    }
  }
  if (file) out(`\nJSON détaillé : \`${file}\`\n`);
  return r.ok ? 0 : 1;
}

/** Entry point: `main(['sim', ...])` or `main(['tune', ...])`. */
export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (rest.includes('--help') || rest.includes('-h')) {
      out(`${HELP}\n`);
      return 0;
    }
    if (command === 'sim') return await simMain(rest);
    if (command === 'tune') return await tuneMain(rest);
    throw new UsageError(`commande inconnue : ${command ?? ''}`);
  } catch (e) {
    if (e instanceof UsageError) {
      err(`${e.message}\n\n${HELP}`);
      return 2;
    }
    throw e;
  }
}

const HELP = `npm run sim -- [options]
  --seeds N          parties par stratégie (défaut ${RUN_DEFAULTS.seeds})
  --seed-offset N    première graine (défaut ${RUN_DEFAULTS.seedOffset})
  --max-level N      dernier niveau joué (défaut ${RUN_DEFAULTS.maxLevel})
  --object a,b       seulement ces objets (plus natural, random, new, minimal)
  --strategies s,t   liste exacte : natural, random, new, minimal, object:<id>
  --json FICHIER     JSON détaillé (défaut ${REPORT_DIR}/sim.json) ; --no-json pour ne rien écrire
  --workers N        fils d’exécution (défaut : les cœurs, 8 au plus ; 1 = sans fil)

npm run tune -- <cardId> [options]
  --seeds N          parties par stratégie et par point essayé (défaut ${TUNER.seeds})
  --seed-offset N    première graine du réglage (défaut ${TUNER.seedOffset})
  --control-offset N première graine du contrôle (défaut ${TUNER.controlSeedOffset})
  --max-level N      dernier niveau joué (défaut ${RUN_DEFAULTS.maxLevel})
  --apply            écrit les valeurs proposées dans ${TUNING_FILE} (seulement si les critères passent)
  --accept-regressions  ne bloque pas sur la régression d’autres objets (accord de l’auteur)
  --json FICHIER     JSON détaillé (défaut ${REPORT_DIR}/tune-<cardId>.json) ; --no-json
  --workers N        fils d’exécution (défaut : les cœurs, 8 au plus ; 1 = sans fil)`;
