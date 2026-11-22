# PLAN-recompenses.md : choisir sa récompense au Hub

> **État : à valider.** Branche `claude/hub-objectives-reward-choices-kdavx9`. Ce document décrit le travail ; il ne modifie aucun code. Les choix faits en cours de route iront dans [`docs/DECISIONS.md`](docs/DECISIONS.md), l'avancement dans [`docs/PROGRESS.md`](docs/PROGRESS.md).

---

## 0. Résumé

- **Aujourd'hui**, chaque niveau donne une récompense fixe (PLAN §7.2). Toutes les parties suivent la même trame.
- **Demain**, à la fin d'un niveau, le Hub propose **2 cartes** (3 avec la carte Éventail). Le joueur en prend une, sans coût. Les cartes sont tirées dans un **catalogue** décrit en configuration : poids par niveau, prérequis, éditions (base, brillante, légendaire).
- **La trame actuelle reste la référence** : la carte « fil rouge » propose la prochaine récompense du tableau actuel. Un joueur qui la prend toujours retrouve le jeu d'aujourd'hui, déjà équilibré.
- **Quatre phases** :
  1. Moteur et ergonomie, avec des objets factices (§5).
  2. Premiers vrais objets (2 ou 3) et simulateur de tirages (§6).
  3. Simulateur de rythme et équilibrage (§7).
  4. Ajout progressif de contenu (§8).

---

## 1. Décisions déjà prises

| Sujet                         | Décision                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coût d'une carte              | Aucun. On prend 1 carte parmi N. Pas de monnaie.                                                                                                                                        |
| Ouverture de l'écran de choix | Automatique en fin de niveau. Le jeu continue derrière (pas de pause).                                                                                                                  |
| Forme d'une carte             | Recto : image de l'objet dans son édition, puis son nom. Un clic retourne la carte (explications). Un bouton « Choisir » sous chaque carte, retournée ou non : un seul clic suffit.     |
| Fil rouge                     | Le premier élément du tableau actuel que le joueur n'a pas encore. Son poids baisse à chaque refus, sans descendre sous la courbe normale de la carte.                                  |
| Fiches tutoriel               | Après le choix, seulement si le joueur obtient quelque chose de nouveau pour la première fois de la partie (une valeur, un bâtiment, une fonction, une édition, un exemplaire limité…). |
| Dépendances                   | Une carte n'est proposée que si ses prérequis sont remplis : pas de 3 sans le 2, pas de − sans le ×, etc.                                                                               |
| Valeurs extractibles          | Débloquées une par une, dans l'ordre (2, 3, … 9, 11, …). Le 10 reste interdit sur la carte.                                                                                             |
| Probabilités                  | Calculées avant chaque tirage : courbes par niveau, ajustables (le système de boutique de Balatro sert de modèle).                                                                      |
| Éditions                      | Base, brillante, légendaire, avec des taux de départ de 85 / 10 / 5 %.                                                                                                                  |
| Sauvegardes existantes        | Pas de migration. Les anciennes sauvegardes sont refusées proprement.                                                                                                                   |
| Contenu                       | Pas décidé maintenant. La phase 1 utilise des objets factices ; on ajoute ensuite les objets un par un.                                                                                 |

---

## 2. Vocabulaire

- **Offre** : l'ensemble des cartes proposées à la fin d'un niveau.
- **Emplacement** : une place dans l'offre. Il y en a deux de départ, **Nombres** et **Atelier**. La carte Éventail en ajoute un troisième, **Joker**.
- **Carte** : une entrée du catalogue (débloquer le ×, valeur suivante, 1 exemplaire du +, Éventail…).
- **Fil rouge** : la suite des récompenses du tableau actuel (PLAN §7.2), dans l'ordre.
- **Édition** : la qualité d'un exemplaire de bâtiment (base, brillante, légendaire).
- **Exemplaire limité** : un bâtiment qu'on possède en nombre fini, par opposition à un bâtiment débloqué, qu'on pose sans limite.
- **Garde-fou** : une règle explicite qui modifie les poids dans une situation précise.

---

## 3. Le système

### 3.1 Le fil rouge

Le tableau actuel (`LEVEL_TABLE` dans `balance.ts`), déroulé dans l'ordre, donne la suite :

> +, Améliorations, valeur, Pont, valeur, valeur, ×, valeur, valeur, Priorités, valeur, valeur, −, valeur, valeur, ÷, valeur, valeur, ^, valeur, valeur, Stockage, valeur × 8, puis valeur à l'infini.

Chaque « valeur » du tableau correspond déjà à exactement une nouvelle valeur (Extraction 2, 3, 4… 9, 11 : le 10 est sauté). Le passage aux valeurs une par une ne change donc rien pour qui suit le fil rouge.

