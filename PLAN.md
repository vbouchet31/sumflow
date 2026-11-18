# PLAN.md : Sumflow, jeu d'usine à nombres pour navigateur

> Document destiné à un agent de développement autonome. Il contient **toute** la spécification du jeu et du projet. L'agent ne doit pas avoir besoin d'autre source. En cas de doute, appliquer la règle la plus simple qui respecte ce document, puis la consigner dans `docs/DECISIONS.md`.

---

## 0. Résumé en 10 lignes

- **Quoi** : un jeu d'usine 2D, en vue de dessus, sur grille carrée infinie. Le joueur extrait des nombres sur la carte, les transporte sur des tapis, les combine avec des opérateurs (+, ×, −, ÷, ^) et livre au Hub central les nombres demandés.
- **Inspiration** : mécaniques de Beltmatic (Notional Games, 2024). **Aucun asset, texte, logo ou nom de l'original n'est réutilisé.** Nom de travail : **Sumflow**. Visuels et textes 100 % originaux.
- **Stack** : TypeScript strict + Vite, rendu Canvas 2D, UI en DOM vanilla, zéro dépendance runtime.
- **Hébergement** : repo GitHub, déploiement GitHub Pages via GitHub Actions.
- **Pas de serveur, pas de compte.** Sauvegarde locale (`localStorage`) + export/import fichier `.json`.
- **Cible** : desktop, souris + clavier. Tablette et téléphone en paysage au doigt (ajout, voir [`PLAN-tactile.md`](PLAN-tactile.md)). Navigateurs evergreen (Chrome, Firefox, Edge, Safari récents).
- **Langues** : français (défaut) et anglais.
- **Livraison** : 12 jalons (M0 à M11), chacun testable et déployé.

---

## 1. Règles de travail pour l'agent

