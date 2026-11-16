# Sumflow

Jeu d'usine à nombres pour navigateur : extraire des nombres, les transporter sur des tapis, les combiner avec des opérateurs (+, ×, −, ÷, ^) et livrer au Hub les nombres demandés.

> Projet de fan, inspiré par Beltmatic de Notional Games. Code et visuels originaux.

Version jouable en ligne : https://vbouchet31.github.io/sumflow/

## Le jeu

- **Extraire** : un extracteur posé sur un gisement sort son nombre en continu.
- **Transporter** : les tapis se tracent en L, se divisent, fusionnent et se croisent par des ponts.
- **Combiner** : additionneur, multiplicateur, soustracteur, diviseur (quotient et reste) et exposant.
- **Livrer** : le Hub demande un nombre par niveau. 30 niveaux, puis des niveaux générés sans fin.
- **Améliorer** : livrer certains nombres accélère les tapis, les extracteurs et les opérateurs.
- **Éditer** : copier, coller, pivoter, miroir, annuler, marqueurs, stockages.

La carte est infinie et générée à partir d'une graine (`?seed=42` fixe celle d'une nouvelle partie). La partie est sauvegardée dans le navigateur ; le menu permet de l'exporter ou d'en importer une. Interface en français et en anglais.

Spécification complète dans [`PLAN.md`](PLAN.md), avancement dans [`docs/PROGRESS.md`](docs/PROGRESS.md), choix de conception dans [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Commandes

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
| Panneaux                                         | `U` améliorations, `L` niveaux, `N` nombres livrés                                                                 |
| Menu (sauvegarde, export, import, options, aide) | `Échap` (sans outil actif)                                                                                         |
| Pause                                            | `Espace`                                                                                                           |
| Performances (FPS, temps de simulation, objets)  | `F3`                                                                                                               |

Les panneaux et le menu s'utilisent aussi au clavier seul : `Tab`, `Entrée`, `Échap`.

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
| `npm run bench`     | Bench de la simulation : scénario de référence, échoue au-delà de 4 ms par tick       |

## Performances

Scénario de référence (`src/debug/reference.ts`) : 20 000 tuiles de tapis, 1 000 bâtiments, environ 15 000 items.

- **Simulation** : `npm run bench` mesure le temps moyen d'un tick et échoue au-delà de 4 ms.
- **Rendu** : ouvrir le jeu avec `?debug=1`, lancer `__sumflow.loadReference()` dans la console d'une partie neuve, puis `F3` pour lire les FPS à différents zooms.
- **Lighthouse** : `npm run build && npm run preview`, puis `npx lighthouse http://localhost:4173/ --only-categories=performance` (objectif : 90 ou plus).

Outils de debug : `?debug=1` expose `window.__sumflow` (poser des bâtiments, avancer le temps, débloquer, etc.) et affiche un petit panneau (graine, ticks, curseur, zoom).

## Déploiement

GitHub Actions (`.github/workflows/deploy.yml`) lance lint, typecheck, tests, build et e2e sur chaque push et PR, puis déploie sur GitHub Pages à chaque push sur `main`.

Réglage requis une fois : **Settings > Pages > Source : GitHub Actions**.

## Crédits

Sumflow est un projet de fan, inspiré par [Beltmatic](https://store.steampowered.com/app/2674590/Beltmatic/) de Notional Games. Tout le code et tous les visuels sont originaux : aucun asset, texte ou nom du jeu d'origine n'est réutilisé. Si l'idée te plaît, va jouer à l'original.

Aucune dépendance à l'exécution : TypeScript, Canvas 2D et WebAudio, outillés avec Vite, Vitest et Playwright.

## Licence

MIT, voir [`LICENSE`](LICENSE).