**La carte fil rouge d'une offre** est le premier élément de cette suite que le joueur n'a pas encore. La k-ième « valeur » de la suite est considérée comme acquise si `maxExtraction` l'atteint.

- Un joueur qui a refusé le 2 voit donc revenir « Valeur 2 » comme fil rouge.
- **Pour qu'un joueur qui refuse volontairement ne soit pas harcelé**, le poids du fil rouge baisse à chaque refus : `poids × naturalRefusalDecay ^ refus` (par exemple 0,7, à régler en phase 3).
  - Un **refus** : l'offre contenait la carte fil rouge et le joueur en a pris une autre. Une offre sans la carte fil rouge ne compte pas.
  - Le compteur suit **un élément du fil rouge** : il repart à 0 dès que cet élément est obtenu (par la carte fil rouge ou autrement) et que le fil rouge passe au suivant.
  - Le poids ne descend jamais sous la courbe normale de la carte : refuser le 2 dix fois le rend aussi rare qu'une carte ordinaire, pas introuvable.
- **Niveaux 1 et 2** : récompense du fil rouge donnée directement, sans écran (`OFFERS.fixedUntil = 2`). Le premier écran de choix arrive à la fin du niveau 3.

### 3.2 Le catalogue

Un seul fichier, `src/config/cards.ts`, décrit toutes les cartes. Aucune règle de jeu propre à une carte n'est écrite ailleurs que dans son effet.

| Genre     | Effet                                                            | Éditions    | Exemple            |
| --------- | ---------------------------------------------------------------- | ----------- | ------------------ |
| `value`   | valeur extractible suivante (`maxExtraction` + 1, en sautant 10) | non         | Valeur 5           |
| `unlock`  | débloque un bâtiment ou une fonction, sans limite                | non         | ×, Pont, Priorités |
| `copies`  | donne N exemplaires d'un bâtiment                                | oui (tirée) | 1 + brillant       |
| `passive` | règle globale permanente                                         | non         | opérateurs + 5 %   |
| `meta`    | modifie les offres suivantes                                     | non         | Éventail           |

**Poids** : des poids relatifs, pas des pourcentages. Les cartes disponibles se partagent le tirage au prorata, donc ajouter une carte ne casse pas les autres. Un poids est une **courbe** : quelques points `(niveau, poids)`, interpolés linéairement ; avant le premier point, on prend la première valeur, après le dernier, la dernière.

**Disponibilité** d'une carte : tous ses prérequis sont remplis, `minLevel` est atteint, et elle n'a pas atteint `maxPicks` (1 pour une carte unique). Une carte `unlock` déjà obtenue n'est plus disponible.

**Poids initiaux des déblocages actuels** (phase 1) : chaque courbe est centrée sur le niveau du tableau actuel. Le × (niveau 7 dans le tableau) a par exemple un poids faible avant 5, maximal vers 7, puis moyen. Ainsi, même hors fil rouge, l'ordre reste proche de l'actuel tant que la phase 3 n'a pas réglé les poids.

**Prérequis proposés pour l'existant** (à valider) :

| Carte         | Prérequis                |
| ------------- | ------------------------ |
| Valeur k      | valeur précédente        |
| +             | aucun (fixe au niveau 1) |
| Améliorations | aucun (fixe au niveau 2) |
| Pont          | aucun                    |
| ×             | +                        |
| Priorités     | Pont                     |
| −             | ×                        |
| ÷             | −                        |
| ^             | ×                        |
| Stockage      | niveau 12 ou plus        |

Les **pistes d'amélioration** restent liées aux bâtiments débloqués (`isTrackUnlocked`). Un exemplaire limité d'un bâtiment non débloqué tourne à la vitesse de base de sa piste (niveau 1), multipliée par son édition.

### 3.3 Le tirage d'une offre

1. **Emplacements** : Nombres et Atelier, plus Joker si le joueur a Éventail.
2. **Pour chaque emplacement**, dans l'ordre :
   1. lister les cartes disponibles de cet emplacement (Joker : toutes), sans celles déjà tirées dans cette offre ;
   2. calculer leur poids : courbe du niveau, poids du fil rouge, puis garde-fous, puis effets des cartes du joueur (par exemple une future Loupe) ;
   3. tirer une carte au prorata des poids ;
   4. tirer son édition si elle en accepte.
