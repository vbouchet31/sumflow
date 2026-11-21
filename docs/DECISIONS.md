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
- **Bulles d'aide** : `state.helpSeen` (sauvegardé). La première bulle encore non vue et déjà pertinente s'affiche sous le HUD. « Réafficher les bulles » vide la liste. Remplacées depuis par les fiches tutoriel (voir plus bas).
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

## Tactile (PLAN-tactile.md)

- **Cible** : tablette et téléphone en paysage d'abord. Téléphone portrait utilisable, sans plus.
- **Par type de pointeur, pas par appareil** : `pointerType` décide (`mouse` d'un côté, `touch` et `pen` de l'autre). Une souris branchée sur une tablette marche comme sur un PC.
- **Modèle de gestes** : sans outil, un doigt déplace la carte ; avec un outil, il construit. Deux doigts déplacent et zooment toujours. Le choix est fait quand le doigt se pose (changer d'outil pendant un geste ne le change pas).
- **Seuil de 10 px** avant qu'un appui devienne un glisser. Un appui bref agit sur la tuile touchée en premier, même si le doigt a un peu glissé.
- **Rien n'est posé avant le relâchement**, donc un deuxième doigt annule sans trace dans l'historique. Après un pincement, le doigt restant ne fait que déplacer la carte : lever un doigt ne pose jamais rien.
- **Le fantôme apparaît dès que le doigt se pose** (avec un outil) et disparaît quand il se lève : il n'y a pas de tuile survolée sur un écran tactile.
- **Appui long** : 450 ms sans dépasser le seuil. Il abandonne l'appui en cours avant de se déclencher.
- **Pas de minuteur dans les gestes** : `Gestures.update(now)` est appelé à chaque image, avec l'horloge des événements. Tout est testable sans DOM.
- **Outils sans glisser (extracteur, pont, priorité, marqueur)** : un doigt qui glisse déplace le fantôme, l'objet est posé là où le doigt se lève. Cela permet d'ajuster la position avant de lâcher.
- **Barre d'actions pour tout le monde** : pas de détection d'appareil. Le texte de la barre ne cite plus de touches (elles sont dans les infobulles des boutons).
- **Appui long sans outil = sélection** (voir « Sélection et déplacement ») : la pipette au doigt ressemblait trop à « en poser un autre ». Avec un outil, l'appui long reste la pipette.
- **Appui long sur rien** : le geste continue comme si de rien n'était. Garder le doigt immobile pour viser, puis lâcher, pose bien l'objet. L'appui long ne prend la main que s'il y a un objet à prendre à la pipette.
- **Info-bulle épinglée** : seulement sans outil. Elle tombe dès qu'un outil est choisi ou qu'une souris bouge (le survol reprend la main).
- **Coude** : le bouton est un état qui reste jusqu'à ce qu'on le rebascule ; `Ctrl` l'inverse pendant qu'il est tenu.
- **Points de rupture en un seul endroit** : `src/ui/layout.ts` pose des classes sur `<html>`, la feuille de style s'écrit contre ces classes. Les requêtes média ne servent plus qu'au type de pointeur (`pointer: coarse`, `hover`).
- **Barre de construction en bas, même sur téléphone couché** : la largeur y est abondante (15 boutons visibles sur 16), une barre verticale n'en montrerait que 6.
- **Panneaux sur téléphone couché** : feuille pleine hauteur à droite plutôt qu'en bas, car c'est la hauteur qui manque.
- **Chips « Sauvegardé il y a… » et « Curseur : x, y » réservées au mode debug** (`?debug=1` ou dev) : elles encombraient l'interface. Les échecs de sauvegarde restent signalés par un toast.
- **Téléphone debout** : mêmes contrôles de mise en page que les autres gabarits (ils passent), mais pas de test de gestes dédié.
- **Icônes** : toujours des symboles Unicode. Le ciseau et le triangle de reprise portent le sélecteur U+FE0E pour ne pas devenir des emojis. À vérifier sur appareil : présence des glyphes `⧉`, `⎘`, `⌫`, `↻` dans les polices d'Android.
- **Collage au doigt** : pose en deux temps, seulement pour le collage (objet large, il remplace des tapis). Les autres outils posent au relâchement, Annuler rattrape une erreur. Pas de rangée de copies au doigt. Si rien ne peut être posé, l'aperçu reste pour être déplacé. Un geste annulé (pincement) remet l'aperçu où il était.
- **Vitesse d'inertie** : distance des 100 dernières millisecondes divisée par le temps écoulé jusqu'au lâcher, en partant de l'échantillon juste avant la fenêtre. Un doigt qui s'arrête plus de 100 ms avant de se lever ne lance pas la carte. Seuil de départ 150 px/s, arrêt à 20 px/s, constante de temps 325 ms.
- **Défilement au bord réservé au doigt** : à la souris, le clavier déplace déjà la caméra pendant un tracé.
- **Icônes d'installation en PNG** : écart assumé au « aucun fichier image » du PLAN §10.1. iOS n'accepte pas de SVG pour l'icône d'écran d'accueil. Les PNG sont produits par un script depuis le favicon, pas dessinés à la main.
- **Pas de service worker** : l'installation n'en a plus besoin sur Chrome, et le jeu hors ligne n'est pas demandé. Le jeu installé a donc besoin du réseau pour se charger.
- **`storage.persist()` au niveau 2** et non au chargement : Firefox pose la question au joueur, autant attendre qu'il ait quelque chose à perdre.
- **`display: fullscreen`** dans le manifeste, avec repli `standalone` (iOS). Orientation libre : la tablette debout est prise en charge.
- **Pas de réduction du ratio de pixels pendant le pincement** : la mesure disponible ne la justifie pas. À revoir après un essai sur un téléphone Android milieu de gamme.

## Sélection et déplacement

- **Sélection persistante** : sans outil, un clic ou un appui sélectionne l'objet. Elle remplace l'info-bulle épinglée au doigt, et vaut aussi pour la souris. Un bâtiment est retenu par son identifiant, pour suivre ses déplacements ; un tapis, un pont ou un gisement, par sa tuile.
- **Fin de la sélection** : clic dans le vide ou sur un autre objet, `Échap` (avant le menu), choix d'un outil, objet disparu. Déplacer la carte la garde.
- **Barre d'actions réutilisée** : la même barre qu'avec un outil, avec le nom de l'objet et ses actions. Pas de bouton flottant près de l'objet : il gênerait le glisser et sortirait de l'écran au bord de la carte.
- **Petit écran** : l'info-bulle monte au-dessus de la barre d'actions quand les deux sont visibles (elles se chevauchaient sur téléphone debout).
- **Saisir un bâtiment** : à la souris, glisser n'importe quel bâtiment le déplace (le clic gauche sans outil ne faisait rien). Au doigt, seul le bâtiment sélectionné se glisse, sinon le doigt ne pourrait plus déplacer la carte quand l'écran est rempli de bâtiments. L'appui long soulève directement.
- **Déplacement sur place** : `World.moveBuilding` garde l'objet (identifiant, tampons, stock). Annuler un déplacement le remet en place avec son contenu, au lieu de le reconstruire vide. La priorité de sortie suit le même port.
- **Non déplaçables** : le Hub, et l'extracteur, qui n'a de sens que sur son gisement.
- **Lignes suivies** : une ligne qui pointe dans un port d'entrée, ou une ligne que rien d'autre n'alimente devant un port de sortie. Une ligne qui longe le bâtiment ne suit pas : la tirer créerait des formes absurdes.
- **Élastique en L** : on remonte la ligne (24 tapis au plus, tant qu'elle est une simple file) et on choisit le point d'ancrage, la face d'arrivée (même rôle de port) et le coude qui écrivent et retirent le moins de tapis. Égalité : la même face qu'avant. Pas de recherche de chemin : le résultat doit rester prévisible et se calculer à chaque image (mis en cache par position).
- **Obstacles** : bâtiments, autres tapis (sauf pont, comme l'outil Tapis), cases devant une sortie (le tapis volerait les nombres, et faisait boucler un opérateur sur lui-même lors des essais). Deux lignes réacheminées peuvent se croiser par un pont.
- **Ordre des lignes** : elles sont tracées l'une après l'autre. Si l'une reste débranchée, on réessaie en mettant chaque ligne en premier, et on garde le résultat avec le moins de lignes débranchées.
- **Ligne bloquée** : elle reste telle quelle, débranchée, en rouge sur le fantôme (choix validé : autoriser plutôt que refuser, Annuler sert de filet). Au-delà de 160 cases de tracé, la ligne est aussi laissée en place.
- **Une teinte par ligne pendant le glisser** : avec plusieurs lignes et des ponts, on ne savait plus quel tapis allait où. Chaque ligne a sa teinte douce (pervenche, ambre, mauve, cyan, blanc craie), forte sur les tapis réacheminés, légère sur ceux qui restent. Pas de jaune (kaki sur l'ardoise, proche du vert « nouveau ») ni de corail (proche du rouge « bloqué »). Numérotées dans l'ordre des ports, elles ne changent pas pendant le glisser.

## Audit de `balance.ts` (après M11)

- **Constantes** : toutes conformes aux §4, §5, §6 et §7 (table des niveaux, vitesses, coûts `C(L)`, facteurs, suites `t_k`, génération de carte, tampons, stockage).
- **Règles dérivées**, vérifiées sur 2 000 graines : niveaux 1 à 5 fixes, cibles strictement croissantes, dernier niveau ≤ 2 000 000 000 (entre le niveau 618 et 669 selon la graine), suites `t_k` strictement croissantes, sans 10, valeurs de base < 30 conservées. L'écart des niveaux 6 à 30 peut atteindre 10,5 % (au lieu de 8 %) : c'est l'arrondi d'une petite cible (niveau 6, base 19 → 17 ou 21), conforme à la formule.
- **Plafonds doux jamais atteints** : comme pour le Tapis (M7), les suites `t_k` dépassent 2 000 000 000 avant les plafonds de vitesse. Fin de piste observée (graine 42) : Additionneur L = 68 (3,2 op/s, plafond 4), Multiplicateur L = 60 (≈ 2 op/s, plafond 3), Soustracteur/Diviseur L = 57, Exposant L = 51 (≈ 1,9 op/s). Les deux règles du plan restent appliquées ; seule la seconde joue en pratique.
- **Valeur interdite** : la suite des améliorations utilise désormais `MAPGEN.forbiddenValue` au lieu d'un `10` en dur. La limite de 32 copies par collage en rangée est passée dans `EDIT.maxPasteRow`.

## Fiches tutoriel (§7.5)

- **Une modale plutôt qu'une bulle** : les joueurs ne savaient pas par où commencer, la bulle passait inaperçue. La fiche s'ouvre seule (partie neuve, puis chaque déblocage) et bloque le jeu derrière elle le temps de la lire. La simulation continue.
- **La démo est le vrai jeu** : un petit `World` avec ses propres gisements, dessiné par le `Renderer` du jeu, et un pointeur virtuel qui passe par un vrai `ToolController`. Fantômes, placement, tapis en L et ponts sont donc exactement ceux du jeu, et restent justes si leurs règles changent. Pas d'image ni de GIF dans le bundle.
- **Script pur** (`src/tutorial/script.ts`, sans DOM) : un test unitaire joue chaque scène jusqu'au bout, à la souris et au doigt, et vérifie que le Hub reçoit le bon résultat. Une scène cassée par un changement de règle fait échouer les tests.
- **Usine de démo accélérée** : opérateurs au niveau d'amélioration 8, tapis au niveau 3, pour voir un résultat en quelques secondes sans que les items filent trop vite.
- **Doigt ou souris** : d'après le dernier `pointerType` reçu, sinon `(pointer: coarse)`. Au doigt, le fantôme n'apparaît que doigt posé, comme dans le jeu. À la souris, il apparaît une fois le pointeur arrivé (en chemin, il clignoterait en rouge sur chaque case traversée).
- **Tracés jusqu'à la case avant le bâtiment** : le dernier tapis pointe déjà dedans, et la démo ne montre jamais la case rouge d'un tracé posé sur le bâtiment.
- **Animations réduites** : image fixe de l'usine terminée, en marche depuis quelques secondes.
- **Série** : plusieurs déblocages d'un coup (ancienne sauvegarde, `unlockAll`) donnent une série « 1 / N » avec un bouton « Suivant ».
- **Fiches sans démo** : Améliorations et Priorités (pas de bâtiment à poser) montrent leur icône.
- **Nouvelle fiche Multiplicateur** : elle manquait à la liste. Une partie qui l'a déjà débloqué la verra une fois.
- **`?tutorial=0`** : les fiches ne s'ouvrent plus seules. Utilisé par les tests e2e qui ne portent pas sur elles.

## Direction artistique « Tableau noir » (§10.1)

- **Pourquoi** : le premier rendu ressemblait trop à Beltmatic (bleu nuit, tuiles arrondies pleines). Six pistes ont été maquettées (branches `claude/design-*`) ; « Tableau noir » a été retenue et poussée jusqu'au dessin à main levée.
- **Main levée contre règle** : ce que le joueur construit (bâtiments, tapis, nombres) est esquissé ; le Hub est net, comme un point de départ donné par le prof.
- **Aléatoire stable** : aucun `Math.random` au rendu. Chaque tremblement vient d'une graine tirée de la position (`tileSeed`, mélange MurmurHash3). Sinon les traits « bouilliraient » d'une image à l'autre, et deux régions de cache dessinées à part ne se raccorderaient pas.
- **Tapis en chaînes** (`src/render/beltChains.ts`, pur et testé) : un rail continu par chaîne au lieu d'un morceau par case, qui donnait un effet de pointillés. Une séparation continue tout droit, ses branches partent du rail ; une fusion s'arrête contre le rail ; le morceau de rail traversé est effacé. Les régions de cache sont dessinées avec 3 cases de marge pour que les chaînes se prolongent au-delà de leur bord.
- **Hachures en cache** : 3 motifs par couleur et taille, montrés sous 8 orientations (quarts de tour, miroir) ; tailles par quart d'octave et 512 px au plus, pour qu'un zoom réutilise les mêmes images ; budget de 32 Mo.
- **Flèches de tapis** : une seule ligne brisée par flèche, aléa tiré d'un seul hachage. Les versions courbes en deux morceaux coûtaient environ 10 images/s pendant un zoom sur l'usine de référence.
- **Pas de flèche jaune aux portes des bâtiments** : essayée, elle cassait l'ensemble. Le trait qui ferme les rails suffit.
- **Polices embarquées** plutôt que Google Fonts : pas de requête vers un tiers à chaque visite, et le jeu reste jouable sans réseau une fois chargé. Fredericka the Great pèse 203 Ko (sous-ensemble latin) ; un sous-ensemble plus petit ne gagne rien (le poids vient du dessin des lettres). Les caches qui contiennent du texte (gisements, items) sont redessinés quand la police manuscrite a fini de charger.
- **Icônes d'aide** : cercle à la craie au lieu de blanc sur bleu (4,34:1, sous le seuil de 4,5:1).
- **Coût mesuré** (build de production, Chromium sans GPU, usine de référence) : vues fixes à 60 images/s comme avant ; zoom continu à environ 53 images/s contre 57 sur l'ancien rendu.

## Couleur des extracteurs (§5, §10.1)

- **Une couleur par valeur** : l'extracteur est colorié avec la craie de sa valeur, la même que celle de ses items sur les tapis. On voit d'un coup d'œil d'où vient un nombre.
- **Palette « boîte de craies »** retenue parmi quatre maquettes (craies vives, boîte de craies, craies poudrées, Okabe-Ito). Choisie à la main pour aller avec les craies déjà présentes (rouge, vert, jaune et rose sont les mêmes). Elle remplace les teintes HSL saturées d'avant.
- **Valeur de l'extracteur en blanc** : plus lisible qu'en couleur sur les hachures de la même teinte (le 7 orange sur orange était le pire cas).
- **Couleur jamais seule** : le nombre est toujours écrit, la couleur n'est qu'une aide. Les valeurs au-delà de 9 ont une teinte dans le même ton craie, qui avance de l'angle d'or (137,5°) d'une valeur à la suivante.
- **Angle d'or plutôt que hachage** : avec une teinte tirée au hasard, des valeurs proches se ressemblaient (11, 12 et 13 étaient tous verts). Avec l'angle d'or, deux valeurs qui se suivent sont toujours loin sur le cercle. Des valeurs éloignées peuvent encore se ressembler (v et v + 13 diffèrent de 8°), et certaines retombent près d'une craie de 1 à 9 (12 est bleu comme 1).
- **OKLCH et deux luminosités** : environ 30 000 réglages (pas de 80° à 180°, départ de 0° à 360°) ont été mesurés en distance OKLab sur les valeurs 11 à 40. Changer l'angle seul gagne au mieux 30 %, et les angles « ronds » (135° = 3/8 de tour) font tourner un cycle de 8 couleurs. Garder l'angle d'or, passer en OKLCH et alterner deux luminosités triple l'écart entre voisins (0,033 → 0,095) et avec 1 à 9 (0,012 → 0,038), et double celui de la paire la plus proche (0,012 → 0,024). Contrepartie : certains pairs foncés tirent vers le brun ou le kaki. Les deux tons tiennent dans le sRGB pour toutes les teintes.

## Bulle d'actions sur un bâtiment sélectionné

- **Pourquoi** : pivoter ou supprimer le bâtiment sélectionné passait par la barre d'actions en bas de l'écran, loin de lui. Une bulle juste à côté du bâtiment met ces actions là où le regard est déjà. Maquette validée avant le code.
- **Trois boutons, avec libellés** : Pivoter, Copier, Supprimer. Les libellés sous les icônes restent : plus clair qu'une icône seule, surtout au doigt, pour une bulle d'environ 180 px. Pivoter n'apparaît pas pour ce qui ne pivote pas (extracteur, stockage). Le Hub n'a pas de bulle.
- **Copier = copier une zone qui ne contient que le bâtiment** : même presse-papiers que `Ctrl+C`, puis mode collage. Le bâtiment garde son orientation (et son miroir, sa priorité). Le nom « Copier » est donc exact. La pipette reste dans la barre du bas et sur `E`.
- **Supprimer** à part (séparateur, craie rouge), pour ne pas le toucher par accident. Pas de confirmation : l'annulation (`Ctrl+Z`, bouton du haut) suffit.
- **Placement** : au-dessus du bâtiment, flèche vers son centre ; en dessous quand la place manque en haut ; décalée pour rester dans l'écran et au-dessus des barres du bas. Taille fixe quel que soit le zoom. Elle suit la caméra à chaque image et se cache quand le bâtiment sort de l'écran ou pendant un déplacement.
- **Pas de bulle pour les tapis et les ponts** : leurs actions (pipette, supprimer) restent dans la barre du bas. Pour un bâtiment, cette barre ne garde que son nom, la pipette et Désélectionner.
