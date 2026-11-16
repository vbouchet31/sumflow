# Décisions

Choix pris quand `PLAN.md` est muet ou ambigu. Une entrée par décision, la plus récente en bas.

## M0

- **Versions de l'outillage** : TypeScript `~6.0` (et non 7.x) car `typescript-eslint` 8 exige `typescript < 6.1`. Vite 8, Vitest 5, ESLint 10, Playwright `1.63.0` (version exacte, alignée sur le Chromium préinstallé de l'environnement de dev ; la CI l'installe via `npx playwright install`).
- **Dépendance dev ajoutée : `@types/node`**. Hors liste §1.6, mais nécessaire pour typer `process.env` dans `playwright.config.ts` et les scripts Node. Types uniquement, aucun code runtime.
- **ESLint sans `@eslint/js`** : on utilise seulement `tseslint.configs.strict` pour rester dans la liste des dépendances autorisées.
- **Règle de déterminisme outillée** : ESLint interdit `Math.random`, `Date.now` et `performance.now` dans `src/sim/` (§1.5).
- **Bench** : Vitest 5 a remplacé l'API `bench()`. `npm run bench` lance donc Vitest en mode `bench` sur `bench/**/*.bench.ts`, avec un chronométrage `performance.now()` et une assertion de seuil (< 4 ms/tick), ce qui colle au critère d'acceptation de M11.
- **Workflow Pages** : l'artefact Pages (`dist`) est téléversé à la fin du job `ci` (là où le build existe), puis le job `deploy` fait `configure-pages` + `deploy-pages`. Équivalent au §15, sans rebuild.
- **i18n dès M0** : un mini-module `t()` FR/EN existe déjà pour respecter la règle §1.4 (aucun texte en dur). Il sera complété en M10.
- **Écran M0** : un titre DOM « Sumflow » par-dessus le canvas (`src/ui/splash.ts`), temporaire, remplacé par le HUD en M1/M4.

## M1

