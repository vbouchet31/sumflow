# Décisions

Choix pris quand `PLAN.md` est muet ou ambigu. Une entrée par décision, la plus récente en bas.

## M0

- **Versions de l'outillage** : TypeScript `~6.0` (et non 7.x) car `typescript-eslint` 8 exige `typescript < 6.1`. Vite 8, Vitest 5, ESLint 10, Playwright `1.63.0` (version exacte, alignée sur le Chromium préinstallé de l'environnement de dev ; la CI l'installe via `npx playwright install`).
- **Dépendance dev ajoutée : `@types/node`**. Hors liste §1.6, mais nécessaire pour typer `process.env` dans `playwright.config.ts` et les scripts Node. Types uniquement, aucun code runtime.
- **ESLint sans `@eslint/js`** : on utilise seulement `tseslint.configs.strict` pour rester dans la liste des dépendances autorisées.
- **Règle de déterminisme outillée** : ESLint interdit `Math.random`, `Date.now` et `performance.now` dans `src/sim/` (§1.5).
- **Bench** : Vitest 5 a remplacé l'API `bench()`. `npm run bench` lance donc Vitest en mode `bench` sur `bench/**/*.bench.ts`, avec un chronométrage `performance.now()` et une assertion de seuil (< 4 ms/tick), ce qui colle au critère d'acceptation de M11.
- **Workflow Pages** : l'artefact Pages (`dist`) est téléversé à la fin du job `ci` (là où le build existe), puis le job `deploy` fait `configure-pages` + `deploy-pages`. Équivalent au §15, sans rebuild.
- **i18n dès M0** : un mini-module `t()` FR/EN existe déjà pour respecter la règle §1.4 (aucun texte en dur). Il sera complété en M10.
- **Écran M0** : un titre DOM « Sumflow » par-dessus le canvas (`src/ui/splash.ts`), temporaire, remplacé par le HUD en M1/M4.
