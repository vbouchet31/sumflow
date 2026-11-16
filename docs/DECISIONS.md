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

## M4

- **Tirage par niveau indépendant** : la cible du niveau `n` utilise `mulberry32(hash2(seed, "LEVL", n))`, un seul tirage. Le résultat ne dépend donc pas du nombre de niveaux déjà générés (testé).
- **Dernier niveau** : le premier niveau (au-delà de 30) dont la cible tirée dépasserait 2 000 000 000 devient le dernier, avec une cible ramenée à **2 000 000 000**. Ce niveau donne quand même sa récompense « Extraction n − 7 ».
- **État** : `levels` (cibles et quantités générées jusqu'au niveau courant + 15), `levelRequirement` (`null` en jeu libre), `finishedAtTick`, `unlockedBuildings`, `unlockedFeatures`. La récompense d'un niveau se recalcule à partir de son numéro (`rewardFor(n)`), elle n'est pas stockée.
- **Temps de jeu** dérivé du compteur de ticks (pause non comptée). Le champ `playTimeMs` de la sauvegarde (M10) en découlera.
- **Statistiques de livraison** (`DeliveryStats`) : 60 seaux d'une seconde, état d'exécution non sauvegardé. Le débit est une moyenne sur le temps écoulé tant que la fenêtre n'est pas pleine. Le HUD affiche le débit du nombre cible.
- **Panneau Niveaux** : 12 lignes en partant du niveau en cours (inclus), touche `L` ou bouton en haut à droite.
- **Son** : `Sfx` WebAudio minimal (arpège de fin de niveau, pose, démolition, erreur), créé au premier geste. Volume et options en M10.
- **Onde de fin de niveau** désactivée si le système demande de réduire les animations (`prefers-reduced-motion`). L'option du jeu viendra en M10.
- **CSS** : règle globale `[hidden] { display: none !important }`, sinon un `display: grid` réaffiche des éléments masqués.
- **API debug** : `unlockAll()` et `setLevel(n)` (accorde les récompenses des niveaux précédents).

## M6

- **Ponts** : `state.bridges` (une tuile porte un tapis **ou** un pont). Chaque voie est un objet `Belt` à une seule sortie, ce qui réutilise toute la logique des tapis. Dans le réseau, une voie a une clé de nœud négative dérivée de la tuile et de l'axe. Un item qui arrive sur un pont prend la voie de son axe de déplacement. Une voie absente (`null`) n'accepte rien.
- **Tapis « droit »** (pour le pont auto, §6.5) : une seule sortie, et aucun voisin qui l'alimente par le côté (seule l'arrière est permise). Le chemin doit traverser la tuile tout droit (même direction avant et après), pas dans un coude.
- **Repasser sur un pont existant** : tout droit, le tracé redéfinit la voie de son axe ; dans un coude, il remplace le pont par un tapis.
- **Pont manuel (touche 9)** : la direction de chaque voie vient d'un tapis voisin qui alimente la tuile sur cet axe, sinon de la rotation `R` si elle est sur cet axe, sinon Est (horizontale) et Sud (verticale). Un tapis droit déjà présent garde sa voie et son item. Refusé sur un bâtiment, un pont existant ou un tapis non droit.
- **Priorités** : sur un tapis-jonction, `priority` = direction prioritaire. Sur un bâtiment, `priority` = clé de port (tuile × 4 + face) de la face de sortie prioritaire. Le clic se fait sur la **tuile alimentée** ; on cherche d'abord une jonction voisine, puis une face de sortie de bâtiment. Le losange vert est dessiné sur cette tuile. Une seule priorité par source. La sortie prioritaire ne fait pas avancer le tourniquet des autres.
- **Outil Priorité** : `P`, ou `Alt+clic` en mode Tapis. Visible quand la fonction est débloquée (niveau 10).
- **Rendu du pont** : voie verticale et ses items dessous, tablier horizontal avec rails clairs, items horizontaux dessus.
- **Info-bulle remontée** au-dessus de la barre de construction, qui s'élargit avec les déblocages.

