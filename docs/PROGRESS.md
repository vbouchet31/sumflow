# Avancement

| Jalon                                            | État              | Notes                                       |
| ------------------------------------------------ | ----------------- | ------------------------------------------- |
| M0 Squelette et déploiement                      | ✅ terminé        |                                             |
| M1 Grille, caméra, Hub                           | ✅ terminé        |                                             |
| M2 Carte procédurale                             | ✅ terminé        |                                             |
| M3 Tapis, extracteur, livraison                  | ✅ terminé        |                                             |
| M4 Progression des niveaux                       | ✅ terminé        |                                             |
| M5 Opérateurs                                    | ✅ terminé        |                                             |
| M6 Jonctions, priorités, ponts                   | ✅ terminé        |                                             |
| M7 Améliorations et statistiques                 | ✅ terminé        |                                             |
| M8 Stockage                                      | ✅ terminé        |                                             |
| M9 Outils d'édition                              | ✅ terminé        |                                             |
| M10 Sauvegarde, options, i18n, menu, aide, audio | ✅ terminé        |                                             |
| M11 Performance et finition                      | ✅ terminé (code) | Score Lighthouse à relever (voir le détail) |

## Tactile (PLAN-tactile.md)

Cible : tablette et téléphone en paysage d'abord. Branche `dev-mobile`.

| Jalon                            | État       |
| -------------------------------- | ---------- |
| T0 Plomberie                     | ✅ terminé |
| T1 Gestes caméra et construction | ✅ terminé |
| T2 Remplacement du clavier       | ✅ terminé |
| T3 Mise en page                  | ✅ terminé |
| T4 Confort                       | ✅ terminé |
| T5 Installation                  | ✅ terminé |

## Choix de récompense au Hub (PLAN-recompenses.md)

Branche `claude/hub-objectives-reward-choices-kdavx9`. Plan validé, phase 1 en cours.

| Jalon                                         | État       |
| --------------------------------------------- | ---------- |
| R1 Catalogue et tirage                        | ✅ terminé |
| R2 Progression et sauvegarde                  | ✅ terminé |
| R3 Écran de choix                             | ✅ terminé |
| R4 Fiches après le choix                      | ✅ terminé |
| R5 Éditions et exemplaires                    | ✅ terminé |
| R6 Objets factices et finitions               | ⏳ à faire |
| Phase 2 Premiers objets, simulateur de tirage | ⏳ à faire |
| Phase 3 Simulateur de rythme, équilibrage     | ⏳ à faire |

## Direction artistique « Tableau noir »

- [x] Palette ardoise et craie (canvas et variables CSS), cadres en bois, polices manuscrites embarquées.
- [x] Bâtiments coloriés et esquissés, Hub tracé à la règle, nombres entourés à la main, stockage, fantômes, icônes.
- [x] Tapis en rails continus par chaîne : virages serrés, portes de bâtiments, bouts libres, jonctions en T et en +, ponts.
- [x] Tests : géométrie des chaînes et utilitaires craie (unitaires), couleurs et cache des tapis (e2e), contraste.
- [x] Effets craie : coup d'éponge à la démolition (objet, zone, couper, vider), poussière de craie à la pose (bâtiments, tapis discrets, collage, déplacement), aussi à l'annulation. Coupés par « Réduire les animations ». Tests unitaires (cycle de vie, plafonds, chargement) et e2e.
- [ ] À vérifier sur appareil : coût du rendu craie sur un téléphone milieu de gamme (zoom continu).

## Fiches tutoriel

- [x] Fiche modale animée à la première partie et à chaque déblocage (démo jouée par le vrai moteur).
- [x] Souris, doigt et clavier ; mise en page téléphone (paysage : démo à gauche, texte à droite).
- [x] Menu Aide : liste des fiches rencontrées, chacune rejouable.
- [x] Tests : chaque scène livre son résultat (unitaires), ouverture, série, sauvegarde, tactile et mise en page (e2e).

### T5 : détail

