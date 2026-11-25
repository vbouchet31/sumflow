---
name: ajouter-objet
description: Recette répétable pour ajouter, modifier ou rééquilibrer un objet de récompense de Sumflow (bâtiment spécial, nouvelle opération, carte Édition, passif, méta). Utiliser dès que l'auteur propose une idée d'objet, veut changer les effets ou les poids d'un objet existant, ou demande de relancer l'équilibrage (npm run sim, npm run tune).
---

# Ajouter un objet de récompense

Cette skill est la recette de `PLAN-objets.md`. Elle sert d'une conversation à l'autre : **la mémoire d'un objet est sa fiche** `docs/objets/<id>.md`. Ne jamais compter sur une conversation précédente.

## 0. Avant tout

1. Lire `PLAN-objets.md` (§2 à §5 : registre, simulateur, critères, régleur) et, dans `docs/DECISIONS.md`, les sections « Objets répétables ».
2. Si la fiche `docs/objets/<id>.md` existe, la lire en entier : état, décisions, historique des simulations, retours de parties de test. Reprendre là où elle s'arrête.
3. Sinon, copier `docs/objets/_modele.md` vers `docs/objets/<id>.md` (identifiant court, en anglais, en kebab-case, comme les ids de cartes : `concat`, `hub-relay`).
4. Travailler sur la branche de développement indiquée par la session, jamais directement sur `main`.

## 1. Discussion avec l'auteur (remplir la fiche)

- **Une question à la fois**, et seulement si la réponse change quelque chose. Proposer une valeur par défaut argumentée à chaque question, pour que l'auteur puisse répondre « oui ».
- Ordre conseillé (sections de la fiche) :
  1. idée et effet en une phrase, puis 1 à 3 exemples concrets ;
  2. genre de carte (`special`, `unlock`, `edition`, `passive`, `meta`) et emplacement ;
  3. pour un bâtiment : opération exacte (cas limites : négatifs, 0, saturation à `INT_MIN` / `INT_MAX`), empreinte et ports, piste d'amélioration, vitesse de base ;
  4. éditions (effet commun ou propre) ;
  5. prérequis, niveau minimum, courbe de poids de départ, **niveau repère** ;
  6. **boutons du régleur et leurs bornes** (rien d'autre ne pourra être réglé automatiquement) ;
  7. critères particuliers (sinon les 3 critères standard).
- Écrire chaque réponse dans la fiche au fur et à mesure (état « en discussion »). Résumer la fiche à l'auteur et attendre son accord avant de coder.

## 2. Code

Points de passage pour une **nouvelle opération** sur un **bâtiment spécial** (le cas le plus complet) :

1. `src/config/operations.ts` : l'id dans `OperationId` et l'entrée dans `OPERATIONS` (symbole, sorties, `compute` pur et borné, `commutative`, `track`).
2. `src/simtools/hints.ts` : l'indice de décomposition de l'opération pour le modèle de coût (`OPERATION_HINTS`). Le typage l'exige. Respecter les règles du fichier (une proposition n'est jamais retirée quand on ajoute des valeurs).
3. `src/config/buildings.ts` : le type dans `SpecialType` et l'entrée de `SPECIAL_BUILDINGS` (`op`, `footprint`). Les ports de l'empreinte doivent correspondre à l'opération (un test le vérifie).
4. `src/config/colors.ts` (`BUILDING_COLORS`), `src/config/cards.ts` (`EDITION_EFFECTS`, la carte dans `CARDS` avec prérequis, `minLevel`, courbe), `src/config/keymap.ts` si une touche est libre.
5. `src/config/tuning.json` : la ligne de l'objet avec ses valeurs par défaut ; les bornes propres dans `KNOB_OVERRIDES` de `src/config/tuning.ts` si la fiche en définit.
6. `src/i18n/fr.ts` et `src/i18n/en.ts` : `tool.<type>`, `card.<id>.title`, `card.<id>.text`, et la fiche tutoriel.
7. `src/ui/help.ts` : la fiche tutoriel du bâtiment ; le dessin à la craie (`src/render/toolIcons.ts`, `src/render/cardArt.ts`) s'il faut plus qu'un symbole.
8. Retirer un objet factice remplacé (`placeholder: true`) si la fiche le prévoit.

