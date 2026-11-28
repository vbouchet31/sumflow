# PLAN-paliers.md : des récompenses plus fréquentes, des choix sur les objets

> **État : jalons P1 et P2 faits (réglages ; fil rouge d’office, paliers, file des offres, sauvegarde v3).** Branche `ccr-ef7ff23f-njv12p`. Ce plan **remplace une partie** de [`PLAN-recompenses.md`](PLAN-recompenses.md) (fil rouge dans les offres, emplacements Nombres / Atelier / Joker, refus) et complète [`PLAN-objets.md`](PLAN-objets.md) (simulateur, critères). Les choix faits en cours de route iront dans [`docs/DECISIONS.md`](docs/DECISIONS.md), l'avancement dans [`docs/PROGRESS.md`](docs/PROGRESS.md).

---

## 0. Résumé

- **Le constat** :
  - à partir du niveau 11, un niveau dure 15 à 20 minutes (modèle du simulateur), donc on a une offre toutes les 15 à 20 minutes ;
  - une offre met en concurrence la progression (fil rouge) et une découverte. La progression gagne presque toujours : on se sent « forcé », et les nouveaux objets servent peu ;
  - Éventail sort si peu (poids 3 dans l'Atelier) que l'auteur ne l'a jamais vu en plusieurs parties.
- **L'idée** : séparer deux horloges.
  - **La progression** : la fin d'un niveau donne **toujours** sa récompense du fil rouge, d'office, sans écran de choix.
  - **La découverte** : des **paliers** à l'intérieur de chaque niveau (par exemple à 50 % de la quantité) ouvrent une offre qui ne contient **que des objets**.
- **Le rythme** : des quantités un peu plus basses à partir du niveau 16, et plus de paliers quand les niveaux s'allongent. Cible : **une récompense toutes les 3 à 4 minutes** en milieu de partie.
- **Les offres** : 2 cartes au départ, 3 puis 4 avec Éventail (pris deux fois). Un seul tas de cartes, avec une **règle de diversité**.
- **Tout est réglable** dans la configuration, et le simulateur sait surcharger ces réglages pour comparer des variantes.

---

## 1. Décisions prises

| Sujet                     | Décision                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fin de niveau             | La récompense du fil rouge est **donnée d'office**, à chaque niveau, sans écran de choix (comme aujourd'hui aux niveaux 1 et 2).                               |
| Choix                     | Tous les choix passent par les **offres de palier**, qui ne proposent que des objets (jamais une carte du socle).                                              |
| Paliers                   | 50 % à partir du niveau 6 ; 33-66 % à partir du niveau 12 ; 25-50-75 % à partir du niveau 16. Réglable.                                                        |
| Quantités                 | × 0,75 à partir du niveau 16, **niveaux infinis compris**. Réglable.                                                                                           |
| Rythme cible              | Une récompense toutes les 3 à 4 minutes en milieu de partie (niveaux 11 à 30).                                                                                 |
| Taille d'une offre        | 2 cartes au départ. Éventail I la passe à 3, Éventail II à 4 (le maximum).                                                                                     |
| Éventail                  | Très probable dès le premier palier, avec un **filet de sécurité** : s'il n'est pas sorti après N offres, il est forcé dans la suivante. Pas garanti d'emblée. |
| Emplacements              | **Un seul tas**, avec une **règle de diversité** : pas deux cartes du même genre dans une offre, sauf s'il n'y a pas d'autre choix.                            |
| Fil rouge dans les offres | Supprimé : plus de poids du fil rouge, plus de compteur de refus, plus de garde-fou lié au fil rouge.                                                          |
| Déblocages « en avance »  | Écartés pour l'instant (une carte du socle dans une offre de palier recréerait le sentiment d'être forcé). À rediscuter plus tard, comme carte rare.           |
| Sauvegardes               | Pas de migration. Les anciennes sauvegardes sont refusées proprement (`SAVE_VERSION` passe à 3).                                                               |
| Revenir sur une décision  | Autorisé : ce plan revient sur des décisions de `PLAN-recompenses.md` (§1 « Fil rouge », « Niveaux 1 et 2 », §3.1, §3.3).                                      |

---

## 2. Vocabulaire

