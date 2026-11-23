# PLAN-recompenses.md : choisir sa récompense au Hub

> **État : phase 1 terminée (jalons R1 à R6), phase 2 à venir.** Branche `claude/hub-objectives-reward-choices-kdavx9`. Ce document décrit le travail ; il ne modifie aucun code. Les choix faits en cours de route iront dans [`docs/DECISIONS.md`](docs/DECISIONS.md), l'avancement dans [`docs/PROGRESS.md`](docs/PROGRESS.md).

---

## 0. Résumé

- **Aujourd'hui**, chaque niveau donne une récompense fixe (PLAN §7.2). Toutes les parties suivent la même trame.
- **Demain**, à la fin d'un niveau, le Hub propose **2 cartes** (3 avec la carte Éventail). Le joueur en prend une, sans coût. Les cartes sont tirées dans un **catalogue** décrit en configuration : poids par niveau, prérequis, éditions.
- **Trois sortes de récompenses** :
  - les **déblocages** (valeurs, opérateurs, fonctions), sans limite, comme aujourd'hui ;
  - les **bâtiments spéciaux**, en nombre limité, chacun avec son édition (base, brillante ou légendaire) ;
  - les **cartes Édition**, qu'on applique sur n'importe quel bâtiment déjà posé.
- **La trame actuelle reste la référence** : la carte « fil rouge » propose la prochaine récompense du tableau actuel. Un joueur qui la prend toujours retrouve le jeu d'aujourd'hui, déjà équilibré.
- **Quatre phases** :
  1. Moteur et ergonomie, avec des objets factices (§5).
  2. Premiers vrais objets (2 ou 3) et simulateur de tirages (§6).
  3. Simulateur de rythme et équilibrage (§7).
  4. Ajout progressif de contenu (§8).

---

## 1. Décisions déjà prises