1. **Lire ce document en entier avant d'écrire du code.**
2. Travailler jalon par jalon (section 14). Un jalon = une ou plusieurs PR/commits, CI verte, critères d'acceptation cochés.
3. **Toutes les valeurs d'équilibrage** vivent dans `src/config/balance.ts`. Aucune constante de gameplay en dur ailleurs.
4. **Tous les textes visibles** passent par l'i18n (`t('cle')`). Aucun texte en dur dans l'UI.
5. La simulation est **déterministe** : pas de `Math.random()`, pas de `Date.now()` dans `src/sim/`. Utiliser le RNG seedé et le compteur de ticks.
6. Dépendances autorisées (dev uniquement) : `typescript`, `vite`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `eslint`, `typescript-eslint`, `prettier`, `jsdom`. **Aucune dépendance runtime.** Toute autre dépendance doit être justifiée dans `docs/DECISIONS.md`.
7. Tenir à jour `docs/DECISIONS.md` (choix pris quand le plan est muet) et `docs/PROGRESS.md` (jalons terminés, écarts connus).
8. Ne jamais casser une sauvegarde existante sans migration (section 11.4).
9. Messages de commit en anglais, format Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`).

---

## 2. Glossaire

| Terme | Définition |
|---|---|
| **Tuile** | Case de la grille, coordonnées entières `(x, y)`. `x` croît vers la droite, `y` vers le bas. |
| **Face** | Un des 4 côtés d'une tuile : `N`, `E`, `S`, `W` (indices 0, 1, 2, 3). |
| **Nombre / item** | Valeur entière 32 bits signée transportée sur la carte. Un item occupe une tuile de tapis. |
| **Gisement** | Zone 3×3 de la carte portant une valeur extractible (affichée au centre). |
| **Extracteur** | Bâtiment 3×3 posé sur un gisement, qui produit sa valeur en continu. |
| **Tapis (belt)** | Tuile qui déplace des items. A une ou plusieurs sorties. |
| **Jonction** | Tapis avec plusieurs sorties (division) ou plusieurs entrées (fusion). |
| **Pont (bridge)** | Tuile qui laisse se croiser deux flux perpendiculaires sans les mélanger. |
| **Opérateur** | Bâtiment de calcul à deux entrées A et B : Additionneur, Multiplicateur, Soustracteur, Diviseur, Exposant. |
| **Port** | Tuile d'un bâtiment qui reçoit (entrée A/B) ou émet (sortie) des items, via ses faces extérieures. |
| **Hub** | Bâtiment central 6×6 qui reçoit les livraisons. |
| **Stockage** | Bâtiment 3×3 tampon pour 10 000 exemplaires d'une seule valeur. |
| **Niveau** | Palier de progression : livrer N exemplaires d'un nombre cible. |
| **Amélioration** | Palier d'une piste (tapis, extracteur, chaque opérateur), payé en livrant des nombres. |
| **Exigence** | Paire `(valeur, quantité)` à livrer, avec son propre compteur. |
| **Tick** | Pas de simulation fixe de 1/60 s. |

---

## 3. Vision de jeu

### 3.1 Boucle principale
1. Le Hub affiche un **nombre cible** et une **quantité** (ex. « 27 × 150 »).
2. Le joueur trouve des gisements utiles, pose des extracteurs, tire des tapis.
3. Il compose le nombre avec les opérateurs (ex. 3 × 9, ou 5 × 5 + 2).
4. Chaque item livré au Hub incrémente toutes les exigences actives de même valeur.
5. Niveau terminé : récompense (nouveau bâtiment, nouvelle valeur extractible, nouvelle fonction), nouveau nombre cible.
6. En parallèle, il livre d'autres nombres pour **améliorer** la vitesse des tapis, des extracteurs et des opérateurs.
7. Les anciennes chaînes de production restent utiles : les exigences d'amélioration se chevauchent (section 7.3).

### 3.2 Ton et ressenti
- Jeu **calme, sans ennemi, sans échec**. Pas de timer, pas de pénalité.
- Plaisir : résoudre « comment fabriquer 891 avec des 3, 7 et 11 », puis optimiser le débit.
- Les nombres sont toujours lisibles : c'est le cœur du jeu.

### 3.3 Hors périmètre (ne pas faire)
Multijoueur, comptes, backend, mods, succès Steam, musique composée, éditeur de cartes, mode bac à sable dédié (le debug suffit), application native, mode hors ligne (service worker).

Le tactile, d'abord hors périmètre, a été ajouté après la v1 : voir [`PLAN-tactile.md`](PLAN-tactile.md) et la section 8.3.

---

## 4. Monde et carte

### 4.1 Grille
- Grille carrée **infinie** en pratique : coordonnées entières dans `[-500 000, 500 000]`.
- Taille de rendu de base d'une tuile : **32 px** à zoom 1.
- Clé de tuile numérique : `key(x, y) = (x + 2^20) * 2^21 + (y + 2^20)` (entier sûr < 2^53). Fournir `unkey(k)`.
- Le monde est découpé en **chunks 32×32** pour la génération et le rendu.

### 4.2 Hub
- Taille **6×6**, occupe les tuiles `x ∈ [-3, 2]`, `y ∈ [-3, 2]`.
- **Ses 24 faces extérieures sont des entrées.** Aucune sortie.
- Accepte n'importe quelle valeur, instantanément, sans limite.
- Indestructible, non copiable, ignoré par les outils de zone.
- Affiche dessus (rendu canvas) : numéro de niveau, nombre cible en grand, barre `livrés / requis`, icône de la prochaine récompense.

### 4.3 Gisements
- Un gisement = **zone 3×3**, avec une valeur `v ≥ 1`, **jamais 10** (règle de conception importante : 10 serait trop puissant pour composer).
- Rendu : carré sombre 3×3, valeur en blanc au centre. Si `v` n'est pas encore débloquée : valeur grisée + petit cadenas.
- Les gisements ne bloquent rien : on peut construire des tapis ou bâtiments dessus. Seul un extracteur l'exploite.
- Deux gisements ne se chevauchent jamais et gardent au moins **1 tuile d'écart**.
- Aucun gisement dans le carré `x, y ∈ [-6, 5]` (zone dégagée autour du Hub).

### 4.4 Génération procédurale (déterministe)
Tout dérive du `seed` de la partie (entier 32 bits). Les gisements **ne sont pas sauvegardés** : ils sont recalculés à partir du seed.

**RNG** : implémenter `mulberry32(seed)` et `hash2(seed, a, b)` (mélange type splitmix32) pour dériver un sous-seed par chunk.

**Étape A : gisements garantis** (calculés une fois à la création, puis à chaque chargement).
Pour chaque valeur `v` de 1 à 80 (sauf 10), placer des gisements à distance contrôlée du centre :

| Valeur | Nombre de gisements garantis | Distance (rayon, en tuiles) |
|---|---|---|
| 1 | 4 (un par quadrant) | 9 à 16 |
| 2 | 3 | 14 à 24 |
| 3 | 2 | 20 à 32 |
| 4 à 9 | 2 | `10 + 7v` à `18 + 9v` |
| 11 à 80 | 1 | `60 + 14v` à `90 + 18v` |

Angle aléatoire (RNG seedé). Si collision, retenter jusqu'à 30 fois en décalant l'angle, puis la distance de +3.

**Étape B : gisements aléatoires par chunk** (générés à la demande quand un chunk devient visible ou est interrogé).
- RNG du chunk : `mulberry32(hash2(seed, cx, cy))`.
- Nombre de tentatives : 4 par chunk.
- Pour chaque tentative : position aléatoire dans le chunk ; distance `d` au centre ; valeur tirée parmi `[1, vmax(d)] \ {10}` avec `vmax(d) = 2 + floor(d / 22)` ; poids `w(v) = v^(-1.15)`.
- Rejet si collision avec un gisement garanti ou déjà placé (garder 1 tuile d'écart), ou si dans la zone dégagée.
- Les gisements garantis qui tombent dans le chunk sont inclus en priorité.

**Propriétés à tester** : même seed ⇒ mêmes gisements ; ordre de génération des chunks sans effet sur le résultat ; aucun chevauchement ; aucun 10.

### 4.5 Valeurs extractibles
- État `maxExtraction` (au départ 1). Une valeur `v` est extractible si `v ≤ maxExtraction` et `v ≠ 10`.
- Les récompenses « Extraction N » fixent `maxExtraction = N`.

---

## 5. Les nombres

- Type : entier signé 32 bits, manipulé en `number` JS.
- **Saturation** : tout résultat est borné à `[-2 147 483 648, 2 147 483 647]` (`INT_MIN`, `INT_MAX`). Pas de dépassement cyclique.
- Fonctions pures dans `src/core/intmath.ts`, testées exhaustivement :

| Opération | Règle |
|---|---|
| `add(a, b)` | `clamp(a + b)` |
| `sub(a, b)` | `clamp(a - b)` ; négatifs autorisés ; `a - a = 0` (seul moyen d'obtenir 0) |
| `mul(a, b)` | `clamp(a * b)` (le produit double précision suffit : tout résultat hors bornes sature) |
| `divmod(a, b)` | `b = 0` ⇒ `q = 0, r = a`. Sinon `q = trunc(a / b)`, `r = a - q*b` (le reste a le signe du dividende) |
| `pow(a, b)` | `b = 0` ⇒ 1 (y compris `0^0`). `b < 0` ⇒ `a = 1` : 1 ; `a = -1` : ±1 selon parité ; sinon 0. `b > 0` ⇒ exponentiation rapide avec saturation à chaque étape (dès que `|r| > INT_MAX`, retourner la borne de bon signe) |

- **Affichage** sur les items : jusqu'à 4 chiffres en entier (`9999`, `-999`) ; au-delà abrégé avec 3 chiffres significatifs : `12.3k`, `456k`, `7.89M`, `2.15G`. Info-bulle et panneaux : valeur complète avec séparateur de milliers selon la langue.
- **Couleur** d'un item : teinte dérivée d'un hash de la valeur (`hue = (hash(v) % 360)`), saturation 65 %, luminosité 55 %. Les valeurs 1 à 9 ont des teintes fixes et bien distinctes, définies dans `balance.ts`.

---

## 6. Bâtiments et transport

### 6.1 Modèle commun
- Chaque bâtiment a un **type**, une **position d'origine** (coin haut-gauche après rotation), une **rotation** `0..3` (quarts de tour horaires) et une **empreinte** (liste de tuiles locales).
- Chaque tuile d'empreinte a un rôle : `inputA`, `inputB`, `output`, `outputQ`, `outputR`, `body` (aucun port), ou `any` (hub, stockage, extracteur).
- **Faces de port** : seules les faces d'une tuile de port qui donnent **vers l'extérieur** du bâtiment sont des connexions possibles.
- Définitions données en rotation 0. Rotation : `(x, y) → (H-1-y, x)` pour un quart de tour horaire sur une boîte `W×H` (la boîte devient `H×W`), faces décalées de +1 modulo 4.
- **R** : rotation horaire du fantôme ; **Shift+R** : antihoraire.

### 6.2 Tampons et cycle des opérateurs
- Chaque port d'entrée a un **tampon de 4 items** (FIFO).
- Chaque groupe de sortie (`output`, `outputQ`, `outputR`) a un **tampon de 2 items**.
- Un opérateur **démarre un cycle** quand chaque tampon d'entrée contient ≥ 1 item et que chaque tampon de sortie concerné a de la place pour le résultat.
- Durée du cycle : `1 / vitesse(piste, niveau)` secondes (section 7.3). En fin de cycle : retire 1 item de A et de B, calcule, pousse le(s) résultat(s), flash visuel de 150 ms.
- Les sorties se vident vers les tapis/bâtiments connectés (section 6.4).

### 6.3 Catalogue des bâtiments (rotation 0, `(x, y)` locaux)

Légende : `A` entrée A, `B` entrée B, `O` sortie, `Q` quotient, `R` reste, `#` corps.

#### Extracteur (dès le départ)
- **3×3**, doit couvrir exactement un gisement extractible (le fantôme s'aimante au gisement survolé).
- Ses **12 faces extérieures sont des sorties**.
- Débit total : `capacitéBelts(niveauExtracteur) × vitesseTapis` items/s, accumulé tick par tick (accumulateur flottant).
- Distribution : **tourniquet** entre les sorties connectées qui ont de la place, avec priorité éventuelle (section 6.6). Si plus de sorties connectées que la capacité, chacune reçoit moins (débit total inchangé).
- Pas de tampon interne au-delà d'un item en attente (si aucune sortie n'a de place, la production s'arrête, l'accumulateur est plafonné à 1).

#### Additionneur `+` (récompense du niveau 1)
- **2×2** :
```
A B
O O
```
- Entrées : A par ses faces N et W ; B par ses faces N et E.
- Sortie : faces S des deux tuiles O, W de la tuile (0,1), E de la tuile (1,1) (4 faces).
- Résultat : `add(A, B)`. Couleur : vert.