- **Fil rouge** : la suite des récompenses de `LEVEL_TABLE` (`naturalSequence()`), dans l'ordre. Elle ne change pas.
- **Récompense de niveau** : la carte du fil rouge donnée d'office à la fin d'un niveau.
- **Palier** : une fraction de la quantité d'un niveau (par exemple 50 %). Le franchir ouvre une offre de palier.
- **Offre de palier** : 2 à 4 cartes d'objets, on en prend une.
- **Socle** : les cartes du fil rouge (valeurs, déblocages, fonctions). Elles ne sont **jamais** tirées dans une offre de palier.
- **Objet** : toute carte hors socle (édition, bâtiment spécial, passif, méta).
- **Genre** : la sorte d'effet d'une carte (`effect.kind` : `edition`, `special`, `passive`, `meta`). La règle de diversité porte sur le genre.
- **Filet de sécurité** : une carte qui n'est pas sortie depuis N offres alors qu'elle était disponible est forcée dans l'offre suivante.

---

## 3. Le système

### 3.1 Fin de niveau : le fil rouge d'office

- À la fin du niveau `n`, le jeu donne la carte du fil rouge de `n` (`naturalStep(n)`), comme `fixedReward` le fait aujourd'hui pour les niveaux 1 et 2.
- `OFFERS.fixedUntil` disparaît : **tous** les niveaux sont fixes.
- Si l'élément du fil rouge est déjà possédé (cas du mode debug `setLevel`, ou d'un futur objet qui donnerait la même chose), le niveau donne l'élément suivant non possédé (`naturalAt`), pour ne jamais perdre une récompense.
- **Dernier niveau** : il donne sa récompense de fil rouge, puis l'écran de fin s'ouvre une fois les offres de palier en attente résolues.

### 3.2 Les paliers

**Réglage** (dans `balance.ts`, à côté de `LEVELS`) :

```ts
/** Paliers d'un niveau : à partir de `from`, aux fractions `at` de la quantité. */
export const PALIERS = [
  { from: 6, at: [1 / 2] },
  { from: 12, at: [1 / 3, 2 / 3] },
  { from: 16, at: [1 / 4, 1 / 2, 3 / 4] },
] as const;
```

- **Les paliers d'un niveau** : ceux de la dernière entrée dont `from` est inférieur ou égal au niveau. Avant la première entrée, aucun palier (niveaux 1 à 5).
- **Seuil d'un palier** : `ceil(fraction × quantité)` items livrés de la cible du niveau. Deux paliers qui tombent sur le même seuil (petite quantité) donnent deux offres.
- **Comptage** : le même que la fin de niveau (`deliver` dans `progression.ts`). Un item livré peut franchir un palier et finir le niveau en même temps : l'offre de palier passe alors **avant** la récompense de niveau dans l'ordre des événements, mais la récompense de niveau, elle, s'applique tout de suite (elle n'attend pas de choix).
- **État sauvegardé** : l'index du prochain palier du niveau en cours. Il repart à 0 au niveau suivant.
- **Le 100 % n'est pas un palier** : c'est la fin du niveau, qui donne le fil rouge.

### 3.3 Les quantités

**Réglage** (dans `balance.ts`) :

```ts
/** Facteur sur les quantités, par tranche : le dernier `from` atteint s'applique. */
export const QUANTITY_FACTOR = [{ from: 16, factor: 0.75 }] as const;
```

- `quantityFor(n)` multiplie la quantité de base (tableau ou formule infinie) par le facteur, puis arrondit à la dizaine (au moins 1).
- **Le facteur s'applique jusqu'à la fin, niveaux infinis compris**, pour éviter un saut au niveau 31 (le tableau finit à 14 000 × 0,75 = 10 500 ; sans facteur, la formule infinie repartirait à 14 200).
- `LEVEL_TABLE` garde ses quantités actuelles : le facteur se lit à part, et on peut tester une autre valeur en changeant un seul chiffre.

**Ordre de grandeur attendu** (modèle du simulateur, médianes, à confirmer en phase de réglage) :

| Niveaux | Durée d'un niveau aujourd'hui | Paliers    | Avec × 0,75 dès le 16 | Intervalle entre deux récompenses |
| ------- | ----------------------------- | ---------- | --------------------- | --------------------------------- |
| 1 à 5   | moins d'1 min                 | aucun      | inchangé              | les niveaux eux-mêmes             |
| 6 à 11  | 3 à 5 min                     | 50 %       | inchangé              | 1,5 à 2,5 min                     |
| 12 à 15 | 6 à 12 min                    | 33-66 %    | inchangé              | 2 à 4 min                         |
| 16 à 30 | 15 à 23 min                   | 25-50-75 % | 11 à 17 min           | 3 à 4 min                         |
| 31 et + | environ 15 min                | 25-50-75 % | environ 11 min        | environ 3 min                     |