3. **Le fil rouge** : la carte qui correspond au fil rouge prend le poids `max(sa courbe, courbe du fil rouge)` dans son emplacement et dans Joker.
4. **Emplacement vide** : on tire dans l'autre emplacement. Nombres n'est jamais vide (la valeur suivante existe toujours), donc une offre a au moins une carte.
5. **Hasard déterministe** : `mulberry32(hash2(seed ^ OFFER_SALT, niveau, indexEmplacement))`, sur le modèle de `levelDraw`. Une offre dépend de la graine, du niveau et de l'état au moment du tirage (cartes déjà prises).
6. **L'offre est tirée au moment où elle s'affiche** (pas à la fin du niveau, voir §4.4), puis **enregistrée dans la sauvegarde** : recharger la partie ne permet pas de retirer.

**Garde-fous** : une liste de règles lisibles en configuration, du type `{ si: contexte → booléen, cartes: [...], facteur: 3 }`. Exemple : « niveau 12 ou plus et aucun opérateur de croissance, donc × et ‖ × 3 ». La phase 1 met en place le mécanisme avec une règle factice ; les vraies règles viennent en phase 3.

### 3.4 Les éditions

- **Taux** : `EDITIONS = { base: 85, brillante: 10, legendaire: 5 }`, éventuellement en courbes par niveau.
- **Effet commun**, comme dans Balatro, pour que le joueur apprenne la règle une seule fois :
  - brillante : vitesse × 1,25 (opérateurs : cycle ; extracteur : débit) ;
  - légendaire : vitesse × 1,5, plus l'effet propre du bâtiment s'il en a un.
- **Exception par bâtiment** possible dans sa carte (`editionEffects`). Exemple pour le stockage : la capacité plutôt que la vitesse.
- **Seules les cartes `copies` ont une édition.** Débloquer le × ou une valeur n'a pas d'édition.
- **Rendu** : la base reste comme aujourd'hui ; la brillante est en craie nacrée avec un reflet ; la légendaire en craie dorée avec une petite étoile. Le même code couleur sert sur la carte de l'offre, dans la barre de construction, sur le fantôme et dans l'info-bulle.

### 3.5 Les exemplaires limités

- **On enregistre ce qu'on possède, on calcule ce qui reste.** L'état garde `owned["adder:brillante"] = 1`. Le nombre d'exemplaires disponibles vaut `possédés − posés`, recompté à partir des bâtiments du monde.
  - Conséquence : démolir, couper, déplacer, annuler et rétablir restent justes **sans code spécial**. Le journal d'annulation (`journal.ts`, `history.ts`) ne connaît pas l'inventaire.
  - La seule vérification se fait à la pose : refus si `posés ≥ possédés`.
- **Un bâtiment débloqué** reste illimité en édition de base. Une édition est toujours limitée.
- **Le bâtiment porte son édition** : `Building.edition?: 'brillante' | 'legendaire'` (absent = base), enregistrée dans la sauvegarde et dans les copies (`ClipBuilding.edition`).
- **Coller ou rétablir sans exemplaire disponible** : on pose la version de base si le bâtiment est débloqué, sinon la pose est bloquée (fantôme rouge, comme un emplacement occupé). À valider (§9).
- **Pose en rangée** (`planOperatorRow`) : la rangée s'arrête au dernier exemplaire disponible.
- **Pipette** (`E`) : reprend le bâtiment avec son édition.

### 3.6 Les valeurs extractibles

- `maxExtraction` reste le seul état. Comme les valeurs arrivent dans l'ordre, « toutes les valeurs ≤ max sauf 10 » reste exact.
- La carte `value` fait `maxExtraction` + 1, ou + 2 pour passer de 9 à 11.
- Niveaux infinis : plus de récompense « Extraction n − 7 » ; chaque niveau donne une offre, et le fil rouge y est « valeur suivante ».

---

## 4. Le parcours du joueur

### 4.1 Fin de niveau

1. La livraison termine le niveau : l'onde et le son actuels, puis un toast « Niveau 8 terminé » (sans récompense : elle n'est pas encore choisie).
2. Le niveau suivant démarre tout de suite. Les livraisons continuent de compter.
3. Le niveau terminé entre dans la **file des offres en attente**.
4. L'écran de choix s'ouvre dès que les conditions du §4.4 le permettent.

### 4.2 L'écran de choix

```
┌───────────────────────────────────────────────────┐
│                NIVEAU 8 TERMINÉ                   │
│              Choisis ta récompense                │
│    (Tu gardes ce choix pour toute la partie.)     │  ← 1re fois seulement
│                                                   │
│   ┌─────────────┐   ┌─────────────┐               │
│   │             │   │      ✦      │               │
│   │   [image    │   │   [image    │               │
│   │    du ×]    │   │  du + doré] │               │
│   │             │   │             │               │
│   │Multiplicat. │   │ Additionneur│               │
│   └─────────────┘   └─────────────┘               │
│     [ Choisir ]       [ Choisir ]                 │
│                                                   │
│                  Voir la carte                    │
└───────────────────────────────────────────────────┘

Carte retournée (après un clic sur la carte) :
   ┌─────────────┐
   │ ATELIER     │
   │ Additionneur│
   │ légendaire  │
   │ Exemplaire×1│
   │ Vitesse ×1,5│
   │ Fait A + B. │
   │ [Nouveau]   │
   └─────────────┘
     [ Choisir ]
```

