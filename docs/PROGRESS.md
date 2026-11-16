# Avancement

| Jalon                                            | État              | Notes                                                                |
| ------------------------------------------------ | ----------------- | -------------------------------------------------------------------- |
| M0 Squelette et déploiement                      | ✅ terminé (code) | Déploiement Pages à valider après merge sur `main` (voir ci-dessous) |
| M1 Grille, caméra, Hub                           | ⏳ à faire        |                                                                      |
| M2 Carte procédurale                             | ⏳ à faire        |                                                                      |
| M3 Tapis, extracteur, livraison                  | ⏳ à faire        |                                                                      |
| M4 Progression des niveaux                       | ⏳ à faire        |                                                                      |
| M5 Opérateurs                                    | ⏳ à faire        |                                                                      |
| M6 Jonctions, priorités, ponts                   | ⏳ à faire        |                                                                      |
| M7 Améliorations et statistiques                 | ⏳ à faire        |                                                                      |
| M8 Stockage                                      | ⏳ à faire        |                                                                      |
| M9 Outils d'édition                              | ⏳ à faire        |                                                                      |
| M10 Sauvegarde, options, i18n, menu, aide, audio | ⏳ à faire        |                                                                      |
| M11 Performance et finition                      | ⏳ à faire        |                                                                      |

## M0 : détail

- [x] Vite + TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- [x] ESLint, Prettier, Vitest, Playwright installés.
- [x] Scripts `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck`, `bench`.
- [x] `vite.config.ts` avec `base: './'`.
- [x] Workflow `.github/workflows/deploy.yml` (§15).
- [x] Page : canvas plein écran bleu nuit `#0f1422` + titre « Sumflow » (via i18n).
- [x] `npm run build` sans avertissement.
- [ ] L'URL Pages affiche la page : nécessite le merge sur `main` et le réglage Settings > Pages > Source : **GitHub Actions**.

### Écarts connus

- `npm audit` signale des vulnérabilités modérées dans des dépendances **dev** de `typescript-eslint` ; aucun impact sur le bundle livré (zéro dépendance runtime).