## M7

- **Suites `t_k`** : générées paresseusement et stockées dans `state.upgradeSeqs` (sauvegardées en M10). Un tirage par terme, `mulberry32(hash2(seed ^ "UPGR", indexPiste, k))`, donc le résultat ne dépend pas de l'ordre de génération (testé). Une valeur qui tombe sur 10 devient 11. Une suite strictement croissante n'a jamais de doublon dans sa fenêtre.
- **Exigences actives** : `state.upgradeReqs[piste]` (vide si la piste est verrouillée ou au max). Elles sont recréées à `delivered = 0` après chaque achat et à chaque déblocage de piste.
- **Arrondi des quantités** au multiple de 50 le plus proche (minimum 50). Exemple : additionneur L = 3 : 4 800, 3 850, 2 900.
- **Max d'une piste** : extracteur au niveau 12, plafond doux atteint (tapis 20, additionneur 4, autres 3 op/s), **ou** terme `t_L` > 2 000 000 000. En pratique, la suite du Tapis dépasse 2 000 000 000 vers L ≈ 70 (environ 14 tuiles/s), avant le plafond de 20. Le plan énonce les deux règles et les deux sont appliquées.
- **Achat automatique** : `state.autoBuyUpgrades` (option de la partie, sauvegardée). L'activer achète tout ce qui est déjà prêt. La case est dans le panneau Améliorations ; elle sera aussi dans Options en M10.
- **Panneaux** : base `Panel` commune (titre, fermer, `Échap`). Un seul panneau ouvert à la fois. `U` Améliorations (bouton visible dès que la fonction est débloquée, badge vert si une amélioration est prête), `N` Nombres livrés, `L` Niveaux.
- **Nombres livrés** : liste les valeurs livrées dans la dernière minute, plus la cible et les nombres d'amélioration même à 0. Tri : cible, puis amélioration, puis autres, puis débit décroissant. Rafraîchie toutes les 500 ms.
- **Son « amélioration prête »** : deux notes douces, avec un toast. Pas de son ni de toast si l'achat automatique est actif (seul le toast « niveau N » s'affiche).

## M8

- **Faces du stockage** : n'importe quelle face accepte ce qui la pousse (un tapis qui pointe vers elle, ou une face de sortie de bâtiment collée, limitée à la vitesse des tapis comme toute connexion directe). En sortie, le stockage ne remplit que les **tapis** adjacents qui ne pointent pas vers lui, jamais un bâtiment directement. C'est la lecture la plus simple de §6.3.
- **Sortie saturée** : à chaque tick, chaque face de sortie dont la tuile est libre reçoit un item, avec la même reprise d'avance que l'extracteur. Le débit vaut exactement la vitesse des tapis (testé à 1 et 4).
- **Ordre des faces** : déterministe (empreinte puis N, E, S, O). Pas de tourniquet nécessaire, chaque face libre est servie à chaque tick.
- **Valeur refusée** : l'item attend à `progress = 1` sur le tapis (comme une entrée pleine).
- **Pose** : même outil générique que les opérateurs (fantôme centré, rangée au glisser), touche `8`. Le stockage ne pivote pas.
- **Rendu** : bloc gris acier, valeur (« — » si vide), barre et compteur `n / 10k`.

## M9