Les objets gagnés accélèrent la production : en vrai, les intervalles seront un peu plus courts.

### 3.4 Le tirage d'une offre de palier

**Réglage** (dans `cards.ts`, remplace l'actuel `OFFERS`) :

```ts
export const OFFERS = {
  /** Cartes d'une offre sans Éventail. */
  baseCards: 2,
  /** Plafond, Éventail compris. */
  maxCards: 4,
  /** Cartes d'un même genre dans une offre, tant que d'autres genres sont disponibles. */
  maxPerGenre: 1,
} as const;
```

1. **Nombre de cartes** : `min(maxCards, baseCards + cartes supplémentaires des cartes méta prises)`. `META_EFFECTS.eventail.extraSlots` devient `extraCards: 1`.
2. **Cartes disponibles** : les règles actuelles (`isAvailable` : prérequis, `minLevel`, `maxPicks`, déblocage non obtenu), **plus** : aucune carte du socle. Les cartes du socle passent à `slot: null`, ou mieux, le champ `slot` disparaît au profit d'un drapeau `drawable` (à trancher à l'implémentation, §9).
3. **Poids** : `courbe(niveau) × weightScale` (valeurs réglées), puis garde-fous. Plus de poids du fil rouge.
4. **Pour chaque carte de l'offre**, dans l'ordre :
   1. prendre les cartes disponibles qui ne sont pas déjà dans cette offre ;
   2. **diversité** : si certaines n'ont pas encore atteint `maxPerGenre` dans l'offre, ne garder qu'elles ; sinon, garder tout ;
   3. **filet de sécurité** (§3.5) : pour la première carte de l'offre seulement, si une carte disponible a atteint son seuil, elle est prise directement ;
   4. sinon, tirer au prorata des poids ;
   5. pour un bâtiment spécial, tirer son édition d'origine (`SPECIAL_EDITION_ODDS`, inchangé).
5. **Pas assez de cartes** : l'offre en montre moins. **Aucune carte** : le palier ne donne rien, sans écran, avec un toast discret (cas rare : les cartes Édition sont illimitées).
6. **Graine** : `mulberry32(hash2(seed ^ OFFER_SALT, niveau, palier × 8 + rang))`. Une offre reste reproductible pour une graine, un niveau et un palier donnés.
7. **Tirage tardif** : comme aujourd'hui, une offre n'est tirée qu'au moment de s'afficher, donc elle tient compte du choix précédent.

**Exemple** (niveau 9, Éventail non pris, pool : Édition brillante, Édition légendaire, Passif, Éventail, Concaténateur) : la 1re carte tombe sur Édition légendaire ; pour la 2e, la diversité retire Édition brillante (même genre) ; on tire entre Passif, Éventail et Concaténateur.

### 3.5 Éventail et le filet de sécurité

- **Deux cartes au catalogue**, chacune unique (`maxPicks: 1`), qui réutilisent les mécanismes existants :

| Carte        | Effet          | Prérequis              | Niveau min. | Poids de départ |
| ------------ | -------------- | ---------------------- | ----------- | --------------- |
| `eventail`   | +1 carte (→ 3) | aucun                  | 6           | 8               |
| `eventail-2` | +1 carte (→ 4) | carte `eventail` prise | 12          | 6               |

- **Objectif** : environ une chance sur 3 d'être proposé à chaque offre tant qu'il est disponible. Les poids de départ sont à régler par le simulateur (§5).
- **Filet de sécurité, générique** : un champ optionnel `pity?: number` sur une carte du catalogue.
  - Compteur par carte, sauvegardé : nombre d'offres de palier où la carte était **disponible** sans être **proposée**.
  - À `pity`, la carte est forcée dans l'offre suivante (première carte).
  - Le compteur repart à 0 dès que la carte est **proposée**, prise ou non : le but est qu'on la voie, pas qu'on la prenne.
  - Départ proposé : `pity: 4` pour les deux Éventail. Avec une offre toutes les 2 à 4 minutes, on le voit au plus tard après environ 10 minutes de disponibilité.
- Le filet de sécurité servira aussi aux futurs objets qui doivent être vus (un bâtiment phare, par exemple).