#### Multiplicateur `×` (niveau 7)
- **3×1** : `A O B`
- Entrées : A par N, W, S ; B par N, E, S.
- Sortie : faces N et S de la tuile centrale.
- Résultat : `mul(A, B)`. Couleur : orange.

#### Soustracteur `−` (niveau 13)
- **Forme en L, 3 tuiles** :
```
A .
O B
```
- Entrées : A (0,0) par N, W, E ; B (1,1) par N, E, S.
- Sortie : coin O (0,1) par W et S.
- Résultat : `sub(A, B)`. **L'ordre compte** : les lettres A et B sont dessinées sur les tuiles. Couleur : rouge.

#### Diviseur `÷` (niveau 16)
- **2×2** :
```
A B
Q R
```
- Entrées : A par N et W ; B par N et E.
- Sorties : Q par W et S ; R par S et E.
- Résultat : `divmod(A, B)`. Q toujours émis. **R émis seulement s'il est non nul.**
- Démarrage du cycle seulement si le tampon Q a de la place **et** le tampon R a de la place.
- Propriété utile pour le joueur : seul opérateur à deux sorties (permet de dupliquer un nombre : `(7n) ÷ 6` donne quotient et reste). Couleur : violet.

#### Exposant `^` (niveau 19)
- **Forme en L, 3 tuiles** (miroir du soustracteur) :
```
. B
A O
```
- Entrées : A (0,1) par N, W, S ; B (1,0) par N, W, E.
- Sortie : coin O (1,1) par E et S.
- Résultat : `pow(A, B)`. Couleur : jaune.

#### Stockage (niveau 22)
- **3×3**, 12 faces.
- Une face est **entrée** si un tapis adjacent pointe vers elle, **sortie** sinon (si un tapis adjacent existe et ne pointe pas vers le stockage).
- Capacité **10 000** items **d'une seule valeur**. La première valeur reçue à vide fixe la valeur ; les autres valeurs sont refusées (le tapis entrant se bloque). Revenu à 0, la valeur est libérée.
- Entrée et sortie illimitées en vitesse : chaque tick, chaque sortie dont la tuile de tapis est libre reçoit un item (sortie saturée). Sert de tampon et d'équilibreur.
- Affiche la valeur stockée et le remplissage (`4 210 / 10 000`). Couleur : gris acier.

#### Tapis (dès le départ)
Voir 6.4. Couleur : gris foncé avec chevrons animés.

#### Pont (niveau 4)
Voir 6.5.

### 6.4 Tapis : règles exactes

**Données d'une tuile de tapis** :
- `outputs` : masque de 1 à 4 directions de sortie.
- `item` : au plus **un item** par tuile, avec `progress ∈ [0, 1]` (position le long de la tuile).
- `rr` : index de tourniquet pour les sorties ; `rrIn` pour les entrées.
- `priority` : direction de sortie prioritaire ou `null`.

**Entrées implicites** : une tuile reçoit d'un voisin si ce voisin a une sortie dirigée vers elle **et** si elle-même n'a pas de sortie vers ce voisin.

**Mouvement** (par tick, `dt = 1/60`) :
1. `progress += vitesseTapis × dt`.
2. Si `progress ≥ 1`, l'item tente de quitter la tuile vers la cible choisie (tourniquet sur les sorties qui peuvent accepter, priorité d'abord). Cible possible : autre tapis vide, port d'entrée avec tampon non plein, Hub, stockage acceptant, pont (voie libre).
3. Réussite : l'item passe dans la cible avec `progress -= 1` (conserve l'avance pour un débit exact). Échec : `progress = 1`, l'item attend.
4. **Débit théorique d'un tapis plein = vitesseTapis items/s.** Test obligatoire.

**Ordre de traitement** (essentiel pour le débit) : traiter les tuiles **de l'aval vers l'amont**. Recalculer un ordre topologique inverse du graphe des tapis à chaque modification du réseau (pas à chaque tick). Les cycles sont cassés à un point arbitraire mais déterministe (plus petite clé).

**Fusion** : une tuile avec plusieurs voisins entrants accepte en tourniquet (`rrIn`) parmi ceux qui ont un item prêt. Chaque flux entrant a ainsi une part égale.

**Division** : une tuile avec plusieurs sorties distribue en tourniquet parmi les sorties qui ont de la place.

**Règles de connexion avec les bâtiments** :
- Une face de **sortie** d'un bâtiment pousse dans la tuile de tapis adjacente si ce tapis n'a **pas** de sortie dirigée vers le bâtiment (sinon ce tapis est une entrée, pas une sortie).
- Un tapis qui pointe vers une face d'**entrée** (A, B, Hub, stockage) livre dans le tampon correspondant s'il a de la place.
- Un tapis qui pointe vers une face sans port (corps, face de sortie, côté intérieur) **bloque** : l'item attend à `progress = 1`. L'info-bulle du tapis affiche « Bloqué : pas d'entrée ici ».
- Sorties multiples d'un même groupe : tourniquet entre les faces connectées qui peuvent accepter, priorité d'abord (6.6).

**Connexion directe bâtiment-à-bâtiment** : une face de sortie adjacente à une face d'entrée d'un autre bâtiment transfère directement (1 item par tick max par paire de faces, limité par la vitesse tapis). Les ponts peuvent aussi être alimentés directement.

**Rendu** : chevrons animés selon `outputs`. Item dessiné à la position interpolée entre le centre de la tuile d'entrée et la sortie.

### 6.5 Tracé des tapis (UX)
- Outil Tapis (touche `1`). **Clic gauche + glisser** depuis une tuile de départ.
- Le tracé est un **chemin en L** : d'abord l'axe du plus grand écart, puis l'autre. **Maintenir Ctrl** pendant le glisser inverse l'ordre du coude.
- Chaque tuile du chemin sort vers la suivante. La dernière sort dans la direction du dernier segment.
- **Départ sur un tapis existant** : on **ajoute** une sortie à cette tuile (crée une division) au lieu de la remplacer.
- **Arrivée contre un tapis existant** : si la dernière tuile pointe dans un tapis, c'est une fusion (rien de spécial à faire, l'entrée implicite suffit).
- **Passage sur un tapis existant** :
  - Pont non débloqué : la tuile existante est remplacée (fantôme orange = remplacement).
  - Pont débloqué et tuile existante **droite et perpendiculaire** (une seule entrée, une sortie opposée) : un **pont** est créé automatiquement (fantôme bleu).
  - Sinon : remplacement.
- **Tuiles occupées par un bâtiment ou le Hub** : sautées (fantôme rouge sur ces tuiles), le reste du chemin est posé.
- Relâcher : pose tout le chemin en une seule action annulable.
- Clic simple sans glisser sur une tuile vide : pose 1 tapis orienté selon la rotation courante (`R`).
- Fantôme : vert = nouveau, orange = remplacement, bleu = pont, rouge = impossible.