| Sujet                                                        | Décision                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coût d'une carte                                             | Aucun. On prend 1 carte parmi N. Pas de monnaie.                                                                                                                                                                                       |
| Ouverture de l'écran de choix                                | Automatique en fin de niveau. Le jeu continue derrière (pas de pause).                                                                                                                                                                 |
| Forme d'une carte                                            | Recto : image de l'objet dans son édition, puis son nom. Un clic retourne la carte (explications). Un bouton « Choisir » sous chaque carte, retournée ou non : un seul clic suffit.                                                    |
| Fil rouge                                                    | Le premier élément du tableau actuel que le joueur n'a pas encore. Son poids baisse à chaque refus, sans descendre sous la courbe normale de la carte.                                                                                 |
| Niveaux 1 et 2                                               | Fixes : + puis Améliorations, donnés d'office sans écran. Le premier écran de choix arrive à la fin du niveau 3.                                                                                                                       |
| Fiches tutoriel                                              | Après le choix, seulement si le joueur obtient quelque chose de nouveau pour la première fois de la partie (une valeur, un bâtiment, une fonction, une édition…).                                                                      |
| Dépendances                                                  | Une carte n'est proposée que si ses prérequis sont remplis : pas de 3 sans le 2, pas de − sans le ×, etc.                                                                                                                              |
| Valeurs extractibles                                         | Débloquées une par une, dans l'ordre (2, 3, … 9, 11, …). Le 10 reste interdit sur la carte.                                                                                                                                            |
| Probabilités                                                 | Calculées avant chaque tirage : courbes par niveau, ajustables (le système de boutique de Balatro sert de modèle).                                                                                                                     |
| Bâtiments sans limite (+, ×, −, ÷, ^, extracteur, stockage…) | Jamais proposés à l'unité, même avec une édition. On les débloque, c'est tout.                                                                                                                                                         |
| Cartes Édition                                               | Une carte Édition s'applique sur **n'importe quel bâtiment** posé, bâtiments spéciaux compris. Si on démolit ce bâtiment, on récupère la carte Édition, à réappliquer ailleurs. Les effets de chaque édition seront définis plus tard. |
| Bâtiment spécial obtenu en base                              | Il peut recevoir une carte Édition. Ce qui vient d'une carte Édition redevient une carte Édition ; une édition d'origine ne quitte jamais son bâtiment.                                                                                |
| Récupérer une édition appliquée                              | Oui, de deux façons : en démolissant le bâtiment, ou sans démolir (« Retirer l'édition » dans la bulle). Choix provisoire : on pourra passer plus tard à des éditions définitives, comme dans Balatro (réglage `EDITION_RULES`, §3.5). |
| Bâtiments spéciaux                                           | Limités, obtenus avec leur édition (par exemple un Concaténateur doré). Le bâtiment et son édition ne se séparent pas : le démolir rend un Concaténateur doré.                                                                         |
| Taux d'édition des bâtiments spéciaux                        | Base, brillante, légendaire : 85 / 10 / 5 % au départ.                                                                                                                                                                                 |
| Sauvegardes existantes                                       | Pas de migration. Les anciennes sauvegardes sont refusées proprement.                                                                                                                                                                  |
| Contenu                                                      | Pas décidé maintenant. La phase 1 utilise des objets factices ; on ajoute ensuite les objets un par un.                                                                                                                                |

---

## 2. Vocabulaire

- **Offre** : l'ensemble des cartes proposées à la fin d'un niveau.
- **Emplacement** : une place dans l'offre. Il y en a deux de départ, **Nombres** et **Atelier**. La carte Éventail en ajoute un troisième, **Joker**.
- **Carte** : une entrée du catalogue (débloquer le ×, valeur suivante, Édition légendaire, Éventail…).
- **Fil rouge** : la suite des récompenses du tableau actuel (PLAN §7.2), dans l'ordre.
- **Bâtiment ordinaire** : un bâtiment qu'on débloque et qu'on pose sans limite (extracteur, opérateurs, stockage, tapis, pont).
- **Bâtiment spécial** : un bâtiment qu'on possède en nombre limité (exemple prévu : le Concaténateur). Il a une **édition d'origine**, qui ne le quitte jamais.
- **Édition** : la qualité d'un bâtiment (base, brillante, légendaire).
- **Carte Édition** : une édition brillante ou légendaire à appliquer sur un bâtiment posé. Une fois appliquée, on parle d'**édition appliquée** ; elle revient au joueur si le bâtiment disparaît.
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

| Genre     | Effet                                                            | Édition                        | Exemple            |
| --------- | ---------------------------------------------------------------- | ------------------------------ | ------------------ |
| `value`   | valeur extractible suivante (`maxExtraction` + 1, en sautant 10) | non                            | Valeur 5           |
| `unlock`  | débloque un bâtiment ordinaire ou une fonction, sans limite      | non                            | ×, Pont, Priorités |
| `special` | donne N exemplaires d'un bâtiment spécial                        | d'origine, tirée (85 / 10 / 5) | Concaténateur doré |
| `edition` | donne une carte Édition à appliquer                              | fixée par la carte             | Édition légendaire |
| `passive` | règle globale permanente                                         | non                            | opérateurs + 5 %   |
| `meta`    | modifie les offres suivantes                                     | non                            | Éventail           |

**Poids** : des poids relatifs, pas des pourcentages. Les cartes disponibles se partagent le tirage au prorata, donc ajouter une carte ne casse pas les autres. Un poids est une **courbe** : quelques points `(niveau, poids)`, interpolés linéairement ; avant le premier point, on prend la première valeur, après le dernier, la dernière.

**Disponibilité** d'une carte : tous ses prérequis sont remplis, `minLevel` est atteint, et elle n'a pas atteint `maxPicks` (1 pour une carte unique). Une carte `unlock` déjà obtenue n'est plus disponible.

**Emplacements et poids de départ** (phase 1, à régler en phase 3). Pour un déblocage placé au niveau L dans le tableau actuel, la courbe est `[(L − 4, 2), (L, 20), (L + 6, 8)]` : rare avant son niveau habituel, fréquent autour, moyen ensuite. Même hors fil rouge, l'ordre reste ainsi proche de l'actuel.

| Carte                                   | Emplacement       | Poids de départ                                      |
| --------------------------------------- | ----------------- | ---------------------------------------------------- |
| Fil rouge (n'importe quelle carte)      | celui de la carte | `max(sa courbe, 50 → 25 → 15)` aux niveaux 3, 20, 40 |
| Valeur suivante                         | Nombres           | 20                                                   |
| × (L = 7), − (13), ÷ (16), ^ (19)       | Nombres           | courbe en L                                          |
| Pont (4), Priorités (10), Stockage (22) | Atelier           | courbe en L                                          |
| Édition brillante                       | Atelier           | 6                                                    |
| Édition légendaire                      | Atelier           | 2                                                    |
| Additionneur ancien (factice)           | Atelier           | 4                                                    |
| Passif factice                          | Atelier           | 3                                                    |
| Éventail (unique)                       | Atelier           | 3, à partir du niveau 6                              |
| + et Améliorations                      | aucun             | jamais tirés (niveaux 1 et 2 fixes)                  |

**Prérequis** (validés) :

| Carte                                 | Prérequis                |
| ------------------------------------- | ------------------------ |
| Valeur k                              | valeur précédente        |
| +                                     | aucun (fixe au niveau 1) |
| Améliorations                         | aucun (fixe au niveau 2) |
| Pont                                  | aucun                    |
| ×                                     | +                        |
| Priorités                             | Pont                     |
| −                                     | ×                        |
| ÷                                     | −                        |
| ^                                     | ×                        |
| Stockage                              | niveau 12 ou plus        |
| Édition brillante, Édition légendaire | aucun                    |

Les **pistes d'amélioration** restent liées aux bâtiments ordinaires débloqués (`isTrackUnlocked`). La piste d'un bâtiment spécial se décide dans sa fiche (§6.1) : une piste existante, une nouvelle, ou aucune.

### 3.3 Le tirage d'une offre

1. **Emplacements** : Nombres et Atelier, plus Joker si le joueur a Éventail.
2. **Pour chaque emplacement**, dans l'ordre :
   1. lister les cartes disponibles de cet emplacement (Joker : toutes), sans celles déjà tirées dans cette offre ;
   2. calculer leur poids : courbe du niveau, poids du fil rouge, puis garde-fous, puis effets des cartes du joueur (par exemple une future Loupe) ;
   3. tirer une carte au prorata des poids ;
   4. pour une carte `special`, tirer son édition d'origine.
3. **Le fil rouge** : la carte qui correspond au fil rouge prend le poids `max(sa courbe, courbe du fil rouge)` dans son emplacement et dans Joker.
4. **Emplacement vide** : on tire dans l'autre emplacement. Nombres n'est jamais vide (la valeur suivante existe toujours), donc une offre a au moins une carte.
5. **Hasard déterministe** : `mulberry32(hash2(seed ^ OFFER_SALT, niveau, indexEmplacement))`, sur le modèle de `levelDraw`. Une offre dépend de la graine, du niveau et de l'état au moment du tirage (cartes déjà prises).
6. **L'offre est tirée au moment où elle s'affiche** (pas à la fin du niveau, voir §4.4), puis **enregistrée dans la sauvegarde** : recharger la partie ne permet pas de retirer.

**Garde-fous** : une liste de règles lisibles en configuration, du type `{ si: contexte → booléen, cartes: [...], facteur: 3 }`. Exemple : « niveau 12 ou plus et aucun opérateur de croissance, donc × et ‖ × 3 ». La phase 1 met en place le mécanisme avec une règle factice ; les vraies règles viennent en phase 3.

### 3.4 Les éditions

- **Effet commun**, comme dans Balatro, pour que le joueur apprenne la règle une seule fois :
  - brillante : vitesse × 1,25 ;
  - légendaire : vitesse × 1,5, plus l'effet propre du bâtiment s'il en a un.
- **Tous les bâtiments acceptent une édition.** Les effets de chaque édition, bâtiment par bâtiment, seront discutés plus tard et décrits dans `EDITION_EFFECTS` (par type de bâtiment).
- **Effets provisoires de la phase 1**, pour avoir quelque chose à tester :

| Bâtiment                   | Brillante       | Légendaire     |
| -------------------------- | --------------- | -------------- |
| Opérateurs (+, ×, −, ÷, ^) | cycle × 1,25    | cycle × 1,5    |
| Extracteur                 | débit × 1,25    | débit × 1,5    |
| Stockage                   | capacité × 1,25 | capacité × 1,5 |
| Bâtiment spécial factice   | cycle × 1,25    | cycle × 1,5    |

- **Tapis, ponts et Hub : reportés.** Dans le code, ils ne sont pas rangés comme les autres bâtiments (tapis et ponts par case, Hub fixe), et aucun effet n'est encore prévu pour eux. Ils recevront des éditions quand leurs effets seront définis. La phase 1 couvre l'extracteur, les opérateurs, le stockage et les bâtiments spéciaux.
- **Une seule édition par bâtiment.**
- **Rendu** : la base reste comme aujourd'hui ; la brillante est en craie nacrée avec un reflet ; la légendaire en craie dorée avec une petite étoile. Le même code couleur sert sur la carte de l'offre, dans la barre de construction, sur le fantôme, dans l'info-bulle et sur la carte Édition elle-même (un bâton de craie nacrée ou dorée).
- **Analogie Balatro** : la carte Édition joue le rôle des cartes qui ajoutent une édition à une carte choisie (comme la carte spectrale Aura), et le bâtiment spécial celui d'un joker vendu déjà avec son édition.

### 3.5 Cartes Édition et bâtiments spéciaux : l'inventaire

**Principe : on enregistre ce qu'on possède, on calcule ce qui reste.**

- L'état garde :
  - `editionCards = { brillante: 1, legendaire: 2 }` : les cartes Édition obtenues ;
  - `specials = { "concat:legendaire": 1 }` : les bâtiments spéciaux obtenus, par type et édition d'origine.
- Ce qui reste disponible se recompte à partir du monde :
  - cartes Édition libres = obtenues − éditions appliquées sur des bâtiments posés ;
  - bâtiments spéciaux libres = obtenus − posés.
- **Conséquence** : démolir, couper, déplacer, annuler et rétablir restent justes **sans code d'inventaire**. Démolir un × doré libère la carte Édition légendaire, parce qu'il n'est plus compté. Démolir un Concaténateur doré libère un Concaténateur doré.
- **Le bâtiment porte son édition** : `Building.edition?: 'brillante' | 'legendaire'` (absent = base) et `Building.editionApplied?: boolean` (vrai si elle vient d'une carte Édition, faux si c'est l'édition d'origine d'un bâtiment spécial). Les deux sont enregistrés dans la sauvegarde et dans l'instantané d'annulation (`BuildingSnap` dans `journal.ts`) : appliquer ou retirer une édition est donc une action qu'on peut annuler, comme une rotation.

**Appliquer une carte Édition**

- **Outil Édition** (touche `G`, visible dès qu'on possède une carte Édition) : on choisit Brillante ou Légendaire dans la rangée de variantes, puis on clique un bâtiment. Le fantôme montre le bâtiment recoloré.
- **Bulle de sélection** (`selectionBubble.ts`, qui propose déjà Pivoter, Copier, Supprimer) : un bouton ✦ « Édition » applique une carte libre sur le bâtiment sélectionné.
- **Remplacer** : appliquer une carte sur un bâtiment qui a déjà une édition appliquée échange les deux. L'ancienne carte revient au joueur.
- **Retirer sans démolir** : dans la bulle, « Retirer l'édition » rend la carte et remet le bâtiment en base. Une édition d'origine ne se retire pas.
- **Réglage pour plus tard** : `EDITION_RULES = { returnOnDemolish: true, removable: true }`. Si l'on passe un jour à des éditions définitives (comme dans Balatro), on met les deux à `false` :
  - la carte Édition est alors **consommée** à l'application, donc le compte devient « obtenues − consommées » au lieu de « obtenues − appliquées » ;
  - annuler l'application (`Ctrl+Z`) rend quand même la carte, sinon une erreur de clic coûterait une carte ;
  - la phase 1 écrit le code pour les deux réglages et teste les deux, pour que ce changement ne coûte qu'une ligne de configuration.

**Cas limites**

| Situation                                                                    | Règle                                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coller un bâtiment ordinaire qui avait une édition appliquée                 | Collé en base. Une édition appliquée ne se copie jamais : on ne dépense pas une carte précieuse sans le vouloir.                                    |
| Coller un bâtiment spécial                                                   | Posé avec son édition d'origine s'il en reste un libre, sinon bloqué (fantôme rouge, comme une case occupée). Il n'existe pas de version illimitée. |
| Déplacer                                                                     | Le bâtiment garde son édition, rien ne change dans l'inventaire.                                                                                    |
| Annuler une démolition alors que la carte libérée a été réappliquée ailleurs | Le bâtiment revient en base. Pour un bâtiment spécial plus disponible, la restauration est bloquée, comme une case occupée.                         |
| Pose en rangée d'un bâtiment spécial (`planOperatorRow`)                     | La rangée s'arrête au dernier exemplaire libre.                                                                                                     |
| Pipette (`E`)                                                                | Un bâtiment ordinaire est repris en base ; un bâtiment spécial avec son édition d'origine.                                                          |

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
5. **Dernier niveau** (cible de 2 milliards) : il donne une offre comme les autres. L'écran de fin s'ouvre après le choix.

### 4.2 L'écran de choix

```
┌───────────────────────────────────────────────────┐
│                NIVEAU 8 TERMINÉ                   │
│              Choisis ta récompense                │
│    (Tu gardes ce choix pour toute la partie.)     │  ← 1re fois seulement
│                                                   │
│   ┌─────────────┐   ┌─────────────┐               │
│   │             │   │      ✦      │               │
│   │   [image    │   │  [bâton de  │               │
│   │    du ×]    │   │craie dorée] │               │
│   │             │   │             │               │
│   │Multiplicat. │   │  Édition    │               │
│   │             │   │ légendaire  │               │
│   └─────────────┘   └─────────────┘               │
│     [ Choisir ]       [ Choisir ]                 │
│                                                   │
│                  Voir la carte                    │
└───────────────────────────────────────────────────┘

Carte retournée (après un clic sur la carte) :
   ┌─────────────┐
   │ ATELIER     │
   │ Édition     │
   │ légendaire  │
   │ À appliquer │
   │ sur un bâti-│
   │ ment posé.  │
   │ Vitesse ×1,5│
   │ Démolir le  │
   │ bâtiment la │
   │ rend.       │
   │ [Nouveau]   │
   └─────────────┘
     [ Choisir ]
```

- **Recto** : l'**image de l'objet dans son édition** et, en dessous, son **nom**. Rien d'autre, pour que la carte se lise d'un coup d'œil.
  - Bâtiment : la même image que dans la barre de construction (`drawToolIcon`, `toolIcons.ts`), dans la bonne orientation ; un bâtiment spécial est dessiné dans son édition d'origine.
  - Carte Édition : un bâton de craie nacrée ou dorée.
  - Valeur : le nombre entouré à la craie, dans sa couleur d'item (`ITEM_CHALKS`).
  - Fonction, passif, méta : une icône à la craie, comme les fiches tutoriel actuelles.
- **Verso** (clic ou toucher sur la carte, qui se retourne) : l'emplacement, le nom complet avec l'édition, ce que la carte donne (débloqué sans limite, exemplaire × N, carte à appliquer), l'effet de l'édition, une ou deux phrases d'explication et les étiquettes (Nouveau, Unique, Suite classique). Un nouveau clic la remet au recto.
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
  - chaque bouton « Choisir » nomme sa carte (« Choisir Édition légendaire »).
- **Son** : l'arpège de fin de niveau existe déjà ; on ajoute un léger bruit de carte au retournement, et un son doux au choix.

### 4.3 Après le choix : les fiches tutoriel

- La récompense s'applique, avec un toast « Obtenu : Édition légendaire ».
- Les fiches utilisent le mécanisme actuel (`help.ts` : `when(state)` et `helpSeen`). Une carte prise rend son `when` vrai, donc la fiche passe en attente toute seule. **Rien n'est montré pour ce qu'on connaissait déjà.**
- **Nouvelles fiches** :

| Fiche                | S'affiche la 1re fois que…                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `value`              | une valeur est obtenue par une carte (« Les gisements de 2 sont extractibles. »)                                                       |
| `edition.brillante`  | on obtient une première carte Édition brillante, ou un bâtiment spécial brillant (avec une démo : outil Édition, clic sur un bâtiment) |
| `edition.legendaire` | idem pour légendaire                                                                                                                   |
| `special`            | on obtient un premier bâtiment spécial (compteur, démolir le rend)                                                                     |
| `passive`            | on obtient un premier passif                                                                                                           |
| `eventail`           | on prend Éventail                                                                                                                      |

- Chaque bâtiment spécial a en plus sa propre fiche, comme les bâtiments ordinaires.
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

- **Bâtiments ordinaires** : comme aujourd'hui, sans compteur.
- **Bâtiments spéciaux** : un outil par type, avec un **compteur** en pastille (`×1`). Si on en possède plusieurs éditions, une rangée de variantes au-dessus de l'outil propose par exemple Base ×1 / Légendaire ×1 (même emplacement que les boutons tactiles actuels). Au clavier, appuyer de nouveau sur la touche de l'outil fait défiler les variantes. À 0, la variante est grisée ; l'outil disparaît quand il ne reste plus rien à poser.
- **Outil Édition** (`G`) : apparaît dès la première carte Édition. Sa pastille montre les cartes libres (✦ 1 · ★ 2) ; ses variantes sont Brillante et Légendaire.

### 4.6 Hub, panneaux, info-bulle, écran de fin

- **Hub** : l'icône de la prochaine récompense (`rewardIcon`) devient une icône « 2 cartes » (ou l'icône fixe pour les niveaux 1 et 2).
- **Panneau Niveaux** : la colonne récompense affiche « Choix » (« Choix : 3 cartes » avec Éventail).
- **Info-bulle** d'un bâtiment : son édition, son effet, et si elle est appliquée (« Édition appliquée : démolir rend la carte ») ou d'origine.
- **Écran de fin** : un récapitulatif « Tes choix », niveau par niveau. C'est ce qui rend chaque partie racontable (phase 1 si le temps le permet, sinon phase 2).

---

## 5. Phase 1 : moteur et ergonomie, avec des objets factices

**But** : tout le système fonctionne de bout en bout, avec le contenu actuel et quelques objets factices qui couvrent chaque cas d'interface. Un seul nouveau bâtiment, factice, pour tester l'inventaire des bâtiments spéciaux.

### 5.1 Modèle de données (indicatif)

```ts
// src/config/cards.ts
export type Slot = 'nombres' | 'atelier';
export type Edition = 'base' | 'brillante' | 'legendaire';
export type SpecialEdition = Exclude<Edition, 'base'>;
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
  | { kind: 'special'; building: SpecialType; count: number }
  | { kind: 'edition'; edition: SpecialEdition }
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
/** Édition d'origine d'un bâtiment spécial. */
export const SPECIAL_EDITION_ODDS = { base: 85, brillante: 10, legendaire: 5 };
/** Effet de chaque édition, par type de bâtiment (absent = effet visuel seulement, à définir). */
export const EDITION_EFFECTS: Partial<Record<BuildingType, Record<SpecialEdition, EditionEffect>>>;
export const GUARDS: readonly Guard[] = [];
```

```ts
// Ajouts à GameState (src/sim/state.ts)
picks: { level: number; card: string; edition: Edition; tick: number }[];
/** Niveaux terminés dont l'offre n'est pas encore choisie, dans l'ordre. */
pendingLevels: number[];
/** Offre tirée pour pendingLevels[0], enregistrée pour ne pas changer au rechargement. */
currentOffer: { level: number; cards: { card: string; edition: Edition }[] } | null;
/** Cartes Édition obtenues. Les libres se calculent (obtenues − appliquées). */
editionCards: Record<SpecialEdition, number>;
/** Bâtiments spéciaux obtenus, par "type:édition". Les libres se calculent (obtenus − posés). */
specials: Record<string, number>;
passives: PassiveId[];
/** Refus de l'élément actuel du fil rouge (remis à 0 quand il est obtenu). */
naturalRefusals: number;

// Ajouts à Building (src/sim/entities.ts) et à BuildingSnap (src/sim/journal.ts)
edition?: SpecialEdition;
/** Vrai si l'édition vient d'une carte Édition (elle revient au joueur). */
editionApplied?: boolean;
```

Le type `Reward` actuel devient l'effet d'une carte (`CardEffect`). `rewardFor(n)` disparaît au profit de `naturalAt(state)` (fil rouge) et `drawOffer(state, level)`.

### 5.2 Fichiers touchés

| Zone             | Fichiers                                                                                                                                                 | Changement                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Configuration    | `config/cards.ts` (nouveau), `config/balance.ts`, `config/keymap.ts`                                                                                     | catalogue, `OFFERS`, `EDITION_EFFECTS`, fil rouge tiré de `LEVEL_TABLE`, touche `G`                                 |
| Tirage           | `sim/offers.ts` (nouveau)                                                                                                                                | disponibilité, poids, tirage, fil rouge, garde-fous (fonctions pures)                                               |
| Progression      | `sim/progression.ts`, `sim/levels.ts`, `sim/state.ts`                                                                                                    | file d'attente, `chooseCard`, application des effets, `setLevel` par le fil rouge                                   |
| Éditions         | `sim/entities.ts`, `sim/journal.ts`, `sim/operators.ts`, `sim/extractor.ts`, `sim/storage.ts`                                                            | `edition` et `editionApplied`, `cycleDuration(world, building)`, débit et capacité × édition                        |
| Inventaire       | `sim/inventory.ts` (nouveau), `build/placement.ts`, `build/clipboard.ts`, `build/move.ts`, `sim/clip.ts`                                                 | comptes libres, contrôle à la pose, éditions appliquées jamais copiées, bâtiments spéciaux copiés avec leur édition |
| Outil Édition    | `build/tools.ts`, `ui/selectionBubble.ts`, `ui/toolActions.ts`                                                                                           | appliquer, échanger, retirer (actions annulables)                                                                   |
| Bâtiment factice | `config/buildings.ts`, `sim/operators.ts`                                                                                                                | un bâtiment spécial au comportement d'additionneur (§5.3)                                                           |
| Sauvegarde       | `save/schema.ts`, `save/serialize.ts`, `save/migrations.ts`, `save/manager.ts`                                                                           | version 2, nouveaux champs, v1 refusée avec un message clair                                                        |
| Interface        | `ui/offerScreen.ts` (nouveau), `ui/buildBar.ts`, `ui/topBar.ts`, `ui/hud.ts`, `ui/panels/levels.ts`, `ui/tooltip.ts`, `ui/endScreen.ts`, `ui/styles.css` | écran de choix, badge, compteurs, variantes, outil Édition, colonne « Choix », récapitulatif                        |
| Câblage          | `main.ts`                                                                                                                                                | ouverture automatique (§4.4), ordre fiches / offres, toasts                                                         |
| Rendu            | `render/layers/buildings.ts`, `render/layers/ghosts.ts`, `render/layers/hub.ts`, `render/toolIcons.ts`, `config/colors.ts`                               | craie nacrée et dorée, bâton de craie, icône « cartes »                                                             |
| Fiches           | `ui/help.ts`, `tutorial/scenes.ts`                                                                                                                       | nouvelles fiches (§4.3)                                                                                             |
| Textes           | `i18n/fr.ts`, `i18n/en.ts`                                                                                                                               | cartes, écran, outil, fiches, toasts                                                                                |
| Debug            | `debug/debugApi.ts`, `ui/debugPanel.ts`                                                                                                                  | voir §5.4                                                                                                           |

### 5.3 Objets factices

Chacun couvre un cas d'interface précis. Ceux marqués « réel » sont jouables pour de bon et peuvent rester après la phase 1.

| Carte                                                                        | Genre          | Ce qu'elle teste                                                                                                                  | Statut                                                             |
| ---------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Déblocages actuels (+, ×, −, ÷, ^, Pont, Priorités, Stockage, Améliorations) | `unlock`       | fil rouge, prérequis, fiches existantes                                                                                           | réel                                                               |
| Valeur suivante                                                              | `value`        | carte sans édition, nouvelle fiche `value`                                                                                        | réel                                                               |
| Édition brillante, Édition légendaire                                        | `edition`      | outil Édition, bulle, échange, retrait, démolir rend la carte, craie nacrée et dorée, effets sur opérateurs, extracteur, stockage | réel                                                               |
| « Additionneur ancien » (édition d'origine tirée)                            | `special`      | compteur, variantes, collage bloqué, démolir le rend, édition inséparable                                                         | factice (bâtiment au comportement d'additionneur, image distincte) |
| Opérateurs + 5 %                                                             | `passive`      | carte sans bâtiment, liste des effets actifs                                                                                      | factice                                                            |
| Éventail                                                                     | `meta`, unique | 3e emplacement, sortie du tirage après la prise                                                                                   | réel                                                               |
| Garde-fou factice                                                            | règle          | mécanisme des garde-fous, visible dans le panneau debug                                                                           | factice                                                            |

### 5.4 Debug et tests automatisés

- **URL** : `?pick=natural|first|random` choisit tout seul (comme `?tutorial=0`). Les tests de bout en bout existants (`levels.spec`, `finish.spec`, `upgrades.spec`, `play.spec`) passent en `?pick=natural` et restent verts.
- **API** (`window.__sumflow`) :
  - `offer()` : l'offre courante et les poids de chaque carte disponible ;
  - `forceOffer(['mult', 'edition-legendaire'])` ;
  - `choose(index)` ;
  - `grant(cardId, edition?)` ;
  - `setLevel(n)` : accorde le fil rouge des niveaux précédents.
- **Panneau debug** : un tableau des cartes disponibles, avec leur poids brut, le facteur de chaque garde-fou et leur probabilité finale ; l'inventaire (obtenu, posé ou appliqué, libre).

### 5.5 Tests

- **Unitaires** :
  - validation du catalogue : identifiants uniques, prérequis existants, pas de boucle de dépendances, poids ≥ 0, aucun bâtiment ordinaire en carte `special` ;
  - tirage déterministe (même état donne la même offre) ;
  - aucune carte en double dans une offre ;
  - prorata exact sur un grand nombre de tirages ;
  - emplacement vide qui bascule sur l'autre ;
  - le fil rouge suivi de bout en bout redonne exactement l'ordre de `LEVEL_TABLE` ;
  - valeurs 9 → 11 ;
  - répartition des éditions d'origine ;
  - cartes Édition : appliquer, échanger, retirer, démolir rend la carte, annuler et rétablir chaque action, sur un bâtiment ordinaire comme sur un bâtiment spécial de base ;
  - bâtiments spéciaux : pose refusée à 0, démolir le rend avec son édition, collage bloqué sans exemplaire libre ;
  - collage d'un bâtiment ordinaire à édition appliquée : collé en base ;
  - annuler une démolition quand la carte a été réappliquée ailleurs : bâtiment restauré en base ;
  - effets : cycle, débit et capacité multipliés par l'édition ;
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
  - outil Édition et bulle : appliquer sur un ×, démolir, la pastille remonte ;
  - compteur d'un bâtiment spécial dans la barre de construction ;
  - craie dorée visible (contrôle de pixels, comme `pixels.ts`).

### 5.6 Jalons

| Jalon                                        | Contenu                                                                                                                                                | Jouable ?                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **R1** Catalogue et tirage                   | `cards.ts`, `offers.ts`, tests unitaires. Aucune interface.                                                                                            | non (code seul)                    |
| **R2** Progression et sauvegarde             | file d'attente, `chooseCard`, valeurs une par une, sauvegarde v2, API debug, `?pick=`                                                                  | oui, choix automatique             |
| **R3** Écran de choix                        | `offerScreen.ts`, règles d'ouverture, Voir la carte et badge, clavier, tactile, toasts, Hub, panneau Niveaux, textes FR/EN                             | **oui, première version à tester** |
| **R4** Fiches après le choix                 | nouvelles fiches, ordre fiches / offres                                                                                                                | oui                                |
| **R5** Éditions                              | `edition` et `editionApplied`, effets, inventaire calculé, outil Édition, bulle, échange, retrait, annulation, collage, craie, info-bulle              | oui                                |
| **R6** Bâtiment spécial factice et finitions | « Additionneur ancien », compteurs et variantes, passif et garde-fou factices, panneau des poids, récapitulatif de fin, tests de bout en bout restants | oui                                |

Chaque jalon se termine par `npm run lint`, `npm test`, `npm run build` et `npm run test:e2e`, puis une mise à jour de `docs/PROGRESS.md` et `docs/DECISIONS.md`.

### 5.7 Fin de la phase 1

- Une partie se joue du niveau 1 à la fin en ne prenant que le fil rouge, avec le même ordre de déblocage qu'aujourd'hui (test automatique).
- Chaque genre de carte (`value`, `unlock`, `special`, `edition`, `passive`, `meta`) existe au moins une fois, avec son rendu, sa fiche et ses tests.
- L'écran est utilisable à la souris, au clavier, au doigt, sur ordinateur, tablette et téléphone en paysage.

---

## 6. Phase 2 : premiers vrais objets et simulateur de tirages

### 6.1 Fiche d'un objet (modèle à remplir pour chaque ajout)

| Champ                     | Contenu                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Identité                  | id, nom FR/EN, icône, couleur de craie                                                                                    |
| Carte                     | genre, emplacement, nombre d'exemplaires, `maxPicks`, prérequis, `minLevel`, courbe de poids                              |
| Bâtiment (s'il y en a un) | empreinte, ports (rôles et faces, comme PLAN §6.3), règle de calcul, piste d'amélioration (existante, nouvelle ou aucune) |
| Éditions                  | effet brillant, effet légendaire (ou les effets communs)                                                                  |
| Fiche tutoriel            | titre, texte, scène de démo                                                                                               |
| Tests                     | règle de calcul, ports, sauvegarde, rendu                                                                                 |

### 6.2 Candidats (2 ou 3, à choisir au début de la phase)

- **Concaténateur `‖`** (bâtiment spécial) : `A ‖ B` colle les chiffres (`1 ‖ 1 = 11`, `47 ‖ 0 = 470`). Points à fixer : le signe (celui de A), un B négatif, la saturation (`INT_MAX`), sa piste de vitesse. C'est un opérateur de croissance, concurrent du ×.
- **Relais du Hub** (bâtiment spécial) : un petit point de livraison, à poser loin du Hub, qui compte comme le Hub. Il change la disposition de l'usine. Effet légendaire possible : chaque livraison compte double.
- **Extracteur de prospection** (bâtiment spécial) : extrait une seule valeur au-dessus du plafond (le gisement choisi à la pose).
- **Effets légendaires propres aux bâtiments ordinaires** : par exemple le × légendaire qui sort son résultat des deux côtés. Une carte Édition légendaire garde ainsi de la valeur en fin de partie, quand un seul bâtiment × 1,5 pèse peu parmi des centaines.

Le « Additionneur ancien » factice est retiré une fois le premier vrai bâtiment spécial en place.

### 6.3 Simulateur de tirages

- **Commande** : `npm run sim:offers`, avec un mode Vitest dédié, sur le modèle de `npm run bench` (`vite.config.ts`). Il n'utilise que les fonctions pures de `offers.ts`.
- **Stratégies de joueur simulées** : toujours le fil rouge ; au hasard ; toujours une nouveauté ; minimaliste (refuse les valeurs) ; collectionneur (prend les éditions et les bâtiments spéciaux).
- **Sorties**, niveau par niveau, sur 10 000 graines :
  - probabilité qu'une carte soit **proposée**, puis **prise** ;
  - probabilité que le fil rouge soit présent dans une offre ;
  - nombre de cartes Édition et de bâtiments spéciaux vus et obtenus, par édition ;
  - emplacements vides ;
  - cartes jamais vues.
- **Format** : un tableau Markdown dans le terminal, plus un CSV pour aller plus loin. Une page HTML de graphiques pourra venir en phase 3.

---

## 7. Phase 3 : simulateur de rythme et équilibrage

**Limite assumée** : on ne simule pas une vraie usine. On estime un **coût relatif** par niveau, comparé à la partie de référence (le fil rouge).

1. **Coût d'un nombre** avec un jeu d'outils (valeurs, opérateurs, bâtiments spéciaux) : le nombre minimal d'opérations et d'items bruts pour fabriquer la cible.
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

## 9. Questions ouvertes

**Aucune question ne bloque la phase 1.** Sujets volontairement reportés :

- **Effets des éditions**, bâtiment par bâtiment (y compris tapis, ponts et Hub) : avant ou pendant la phase 2. La phase 1 utilise les effets provisoires du §3.4.
- **Éditions définitives** (comme dans Balatro) : un réglage prêt dans `EDITION_RULES` (§3.5), à décider après les premières parties.
- **Contenu** : les 2 ou 3 premiers vrais objets, au début de la phase 2 (§6.2).
- **Objectifs de réglage** du rythme : au début de la phase 3 (§7).