### 3.6 Ce qui disparaît

- Le poids du fil rouge (`OFFERS.natural`), le compteur de refus (`naturalRefusals`, `naturalRefusalDecay`) et sa mise à jour dans `rewards.ts`.
- Les emplacements Nombres, Atelier et Joker (`Slot`, `OfferSlot`, `OFFERS.slots`, le repli d'un emplacement vide vers l'autre).
- Le garde-fou factice `no-growth-operator` (le × est désormais donné d'office au niveau 7). Le mécanisme `GUARDS` reste, vide.
- `OFFERS.fixedUntil` et la distinction niveau fixe / niveau à offre.
- Les courbes `unlockCurve` des cartes du socle (elles ne sont plus tirées). Leurs définitions restent : effet, icône, textes, fiche.

---

## 4. Le parcours du joueur

### 4.1 Fin de niveau

1. L'onde et le son actuels, puis un toast « Niveau 8 terminé : Multiplicateur ».
2. La récompense s'applique tout de suite. Sa fiche tutoriel s'affiche si c'est une première (mécanisme actuel, `help.ts`).
3. Le niveau suivant démarre aussitôt.

### 4.2 Franchir un palier

1. Un son léger (plus discret que la fin de niveau) et un toast « Palier atteint ».
2. L'offre entre dans la **file des offres en attente**, qui garde désormais des couples `{ niveau, palier }`.
3. L'écran de choix s'ouvre dans les conditions actuelles (`PLAN-recompenses.md` §4.4 : aucune fenêtre, aucun geste, pas de rattrapage, pas de fiche en attente).
4. **Écran de choix** : celui d'aujourd'hui (`offerScreen.ts`), avec un titre adapté (« Niveau 17, palier 2 / 3 ») et 2 à 4 cartes. Le compteur « 1 / 3 » de la file reste.
5. Le rattrapage hors onglet peut franchir plusieurs paliers et niveaux : les récompenses de niveau s'appliquent, les offres de palier s'empilent dans la file.

### 4.3 Hub, panneaux, écran de fin

- **Hub** (`render/layers/hub.ts`) : la jauge de progression du niveau porte des **repères** à chaque palier ; un repère franchi change d'aspect. L'icône de récompense (`rewardIcon`) montre de nouveau le prochain élément du fil rouge, puisqu'il est garanti.
- **Barre du haut / HUD** (`hud.ts`) : la progression affiche le prochain palier (« 1 200 / 2 500 · palier à 1 875 »), à préciser au jalon interface.
- **Panneau Niveaux** (`panels/levels.ts`) : la colonne récompense montre l'élément du fil rouge et le nombre de paliers (« × · 3 choix »).
- **Écran de fin** (`endScreen.ts`) : le récapitulatif « Tes choix » regroupe les choix par niveau et par palier.
- **Panneau debug** (`debugPanel.ts`) : table des poids d'une offre de palier (sans colonne fil rouge), compteurs du filet de sécurité, bouton « Franchir le palier suivant ».

### 4.4 Ce qui ne change pas

- Fiches tutoriel, outil Édition, inventaire, barre de construction, bâtiments spéciaux, éditions et leurs effets.
- Améliorations : pistes, coûts et fenêtres inchangés.

---

## 5. Simulateur et équilibrage

Le simulateur (`npm run sim`) et le régleur (`npm run tune`) suivent le nouveau système, en lisant les mêmes réglages que le jeu.

### 5.1 La partie simulée

- Chaque niveau donne son fil rouge d'office ; les offres de palier sont tirées avec le vrai code (`drawOffer`).
- **Temps d'un palier** : la fraction correspondante du temps du niveau, calculé avec les outils possédés au moment du palier. Un objet pris au palier 1 accélère donc la suite du niveau.
- Le modèle de coût lui-même ne change pas.

### 5.2 Stratégies

| Stratégie     | Choix à chaque offre de palier                                                 |
| ------------- | ------------------------------------------------------------------------------ |
| `none`        | **référence** : aucun objet (le simulateur seul a le droit de ne rien prendre) |
| `random`      | une carte au hasard                                                            |
| `new`         | une nouveauté si possible, sinon au hasard                                     |
| `object:<id>` | l'objet chaque fois qu'il est proposé, sinon au hasard                         |
| `once:<id>`   | l'objet la première fois, puis au hasard                                       |

- `natural` et `minimal` disparaissent (le fil rouge n'est plus un choix).
- **Indice de difficulté** : temps du niveau divisé par celui de la stratégie `none` pour la même graine. 1,0 veut dire « fil rouge seul ».
- Le mode `?pick=` du jeu (`autoPick.ts`) suit les mêmes modes.

### 5.3 Critères (`PLAN-objets.md` §4, à revoir avec l'auteur)

1. **Pas indispensable** : inchangé, mesuré avec `object:<id>` contre `none`.
2. **Pas inutile** : inchangé, mesuré avec `once:<id>` contre `none`.
3. **Visible** : inchangé dans sa forme (offert au moins une fois avant son niveau repère dans 50 à 80 % des parties). Avec beaucoup plus d'offres, il faudra sans doute baisser les poids, ou relever les bornes.
4. **Proposition, nouveau : pas envahissant.** En médiane, l'objet apparaît dans au plus 40 % des offres où il est disponible. Avec une offre toutes les 3 minutes, revoir sans cesse la même carte use vite. Seuil réglable, critère à valider.

### 5.4 Rapport et options

- **Nouvelles mesures** :
  - intervalle entre deux récompenses (médiane, p10, p90) par tranche de 10 niveaux, avec la cible 3 à 4 minutes rappelée pour 11 à 30 ;
  - temps cumulé pour atteindre les niveaux 10, 20 et 30 ;
  - part des offres où chaque objet apparaît (critère 4).
- **Surcharges sans toucher au code** :
  - `--quantity-factor 0.6` (ou `--quantity-factor 16:0.75,25:0.7`) ;
  - `--paliers "6:1/2;12:1/3,2/3;16:1/4,1/2,3/4"`.
- Le réglage des paliers et des quantités reste **manuel**, à partir de ces mesures : le régleur ne touche que les boutons des objets.

### 5.5 Réglage après coup

- Relancer `npm run tune` sur tout le catalogue (éditions, Concaténateur, Éventail, passif factice), puisque la référence a changé.
- Recaler avec des **parties jouées** : l'heure de chaque choix est enregistrée (`picks[].tick`). Le panneau debug compare le temps réel entre deux récompenses au temps estimé.

---

## 6. Fichiers touchés (indicatif)

| Fichier                                         | Changement                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/config/balance.ts`                         | `PALIERS`, `QUANTITY_FACTOR`                                                                                         |
| `src/sim/levels.ts`                             | `quantityFor` applique le facteur ; fonction `paliersFor(n)`                                                         |
| `src/config/cards.ts`                           | nouvel `OFFERS`, fin des emplacements, `extraCards`, `eventail-2`, champ `pity`, socle non tirable, garde-fou retiré |
| `src/sim/offers.ts`                             | tirage en un seul tas avec diversité et filet de sécurité ; fin du poids du fil rouge                                |
| `src/sim/rewards.ts`                            | fin du compteur de refus ; compteurs du filet de sécurité                                                            |
| `src/sim/progression.ts`                        | paliers dans `deliver` ; `completeLevel` donne le fil rouge ; file de `{ niveau, palier }`                           |
| `src/sim/state.ts`, `src/save/*`                | prochain palier, file des offres, compteurs du filet ; `naturalRefusals` retiré ; `SAVE_VERSION` = 3                 |
| `src/sim/autoPick.ts`                           | modes alignés sur les stratégies                                                                                     |
| `src/ui/offerScreen.ts`, `offerInfo.ts`         | titre du palier ; plus d'étiquette d'emplacement ni « Suite classique »                                              |
| `src/render/layers/hub.ts`, `src/ui/hud.ts`     | repères de paliers, icône du fil rouge                                                                               |
| `src/ui/panels/levels.ts`                       | colonne récompense                                                                                                   |
| `src/ui/endScreen.ts`                           | choix par niveau et palier                                                                                           |
| `src/ui/debugPanel.ts`, `src/debug/debugApi.ts` | table des poids, compteurs, bouton palier                                                                            |
| `src/i18n`                                      | textes : toast de palier, titre de l'écran, Éventail II                                                              |
| `src/simtools/*`                                | partie simulée, stratégies, critère 4, mesures de rythme, surcharges                                                 |
| `.claude/skills/ajouter-objet/SKILL.md`         | plus d'emplacement à choisir pour un objet ; champ `pity` ; critère 4                                                |
| `PLAN-recompenses.md`, `docs/*`                 | note en tête vers ce plan ; décisions et avancement                                                                  |

---

## 7. Tests

### 7.1 Unitaires

- **Quantités** : facteur appliqué à partir de 16 ; continuité entre les niveaux 30 et 31 ; arrondi ; quantité jamais nulle.
- **Paliers** : seuils `ceil` ; changement de régime aux niveaux 6, 12 et 16 ; aucun palier avant 6 ; un item qui franchit un palier et finit le niveau ; plusieurs paliers d'un coup (rattrapage).
- **Fin de niveau** : chaque niveau donne son fil rouge, une seule fois ; élément déjà possédé → élément suivant ; dernier niveau.
- **Tirage** :
  - aucune carte du socle, jamais ;
  - 2, 3 puis 4 cartes selon les Éventail pris, jamais plus de 4 ;
  - diversité respectée tant que d'autres genres sont disponibles, relâchée sinon ;
  - moins de cartes quand le pool est petit ; aucune carte → pas d'écran ;
  - reproductible pour une graine, un niveau et un palier ;
  - filet de sécurité : forcé au seuil, compteur remis à 0 quand la carte est proposée, sans effet sur une carte indisponible.
- **Catalogue** (`validateCatalogue`) : `pity` valide ; carte du socle marquée non tirable ; `eventail-2` requiert `eventail`.
- **Sauvegarde** : aller-retour avec la file `{ niveau, palier }` et les compteurs ; ancienne version refusée proprement.

### 7.2 De bout en bout (Playwright)

- Une partie atteint le palier de 50 % du niveau 6 et choisit une carte ; la fin du niveau ne montre pas d'écran de choix.
- Les repères de paliers apparaissent sur la jauge du Hub.
- Le parcours tactile existant (niveau 1 au doigt) reste vert.

### 7.3 Simulateur

- La stratégie `none` donne un indice de 1 partout.
- Les mesures de rythme sont reproductibles pour une graine donnée.
- Les surcharges `--quantity-factor` et `--paliers` changent bien les durées.

---

## 8. Jalons

| Jalon | Contenu                                                                                               | Fin quand                                                             |
| ----- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P1    | Réglages `PALIERS` et `QUANTITY_FACTOR`, `quantityFor`, `paliersFor`                                  | tests unitaires verts ; niveaux 1 à 15 identiques à aujourd'hui       |
| P2    | Fil rouge d'office, paliers dans `deliver`, file `{ niveau, palier }`, sauvegarde v3                  | une partie complète se joue sans écran de fin de niveau ; tests verts |
| P3    | Tirage en un seul tas, diversité, Éventail I et II, filet de sécurité                                 | tests du tirage verts ; panneau debug à jour                          |
| P4    | Interface : écran de choix, repères du Hub, HUD, panneau Niveaux, écran de fin, textes                | e2e verts ; vérifié au téléphone (portrait, paysage)                  |
| P5    | Simulateur : partie à paliers, stratégies, mesures de rythme, critère 4, surcharges                   | rapport produit ; rythme mesuré dans la cible ou écart expliqué       |
| P6    | Réglage : `npm run tune` sur tout le catalogue, poids d'Éventail, parties de test                     | critères validés par l'auteur ; ressenti des parties noté             |
| P7    | Documentation : skill `ajouter-objet`, `DECISIONS.md`, `PROGRESS.md`, note dans `PLAN-recompenses.md` | skill cohérente avec le nouveau tirage                                |

P1 et P2 forment déjà un jeu jouable (fil rouge d'office, paliers avec le tirage actuel adapté). P3 à P5 peuvent avancer en parallèle une fois P2 posé.

---

## 9. Questions ouvertes

1. **Poids de départ d'Éventail** (8 et 6) et **seuil du filet** (4 offres) : à confirmer avec le simulateur.
2. **Critère 4 « pas envahissant »** : à valider, avec son seuil (40 % proposé).
3. **Champ `slot`** : le garder (`null` pour le socle) ou le remplacer par un drapeau `drawable` plus lisible.
4. **Palier sans carte disponible** : toast discret proposé ; on pourrait aussi donner une petite compensation.
5. **Repère de palier dans le HUD** : forme exacte à décider au jalon P4 (repères sur la jauge, texte, les deux).
6. **Recalage en temps réel** : après P6, comparer les intervalles mesurés en partie aux 3 à 4 minutes visées, et ajuster `PALIERS` ou `QUANTITY_FACTOR`.