### 6.6 Priorités (niveau 10)
- Avec l'outil Priorité (touche `P`) ou **Alt+clic**, cliquer une **tuile de tapis qui sort d'une source multi-sorties** (jonction, extracteur, sortie d'opérateur, stockage) la marque prioritaire. Losange vert dessiné sur la tuile.
- Règle : la source envoie d'abord vers la sortie prioritaire si elle a de la place, sinon tourniquet sur les autres.
- Cliquer une autre sortie déplace la priorité ; cliquer le losange la supprime. Une seule priorité par source.

### 6.7 Pont : règles
- Tuile unique avec **deux voies indépendantes** : horizontale et verticale. Chaque voie a sa direction (héritée des tapis) et contient au plus un item.
- Une voie se comporte comme une tuile de tapis droite.
- Un pont ne se crée que sur une tuile droite perpendiculaire (6.5). Il peut aussi être posé à la main avec l'outil Pont (touche `9`), direction des voies déterminée par les tapis voisins au moment de la pose, puis par la rotation.
- **Démolir un pont supprime les deux voies** (comportement simple et prévisible).

---

## 7. Progression

### 7.1 Exigences et livraisons
- Une **exigence** = `{ value, required, delivered }`.
- Exigences **actives** : celle du niveau courant + celles de la prochaine amélioration de chaque piste débloquée.
- À chaque item livré au Hub avec la valeur `v` : **toutes** les exigences actives de valeur `v` non complètes font `delivered += 1`. Un même item peut donc compter pour le niveau et une ou plusieurs améliorations. Les items en excès sont perdus.
- Une nouvelle exigence démarre toujours à `delivered = 0`.
- Statistiques : chaque livraison est enregistrée par valeur pour le calcul de débit (fenêtre glissante de 60 s, échantillonnée par seconde).

### 7.2 Niveaux
- Au niveau `n`, l'exigence est `cible(n) × quantité(n)`. Une fois satisfaite : récompense de `n`, passage au niveau `n+1`, effet visuel (onde circulaire blanche translucide depuis le Hub sur 1,2 s) + son.
- **Table des niveaux 1 à 30** (cibles de base ; voir randomisation plus bas) :

| Niv. | Cible de base | Quantité | Récompense en terminant ce niveau |
|---|---|---|---|
| 1 | 1 | 10 | Additionneur |
| 2 | 2 | 20 | Panneau Améliorations (pistes Tapis, Extracteur, Additionneur) |
| 3 | 3 | 35 | Extraction 2 |
| 4 | 5 | 40 | Pont |
| 5 | 10 | 50 | Extraction 3 |
| 6 | 19 | 100 | Extraction 4 |
| 7 | 27 | 150 | Multiplicateur (+ piste) |
| 8 | 36 | 300 | Extraction 5 |
| 9 | 47 | 450 | Extraction 6 |
| 10 | 50 | 500 | Priorités de tapis |
| 11 | 82 | 600 | Extraction 7 |
| 12 | 174 | 800 | Extraction 8 |
| 13 | 248 | 1 000 | Soustracteur (+ piste Soustracteur/Diviseur) |
| 14 | 324 | 2 000 | Extraction 9 |
| 15 | 466 | 3 000 | Extraction 11 |
| 16 | 594 | 4 000 | Diviseur (partage la piste du soustracteur) |
| 17 | 631 | 5 000 | Extraction 12 |
| 18 | 727 | 6 000 | Extraction 13 |
| 19 | 891 | 7 000 | Exposant (+ piste) |
| 20 | 928 | 8 000 | Extraction 14 |
| 21 | 1 779 | 9 000 | Extraction 15 |
| 22 | 2 805 | 10 000 | Stockage |
| 23 | 3 366 | 10 500 | Extraction 16 |
| 24 | 4 100 | 11 000 | Extraction 17 |
| 25 | 4 950 | 11 500 | Extraction 18 |
| 26 | 5 900 | 12 000 | Extraction 19 |
| 27 | 7 000 | 12 500 | Extraction 20 |
| 28 | 8 200 | 13 000 | Extraction 21 |
| 29 | 9 500 | 13 500 | Extraction 22 |
| 30 | 10 904 | 14 000 | Extraction 23 |

- **Randomisation à la création** (RNG seedé) :
  - Niveaux 1 à 5 : cibles **fixes** (1, 2, 3, 5, 10).
  - Niveaux 6 à 30 : `cible = round(base × U(0.92, 1.08))`, puis forcer `cible(n) > cible(n-1)` (sinon `cible(n-1) + 1`).
- **Niveaux 31 et plus (infini)** :
  - `cible(n) = round(cible(n-1) × U(1.01, 1.03))`, au moins `cible(n-1) + 1`.
  - `quantité(n) = min(20 000, 14 000 + 200 × (n - 30))`.
  - Récompense : `Extraction (n - 7)`.
  - **Fin** : le premier niveau dont la cible dépasserait 2 000 000 000 devient le dernier. Après lui : écran « Partie terminée » (statistiques : temps de jeu, items livrés), puis jeu libre sans objectif de niveau (les améliorations restent disponibles).
- Les cibles sont générées **paresseusement** mais de manière déterministe (stocker le tableau généré jusqu'au niveau courant + 15 dans la sauvegarde).
- **Aperçu** : panneau Niveaux qui liste les 12 prochains niveaux (cible, quantité, récompense).

### 7.3 Améliorations

**Pistes** :

| Piste | Débloquée par | Effet | Niveau max |
|---|---|---|---|
| Tapis | niveau 2 | vitesse des tapis (tuiles/s) | infini |
| Extracteur | niveau 2 | capacité en tapis pleins | 12 |
| Additionneur | niveau 2 | opérations/s | infini |
| Multiplicateur | niveau 7 | opérations/s | infini |
| Soustracteur/Diviseur | niveau 13 | opérations/s (les deux) | infini |
| Exposant | niveau 19 | opérations/s | infini |

**Valeurs par niveau d'amélioration `L`** (le niveau 1 est l'état initial) :

| L | Tapis (tuiles/s) | Extracteur (tapis) | Additionneur (op/s) | Mult., Sous./Div., Exposant (op/s) |
|---|---|---|---|---|
| 1 | 1 | 1 | 0,25 | 0,2 |
| 2 | 2 | 2 | 0,333 | 0,3 |
| 3 | 3 | 3 | 0,4 | 0,4 |
| 4 | 4 | 4 | 0,5 | 0,5 |
| 5 | 5 | 5 | 0,667 | 0,6 |
| 6 | 6 | 6 | 1 | 0,7 |
| 7 | 7 | 7 | 1,5 | 0,8 |
| 8 | 8 | 8 | 2 | 1 |
| 9+ | 8 + 0,1 × (L-8) | L (max 12) | 2 + 0,02 × (L-8) | 1 + 0,02 × (L-8) |

- Plafonds doux : tapis plafonné à **20 tuiles/s**, opérateurs à **4 op/s** (additionneur) et **3 op/s** (autres). Atteint, la piste affiche « Max ».
- Les gros gains (niveaux 1 à 8) puis les petits paliers infinis sont **voulus** : cela donne une longue traîne idle.

**Coût d'une amélioration** (passer du niveau `L` au niveau `L+1`) :
- Chaque piste possède une **suite de nombres** `t_1, t_2, t_3, …` générée à la création.
- Exigences de l'amélioration `L` (fenêtre glissante) :
  - `L = 1` : `[t_1]`
  - `L = 2` : `[t_1, t_2]`
  - `L ≥ 3` : `[t_(L-2), t_(L-1), t_L]`
- Conséquence voulue : chaque nombre sert à **trois améliorations successives**. Une chaîne de production construite pour une amélioration reste utile pour les deux suivantes.
- Quantités : `C(L)` pour le premier nombre de la fenêtre, `0,8 × C(L)` pour le deuxième, `0,6 × C(L)` pour le troisième, arrondis à 50.

| L | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9+ |
|---|---|---|---|---|---|---|---|---|---|
| `C(L)` | 200 | 1 000 | 4 000 | 9 000 | 9 000 | 11 000 | 15 000 | 20 000 | `min(40 000, 20 000 + 250 × (L-8))` |

- Facteur par piste appliqué à `C(L)` : Tapis 1,0 ; Extracteur 1,0 ; Additionneur 1,2 ; autres 1,0.

**Suites `t_k` de base** (10 premiers termes, avant randomisation) :

| Piste | t1..t10 |
|---|---|
| Tapis | 1, 16, 22, 34, 121, 247, 562, 839, 1 526, 4 294 |
| Extracteur | 2, 7, 13, 29, 57, 110, 233, 471, 950, 1 900 |
| Additionneur | 3, 11, 75, 91, 193, 625, 1 400, 3 447, 9 423, 20 000 |
| Multiplicateur | 45, 110, 202, 574, 905, 2 571, 6 901, 15 000, 36 446, 64 331 |
| Soustracteur/Diviseur | 280, 520, 1 100, 2 300, 4 700, 9 800, 21 000, 43 000, 88 000, 180 000 |
| Exposant | 650, 1 874, 3 900, 8 100, 17 000, 35 000, 72 000, 150 000, 310 000, 640 000 |

- Randomisation : valeurs `< 30` gardées telles quelles ; les autres `round(t × U(0.85, 1.15))`, en gardant la suite strictement croissante et **en excluant 10** et les valeurs déjà présentes dans la même fenêtre.
- Au-delà de `t_10` : `t_(k+1) = round(t_k × U(1.10, 1.35))`. Si `t_(k+1) > 2 000 000 000`, la piste est au max.

**Achat** :
- Panneau Améliorations : une ligne par piste avec nom, niveau, valeur actuelle → valeur suivante, jusqu'à 3 exigences avec `livrés / requis` et une barre, bouton « Améliorer ».
- Bouton actif seulement si toutes les exigences de la ligne sont complètes. Son discret + badge vert sur l'icône du panneau quand au moins une amélioration est prête.
- Option « Achat automatique des améliorations » (désactivée par défaut).
- L'effet est immédiat (vitesse des tapis, cycles des opérateurs, débit des extracteurs).

### 7.4 Ordre des déblocages (récapitulatif)
Départ : Tapis, Extracteur, outils d'édition (copier, coller, démolir, marqueurs). Puis : Additionneur (fin niv. 1), Améliorations (2), Pont (4), Multiplicateur (7), Priorités (10), Soustracteur (13), Diviseur (16), Exposant (19), Stockage (22). Extraction : voir table.

### 7.5 Aide contextuelle (fiches tutoriel)
Une fiche modale, une à la fois, à la première ouverture d'une partie neuve puis à chaque déblocage. Chaque fiche montre une **démo animée** (le jeu lui-même, rendu dans un petit canvas : un pointeur virtuel choisit l'outil, pose, trace les tapis, puis l'usine tourne), un titre et une ou deux phrases. Doigt ou flèche de souris selon le dernier pointeur utilisé. Fermeture par le bouton, `Échap`, `Entrée` ou une touche à côté de la fiche. Les fiches vues sont sauvegardées (`helpSeen`) ; le menu Aide liste celles déjà rencontrées et les rejoue.
1. Partie neuve : « Le Hub demande des nombres. Pose un extracteur sur un gisement de 1, puis relie-le au Hub avec des tapis. » (démo)
2. Additionneur débloqué : « Amène deux flux dans les entrées A et B. La somme sort en bas. » (démo 1 + 2 = 3)
3. Améliorations débloquées : « Livre les nombres indiqués pour accélérer ton usine. » (icône)
4. Pont : « Croise un tapis perpendiculaire pour poser un pont automatiquement. » (démo)
5. Multiplicateur, Priorités (icône), Soustracteur (« l'ordre A − B compte »), Diviseur (« le reste sort à part, jamais 0 »), Exposant, Stockage : une fiche chacun.

---

## 8. Contrôles

### 8.1 Caméra
| Action | Entrée |
|---|---|
| Déplacer | touches **physiques** `KeyW/KeyA/KeyS/KeyD` via `event.code` (donc WASD en QWERTY, ZQSD en AZERTY) / flèches ; `Shift` = ×3 ; ignoré si Ctrl ou Alt est enfoncé |
| Déplacer à la souris | clic droit ou molette maintenus + glisser |
| Zoom | molette, centré sur le curseur ; plage 0,05 à 4 |
| Retour au Hub | `H` |

### 8.2 Construction et édition
| Action | Touche |
|---|---|
| Tapis | `1` |
| Extracteur | `2` |
| Additionneur | `3` |
| Multiplicateur | `4` |
| Soustracteur | `5` |
| Diviseur | `6` |
| Exposant | `7` |
| Stockage | `8` |
| Pont (pose manuelle) | `9` |
| Priorité | `P` (ou `Alt+clic` en mode tapis) |
| Pivoter | `R` / `Shift+R` |
| Démolir (zone) | `X` puis glisser ; clic simple = un objet |
| Démolir rapide | `Suppr` sur l'objet survolé |
| Vider les nombres (zone) | `C` puis glisser (enlève items et tampons, stockages compris, garde les bâtiments) |
| Copier / Couper | `Ctrl+C` / `Ctrl+X` puis glisser une zone |
| Coller | `Ctrl+V` ; clic = poser ; glisser = poser une rangée de copies ; `R` pivote ; `F` miroir horizontal |
| Historique du presse-papiers | `Shift+molette` en mode Coller (20 entrées max, supprimables) |
| Marqueur | `B` puis clic ; saisir un texte ; clic sur un marqueur = éditer / supprimer |
| Annuler / Rétablir | `Ctrl+Z` / `Ctrl+Y` ou `Ctrl+Shift+Z` |
| Pipette (copier le type survolé) | `E` |
| Quitter l'outil / fermer panneau / menu | `Échap` |
| Pause simulation | `Espace` |
| Panneaux | `U` Améliorations, `L` Niveaux, `N` Nombres livrés |

- **Lecture des touches** : chiffres via `event.code` (`Digit1`…`Digit9`, pour fonctionner en AZERTY sans Maj) ; lettres d'outils via `event.key` insensible à la casse ; aucun raccourci de lettre ne doit utiliser une touche physique de déplacement. Ignorer les raccourcis quand un champ texte a le focus.
- Zone de sélection max : **128×128** tuiles. Le Hub est ignoré.
- Glisser un bâtiment (pas un tapis) pose une **rangée** de bâtiments espacés de leur largeur dans l'axe dominant.
- Posé sur un emplacement occupé : refusé (fantôme rouge), sauf tapis (remplacement, section 6.5).
- Coller : les objets en conflit ne sont pas posés (rouge), les autres oui. Un extracteur collé n'est posé que s'il tombe exactement sur un gisement extractible.
- Toutes les actions de construction, démolition, collage, priorité, vidage sont **annulables** (pile de 100). Annuler restaure les bâtiments, **pas les items détruits** (documenté).
- Les raccourcis sont listés dans Options > Commandes (lecture seule pour la v1).

### 8.3 Écran tactile
Le type de pointeur décide (`pointerType`), pas l'appareil : une souris garde les commandes de 8.1 et 8.2 sur une tablette.

| Geste | Effet |
|---|---|
| Glisser à un doigt, sans outil | déplacer la carte (elle continue sur sa lancée, sauf si « Réduire les animations ») |
| Deux doigts | déplacer et zoomer ; abandonne le tracé en cours sans rien poser |
| Appui, avec un outil | comme un clic |
| Glisser à un doigt, avec un outil | construire (tracé, rangée, zone) ; près d'un bord, la carte défile |
| Appui, sans outil | inspecter l'objet (info-bulle épinglée) ou ouvrir un marqueur |
| Appui long sur un objet | pipette |
| Coller | l'aperçu se pose, se déplace au doigt, puis bouton « Poser » |

- Seuil de 10 px entre appui et glisser ; appui long à 450 ms.
- Tout raccourci a un bouton : barre d'actions au-dessus de la barre de construction (Pivoter, Miroir, Inverser le coude, historique du presse-papiers, Retirer, Poser, Quitter) et bouton Pause en haut à droite.
- Liste des gestes dans Options > Commandes.

---

## 9. Interface

### 9.1 Disposition
- **Canvas plein écran** pour le monde. **UI en DOM** par-dessus (`#ui-root`), CSS maison.
- **Haut gauche** : niveau, cible, barre de progression, prochaine récompense, débit actuel du nombre cible (/s).
- **Haut droit** : boutons Annuler, Rétablir, Retour au Hub, Marqueur, Nombres livrés, Niveaux, Améliorations (badge), Menu.
- **Bas centre** : barre de construction (icônes des bâtiments débloqués avec touche, outils d'édition). Bâtiments verrouillés masqués.
- **Bas gauche** : info-bulle contextuelle de l'objet survolé (type, valeur, tampons A/B/sortie, cycle en cours, débit).
- **Bas droit** : indicateur de pause. En mode debug (`?debug=1`) seulement : indicateur de sauvegarde (« Sauvegardé il y a 12 s ») et coordonnées du curseur.
- **Au-dessus de la barre de construction** : barre d'actions de l'outil actif (8.3).
- **Petits écrans** : barre de construction en icônes, défilable ; sur téléphone, HUD sur une ligne, panneaux en feuilles, boutons de 44 px au moins, zones sûres respectées (`PLAN-tactile.md` §5.5).
- Toasts : niveau terminé, amélioration prête, sauvegarde, erreurs d'import.

### 9.2 Panneau « Nombres livrés »
- Liste de toutes les valeurs livrées sur la dernière minute avec leur débit.
- Ordre : nombre du niveau (surligné jaune) en tête, puis nombres d'amélioration (étiquetés avec la piste), puis les autres (grisés).
- Bouton qui alterne l'unité : /s, /min, /h.
- Sous la liste : cibles des 12 prochains niveaux.

### 9.3 Panneau « Améliorations »
Voir 7.3.

### 9.4 Menu (Échap)
Reprendre, Nouvelle partie (seed aléatoire ou saisi), Sauvegarder, Exporter (.json), Importer, Options, Aide, À propos.
- **Options** : langue (FR/EN), volume effets (0-100), grille visible (oui/non), afficher les valeurs sur les items (toujours / selon zoom), intervalle de sauvegarde auto (30 s / 60 s / 5 min / jamais), achat auto des améliorations, réduire les animations, commandes.
- **À propos** : « Projet de fan, inspiré par Beltmatic de Notional Games. Code et visuels originaux. » + lien vers le jeu original sur Steam + lien vers le repo.

### 9.5 Accessibilité minimale
- Contraste texte ≥ 4,5:1 sur l'UI DOM.
- Les opérateurs se distinguent par **symbole + forme**, pas seulement par couleur.
- Navigation clavier dans les panneaux (Tab, Entrée, Échap).
- Option « Réduire les animations » (coupe l'onde de niveau et les flashs).

---

## 10. Rendu

### 10.1 Direction artistique (originale)
- Fond bleu nuit `#0f1422`, lignes de grille `#1a2236` (visibles à zoom ≥ 0,5).
- Gisements : carré `#1e2740` à coins arrondis, valeur blanche en police monospace grasse.
- Bâtiments : formes arrondies, couleur pleine désaturée, symbole blanc au centre (`+ × − ÷ ^`), lettres `A`/`B`/`Q`/`R` sur les tuiles de port, tuiles d'entrée plus sombres, tuiles de sortie plus claires.
- Hub : grand carré `#2b6cb0` arrondi, texte blanc.
- Items : disque de couleur (5.) avec la valeur en blanc. Ombre légère.
- Police : pile système `ui-monospace, "SF Mono", Menlo, Consolas, monospace` pour les nombres ; `system-ui` pour l'UI.
- Tous les visuels sont **dessinés par code** (Canvas) et mis en cache dans des canvas hors écran. **Aucun fichier image** sauf favicon (SVG original) et les icônes d'installation (PNG générés depuis ce SVG par `scripts/make-icons.mjs`).

### 10.2 Couches (ordre de dessin)
1. Fond + grille.
2. Gisements (cache par chunk, redessiné si `maxExtraction` change).
3. Tapis et ponts (chevrons animés par décalage temporel).
4. Bâtiments.
5. Items (interpolés).
6. Indicateurs : losanges de priorité, flashs, barres de stockage.
7. Fantômes de construction, rectangle de sélection, aperçu de collage.
8. Marqueurs (texte à taille écran constante, lisible dézoomé).
9. Onde de niveau.

### 10.3 Niveaux de détail (LOD)
| Zoom | Items | Tapis | Texte |
|---|---|---|---|
| ≥ 0,6 | disque + valeur | chevrons | tout |
| 0,3 à 0,6 | disque sans texte | chevrons simplifiés | gisements, bâtiments |
| 0,12 à 0,3 | point coloré 2 px | trait | gisements seulement |
| < 0,12 | masqués | trait fin | marqueurs uniquement |

### 10.4 Performance
- **Culling** : ne dessiner que les chunks visibles + 1 de marge.
- `devicePixelRatio` géré (canvas net sur écran HiDPI), plafonné à 2.
- Objectif : **60 fps** avec 20 000 tuiles de tapis, 1 000 bâtiments et 15 000 items sur un portable milieu de gamme ; simulation < 4 ms par tick dans ce scénario (bench `npm run bench`).
- Structures de données : tableaux typés pour les items si le profilage l'exige (commencer simple, mesurer, optimiser).

---

## 11. Simulation, boucle et sauvegarde

### 11.1 Boucle
- `requestAnimationFrame` pour le rendu.
- Simulation à **pas fixe 60 Hz** avec accumulateur ; maximum 8 ticks par frame (au-delà, ralentir plutôt que geler).
- Pause : la simulation s'arrête, le rendu et la construction continuent.
- **Rattrapage** : quand l'onglet redevient visible après une absence, simuler le temps manqué jusqu'à **10 minutes**, en lots de 600 ticks par frame, avec une barre « Rattrapage… » non bloquante.

### 11.2 Ordre d'un tick
1. Extracteurs produisent.
2. Tapis et ponts avancent (ordre aval → amont, 6.4).
3. Sorties des bâtiments se vident vers leurs cibles.
4. Opérateurs avancent leur cycle, démarrent un nouveau cycle si possible.
5. Stockages échangent.
6. Hub consomme et notifie la progression.
7. Statistiques.

### 11.3 Sauvegarde
- `localStorage` clé `sumflow.save.v1` (sauvegarde unique) + `sumflow.settings`.
- Sauvegarde auto selon l'option (défaut 60 s), à `visibilitychange → hidden` et à `beforeunload`.
- Format : JSON compressé via `CompressionStream('deflate-raw')` puis base64. Repli sans compression si l'API manque.
- Si l'écriture échoue (quota), toast d'erreur + proposition d'export fichier.
- **Export** : fichier `sumflow-AAAAMMJJ-HHMM.json` non compressé (lisible). **Import** : accepte `.json` et le format compressé ; validation de schéma ; en cas d'erreur, rien n'est écrasé.
- Contenu : `version`, `seed`, `tick`, `playTimeMs`, progression (niveau, cibles générées, exigences et compteurs, niveaux des pistes, suites `t_k`), entités (type, position, rotation, état : tampons, cycle, tourniquets, priorité, valeur et stock du stockage), items sur tapis (`key`, valeur, progress), ponts (deux voies), marqueurs, presse-papiers, caméra.
- Les gisements ne sont **pas** sauvegardés (recalculés depuis le seed).

### 11.4 Migrations
- `src/save/migrations.ts` : tableau ordonné `migrate_vN_to_vN1`. Chargement : appliquer les migrations jusqu'à la version courante. Test pour chaque migration.

---

## 12. Audio
- Effets synthétisés par **WebAudio** (oscillateurs + enveloppes), aucun fichier : pose, démolition, clic UI, amélioration prête, niveau terminé (arpège montant 3 notes), erreur.
- Contexte audio créé au premier geste utilisateur. Volume global dans les options. Pas de musique en v1.

---

## 13. Architecture du code

### 13.1 Arborescence
```
.
├── .github/workflows/deploy.yml
├── docs/ DECISIONS.md, PROGRESS.md
├── public/ favicon.svg, manifest.webmanifest, icônes d'installation (PNG)
├── scripts/ make-icons.mjs
├── index.html
├── src/
│   ├── main.ts                  # bootstrap
│   ├── config/ balance.ts, keymap.ts, colors.ts
│   ├── core/ intmath.ts, rng.ts, grid.ts (clés, directions, rotation), events.ts (bus typé), format.ts
│   ├── world/ mapgen.ts, deposits.ts, chunks.ts
│   ├── sim/ state.ts, entities.ts, occupancy.ts, belts.ts, bridges.ts, extractor.ts,
│   │        operators.ts, storage.ts, hub.ts, network.ts (graphe + ordre), tick.ts,
│   │        progression.ts, upgrades.ts, stats.ts
│   ├── build/ placement.ts, beltPath.ts, history.ts, clipboard.ts, tools/*.ts
│   ├── render/ renderer.ts, camera.ts, cache.ts, layers/*.ts, lod.ts
│   ├── input/ keyboard.ts, pointer.ts (souris, doigt, stylet), gestures.ts (gestes tactiles, sans DOM)
│   ├── ui/ hud.ts, buildBar.ts, tooltip.ts, toasts.ts, panels/{upgrades,levels,delivered,menu,options,help}.ts, styles.css
│   ├── save/ serialize.ts, persist.ts, migrations.ts, schema.ts
│   ├── i18n/ index.ts, fr.ts, en.ts
│   ├── audio/ sfx.ts
│   └── debug/ debugApi.ts
├── tests/unit/*.test.ts
├── tests/e2e/*.spec.ts
├── bench/sim.bench.ts
├── vite.config.ts, tsconfig.json, eslint.config.js, .prettierrc, playwright.config.ts
└── README.md
```

### 13.2 Principes
- **`sim/` ne dépend jamais de `render/`, `ui/`, `input/`, ni du DOM.** Testable sous Node.
- `render/` lit l'état, ne le modifie jamais.
- `build/` produit des **commandes** (`PlaceBeltPath`, `PlaceBuilding`, `Demolish`, `Paste`, `SetPriority`, `ClearArea`, `AddMarker`…) appliquées par `sim/` et enregistrées dans `history`.
- Bus d'événements typé (`levelCompleted`, `upgradeReady`, `upgradeBought`, `delivered`, `networkChanged`, `saved`) pour relier sim, UI et audio.
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.

### 13.3 Types clés (indicatifs)
```ts
type Dir = 0 | 1 | 2 | 3; // N E S W
type Rot = 0 | 1 | 2 | 3;
type BuildingType = 'extractor' | 'adder' | 'multiplier' | 'subtractor'
  | 'divider' | 'exponent' | 'storage' | 'hub';
type PortRole = 'A' | 'B' | 'O' | 'Q' | 'R' | 'any' | 'body';

interface Footprint { w: number; h: number; tiles: { x: number; y: number; role: PortRole; faces: Dir[] }[] }

interface Belt { key: number; outputs: number /* bitmask */; item: Item | null;
  rr: number; rrIn: number; priority: Dir | null }
interface Bridge { key: number; laneH: Lane; laneV: Lane }
interface Lane { dir: Dir | null; item: Item | null }
interface Item { value: number; progress: number }

interface Building { id: number; type: BuildingType; x: number; y: number; rot: Rot;
  inA?: number[]; inB?: number[]; out?: number[]; outQ?: number[]; outR?: number[];
  cycle?: number /* secondes restantes, -1 si inactif */; rrOut: number; priority: number | null;
  extractAcc?: number; storeValue?: number | null; storeCount?: number }

interface Requirement { value: number; required: number; delivered: number }
```

### 13.4 API de debug
Active si `import.meta.env.DEV` ou URL `?debug=1`. Exposée sur `window.__sumflow` :
`unlockAll()`, `setLevel(n)`, `setUpgrade(track, level)`, `deliver(value, count)`, `setTimeScale(x)` (1 à 50), `step(seconds)`, `place(type, x, y, rot)`, `beltPath(x1, y1, x2, y2, ctrl?)`, `getState()`, `findDeposit(value)`, `reveal()`. Overlay FPS / ticks / nombre d'items avec `F3`.

---

## 14. Jalons

Chaque jalon se termine par : CI verte, déploiement Pages fonctionnel, `docs/PROGRESS.md` mis à jour.

### M0 : Squelette et déploiement
- Vite + TS strict, ESLint, Prettier, Vitest, Playwright installés. Scripts : `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck`, `bench`.
- `vite.config.ts` : `base: './'` (fonctionne quel que soit le nom du repo).
- Workflow GitHub Actions (section 15). Page qui affiche un canvas plein écran bleu nuit et « Sumflow ».
- ✅ L'URL Pages affiche la page ; `npm run build` sans avertissement.

### M1 : Grille, caméra, Hub
- Caméra (pan clavier/souris, zoom centré curseur, `H`), grille, Hub dessiné avec niveau 1 et cible « 1 × 10 ».
- ✅ Zoom 0,05 à 4 fluide ; tests unitaires `grid.ts` (clés, rotations, faces).

### M2 : Carte procédurale
- `mapgen` complet (4.4), rendu des gisements avec LOD et cadenas, seed affiché dans le menu debug.
- ✅ Tests : déterminisme, indépendance à l'ordre des chunks, pas de 10, pas de chevauchement, au moins quatre 1 à moins de 16 tuiles.

### M3 : Tapis, extracteur, livraison (premier jeu jouable)
- Tracé en L, remplacement, rotation, pose simple ; simulation des tapis (6.4) avec ordre aval → amont ; extracteur ; Hub consomme ; niveau 1 complétable.
- Info-bulle de survol, démolition simple (`Suppr`, outil `X` en clic).
- ✅ Test : tapis plein à vitesse 1 livre 60 ± 1 items/min. Test : extracteur niveau 1 avec 3 sorties produit 1 item/s au total. Test e2e : via l'API debug, poser extracteur + tapis et atteindre le niveau 2.

### M4 : Progression des niveaux
- Table 7.2, randomisation, niveaux infinis, récompenses, onde + son placeholder, HUD complet, panneau Niveaux (12 suivants), écran de fin.
- ✅ Tests : cibles 1 à 5 fixes, suite strictement croissante, déterminisme par seed, récompenses appliquées (`maxExtraction`, déblocages).

### M5 : Opérateurs
- Les 5 opérateurs (6.3) avec empreintes, rotations, ports, tampons, cycles, flash, lettres A/B ; connexions directes ; pose en rangée par glisser.
- ✅ Tests par opérateur : résultat, ordre A/B, saturation, divmod (b = 0, reste nul non émis, négatifs), pow (négatifs, 0^0), cadence exacte (additionneur niveau 1 alimenté en continu : 15 résultats/min ± 1), blocage quand la sortie est pleine.

### M6 : Jonctions, priorités, ponts
- Division au départ d'un tapis existant, fusion équitable, priorités (6.6), ponts auto et manuels (6.7).
- ✅ Tests : fusion de 2 tapis pleins vers 1 tapis = 50/50 ± 2 % ; division 1 → 3 = 1/3 chacun ± 2 % ; priorité respectée tant que la sortie a de la place ; deux flux croisés sur un pont ne se mélangent jamais.

### M7 : Améliorations et statistiques
- Pistes, suites `t_k`, fenêtres glissantes, quantités, panneau Améliorations, badge, achat (manuel et auto), effets immédiats ; panneau Nombres livrés avec unités.
- ✅ Tests : un item compte pour toutes les exigences actives de même valeur ; nouvelle exigence à 0 ; fenêtres `[t1]`, `[t1,t2]`, `[t(L-2)..t(L)]` ; extracteur plafonné à 12 ; plafonds doux.

### M8 : Stockage
- Règles 6.3 (faces auto entrée/sortie, valeur unique, 10 000, sortie saturée), affichage du remplissage.
- ✅ Tests : refus d'une seconde valeur ; libération à 0 ; sortie à pleine vitesse tapis.

### M9 : Outils d'édition
- Démolir zone, vider zone, copier/couper/coller avec historique de 20, rotation et miroir du collage, collage en rangée, marqueurs, pipette, annuler/rétablir (pile 100).
- ✅ Tests : copier-coller-annuler restaure exactement l'état des bâtiments ; miroir inverse A/B correctement (un soustracteur en miroir reste A − B, seules les positions changent) ; zone max 128×128.

### M10 : Sauvegarde, options, i18n, menu, aide, audio
- Section 11.3 et 11.4, options 9.4, i18n FR/EN complète (détection `navigator.language`, défaut FR), bulles d'aide 7.5, sons WebAudio.
- ✅ Tests : aller-retour sauvegarde → chargement identique (hash de l'état) ; import invalide sans effet ; toutes les clés i18n présentes dans les deux langues (test qui compare les clés) ; aucune chaîne en dur dans `src/ui` (règle ESLint ou test grep).

### M11 : Performance et finition
- LOD (10.3), culling, caches, rattrapage hors onglet, bench, overlay `F3`, accessibilité 9.5, README (présentation, commandes, crédits d'inspiration, licence MIT).
- ✅ Bench : scénario de référence < 4 ms/tick ; e2e Playwright : chargement, pose d'une chaîne 1 + 1 → Hub via l'API debug, sauvegarde, rechargement, état conservé ; Lighthouse performance ≥ 90 sur la page.

---

## 15. CI/CD GitHub Pages

`.github/workflows/deploy.yml` :
- Déclencheurs : `push` sur `main`, `pull_request` (sans déploiement), `workflow_dispatch`.
- Job `ci` : Node 22, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, puis `npx playwright install --with-deps chromium` et `npm run test:e2e` (contre `vite preview`).
- Job `deploy` (seulement sur `main`, dépend de `ci`) : `actions/configure-pages`, `actions/upload-pages-artifact` (dossier `dist`), `actions/deploy-pages`. Permissions : `pages: write`, `id-token: write`. Environnement `github-pages`.
- Réglage du repo à documenter dans le README : Settings > Pages > Source : **GitHub Actions**.

---

## 16. Stratégie de test

- **Unitaires (Vitest)** sur `core/`, `world/`, `sim/`, `build/`, `save/`, `i18n/`. Couverture visée ≥ 80 % sur `sim/` et `core/`.
- **Scénarios de simulation** : helper `runScenario(setup, seconds)` qui construit un mini-monde, simule N ticks et renvoie les livraisons. Les tests de débit (sections 14) utilisent ce helper.
- **e2e (Playwright, Chromium)** : chargement, absence d'erreur console, interaction via `window.__sumflow`, une interaction souris réelle (tracer un tapis), sauvegarde/rechargement.
- **e2e tactiles** : projets tablette (couchée, debout) et téléphone (couché, debout), gestes multi-doigts envoyés par CDP ; `touch.spec.ts` (gestes) et `layout.spec.ts` (aucun contrôle hors écran, trop petit ou recouvert).
- **Bench** : `bench/sim.bench.ts` génère le scénario de référence (10.4).

---

## 17. Définition de « terminé » (projet)

- [ ] Une partie neuve est jouable du niveau 1 au niveau 30 sans bug bloquant, avec tous les bâtiments et outils décrits.
- [ ] Toutes les valeurs de `balance.ts` correspondent aux sections 6 et 7.
- [ ] Sauvegarde auto, export, import, migration fonctionnels.
- [ ] FR et EN complets.
- [ ] 60 fps sur le scénario de référence ; pas de fuite mémoire visible après 30 min.
- [ ] CI verte, déploiement Pages automatique, README à jour.
- [ ] Aucun asset, texte ou nom de l'original réutilisé.

---

## Annexe A : exemples de calcul (pour vérifier l'équilibrage)

- **Niveau 1** : 1 extracteur de 1 (1 tapis, vitesse 1) → 10 items en ~10 s + temps de trajet.
- **Additionneur niveau 1** : consomme 2 items toutes les 4 s, soit 0,5 item/s = la moitié d'un tapis de vitesse 1. Il faut donc 2 additionneurs pour absorber un tapis plein à vitesse 1.
- **Fabriquer 7 avec des 1** : 6 additionneurs en série (1+1+1+1+1+1+1). Avec Extraction 7 (niveau 11), on l'extrait directement.
- **Fabriquer 891 (niveau 19)** avec 9 et 11 : `9 × 9 = 81`, `81 × 11 = 891` (2 multiplicateurs).
- **Hub** : 24 faces ; à vitesse 8, débit maximal théorique 192 items/s.
- **Diviseur comme duplicateur** : `(7n) ÷ 6` avec `1 ≤ n ≤ 5` donne `q = n` et `r = n`, donc deux exemplaires de `n` pour un seul en entrée (plus le 6 consommé).

## Annexe B : choix de conception par rapport aux sources

Les sources publiques (wiki communautaire, guides Steam, blogs) divergent selon les versions du jeu original. Choix retenus :
- Vitesse de tapis de départ **1 tuile/s** (version récente documentée) plutôt que 2.
- Tampon d'entrée **4** (et non 5), tampon de sortie **2**.
- Niveau 2, cibles 24 à 29, suites `t_k` au-delà des valeurs connues, génération de carte et formes du diviseur et de l'exposant : **conçus pour ce projet**, cohérents avec les données connues.
- Modèle de tapis à sorties multiples (masque) au lieu des « demi-tapis » de l'original : plus simple à coder, mêmes possibilités (division, fusion, coins).