- **Recto** : l'**image de l'objet dans son édition** et, en dessous, son **nom**. Rien d'autre, pour que la carte se lise d'un coup d'œil.
  - Bâtiment : la même image que dans la barre de construction (`drawToolIcon`, `toolIcons.ts`), dans la bonne orientation, en craie nacrée ou dorée selon l'édition.
  - Valeur : le nombre entouré à la craie, dans sa couleur d'item (`ITEM_CHALKS`).
  - Fonction, passif, méta : une icône à la craie, comme les fiches tutoriel actuelles.
- **Verso** (clic ou toucher sur la carte, qui se retourne) : l'emplacement, le nom complet avec l'édition, ce que la carte donne (débloqué sans limite, ou exemplaire × N), l'effet de l'édition, une ou deux phrases d'explication et les étiquettes (Nouveau, Unique, Suite classique). Un nouveau clic la remet au recto.
- **Un bouton « Choisir » sous chaque carte**, retournée ou non. **Un seul clic suffit** pour qui connaît déjà le jeu ; retourner la carte reste facultatif.
- **Clavier** :
  - `Tab` passe d'une carte à son bouton, puis à la carte suivante ;
  - `Entrée` ou `Espace` sur une carte la retourne ; sur un bouton, choisit ;
  - `Échap` = Voir la carte.
  - **Pas de raccourci `1` `2` `3` pour choisir** : ces touches choisissent déjà les bâtiments, et l'écran s'ouvre tout seul. Un joueur qui appuie sur `2` pour prendre un outil au moment où l'écran apparaît choisirait une carte par erreur.
- **Protection contre le clic de trop** : l'écran s'ouvre pendant que le joueur construit. Les boutons « Choisir » restent inactifs environ 400 ms après l'ouverture (ils s'allument en fondu), pour qu'un clic destiné à la carte ne choisisse pas une récompense.
- **Voir la carte** : ferme l'écran sans choisir. L'offre reste en attente : un badge « Récompense à choisir » apparaît sur le Hub et dans la barre du haut, et le toucher rouvre l'écran. Une offre réduite ne se rouvre pas toute seule ; l'offre suivante, si.
- **Mise en page** : cartes côte à côte, empilées en portrait étroit, chacune avec son bouton dessous. En téléphone paysage (342 px de haut), l'image est réduite, mais le recto garde l'image et le nom.
- **Animation** : la carte pivote sur elle-même (environ 300 ms). Avec « Réduire les animations », le recto est remplacé par le verso instantanément.
- **Accessibilité** :
  - `role="dialog"`, focus piégé (`trapTab`, comme les fiches) ;
  - la carte est un bouton avec `aria-pressed` (retournée ou non), et son verso sert de description (`aria-describedby`), donc un lecteur d'écran lit l'explication sans retourner la carte ;
  - chaque bouton « Choisir » nomme sa carte (« Choisir Additionneur légendaire »).
- **Son** : l'arpège de fin de niveau existe déjà ; on ajoute un léger bruit de carte au retournement, et un son doux au choix.

### 4.3 Après le choix : les fiches tutoriel

- La récompense s'applique, avec un toast « Obtenu : Additionneur brillant ».
- Les fiches utilisent le mécanisme actuel (`help.ts` : `when(state)` et `helpSeen`). Une carte prise rend son `when` vrai, donc la fiche passe en attente toute seule. **Rien n'est montré pour ce qu'on connaissait déjà.**
- **Nouvelles fiches** :

| Fiche                | S'affiche la 1re fois que…                                                       |
| -------------------- | -------------------------------------------------------------------------------- |
| `value`              | une valeur est obtenue par une carte (« Les gisements de 2 sont extractibles. ») |
| `copies`             | on obtient un exemplaire limité (compteur, démolir le rend)                      |
| `edition.brillante`  | on obtient une première édition brillante                                        |
| `edition.legendaire` | on obtient une première édition légendaire                                       |
| `passive`            | on obtient un premier passif                                                     |
| `eventail`           | on prend Éventail                                                                |

- Les fiches des bâtiments et fonctions existants ne changent pas.
- **Ordre** : choix → fiches de ce choix → offre suivante. `showPendingTip` (dans `main.ts`) attend aussi que l'écran de choix soit fermé, et l'écran de choix attend qu'aucune fiche ne soit en attente.

### 4.4 Plusieurs offres en attente

