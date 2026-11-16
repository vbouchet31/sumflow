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

## M1 : détail

- [x] Caméra : déplacement WASD/ZQSD physique + flèches (Shift ×3, ignoré avec Ctrl/Alt), glisser clic droit/milieu, zoom molette centré sur le curseur (0,05 à 4), `H` = retour au Hub.
- [x] Grille visible à zoom ≥ 0,5, canvas HiDPI (DPR plafonné à 2).
- [x] Hub 6×6 dessiné : niveau 1, cible 1, `0 / 10`, barre, icône de récompense (+).
- [x] Tests unitaires `grid.ts` (clés, rotations, faces, chunks), caméra, format.
- [x] Tests e2e : rendu du Hub, zoom, glisser, touche D, touche H.

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
