# Sumflow

Jeu d'usine à nombres pour navigateur : extraire des nombres, les transporter sur des tapis, les combiner avec des opérateurs (+, ×, −, ÷, ^) et livrer au Hub les nombres demandés.

> Projet de fan, inspiré par Beltmatic de Notional Games. Code et visuels originaux.

État : jalon **M10** (sauvegarde, options, menu, aide, FR/EN, sons). Version jouable en ligne : https://vbouchet31.github.io/sumflow/ (ajouter `?debug=1` pour le panneau debug, `?seed=42` pour fixer la carte d'une nouvelle partie). La partie est sauvegardée dans le navigateur ; le menu permet de l'exporter ou d'en importer une. Spécification complète dans [`PLAN.md`](PLAN.md), avancement dans [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Commandes (état actuel)

| Action                                           | Entrée                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Déplacer la caméra                               | `W A S D` (touches physiques, donc `Z Q S D` en AZERTY) ou flèches ; `Shift` = ×3                                  |
| Déplacer à la souris                             | clic droit ou molette maintenus + glisser                                                                          |
| Zoom                                             | molette, centré sur le curseur                                                                                     |
| Retour au Hub                                    | `H`                                                                                                                |
| Bâtiments                                        | `1` à `9` (tapis, extracteur, opérateurs, stockage, pont), `P` priorité, `R` / `Shift+R` pivoter                   |
| Démolir / vider                                  | `X` / `C` puis glisser une zone (clic = un objet) ; `Suppr` = démolir l'objet survolé                              |
| Copier / couper / coller                         | `Ctrl+C` / `Ctrl+X` puis glisser ; `Ctrl+V` : clic ou glisser, `R` pivoter, `F` miroir, `Shift+molette` historique |
| Marqueur, pipette                                | `B` puis clic ; `E` sur un objet                                                                                   |
| Annuler / rétablir                               | `Ctrl+Z` / `Ctrl+Y` (ou `Ctrl+Shift+Z`)                                                                            |
| Menu (sauvegarde, export, import, options, aide) | `Échap` (sans outil actif)                                                                                         |
| Pause                                            | `Espace`                                                                                                           |

## Développement

Prérequis : Node.js 22.12 ou plus.

```bash
npm install
npm run dev
```

| Script              | Rôle                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`       | Serveur de dev Vite                                                                   |
| `npm run build`     | Typecheck + build de production dans `dist/`                                          |
| `npm run preview`   | Sert le build                                                                         |
| `npm test`          | Tests unitaires (Vitest)                                                              |
| `npm run test:e2e`  | Tests e2e (Playwright, Chromium) contre `vite preview` ; lancer `npm run build` avant |
| `npm run lint`      | ESLint + Prettier (vérification)                                                      |
| `npm run format`    | Formate le code avec Prettier                                                         |
| `npm run typecheck` | `tsc --noEmit`                                                                        |
| `npm run bench`     | Bench de la simulation                                                                |

## Déploiement

GitHub Actions (`.github/workflows/deploy.yml`) lance lint, typecheck, tests, build et e2e sur chaque push et PR, puis déploie sur GitHub Pages à chaque push sur `main`.

Réglage requis une fois : **Settings > Pages > Source : GitHub Actions**.

## Licence

MIT, voir [`LICENSE`](LICENSE).