Le rattrapage après une absence (`catchUp.ts`, jusqu'à 10 minutes simulées) peut terminer plusieurs niveaux d'un coup.

- La file garde les **numéros de niveau**. L'offre du premier niveau de la file n'est tirée qu'au moment de s'afficher, donc elle tient compte du choix précédent (prérequis, cartes uniques).
- L'écran indique « 1 / 3 » quand plusieurs offres attendent.
- **L'écran s'ouvre seulement quand** :
  - aucune fenêtre n'est ouverte (menu, fiche, écran de fin, éditeur de marqueur) ;
  - aucun geste n'est en cours (tracé de tapis, sélection, collage glissé) ;
  - le rattrapage est fini ;
  - aucune fiche n'est en attente.

### 4.5 Barre de construction

- **Un outil par type de bâtiment**, comme aujourd'hui. Un bâtiment non débloqué dont on possède un exemplaire apparaît dans la barre avec son compteur.
- **Compteur** en pastille sur l'outil (`×1`). Rien ne s'affiche pour une version de base illimitée.
- **Variantes** : si on possède des éditions d'un bâtiment, une petite rangée au-dessus de l'outil propose Base ∞ / Brillant ×1 / Légendaire ×1 (même emplacement que les boutons tactiles actuels). Au clavier, appuyer de nouveau sur la touche de l'outil fait défiler les variantes.
- Arrivé à 0 exemplaire, la variante est grisée et l'outil revient à la version de base.

### 4.6 Hub, panneaux, info-bulle, écran de fin

- **Hub** : l'icône de la prochaine récompense (`rewardIcon`) devient une icône « 2 cartes » (ou l'icône fixe pour les niveaux 1 et 2).
- **Panneau Niveaux** : la colonne récompense affiche « Choix » (« Choix : 3 cartes » avec Éventail).
- **Info-bulle** d'un bâtiment : l'édition et son effet.
- **Écran de fin** : un récapitulatif « Tes choix », niveau par niveau. C'est ce qui rend chaque partie racontable (phase 1 si le temps le permet, sinon phase 2).

---

## 5. Phase 1 : moteur et ergonomie, avec des objets factices

**But** : tout le système fonctionne de bout en bout, avec le contenu actuel et quelques objets factices qui couvrent chaque cas d'interface. Pas de nouveau bâtiment.

### 5.1 Modèle de données (indicatif)

```ts
// src/config/cards.ts
export type Slot = 'nombres' | 'atelier';
export type Edition = 'base' | 'brillante' | 'legendaire';
export type CurvePoint = { level: number; w: number };

export type Prereq =
  | { building: PlaceableType }
  | { feature: Feature }
  | { value: number }
  | { card: string }
  | { level: number };

export type CardEffect =
  | { kind: 'value' }
  | { kind: 'unlock'; building: PlaceableType }
  | { kind: 'feature'; feature: Feature }
  | { kind: 'copies'; building: PlaceableType; count: number }
  | { kind: 'passive'; id: PassiveId }
  | { kind: 'meta'; id: MetaId };

export interface CardDef {
  id: string;
  slot: Slot;
  effect: CardEffect;
  requires?: readonly Prereq[];
  minLevel?: number;
  /** 1 = carte unique ; absent = sans limite. */
  maxPicks?: number;
  weight: readonly CurvePoint[];
  /** Les cartes `copies` seulement. */
  editions?: boolean;
  editionEffects?: Partial<Record<Exclude<Edition, 'base'>, EditionEffect>>;
  /** Fiche tutoriel montrée la première fois. */
  tip?: string;
  icon: string;
  title: MessageKey;
  text: MessageKey;
  /** Objet factice, à retirer ou remplacer en phase 2. */
  placeholder?: boolean;
}

export const OFFERS = {
  fixedUntil: 2,
  slots: ['nombres', 'atelier'] as const,
  natural: [
    { level: 3, w: 50 },
    { level: 20, w: 25 },
    { level: 40, w: 15 },
  ],
  naturalRefusalDecay: 0.7,
};
export const EDITIONS = { base: 85, brillante: 10, legendaire: 5 };
export const EDITION_DEFAULTS = { brillante: { speed: 1.25 }, legendaire: { speed: 1.5 } };
export const GUARDS: readonly Guard[] = [];
```

```ts
// Ajouts à GameState (src/sim/state.ts)
picks: { level: number; card: string; edition: Edition; tick: number }[];
/** Niveaux terminés dont l'offre n'est pas encore choisie, dans l'ordre. */
pendingLevels: number[];
/** Offre tirée pour pendingLevels[0], enregistrée pour ne pas changer au rechargement. */
currentOffer: { level: number; cards: { card: string; edition: Edition }[] } | null;
/** Exemplaires possédés, par "type:édition". Les disponibles se calculent. */
owned: Record<string, number>;
passives: PassiveId[];
/** Refus de l'élément actuel du fil rouge (remis à 0 quand il est obtenu). */
naturalRefusals: number;
```