Pour les autres genres : `edition`, `passive`, `meta` passent surtout par `src/config/cards.ts` (`PASSIVE_EFFECTS`, `META_EFFECTS`) et `src/sim/rewards.ts` (`applyCard`). Si l'effet n'est pas visible par le modèle de coût, l'ajouter à la liste des effets non modélisés du simulateur, avec la raison.

**Tests obligatoires** : `compute` (cas limites), ports et empreinte, sauvegarde aller-retour, carte valide (`validateCatalogue`), tirage, et un test de bout en bout si l'objet a une interface propre. Puis :

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e -- --trace off
```

Chromium est déjà installé : ne jamais lancer `playwright install`. Le test `smoke.spec.ts` « draws the hub » échoue parfois au hasard : le relancer seul une fois.

## 3. Simulation et réglage

```bash
npm run sim -- --object <id>          # état avant réglage, objet ciblé plus les stratégies de base
npm run tune -- <id>                  # propose des valeurs, n'écrit rien
```

- Lire le verdict des **3 critères** (pas indispensable, pas inutile, visible) pour l'objet, puis les **régressions** des autres objets. Une bascule dans la marge de bruit est « à surveiller » et ne bloque pas.
- Stratégies : `object:<id>` prend l'objet à chaque offre (abus, critères 1 et 3) ; `once:<id>` le prend une fois puis joue le fil rouge (utilité, critère 2).
- Les cartes du **socle** (suite du fil rouge : valeur, ×, −, ÷, ^, pont, priorités, stockage) ne sont pas jugées et `npm run tune` les refuse. Un nouvel objet hors fil rouge est toujours jugé.
- Si l'effet de l'objet est invisible pour le modèle de coût, l'ajouter à `UNMODELED` (`src/simtools/config.ts`) avec sa raison : son critère 2 devient « n/a ».
- Durées indicatives sur 4 cœurs : `sim` environ 40 s, `tune` de 30 s (un bouton) à 2 min (deux boutons).
- Si le régleur ne trouve rien dans les bornes : ne pas élargir les bornes de soi-même. Expliquer à l'auteur le critère qui échoue et la meilleure valeur trouvée, puis proposer une piste (changer l'effet, la vitesse de base, les bornes) et attendre sa décision.
- Rappeler à chaque fois la limite du modèle : il n'y a pas d'usine simulée ; le réglage est un point de départ, la partie de test de l'auteur tranche.

## 4. Validation par l'auteur

1. Montrer un résumé court : valeurs proposées (avant → après), verdict des critères, régressions, et ce que ça change pour le joueur en clair.
2. **Attendre l'accord explicite.** Ensuite seulement : `npm run tune -- <id> --apply` (n'écrit que `src/config/tuning.json`).
3. Ajouter une ligne à l'historique des simulations de la fiche (date, commande, verdict, valeurs), passer l'état à « réglé », noter les décisions dans la fiche et, si elles concernent le jeu entier, dans `docs/DECISIONS.md`.
4. Relancer les 5 vérifications, commiter (messages conventionnels), pousser, et ouvrir ou mettre à jour la pull request si l'auteur le demande.

## 5. Parties de test

- Proposer à l'auteur une partie de test ciblée (par exemple `?debug=1`, puis forcer l'offre de l'objet avec l'API debug `forceOffer`).
- Noter ses retours dans la fiche (section 9). Un retour qui contredit le modèle prime : ajuster l'objet ou les constantes du modèle, puis relancer la section 3.
- Passer l'état à « validé en jeu » quand l'auteur le confirme.

## Rééquilibrer un objet existant

Lire sa fiche, relancer la section 3, puis la section 4. Ne jamais modifier les valeurs de `tuning.json` à la main : toujours passer par `npm run tune -- <id> --apply` après accord.