- [x] **Manifeste** (`public/manifest.webmanifest`) : plein écran, toute orientation, chemins relatifs (le jeu s'installe depuis `/sumflow/` sur GitHub Pages). Balises d'écran d'accueil pour iOS.
- [x] **Icônes** : PNG 192, 512, 512 « maskable » et 180 pour iOS, générés depuis le favicon par `scripts/make-icons.mjs`.
- [x] **Stockage persistant** : `navigator.storage.persist()` demandé une fois par session, à la première sauvegarde réussie à partir du niveau 2.
- [x] **Plein écran** : bouton dans Options, là où le navigateur le permet et hors installation.
- [x] Tests : `requestPersistence` (unitaire), `install.spec.ts` (manifeste, icônes présentes et de la bonne taille).
- [x] **Mesure de performance** (indicative) : scénario de référence, émulation Chromium **sans GPU**, pincement continu. Processeur normal : 60 images/s, rendu 2 à 2,5 ms pendant le pincement. Processeur ralenti 4 fois : rendu 9 à 14 ms pendant le pincement sur téléphone, 10 à 12 ms sur tablette. Le pincement (caches coupés) n'est pas plus lent que l'affichage immobile dans cet environnement, donc pas de réduction du ratio de pixels pendant le geste.

### Reste à vérifier sur de vrais appareils

L'émulation Chromium ne reproduit ni Safari ni un vrai écran. Liste du `PLAN-tactile.md` §7.3 :

- [ ] Pincement et glisser sans zoom ni défilement de page sur iPhone, iPad et Android, y compris en partant d'un bouton.
- [ ] Pas de menu ni de sélection sur appui long.
- [ ] Pas de zoom à la saisie d'un marqueur ; l'éditeur reste visible au-dessus du clavier.
- [ ] Son audible après le premier appui, et après un retour d'arrière-plan.
- [ ] Rotation de l'écran, encoche, barre d'accueil.
- [ ] Export et import d'une sauvegarde depuis Safari iOS.
- [ ] Partie retrouvée après fermeture brutale de l'onglet.
- [ ] Icônes de la barre (symboles Unicode) toutes présentes sur Android.
- [ ] Fluidité du pincement sur une grosse usine, avec un vrai GPU.
- [ ] Installation sur l'écran d'accueil, ouverture en plein écran.

### T4 : détail

- [x] **Collage au doigt en deux temps** : l'aperçu se pose au milieu de l'écran à l'entrée en mode Coller, un appui ou un glisser le déplace, le bouton « Poser » construit (`ToolController.confirmPaste`). À la souris, rien ne change (clic = poser, glisser = rangée).
- [x] **Défilement au bord** : pendant un tracé, un doigt à moins de 56 px d'un bord fait défiler la carte, de plus en plus vite (`edgeScroll`).
- [x] **Inertie** : la carte continue sur sa lancée après un déplacement lâché en mouvement (`PanInertia`). Coupée par « Réduire les animations ».
- [x] **Textes** : consignes d'outils sans « clic », liste « Écran tactile » dans Options > Commandes (en premier quand le pointeur principal est un doigt).
- [x] Tests : unitaires (collage en deux temps, défilement au bord, inertie), e2e tactiles (collage, tracé au-delà de l'écran, inertie avec et sans animations, **niveau 1 terminé au doigt seul**).

### T3 : détail

- [x] **Gabarits** (`src/ui/layout.ts`) : trois classes sur `<html>`, tenues à jour par `matchMedia`. `ui-icons` (≤ 1200 px de large : barre sans libellés), `ui-compact` (≤ 500 px de haut ou ≤ 600 px de large : téléphone), `ui-narrow` (≤ 600 px de large : téléphone debout).
- [x] **Barre de construction** : jamais plus large que l'écran, défilement horizontal, fondu du côté où il reste des boutons, l'outil actif est ramené dans la vue.
- [x] **HUD compact** sur téléphone : une ligne (niveau, cible, compte), un appui le déplie. HUD et bulle d'aide empilés dans une même colonne.
- [x] **Barre du haut** : sur téléphone debout, Marqueur, Nombres livrés et Niveaux se replient derrière un bouton « Plus ».
- [x] **Panneaux** : feuille sur toute la hauteur à droite (téléphone couché), feuille en bas (téléphone debout). Au-dessus des barres, sous les fenêtres modales.
- [x] **Cibles de 44 px** quand le pointeur principal est un doigt (`pointer: coarse`) ; champs à 16 px (pas de zoom à la saisie sur Safari).
- [x] **Zones sûres** (`env(safe-area-inset-*)`), `100dvh`, styles de survol réservés aux pointeurs qui survolent.
- [x] **Clavier virtuel** : l'éditeur de marqueur se place en haut de l'écran, sur une ligne quand la hauteur manque.
- [x] **Événements souris de compatibilité** coupés après un contact tactile : leur `mousedown` retirait le focus du champ de l'éditeur de marqueur que l'appui venait d'ouvrir.
- [x] Chips d'état sous la barre du haut sur tablette et téléphone ; la chip de sauvegarde disparaît sur téléphone.
- [x] `layout.spec.ts` sur quatre gabarits (tablette couchée et debout, téléphone couché et debout) : aucun contrôle hors écran, trop petit ou recouvert, aucun bloc qui en chevauche un autre, panneaux, menu et éditeur dans l'écran.

### T2 : détail

- [x] **Barre d'actions** (`src/ui/toolActions.ts`, remplace `toolHint.ts`) au-dessus de la barre de construction : nom ou consigne de l'outil, puis Pivoter, Miroir, Inverser le coude, entrée précédente / suivante, Retirer, Quitter, selon l'outil. Visible aussi à la souris.
- [x] **Pause** : bouton en haut à droite (il montre ce que fera l'appui : pause ou reprise).
- [x] **Pipette** : appui long sur un objet (`ToolController.pick(tuile)`).
- [x] **Info-bulle** : un appui sans outil l'épingle sur l'objet, encadré sur la carte.
- [x] **Coude du tapis** : `ToolController.toggleElbow()`, `Ctrl` l'inverse le temps d'un tracé.
- [x] Étiquettes de touches masquées sans survol (`@media (hover: none)`).
- [x] Tests : unitaires (coude, pipette, rotation), e2e tactiles (barre d'actions, appui long, info-bulle, pause).

### T1 : détail

- [x] `src/input/gestures.ts` : machine à états sans DOM ni minuteur (`pending`, `build`, `pan`, `pinch`, `spent`), testée sous Node.
- [x] `src/input/pointer.ts` remplace `mouse.ts` : la souris garde son chemin (boutons, molette), le doigt et le stylet au contact passent par les gestes. Un stylet en survol déplace le fantôme comme une souris.
- [x] Sans outil : un doigt déplace la carte. Avec un outil : un doigt construit. Deux doigts déplacent et zooment (`Camera.pinch`), et abandonnent le tracé en cours.
- [x] Le fantôme disparaît quand le doigt se lève (`ToolController.clearHover`).
- [x] Les blocs en lecture seule (HUD, info-bulle, état, toasts) laissent passer clics et touches vers la carte : la règle `#ui-root > *` écrasait leur `pointer-events: none`.
- [x] Tests : `gestures.test.ts`, pincement dans `camera.test.ts`, `touch.spec.ts` sur les trois gabarits (déplacement, pincement, tracé, deuxième doigt, souris sur appareil tactile).

### T0 : détail

- [x] `touch-action: none` sur le canvas : les gestes arrivent au jeu au lieu de faire défiler ou zoomer la page. `touch-action: pan-x pan-y` sur `html, body` : pas de zoom de page en pinçant l'interface, les panneaux défilent toujours.
- [x] Pas de sélection de texte ni de menu sur appui long, pas de rebond ni de tirer-pour-rafraîchir, `viewport-fit=cover`.
- [x] Un geste interrompu (`pointercancel`) ne laisse plus de tracé armé dans les outils (`ToolController.pointerCancel`).
- [x] Audio : le contexte est repris à chaque geste (un `pointerdown` tactile n'est pas une activation, et le mobile le suspend en arrière-plan).
- [x] Sauvegarde synchrone à `pagehide` en plus de `beforeunload`.
- [x] e2e : trois projets tactiles (tablette paysage, tablette portrait, téléphone paysage), gestes multi-doigts envoyés par CDP (`touchDriver` dans `tests/e2e/helpers.ts`).

## M11 : détail

- [x] **Bench** : scénario de référence (`src/debug/reference.ts`, 20 000 tapis, 1 000 bâtiments, 14 750 items). `npm run bench` échoue au-delà de 4 ms/tick ; il tourne aussi en CI.
- [x] **Simulation** : 7,1 ms/tick avant, **1,1 ms/tick** après (cibles des sorties mises en cache par tapis et par bâtiment). Premier tick après une modification : environ 50 ms avant, 25 ms après (réseau recalculé sur tableaux typés).
- [x] **Caches de rendu** (`src/render/cache.ts`) : gisements et tapis dessinés une fois par région de chunks dans des canvas hors écran, items avec valeur dessinés depuis des sprites, disques et points regroupés par couleur.
- [x] **LOD** (§10.3) et **culling** par chunks visibles + 1 de marge ; les losanges de priorité ne parcourent plus que les objets visibles.
- [x] **60 fps** sur le scénario de référence à tous les zooms testés (0,05 à 2), mesuré en 1920×1080 dans Chromium sans GPU : rendu 1 à 6 ms par image.
- [x] **Rattrapage hors onglet** (§11.1) : jusqu'à 10 minutes, par lots de 600 ticks par image, barre « Rattrapage… » non bloquante.
- [x] **Overlay `F3`** : FPS, temps de simulation par tick, temps de rendu, ticks, items, tapis, bâtiments.
- [x] **Accessibilité** (§9.5) : contraste ≥ 4,5:1 vérifié par un test sur tous les écrans ; navigation clavier (focus piégé dans le menu, `Espace` active le bouton qui a le focus) ; l'option « Réduire les animations » coupe aussi les transitions de l'interface.
- [x] **README** : présentation, commandes, performances, crédits, licence.
- [x] Tests : boucle et rattrapage, scénario de référence déterministe, invalidation des caches ; e2e : chaîne 1 + 1 → Hub, sauvegarde, rechargement, état conservé ; `F3` ; rattrapage ; clavier ; contraste ; cache des tapis après une modification.
- [ ] **Lighthouse performance ≥ 90** : pas relevé (Lighthouse n'a pas pu être lancé dans l'environnement de dev). Mesures équivalentes avec le profil mobile de Lighthouse (4G lente, processeur ÷4) : premier affichage et plus grand élément à 0,8 s, décalage de mise en page 0,014, aucun blocage après l'affichage. Commande à lancer : voir le README.

## M10 : détail

- [x] Sauvegarde `localStorage` (`sumflow.save.v1`) compressée (`deflate-raw` + base64, repli JSON), auto selon l'option (60 s par défaut), à `visibilitychange → hidden` et à `beforeunload`.
- [x] Export `sumflow-AAAAMMJJ-HHMM.json` lisible ; import des deux formats avec validation de schéma, rien n'est écrasé en cas d'erreur ; toast si le stockage est plein.
- [x] Migrations (`src/save/migrations.ts`) : moteur ordonné `vN → vN+1`, version 1 actuelle.
- [x] Menu (`Échap` ou bouton) : Reprendre, Nouvelle partie (graine aléatoire ou saisie), Sauvegarder, Exporter, Importer, Options, Aide, À propos.
- [x] Options (`sumflow.settings`) : langue, volume, grille, valeurs sur les items, intervalle de sauvegarde, achat auto, réduire les animations, liste des commandes.
- [x] Bulles d'aide (§7.5), une à la fois, masquables, réaffichables depuis l'Aide.
- [x] Sons WebAudio : pose, démolition, clic UI, amélioration prête, niveau terminé, erreur ; volume réglable.
- [x] Barre d'état : pause ; « Sauvegardé il y a 12 s » et coordonnées du curseur en mode debug uniquement.
- [x] Tests : aller-retour sauvegarde → chargement au même hash d'état (compressé ou non) ; partie rechargée qui continue comme l'originale ; imports invalides sans effet ; migrations ; clés i18n identiques FR/EN ; aucune chaîne en dur dans `src/ui` (test par motifs) ; e2e sauvegarde + rechargement, import invalide, changement de langue, nouvelle partie, bulle d'aide.

## M9 : détail

- [x] Démolir une zone (`X` + glisser ; clic = un objet), Hub ignoré.
- [x] Vider une zone (`C` + glisser) : items des tapis et ponts, tampons et cycles des opérateurs, stock des stockages ; bâtiments gardés.
- [x] Copier / couper (`Ctrl+C` / `Ctrl+X` + glisser), coller (`Ctrl+V`) : clic = poser, glisser = rangée de copies, `R` pivote, `F` miroir horizontal.
- [x] Historique du presse-papiers (20 entrées), `Maj+molette` pour naviguer, `Suppr` pour retirer l'entrée affichée.
- [x] Marqueurs (`B` + clic, saisie, clic sur un marqueur = éditer / supprimer), texte à taille écran constante.
- [x] Pipette (`E`), annuler / rétablir (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+Maj+Z`, boutons en haut à droite), pile de 100.
- [x] Bandeau d'aide au-dessus de la barre (outil en cours, taille de la zone), outils d'édition dans la barre de construction.
- [x] Tests : copier-coller-annuler restaure exactement l'état des bâtiments (et rétablir le rejoue) ; miroir : un soustracteur reste A − B, seules les positions changent ; cohérence empreintes et ports pour tous les bâtiments × 8 orientations × 8 transformations ; zone max 128×128 ; e2e souris + clavier (copier, miroir, coller, annuler) et marqueurs.

## M4 : détail

- [x] Table 7.2, randomisation seedée (niveaux 6 à 30 ±8 %, puis +1 à 3 % par niveau), quantités infinies, dernier niveau à 2 000 000 000.
- [x] Récompenses appliquées (`maxExtraction`, bâtiments, fonctions), onde depuis le Hub, son, toast.
- [x] HUD haut gauche (niveau, cible, barre, débit /s, prochaine récompense), boutons haut droite (Hub, Niveaux).
- [x] Panneau Niveaux (12 niveaux), écran « Partie terminée » puis jeu libre.
- [x] Tests : cibles 1 à 5 fixes, suite strictement croissante, déterminisme par seed (même en génération par morceaux), récompenses appliquées, fin de partie ; e2e HUD + panneau + toast.

## M3 : détail

- [x] Tracé en L (Ctrl inverse le coude), départ sur un tapis existant = division, remplacement, tuiles de bâtiments sautées, pose d'un clic orientée par `R`.
- [x] Simulation des tapis (§6.4) : ordre aval → amont, report de l'avance, tourniquet des sorties, fusion équitable, blocage face sans entrée, face-à-face.
- [x] Extracteur : pose aimantée sur un gisement extractible, débit `capacité × vitesse`, tourniquet entre sorties.
- [x] Hub : consomme tout, fait progresser le niveau ; niveau 1 complétable.
- [x] Info-bulle de survol (Hub, extracteur, tapis avec « Bloqué : pas d'entrée ici », gisement), démolition (`Suppr`, outil `X` en clic), barre de construction, pause (`Espace`).
- [x] Tests : tapis plein à vitesse 1 = 60 ± 1 items/min (et à 2, 5, 8) ; extracteur niveau 1 avec 3 sorties = 1 item/s ; e2e : extracteur + tapis via l'API debug → niveau 2 ; e2e : tracé d'un tapis à la souris.

## M2 : détail

- [x] RNG seedé (`mulberry32`, `hash2`), gisements garantis (étape A) et aléatoires par chunk (étape B).
- [x] Rendu des gisements avec LOD, valeurs grisées et cadenas si non extractibles.
- [x] Graine affichée dans le panneau debug (`?debug=1`), graine fixable via `?seed=`.
- [x] Tests : déterminisme, indépendance à l'ordre des chunks, pas de 10, pas de chevauchement (écart d'une tuile), zone dégagée, au moins quatre 1 à moins de 16 tuiles, poids `v^-1,15`, `vmax(d)`.

## M1 : détail

- [x] Caméra : déplacement WASD/ZQSD physique + flèches (Shift ×3, ignoré avec Ctrl/Alt), glisser clic droit/milieu, zoom molette centré sur le curseur (0,05 à 4), `H` = retour au Hub.
- [x] Grille visible à zoom ≥ 0,5, canvas HiDPI (DPR plafonné à 2).
- [x] Hub 6×6 dessiné : niveau 1, cible 1, `0 / 10`, barre, icône de récompense (+).
- [x] Tests unitaires `grid.ts` (clés, rotations, faces, chunks), caméra, format.
- [x] Tests e2e : rendu du Hub, zoom, glisser, touche D, touche H.

## M0 : détail

- [x] Vite + TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- [x] ESLint, Prettier, Vitest, Playwright installés.
- [x] Scripts `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck`, `bench`.
- [x] `vite.config.ts` avec `base: './'`.
- [x] Workflow `.github/workflows/deploy.yml` (§15).
- [x] Page : canvas plein écran bleu nuit `#0f1422` + titre « Sumflow » (via i18n).
- [x] `npm run build` sans avertissement.
- [x] L'URL Pages affiche la page (CI et déploiement verts après le merge de la PR 1).

### Écarts connus

- `npm audit` signale des vulnérabilités modérées dans des dépendances **dev** de `typescript-eslint` ; aucun impact sur le bundle livré (zéro dépendance runtime).