Le type `Reward` actuel devient l'effet d'une carte (`CardEffect`). `rewardFor(n)` disparaît au profit de `naturalAt(state)` (fil rouge) et `drawOffer(state, level)`.

### 5.2 Fichiers touchés

| Zone          | Fichiers                                                                                                                                                 | Changement                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Configuration | `config/cards.ts` (nouveau), `config/balance.ts`                                                                                                         | catalogue, `OFFERS`, `EDITIONS`, fil rouge tiré de `LEVEL_TABLE`                  |
| Tirage        | `sim/offers.ts` (nouveau)                                                                                                                                | disponibilité, poids, tirage, fil rouge, garde-fous (fonctions pures)             |
| Progression   | `sim/progression.ts`, `sim/levels.ts`, `sim/state.ts`                                                                                                    | file d'attente, `chooseCard`, application des effets, `setLevel` par le fil rouge |
| Éditions      | `sim/entities.ts`, `sim/operators.ts`, `sim/extractor.ts`                                                                                                | `Building.edition`, `cycleDuration(world, building)`, débit × édition             |
| Exemplaires   | `build/placement.ts`, `build/clipboard.ts`, `build/move.ts`, `sim/clip.ts`                                                                               | contrôle à la pose, édition copiée et collée, version de base sinon               |
| Sauvegarde    | `save/schema.ts`, `save/serialize.ts`, `save/migrations.ts`, `save/manager.ts`                                                                           | version 2, nouveaux champs, v1 refusée avec un message clair                      |
| Interface     | `ui/offerScreen.ts` (nouveau), `ui/buildBar.ts`, `ui/topBar.ts`, `ui/hud.ts`, `ui/panels/levels.ts`, `ui/tooltip.ts`, `ui/endScreen.ts`, `ui/styles.css` | écran de choix, badge, compteurs, variantes, colonne « Choix », récapitulatif     |
| Câblage       | `main.ts`                                                                                                                                                | ouverture automatique (§4.4), ordre fiches / offres, toasts                       |
| Rendu         | `render/layers/buildings.ts`, `render/layers/ghosts.ts`, `render/layers/hub.ts`, `config/colors.ts`                                                      | craie nacrée et dorée, icône « cartes »                                           |
| Fiches        | `ui/help.ts`, `tutorial/scenes.ts`                                                                                                                       | nouvelles fiches (§4.3)                                                           |
| Textes        | `i18n/fr.ts`, `i18n/en.ts`                                                                                                                               | cartes, écran, fiches, toasts                                                     |
| Debug         | `debug/debugApi.ts`, `ui/debugPanel.ts`                                                                                                                  | voir §5.4                                                                         |

### 5.3 Objets factices

Chacun couvre un cas d'interface précis. Ceux marqués « réel » sont jouables pour de bon et peuvent rester après la phase 1.

| Carte                                                                        | Genre          | Ce qu'elle teste                                            | Statut                  |
| ---------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- | ----------------------- |
| Déblocages actuels (+, ×, −, ÷, ^, Pont, Priorités, Stockage, Améliorations) | `unlock`       | fil rouge, prérequis, fiches existantes                     | réel                    |
| Valeur suivante                                                              | `value`        | carte sans édition, nouvelle fiche `value`                  | réel                    |
| 1 exemplaire de + (édition tirée)                                            | `copies`       | compteur, variantes, craie nacrée et dorée, démolir le rend | réel                    |
| 1 exemplaire d'extracteur (édition tirée)                                    | `copies`       | effet sur le débit, pose aimantée                           | réel                    |
| 1 exemplaire de × (édition tirée), avant que le × soit débloqué              | `copies`       | bâtiment possédé mais pas débloqué                          | factice (à décider, §9) |
| Opérateurs + 5 %                                                             | `passive`      | carte sans bâtiment, liste des effets actifs                | factice                 |
| Éventail                                                                     | `meta`, unique | 3e emplacement, sortie du tirage après la prise             | réel                    |
| Garde-fou factice                                                            | règle          | mécanisme des garde-fous, visible dans le panneau debug     | factice                 |

### 5.4 Debug et tests automatisés

- **URL** : `?pick=natural|first|random` choisit tout seul (comme `?tutorial=0`). Les tests de bout en bout existants (`levels.spec`, `finish.spec`, `upgrades.spec`, `play.spec`) passent en `?pick=natural` et restent verts.
- **API** (`window.__sumflow`) :
  - `offer()` : l'offre courante et les poids de chaque carte disponible ;
  - `forceOffer(['mult', 'copies-adder'], edition?)` ;
  - `choose(index)` ;
  - `grant(cardId, edition?)` ;
  - `setLevel(n)` : accorde le fil rouge des niveaux précédents.