- **Annuler par journal** : `World.beginChange()` / `endChange()` notent l'état _avant_ de chaque emplacement touché (tuile pour tapis et ponts, id pour un bâtiment, tuile pour un marqueur), puis l'état _après_ à la fin de l'action. Annuler remet l'état avant, rétablir l'état après. Une action sans effet sur la disposition n'entre pas dans la pile.
- **Ce que l'annulation restaure** : la disposition (type, position, rotation, miroir, sorties, voies de pont, priorités, marqueurs). Un objet qui existe toujours garde ses items. Un objet recréé revient vide, avec **le même id**. Les items détruits ne reviennent jamais (§8.2).
- **Vider une zone** ne change pas la disposition : l'action n'entre pas dans la pile (l'annuler ne ferait rien de visible).
- **Miroir des bâtiments** : nouveau champ `mirror` (absent = faux, donc les sauvegardes futures restent compatibles). L'empreinte est d'abord retournée (`x → w-1-x`, faces E et O échangées), puis tournée. Les ports gardent leur rôle : un soustracteur en miroir calcule toujours A − B. C'est le seul moyen d'obtenir ce miroir (le soustracteur en L n'a pas de rotation équivalente qui garde A et B à leur place).
- **Transformation du collage** : stockée comme « miroir puis rotation ». `R` ajoute un quart de tour ; `F` retourne l'aperçu tel qu'il est affiché, donc le miroir s'inverse et la rotation devient `-r`. Pour un bâtiment, l'orientation se compose dans le même groupe (testé sur toutes les combinaisons).
- **Sélection** : un bâtiment fait partie d'une zone dès qu'une de ses tuiles y est. Zone plafonnée à 128×128 : le coin sous le curseur s'arrête de suivre au-delà. Un clic simple = zone 1×1.
- **Presse-papiers** : stocké dans `state.clipboard` (sauvegardé en M10), entrée la plus récente en tête. Coordonnées relatives à la boîte englobante serrée de ce qui a été copié. Les marqueurs ne sont pas copiés. Après une copie ou une coupe, l'outil passe en mode Coller sur la nouvelle entrée.
- **Collage** : l'aperçu est centré sur le curseur. Un tapis ou pont collé remplace ce qui est sur la tuile ; il est refusé (rouge) sur un bâtiment. Un bâtiment collé est refusé s'il touche un bâtiment, sort de la grille ou n'est pas débloqué ; un extracteur seulement s'il tombe exactement sur un gisement extractible (il prend la valeur de ce gisement). Rangée au glisser : copies espacées de la taille du presse-papiers, **32 copies au plus**.
- **`Suppr` en mode Coller** retire l'entrée affichée de l'historique (au lieu de démolir l'objet survolé). `Maj+molette` change d'entrée (pas de 50 px de molette cumulés, pour les pavés tactiles) et remet la rotation et le miroir à zéro.
- **Marqueurs** : un par tuile au plus (`state.markers`, clé de tuile), 40 caractères max, texte vide = suppression. Clic sur un marqueur sans outil, ou avec l'outil Marqueur, ouvre l'éditeur (Entrée valide, Échap annule). Création, modification et suppression sont annulables.
- **Pipette (`E`)** : prend le type et la rotation du bâtiment survolé, ou l'outil Tapis orienté comme le tapis survolé, ou l'outil Pont. Rien sur le Hub.
- **Barre de construction** : les outils d'édition forment un second groupe, en icônes seules (nom dans l'info-bulle) pour que la barre tienne en 1280 px. Coller reste visible mais grisé tant que le presse-papiers est vide.
- **Barre du haut** : Annuler, Rétablir (grisés si la pile est vide), Retour au Hub, Marqueur, puis les panneaux. Le Menu arrive en M10.
- **API debug** : `undo`, `redo`, `copy(x0, y0, x1, y1, cut?)`, `paste(x, y, rot?, mirror?, index?)` (coin haut gauche), `demolishArea`, `clearArea`, `setMarker`, `layout()` (texte canonique de la disposition, pour comparer). `place` et `beltPath` passent désormais par l'historique.

## M10

- **Format compressé** : préfixe `Z1:` puis `deflate-raw` en base64. Un texte qui commence par `{` est du JSON brut. Les deux sont acceptés au chargement et à l'import.
- **Sauvegarde à la fermeture** : `beforeunload` écrit en JSON brut, car la compression est asynchrone et la page pourrait se fermer avant la fin. Les autres sauvegardes (auto, onglet masqué, menu) sont compressées.
- **Champs non sauvegardés** : marques de tick des items, `vacatedTick` / `vacatedCarry` des tapis, flash des opérateurs, statistiques de livraison, historique d'annulation. Une partie rechargée peut donc différer d'au plus un item sur la suite (testé). La caméra, le presse-papiers, les marqueurs et les bulles déjà vues sont sauvegardés.
- **Validation** : validateur écrit à la main (`src/save/schema.ts`), plus une reconstruction de l'état pour détecter les chevauchements. Champs inconnus ignorés. Version plus récente que le jeu = refusée.
- **Sauvegarde illisible au démarrage** : elle est copiée sous `sumflow.save.v1.corrupt` (jamais écrasée), une nouvelle partie démarre et un toast le signale.
- **`?seed=N`** ne sert que quand il n'y a pas de sauvegarde. Sinon la sauvegarde est chargée (le menu Nouvelle partie permet de choisir une graine).
- **Nouvelle partie, import, changement de langue** : on écrit la nouvelle sauvegarde (ou les options) puis on **recharge la page**. Toute l'UI est reconstruite proprement, sans code de réinitialisation. Les sauvegardes sont suspendues juste avant pour ne pas écraser le résultat.
- **Options dans `sumflow.settings`**, à part de la partie. Valeurs invalides ignorées. « Réduire les animations » prend la préférence du système par défaut. « Achat automatique » reste une donnée de la partie (comme en M7) et apparaît aussi dans Options.
- **« Valeurs sur les items : toujours »** affiche le nombre sur chaque disque dès le zoom 0,3 (au lieu de 0,6). En dessous, les items sont des points, sans texte.
- **Échap** : ferme l'écran de fin, un panneau, puis quitte l'outil, puis ouvre le menu. Dans le menu, Échap revient à la vue principale, puis ferme. Les raccourcis sont ignorés tant qu'une fenêtre modale est ouverte.
- **Bulles d'aide** : `state.helpSeen` (sauvegardé). La première bulle encore non vue et déjà pertinente s'affiche sous le HUD. « Réafficher les bulles » vide la liste.
- **Commandes** : texte des touches traduit aussi (« flèches », « molette »…), dans un tableau en lecture seule.
- **Aucune chaîne en dur** : test par motifs sur `src/ui` (`textContent`, `title`, `aria-label`, `placeholder`, troisième argument de `el()`, `append('…')`, `innerHTML`). Les interpolations `${…}` et les symboles (icônes) sont permis.
- **À propos** : lien Steam vérifié (`store.steampowered.com/app/2674590/Beltmatic/`) et lien vers le dépôt, dans `src/config/links.ts`.

## M11

- **Scénario de référence** : 250 modules identiques (2 extracteurs → additionneur → stockage, 80 tapis et 4 bâtiments par module), pistes d'amélioration au niveau 4 (tapis à 4 tuiles/s), 40 s de chauffe. Les tapis d'entrée sont saturés (items en attente), ce qui est le cas le plus coûteux et le plus courant dans une vraie usine. Le même code sert au bench et à `__sumflow.loadReference()`.
- **Cache des cibles** : ce vers quoi mène chaque sortie (tapis, port, Hub, rien) est mémorisé dans le réseau pour les tapis, et par bâtiment et type de port (`world.outputGroups`). Tout est vidé à chaque changement de structure, comme l'ordre du réseau. Le comportement est inchangé : tous les tests de débit, de répartition et de sauvegarde passent sans modification.
- **Tableaux typés pour les items** (§10.4) : non retenus. Le budget est tenu avec une marge de 3,5 sans changer le modèle de données.
- **Recalcul du réseau** : toujours complet après une modification (environ 18 ms pour 20 000 tapis, soit une image perdue au pire). Un recalcul partiel n'est pas justifié à cette taille.
- **Rattrapage** : la durée d'absence est mesurée entre `visibilitychange → hidden` et le retour. Moins d'une seconde : ignoré. Rien n'est dû si le jeu est en pause. Pendant le rattrapage, une image s'arrête de simuler au bout de **24 ms** même si le lot de 600 ticks n'est pas fini : sans cela, une grosse usine figerait l'écran (600 ticks × 1 ms). Le plan demande une barre « non bloquante », d'où ce plafond. Pas de rattrapage après une fermeture de l'onglet.
- **Cache par régions** : une région couvre 1, 2, 4… chunks de côté pour que son image fasse entre 256 et 512 px. Elle est collée sans redimensionnement, alignée sur les pixels de l'écran. Les caches ne servent qu'une fois le zoom stable depuis 3 images (pendant un zoom continu, chaque image aurait une nouvelle échelle) et tant qu'un chunk fait au plus 1 024 px. Un tapis posé ou retiré n'invalide que sa région (événement `beltChanged`) ; les gisements se redessinent quand `maxExtraction` change.
- **Ce qui n'est pas en cache** : bâtiments (peu nombreux, ils clignotent et peuvent chevaucher deux régions), ponts, chevrons animés (zoom ≥ 0,6 : seule la base des tapis est en cache).
- **Chevrons** : extrémités arrondies seulement quand ils sont en cache ou au zoom ≥ 1. Entre 0,6 et 1, le trait fait moins de 2 px et l'arrondi coûtait cher pour rien.
- **Items avec valeur** : un sprite par valeur et par échelle, collé aligné sur les pixels pour garder des chiffres nets.
- **Overlay `F3`** : disponible sans `?debug=1` (lecture seule, utile pour signaler un problème de performance). Chiffres rafraîchis toutes les 500 ms. Placé au-dessus du panneau debug, en bas à droite.
- **API debug** : `loadReference()`, `perf()` (les chiffres de l'overlay) et `lookAt(x, y, zoom?)`.
- **Contraste** : vérifié par un test e2e qui calcule le rapport de chaque texte du DOM sur son fond réel (couches translucides composées sur le fond du canvas). Les boutons désactivés sont exclus, comme dans WCAG. Aucune couleur n'a dû être changée.
- **Clavier** : fermer un panneau ou une fenêtre retire le focus de ses éléments (sinon l'`Échap` suivant était avalé par l'élément masqué). Un clic à la souris sur un bouton rend le clavier au jeu ; une activation au clavier garde le focus sur le bouton.
- **Lighthouse** : pas ajouté aux dépendances (liste fermée du §1.6) ni à la CI. À lancer à la main avec `npx lighthouse`.

## Audit de `balance.ts` (après M11)

- **Constantes** : toutes conformes aux §4, §5, §6 et §7 (table des niveaux, vitesses, coûts `C(L)`, facteurs, suites `t_k`, génération de carte, tampons, stockage).
- **Règles dérivées**, vérifiées sur 2 000 graines : niveaux 1 à 5 fixes, cibles strictement croissantes, dernier niveau ≤ 2 000 000 000 (entre le niveau 618 et 669 selon la graine), suites `t_k` strictement croissantes, sans 10, valeurs de base < 30 conservées. L'écart des niveaux 6 à 30 peut atteindre 10,5 % (au lieu de 8 %) : c'est l'arrondi d'une petite cible (niveau 6, base 19 → 17 ou 21), conforme à la formule.
- **Plafonds doux jamais atteints** : comme pour le Tapis (M7), les suites `t_k` dépassent 2 000 000 000 avant les plafonds de vitesse. Fin de piste observée (graine 42) : Additionneur L = 68 (3,2 op/s, plafond 4), Multiplicateur L = 60 (≈ 2 op/s, plafond 3), Soustracteur/Diviseur L = 57, Exposant L = 51 (≈ 1,9 op/s). Les deux règles du plan restent appliquées ; seule la seconde joue en pratique.
- **Valeur interdite** : la suite des améliorations utilise désormais `MAPGEN.forbiddenValue` au lieu d'un `10` en dur. La limite de 32 copies par collage en rangée est passée dans `EDIT.maxPasteRow`.