- **Caméra** : position = point du monde (en tuiles) au centre de l'écran. Vitesse de déplacement clavier : 700 px écran/s (indépendante du zoom), ×3 avec Shift. Zoom molette : `zoom *= exp(-deltaY × 0,0015)`, borné à [0,05 ; 4]. Réglages dans `src/config/keymap.ts` (ressenti des commandes, pas de l'équilibrage).
- **Position caméra bornée** à `[-500 000, 500 000]` comme la grille.
- **Clic du milieu** : son défilement automatique natif est désactivé pour que le glisser déplace la caméra.
- **Hub** : il affiche « Niveau n », la cible en grand, `livrés / requis`, une barre et l'icône de la prochaine récompense. La forme « 27 × 150 » de §3.1 est rendue sur deux lignes (cible, puis `0 / 150`), plus lisible.
- **Texte du Hub masqué sous le zoom 0,3** (LOD §10.3 : texte des bâtiments jusqu'à 0,3).
- **Table des niveaux 1 à 30** déjà saisie dans `balance.ts` (données pures). La randomisation et les récompenses arrivent en M4.
- **API de debug minimale dès M1** : `window.__sumflow.getState()` (état + caméra), pour les tests e2e. Elle s'enrichira jalon par jalon (§13.4).
- **`formatCompact`** arrondit (et non tronque) à 3 chiffres significatifs, pour coller à l'exemple `2.15G` du §5 (2 147 483 647).

## M2

- **Position d'un gisement** : on stocke sa tuile **centrale** `(x, y)` ; il couvre `[x-1, x+1] × [y-1, y+1]`. La distance au centre est `hypot(x, y)`.
- **Écart d'une tuile** : deux centres doivent être espacés d'au moins 4 sur un des deux axes (3 + 1).
- **Zone dégagée** : aucune tuile d'un gisement dans `[-6, 5]²`. Un tirage qui y tombe compte comme une collision.
- **Valeur 1 « un par quadrant »** : l'angle est tiré dans le quadrant `i` ; les 30 décalages d'angle restent dans ce quadrant (pas de 3°), puis la distance augmente de 3.
- **Autres valeurs garanties** : 30 décalages de 12° autour de l'angle tiré, puis distance +3, en boucle jusqu'au succès.
- **Flux RNG** : gisements garantis sur `mulberry32(mix32(seed ^ 0x6a09e667))`, chunks sur `mulberry32(hash2(seed, cx, cy))`. Chaque tentative consomme toujours 3 tirages (x, y, valeur), acceptée ou non.
- **Indépendance à l'ordre des chunks** : les gisements aléatoires d'un chunk ont leur centre dans `[2, 29]` (local). Leurs tuiles restent donc à au moins une tuile du bord, et deux chunks voisins ne peuvent jamais entrer en collision. Chaque chunk ne se compare qu'aux gisements garantis (globaux) et à ses propres tirages. Le résultat ne dépend pas de l'ordre de génération (testé).
- **Graine** : `?seed=N` dans l'URL, sinon aléatoire (`Math.random` dans `main.ts`, hors simulation). Le menu Nouvelle partie arrivera en M10.
- **Rendu des gisements sans cache hors écran pour l'instant** : dessin direct des chunks visibles (+1 de marge), carrés regroupés dans un seul chemin. Mesuré fluide jusqu'au zoom 0,05. Un cache par chunk sera ajouté en M11 si le profilage le justifie (§10.4 : « commencer simple, mesurer »).
- **LOD des gisements** : coins arrondis et cadenas à partir du zoom 0,3 ; valeur affichée à partir de 0,12 ; en dessous, carrés seuls.
- **« Menu debug »** : en attendant le vrai menu (M10), un petit panneau en bas à gauche (`?debug=1` ou dev) affiche la graine, la tuile sous le curseur, le zoom et la valeur du gisement survolé. API debug : `findDeposit(value)` et `depositAt(x, y)`.

## M3

- **Architecture** : `GameState` (données sauvegardables : tapis par clé de tuile, bâtiments par id, Hub = id 0) + `World` (index dérivés : occupation, ports, seaux par chunk pour le culling, ordre du réseau). Toutes les mutations passent par `World`.
- **Position d'un item** : `progress` 0 = bord d'entrée, 0,5 = centre, 1 = bord de sortie. On mémorise la face d'entrée (`from`) pour dessiner les virages.
- **Marque de tick par item** (`stamp`, jamais sauvegardée) : un item qui vient d'entrer dans une tuile déjà traitée ne bouge pas une deuxième fois dans le même tick (cas des cycles et des divisions).
- **Débit exact d'un tapis plein** : un item posé par un bâtiment reprend l'avance (`carry`) laissée par l'item précédent quand la tuile s'est libérée au tick d'avant (`vacatedTick`/`vacatedCarry`, jamais sauvegardés). Testé à 1, 2, 5 et 8 tuiles/s : `vitesse × 60 ± 1` items/min.
- **Tolérance flottante** : `EPS = 1e-9` (1/60 additionné 60 fois ne fait pas exactement 1).
- **Fusion équitable** : une tuile à plusieurs entrées refuse un item si la source désignée par `rrIn` a un item prêt ; elle accepte sinon et fait avancer `rrIn`. Les sources sont listées dans l'ordre N, E, S, W de la tuile réceptrice. Tests fins de répartition en M6.
- **Ordre aval → amont** : DFS itératif en post-ordre, racines par clé croissante. Dans une boucle pure, la plus petite clé est traitée en dernier (c'est l'arête entrante qui est coupée).
- **Bâtiment posé sur des tapis** : les tapis sous l'empreinte sont remplacés (supprimés). Posé sur un autre bâtiment : refusé. Lecture de §8.2 « refusé, sauf tapis (remplacement) ».
- **Remplacer un tapis garde son item.**
- **Direction d'un tapis posé d'un clic** : Est à la rotation 0, puis sens horaire avec `R`.
- **Extracteur sans connexion directe bâtiment-à-bâtiment** pour l'instant (arrive avec les opérateurs en M5).
- **Niveau suivant minimal** : terminer un niveau passe au suivant de la table de base. Récompenses, cibles randomisées et niveaux infinis en M4.
- **Boucle** : 60 Hz, accumulateur, 8 ticks max par frame (×`timeScale` en debug). `Espace` met en pause ; les chevrons s'arrêtent aussi (ils suivent le temps de simulation).
- **Panneau debug déplacé en haut à droite** pour laisser le bas gauche à l'info-bulle (§9.1).
- **API debug** : `place('belt'|'extractor', x, y, rot)`, `beltPath`, `step`, `setTimeScale`, `setUpgrade`, `deliver`, `getState()` (résumé sérialisable).
