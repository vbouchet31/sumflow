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

La carte est infinie et générée à partir d'une graine : un nombre ou un mot (ton pseudo, ton prénom…), saisi dans « Nouvelle partie » ou passé dans l'URL (`?seed=42`, `?seed=Vincent`) pour une nouvelle partie. Les majuscules et les espaces en trop ne comptent pas, les accents si. La partie est sauvegardée dans le navigateur ; le menu permet de l'exporter ou d'en importer une. Interface en français et en anglais.

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
| Sélection d'une zone                             | outil Sélection puis glisser : Copier et Couper apparaissent au-dessus de la barre (ou `Ctrl+C` / `Ctrl+X`)        |
| Marqueur, pipette                                | `B` puis clic ; `E` sur un objet                                                                                   |
| Bâtiment sélectionné                             | clic sans outil : une bulle à côté propose Pivoter, Copier (même orientation) et Supprimer                         |
| Annuler / rétablir                               | `Ctrl+Z` / `Ctrl+Y` (ou `Ctrl+Shift+Z`)                                                                            |
| Panneaux                                         | `U` améliorations, `L` niveaux, `N` nombres livrés                                                                 |
| Menu (sauvegarde, export, import, options, aide) | `Échap` (sans outil actif)                                                                                         |
| Écran de choix de récompense                     | clic, `Entrée` ou `Espace` sur une carte : la retourner ; « Choisir » ; `Échap` = voir la carte                    |
| Pause                                            | `Espace`                                                                                                           |
| Performances (FPS, temps de simulation, objets)  | `F3`                                                                                                               |

Les panneaux et le menu s'utilisent aussi au clavier seul : `Tab`, `Entrée`, `Échap`.

### Écran tactile

Le jeu se joue au doigt sur tablette et sur téléphone tenu en paysage (en portrait, il reste utilisable). Une souris branchée garde les commandes ci-dessus.

| Action                          | Geste                                                |
| ------------------------------- | ---------------------------------------------------- |
| Déplacer la carte               | glisser à un doigt sans outil, ou à deux doigts      |
| Zoom                            | pincer à deux doigts                                 |
| Construire                      | choisir un outil, puis toucher ou glisser à un doigt |
| Tracer plus loin que l'écran    | amener le doigt près du bord : la carte défile       |
| Abandonner un tracé             | poser un deuxième doigt                              |
| Pivoter, miroir, coude, quitter | boutons au-dessus de la barre de construction        |
| Copier, couper une zone         | outil Sélection, glisser, puis Copier ou Couper      |
| Coller                          | toucher pour déplacer l'aperçu, puis « Poser »       |
| Inspecter un objet              | le toucher sans outil                                |
| Pivoter, copier, supprimer      | toucher le bâtiment, puis la bulle à côté de lui     |
| Pipette                         | appui long sur un objet                              |
| Récompense                      | toucher une carte la retourne, puis « Choisir »      |
| Pause, annuler, panneaux, menu  | boutons en haut à droite                             |

Le jeu peut être installé sur l'écran d'accueil (menu du navigateur, « Ajouter à l'écran d'accueil ») : il s'ouvre alors en plein écran. Sur iPhone et iPad, c'est aussi ce qui met la sauvegarde à l'abri : Safari peut effacer les données d'un site non installé resté quelques jours sans visite. Dans tous les cas, le menu permet d'exporter la partie.

## Développement

Prérequis : Node.js 22.12 ou plus.

```bash
npm install
npm run dev
```

| Script                        | Rôle                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`                 | Serveur de dev Vite                                                                   |
| `npm run build`               | Typecheck + build de production dans `dist/`                                          |
| `npm run preview`             | Sert le build                                                                         |
| `npm test`                    | Tests unitaires (Vitest)                                                              |
| `npm run test:e2e`            | Tests e2e (Playwright, Chromium) contre `vite preview` ; lancer `npm run build` avant |
| `node scripts/make-icons.mjs` | Régénère les icônes d'installation (PNG) depuis `public/favicon.svg`                  |
| `npm run lint`                | ESLint + Prettier (vérification)                                                      |
| `npm run format`              | Formate le code avec Prettier                                                         |
| `npm run typecheck`           | `tsc --noEmit`                                                                        |
| `npm run bench`               | Bench de la simulation : scénario de référence, échoue au-delà de 4 ms par tick       |

## Performances

Scénario de référence (`src/debug/reference.ts`) : 20 000 tuiles de tapis, 1 000 bâtiments, environ 15 000 items.

- **Simulation** : `npm run bench` mesure le temps moyen d'un tick et échoue au-delà de 4 ms.
- **Rendu** : ouvrir le jeu avec `?debug=1`, lancer `__sumflow.loadReference()` dans la console d'une partie neuve, puis `F3` pour lire les FPS à différents zooms.
- **Lighthouse** : `npm run build && npm run preview`, puis `npx lighthouse http://localhost:4173/ --only-categories=performance` (objectif : 90 ou plus).

Outils de debug : `?debug=1` expose `window.__sumflow` (poser des bâtiments, avancer le temps, débloquer, etc.) et affiche un petit panneau (graine, ticks, curseur, zoom). `?tutorial=0` empêche les fiches tutoriel de s'ouvrir seules (tests e2e). `?pick=natural|first|random` choisit seul les récompenses en attente (tests e2e) ; sans ce paramètre (ou avec `none`), le joueur choisit à l'écran ; `__sumflow.offer()`, `forceOffer()`, `choose()` et `grant()` manipulent les offres.

## Déploiement

GitHub Actions (`.github/workflows/deploy.yml`) lance lint, typecheck, tests, build et e2e sur chaque push et PR, puis déploie sur GitHub Pages à chaque push sur `main`.

Réglage requis une fois : **Settings > Pages > Source : GitHub Actions**.

## Crédits

Sumflow est un projet de fan, inspiré par [Beltmatic](https://store.steampowered.com/app/2674590/Beltmatic/) de Notional Games. Tout le code et tous les visuels sont originaux : aucun asset, texte ou nom du jeu d'origine n'est réutilisé. Si l'idée te plaît, va jouer à l'original.

Aucune dépendance à l'exécution : TypeScript, Canvas 2D et WebAudio, outillés avec Vite, Vitest et Playwright.

Polices embarquées dans `public/fonts`, sous licence [SIL Open Font License 1.1](https://openfontlicense.org) (textes de licence à côté des fichiers) : [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) de Patrick Wagesreiter et [Fredericka the Great](https://fonts.google.com/specimen/Fredericka+the+Great) de Tart Workshop.

## Licence

MIT, voir [`LICENSE`](LICENSE). Les polices de `public/fonts` restent sous leur propre licence (SIL OFL 1.1).