- **Panneau debug** : un tableau des cartes disponibles, avec leur poids brut, le facteur de chaque garde-fou et leur probabilité finale.

### 5.5 Tests

- **Unitaires** :
  - validation du catalogue : identifiants uniques, prérequis existants, pas de boucle de dépendances, poids ≥ 0, `editions` seulement sur `copies` ;
  - tirage déterministe (même état donne la même offre) ;
  - aucune carte en double dans une offre ;
  - prorata exact sur un grand nombre de tirages ;
  - emplacement vide qui bascule sur l'autre ;
  - le fil rouge suivi de bout en bout redonne exactement l'ordre de `LEVEL_TABLE` ;
  - valeurs 9 → 11 ;
  - répartition des éditions ;
  - exemplaires : pose refusée à 0 ; démolir, annuler, rétablir et coller gardent le compte juste ;
  - sauvegarde aller-retour avec les nouveaux champs, v1 refusée.
- **De bout en bout** :
  - l'écran s'ouvre en fin de niveau 3 et pas aux niveaux 1 et 2 ;
  - retourner une carte (clic, toucher, `Entrée`), puis la remettre au recto ;
  - « Choisir » en un clic, carte retournée ou non ;
  - boutons inactifs pendant les 400 ms qui suivent l'ouverture ;
  - les touches `1` à `9` ne choisissent jamais de carte ;
  - « Voir la carte » puis badge, puis réouverture ;
  - une fiche après une nouveauté, aucune sinon ;
  - rattrapage avec 2 niveaux terminés, donc « 1 / 2 » ;
  - recharger garde l'offre ;
  - compteur de la barre de construction ;
  - craie dorée visible (contrôle de pixels, comme `pixels.ts`).

### 5.6 Jalons

| Jalon                               | Contenu                                                                                                                      | Jouable ?                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **R1** Catalogue et tirage          | `cards.ts`, `offers.ts`, tests unitaires. Aucune interface.                                                                  | non (code seul)                    |
| **R2** Progression et sauvegarde    | file d'attente, `chooseCard`, valeurs une par une, sauvegarde v2, API debug, `?pick=`                                        | oui, choix automatique             |
| **R3** Écran de choix               | `offerScreen.ts`, règles d'ouverture, Voir la carte et badge, clavier, tactile, toasts, Hub, panneau Niveaux, textes FR/EN   | **oui, première version à tester** |
| **R4** Fiches après le choix        | nouvelles fiches, ordre fiches / offres                                                                                      | oui                                |
| **R5** Éditions et exemplaires      | `Building.edition`, possédés / posés, pose, collage, déplacement, compteurs, variantes, craie, info-bulle, effets de vitesse | oui                                |
| **R6** Objets factices et finitions | passif et garde-fou factices, panneau des poids, récapitulatif de fin, tests de bout en bout restants                        | oui                                |

Chaque jalon se termine par `npm run lint`, `npm test`, `npm run build` et `npm run test:e2e`, puis une mise à jour de `docs/PROGRESS.md` et `docs/DECISIONS.md`.

### 5.7 Fin de la phase 1

- Une partie se joue du niveau 1 à la fin en ne prenant que le fil rouge, avec le même ordre de déblocage qu'aujourd'hui (test automatique).
- Chaque genre de carte (`value`, `unlock`, `copies`, `passive`, `meta`) existe au moins une fois, avec son rendu, sa fiche et ses tests.
- L'écran est utilisable à la souris, au clavier, au doigt, sur ordinateur, tablette et téléphone en paysage.

---

## 6. Phase 2 : premiers vrais objets et simulateur de tirages

### 6.1 Fiche d'un objet (modèle à remplir pour chaque ajout)

