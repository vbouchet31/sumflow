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
- [x] Barre d'état : pause, « Sauvegardé il y a 12 s », coordonnées du curseur.
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