| Champ                     | Contenu                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Identité                  | id, nom FR/EN, icône, couleur de craie                                                                            |
| Carte                     | genre, emplacement, nombre d'exemplaires, `maxPicks`, prérequis, `minLevel`, courbe de poids                      |
| Bâtiment (s'il y en a un) | empreinte, ports (rôles et faces, comme PLAN §6.3), règle de calcul, piste d'amélioration (existante ou nouvelle) |
| Éditions                  | effet brillant, effet légendaire (ou les effets communs)                                                          |
| Fiche tutoriel            | titre, texte, scène de démo                                                                                       |
| Tests                     | règle de calcul, ports, sauvegarde, rendu                                                                         |

### 6.2 Candidats (2 ou 3, à choisir au début de la phase)

- **Concaténateur `‖`** : `A ‖ B` colle les chiffres (`1 ‖ 1 = 11`, `47 ‖ 0 = 470`). Points à fixer : le signe (celui de A), un B négatif, la saturation (`INT_MAX`), sa piste de vitesse. C'est un opérateur de croissance, concurrent du ×.
- **Relais du Hub** : un petit point de livraison, à poser loin du Hub, qui compte comme le Hub. Il change la disposition de l'usine. Effet légendaire possible : chaque livraison compte double.
- **Extracteur de prospection** : extrait une seule valeur au-dessus du plafond (le gisement choisi à la pose).

### 6.3 Simulateur de tirages

- **Commande** : `npm run sim:offers`, avec un mode Vitest dédié, sur le modèle de `npm run bench` (`vite.config.ts`). Il n'utilise que les fonctions pures de `offers.ts`.
- **Stratégies de joueur simulées** : toujours le fil rouge ; au hasard ; toujours une nouveauté ; minimaliste (refuse les valeurs) ; collectionneur (prend les exemplaires).
- **Sorties**, niveau par niveau, sur 10 000 graines :
  - probabilité qu'une carte soit **proposée**, puis **prise** ;
  - probabilité que le fil rouge soit présent dans une offre ;
  - nombre d'éditions vues et obtenues ;
  - emplacements vides ;
  - cartes jamais vues.
- **Format** : un tableau Markdown dans le terminal, plus un CSV pour aller plus loin. Une page HTML de graphiques pourra venir en phase 3.

---

## 7. Phase 3 : simulateur de rythme et équilibrage

**Limite assumée** : on ne simule pas une vraie usine. On estime un **coût relatif** par niveau, comparé à la partie de référence (le fil rouge).

1. **Coût d'un nombre** avec un jeu d'outils (valeurs, opérateurs, éditions) : le nombre minimal d'opérations et d'items bruts pour fabriquer la cible.
   - Jusqu'à environ 10⁶ : plus court chemin sur les nombres (Dijkstra : chaque opération disponible relie deux nombres déjà atteints).
   - Au-delà : décompositions heuristiques (facteurs pour le ×, chiffres pour le ‖, base k pour × et +).
2. **Débit estimé** : vitesse des opérateurs selon les améliorations probables à ce niveau, multipliée par les éditions possédées.
3. **Indice de difficulté** d'un niveau : `quantité × coût / débit`, divisé par la même valeur dans la partie de référence. 1,0 veut dire « comme aujourd'hui ».
4. **Objectifs de réglage** (à discuter) : 90 % des parties restent entre 0,5 et 2 à chaque niveau, et aucune ne reste au-dessus de 5 plus de 3 niveaux de suite. Sinon, on ajoute un garde-fou ou on change une courbe.
5. **Vérification en vrai** : `picks[].tick` enregistre l'heure de chaque choix. Le panneau debug compare le temps réel de chaque niveau à l'indice estimé, pour recaler le modèle.

---

## 8. Phase 4 et suivantes : ajouter du contenu

Pour chaque nouvel objet :

1. Remplir sa fiche (§6.1).
2. Ajouter sa carte dans `cards.ts`, et son bâtiment si besoin (`buildings.ts`, simulation, rendu).
3. Écrire ses textes FR/EN, sa fiche tutoriel et sa démo.
4. Ajouter ses tests (unitaires, plus un test de bout en bout s'il a une interface propre).
5. Lancer `sim:offers`, puis le simulateur de rythme. Ajuster sa courbe et les garde-fous.
6. Noter le choix dans `docs/DECISIONS.md`.

**Réserve d'idées** (rien de décidé) :

- opérateurs à une entrée : Doubleur, Incrémenteur, Carré ;
- Métronome (accélère les opérateurs proches) ;
- Loupe (chances d'édition doublées) ;
- Vision (montre les offres suivantes) ;
- Relance (un nouveau tirage) ;
- jeton « Passer » (refuser les cartes contre un avantage à l'offre suivante) ;
- contrats facultatifs du Hub ;
- reliques posées sur la carte ;
- gisements spéciaux (riches, négatifs, grands nombres premiers).

---

## 9. Questions ouvertes (à trancher avant ou pendant R3)

1. **Niveaux 1 et 2 fixes** : oui (proposé), ou un écran de choix dès le niveau 1 ?
2. **Exemplaire d'un bâtiment pas encore débloqué** (par exemple 1 × brillant au niveau 4) : autorisé ou non ?
3. **Coller sans exemplaire disponible** : version de base (proposé) ou pose bloquée ?
4. **Prérequis du §3.2** : la liste proposée convient-elle (Priorités après le Pont, ^ après le ×, Stockage à partir du niveau 12) ?
