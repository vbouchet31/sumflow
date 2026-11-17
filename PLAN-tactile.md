# PLAN-tactile.md : rendre Sumflow jouable sur écran tactile

> **État : réalisé** (jalons T0 à T5, branche `dev-mobile`). Détail dans [`docs/PROGRESS.md`](docs/PROGRESS.md), choix et écarts dans [`docs/DECISIONS.md`](docs/DECISIONS.md), section « Tactile ». Ce document reste l'étude de départ : le constat du §1 décrit le jeu **avant** ces changements.

Étude des changements nécessaires. Aucun code n'est modifié par ce document.
Le tactile était hors périmètre au moment de l'étude (PLAN.md §0 « Cible : desktop » et §3.3).

---

## 0. Résumé

- **Le jeu est injouable au doigt aujourd'hui**, pour trois raisons mesurées : le navigateur capte les gestes (le pincement zoome la page, le glisser est annulé), aucune action ne remplace le survol et les touches, et l'interface déborde de l'écran.
- **Le cœur du jeu n'a pas à changer.** `ToolController` travaille déjà en coordonnées de tuile et ne valide une action qu'au relâchement. La simulation, le rendu et la sauvegarde ne sont pas touchés.
- **Le travail se concentre sur trois zones** : `src/input/` (reconnaissance de gestes), `src/ui/` + `styles.css` (mise en page et boutons de remplacement), `src/main.ts` (câblage).
- **Modèle de gestes recommandé** : sans outil, un doigt déplace la carte. Avec un outil, un doigt construit. Deux doigts déplacent et zooment toujours.
- **Découpage en 6 jalons** (T0 à T5). T0 + T1 + T2 suffisent pour une première version jouable sur tablette.
- **Une décision à prendre avant de commencer** : la cible (tablette seule, ou téléphone aussi). Voir §9.

---

## 1. Constat mesuré

**Méthode** : build de production, Chromium en émulation tactile, vrais événements tactiles envoyés par CDP (`Input.dispatchTouchEvent`). Trois profils : iPhone 13 portrait (390 × 664), iPhone 13 paysage (750 × 342), iPad 7 portrait (810 × 1080).

**Limite** : c'est une émulation Chromium. Les points propres à Safari iOS sont marqués « à vérifier sur appareil ».

### 1.1 Gestes

| Geste testé                    | Résultat actuel                                                               | Cause                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Glisser à un doigt, sans outil | Caméra immobile. `pointercancel` après 2 `pointermove`                        | Pas de `touch-action` sur le canvas (valeur calculée : `auto`), le navigateur prend le geste pour un défilement |
| Pincement à deux doigts        | Caméra immobile, **la page entière zoome** (`visualViewport.scale` passe à 5) | Idem. Ensuite l'interface est décalée et les boutons ne répondent plus                                          |
| Outil Tapis, glisser           | 0 tapis posé, geste annulé                                                    | Idem                                                                                                            |
| Outil Tapis, appui simple      | 1 tapis posé                                                                  | Fonctionne déjà (`pointerdown` + `pointerup`)                                                                   |
| Appui long                     | `pointerdown` puis `pointerup`, rien d'autre                                  | Aucun comportement défini                                                                                       |

Le déplacement de caméra à la souris passe par le clic droit ou la molette (`Mouse.onDown`, boutons 1 et 2). Un doigt envoie toujours le bouton 0. **Il n'existe donc aucun moyen de déplacer la caméra au doigt**, même une fois `touch-action` corrigé.

### 1.2 Mise en page

| Élément                              | Mesure                       | Problème                                                                                                                               |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Barre de construction, tout débloqué | 1159 px de large, 16 boutons | 12 boutons hors écran sur téléphone portrait, 7 sur téléphone paysage, 7 sur iPad portrait. Pas de défilement, ils sont inatteignables |
| Barre du haut                        | 302 px, à droite             | Recouvre le HUD (200 px) sur un écran de 390 px                                                                                        |
| Bulle d'aide                         | 300 px, `top: 190px`         | Recouvre le Hub sur téléphone                                                                                                          |
| Barre d'état                         | bas droite                   | Recouvre la barre de construction                                                                                                      |
| HUD                                  | 156 px de haut               | Prend près de la moitié des 342 px de hauteur en paysage téléphone                                                                     |
| Boutons du haut                      | 38 × 38 px                   | Sous la cible tactile recommandée (44 px Apple, 48 px Material)                                                                        |
| Boutons d'édition                    | 46 × 50 px                   | Limite                                                                                                                                 |
| Fermeture de panneau                 | 30 × 30 px                   | Trop petit                                                                                                                             |
| Cases à cocher des options           | 18 × 18 px                   | Trop petit                                                                                                                             |

`styles.css` ne contient aucune requête média de taille. Il utilise `100vh` (faux sur mobile quand la barre d'adresse est visible) et ne tient pas compte des zones sûres (encoche, barre d'accueil iOS).

### 1.3 Fonctions sans équivalent tactile

| Fonction                                         | Entrée actuelle                     | Disponible au doigt ?                                                      |
| ------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------- |
| Déplacer la caméra                               | WASD, clic droit, molette maintenue | Non                                                                        |
| Zoomer                                           | Molette                             | Non                                                                        |
| Pivoter                                          | `R` / `Maj+R`                       | Non                                                                        |
| Miroir (collage)                                 | `F`                                 | Non                                                                        |
| Inverser le coude du tapis                       | `Ctrl` pendant le glisser           | Non                                                                        |
| Historique du presse-papiers                     | `Maj+molette`                       | Non                                                                        |
| Retirer une entrée du presse-papiers             | `Suppr`                             | Non                                                                        |
| Démolir l'objet survolé                          | `Suppr`                             | Non (l'outil Démolir le remplace)                                          |
| Pipette                                          | `E` sur l'objet survolé             | Non                                                                        |
| Quitter l'outil                                  | `Échap`                             | Partiel (retoucher le bouton de l'outil actif)                             |
| Pause                                            | `Espace`                            | Non                                                                        |
| Priorité                                         | `P` ou `Alt+clic`                   | Oui (bouton de la barre)                                                   |
| Copier, couper, coller, marqueur, démolir, vider | Raccourcis                          | Oui (boutons de la barre)                                                  |
| Annuler, rétablir, Hub, panneaux, menu           | Raccourcis                          | Oui (barre du haut)                                                        |
| Info-bulle de l'objet                            | Survol                              | Non (visible seulement pendant l'appui)                                    |
| Fantôme de construction avant de poser           | Survol                              | Non (le doigt cache la tuile, et le fantôme reste figé au dernier contact) |
| Coordonnées du curseur                           | Survol                              | Sans objet                                                                 |
| Overlay de performance                           | `F3`                                | Non (outil de développement, peut rester clavier)                          |

---

## 2. Principes de conception

1. **Réagir au type de pointeur, pas à l'appareil.** Chaque événement porte `pointerType` (`mouse`, `touch`, `pen`). On ne détecte pas « mobile ». Un iPad avec souris, un PC à écran tactile et un stylet doivent tous marcher.
2. **Le chemin souris ne change pas.** Mêmes boutons, même molette, mêmes tests e2e verts.
3. **Aucune fonction ne dépend d'une touche ou du survol.** Chaque raccourci a un bouton visible. Ces boutons servent aussi à la souris.
4. **Rien n'est validé avant le relâchement.** C'est déjà le cas dans `ToolController.pointerUp`. On en profite : un deuxième doigt annule le geste en cours sans rien poser.
5. **`Annuler` toujours à portée.** Au doigt, les erreurs de pose sont plus fréquentes.
6. **Logique de gestes sans DOM**, testable sous Node, comme `Camera`.

---

## 3. Modèle de gestes

### 3.1 Tableau des gestes (recommandé)

| Geste                                  | Sans outil                                                  | Avec outil                                      |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Appui bref                             | Inspecter l'objet (info-bulle épinglée), ouvrir un marqueur | Action de l'outil sur la tuile (comme un clic)  |
| Glisser à un doigt                     | **Déplacer la caméra**                                      | **Construire** (tracé de tapis, rangée, zone)   |
| Deux doigts                            | Déplacer + zoomer                                           | Déplacer + zoomer, **annule le tracé en cours** |
| Appui long (≈ 450 ms, sans bouger)     | Pipette sur l'objet                                         | Pipette sur l'objet                             |
| Glisser près du bord (en construisant) | Sans objet                                                  | Défilement automatique de la caméra             |

**Pourquoi ce modèle** : c'est celui des jeux d'usine sur mobile. Il garde le tracé de tapis à un doigt (l'action la plus fréquente) et ne demande aucun mode caché.

**Alternative écartée** : un doigt déplace toujours, construire demande un appui long puis glisser. Plus sûr contre les poses accidentelles, mais chaque tapis coûte 450 ms d'attente. Trop lent pour un jeu où l'on trace sans arrêt.

**Conséquence à accepter** : avec un outil actif, il faut deux doigts pour déplacer la carte. Le bouton « Quitter l'outil » (§4.1) et le défilement au bord compensent.

### 3.2 Machine à états

Nouveau module `src/input/gestures.ts`, sans DOM. Il reçoit des événements abstraits `{ id, type, x, y, t }` et un indicateur « un outil est actif », et émet des actions.

```
            1er doigt posé
  repos ─────────────────────▶ attente
                                 │  bouge > 10 px, outil actif   ─▶ construction
                                 │  bouge > 10 px, sans outil    ─▶ déplacement
                                 │  relâché avant                ─▶ appui bref  ─▶ repos
                                 │  450 ms sans bouger           ─▶ appui long  ─▶ repos
                                 │  2e doigt posé                ─▶ pincement
  construction ── 2e doigt ──▶ pincement (annule le tracé)
  déplacement  ── 2e doigt ──▶ pincement
  pincement ── un doigt levé ─▶ déplacement (avec le doigt restant)
  tout état ── tous levés ───▶ repos
```

Règles importantes :

- **Seuil de mouvement** : 10 px CSS pour le doigt, 0 pour la souris.
- **Après un pincement, on ne revient jamais en construction** avant que tous les doigts soient levés. Sinon lever un doigt poserait un bâtiment.
- **`pointercancel`** annule tout sans rien poser.
- **Appui long** : annulé dès que le doigt bouge au-delà du seuil. Retour haptique léger si disponible (`navigator.vibrate`, absent sur iOS, donc optionnel).
- **Stylet** (`pen`) : traité comme un doigt unique. Son survol, quand il existe, alimente le fantôme comme la souris.

### 3.3 Mathématique du pincement

À chaque `pointermove`, avec le milieu `m` et l'écart `d` des deux doigts :

1. `camera.zoomAt(m.x, m.y, d / dPrécédent)`
2. `camera.panScreen(m.x - mPrécédent.x, m.y - mPrécédent.y)`

`zoomAt` garde déjà fixe le point du monde sous `(sx, sy)` et borne le zoom (0,05 à 4). Rien à changer dans `Camera`, à part éventuellement une méthode `pinch(prevA, prevB, a, b)` pour regrouper les deux appels et la tester.

### 3.4 Le problème du doigt qui cache la tuile

À la souris, le fantôme se voit avant de cliquer. Au doigt, il est sous le doigt, puis posé au relâchement.

| Option                     | Principe                                                                      | Pour                                                             | Contre                                                        |
| -------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| **A. Pose directe**        | Poser au relâchement, corriger avec Annuler                                   | Rapide, rien à apprendre, aucun changement dans `ToolController` | Imprécis pour les gros objets                                 |
| **B. Placer puis valider** | L'appui place le fantôme, on l'ajuste en glissant, un bouton « Poser » valide | Précis, visible                                                  | Un appui de plus par pose, état nouveau dans `ToolController` |
| **C. Décalage du fantôme** | Fantôme dessiné au-dessus du doigt                                            | Visible sans étape en plus                                       | Déroutant, impossible près du bord haut                       |

**Recommandation** : A pour les tapis, l'extracteur, les opérateurs et les zones. B pour le **collage** uniquement (objet large, remplace des tapis existants, donc erreur coûteuse). C est écartée.

À ajouter dans tous les cas : pendant qu'un doigt construit, afficher l'info utile **hors du doigt** (la `tool-hint` montre déjà la taille de zone, on y ajoute la longueur du tracé).

---

## 4. Remplacer le clavier et le survol

### 4.1 Barre d'actions contextuelle

Aujourd'hui `ToolHint` affiche une ligne de texte qui cite des touches (« R : pivoter · F : miroir · Maj+molette… »). Elle devient une rangée de **boutons**, au même endroit (au-dessus de la barre de construction), visible dès qu'un outil est actif.

| Outil actif                              | Boutons                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Tapis                                    | Inverser le coude, Quitter                                                  |
| Opérateurs, pont                         | Pivoter, Quitter                                                            |
| Extracteur, stockage, priorité, marqueur | Quitter                                                                     |
| Démolir, vider, copier, couper           | Quitter (+ taille de la zone en texte)                                      |
| Coller                                   | Pivoter, Miroir, Précédent, « 2 / 5 », Suivant, Retirer, **Poser**, Quitter |

Les méthodes existent déjà dans `ToolController` : `rotate`, `mirror`, `cycleClip`, `removeClip`, `cancel`. Seule l'inversion du coude manque (voir §5.2).

**Affichage** : pour tout le monde, souris comprise. Pas de détection d'appareil, et les joueurs souris y gagnent des boutons découvrables. Les étiquettes de touches (`<kbd>`) sont masquées avec `@media (hover: none)`.

### 4.2 Autres remplacements

| Fonction                          | Remplacement                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Pause                             | Bouton dans la barre du haut (l'indicateur « En pause » existe déjà dans `StatusBar`)          |
| Pipette                           | Appui long sur un objet                                                                        |
| Démolir l'objet survolé (`Suppr`) | Outil Démolir + appui. Pas de nouvel élément                                                   |
| Info-bulle                        | Appui bref sans outil : l'info-bulle s'épingle sur la tuile touchée, jusqu'à un appui ailleurs |
| Fantôme                           | Affiché seulement pendant qu'un doigt est posé. Effacé au relâchement                          |
| Coordonnées du curseur            | Masquées quand il n'y a pas de survol                                                          |
| Overlay de performance            | Reste sur `F3`, plus une entrée dans Options si besoin                                         |

---

## 5. Changements par fichier

### 5.1 `src/input/`

| Fichier                   | Changement                                                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gestures.ts` (nouveau)   | Machine à états du §3.2. Sans DOM                                                                                                                                                                                                                                                                        |
| `mouse.ts` → `pointer.ts` | Branche les événements DOM sur `gestures.ts`. Suit **plusieurs** pointeurs (une `Map` par `pointerId`) au lieu d'un `panPointer` et d'un `buildPointer`. Garde le chemin souris tel quel. Expose `hasHover` (vrai pour souris et stylet en survol, faux après un contact tactile) à la place de `inside` |
| `keyboard.ts`             | Aucun changement                                                                                                                                                                                                                                                                                         |

Défauts existants à corriger au passage dans `mouse.ts` :

- **`onCancel` ne prévient pas les outils.** Il remet `buildPointer` à `null`, mais `ToolController.drag` reste armé. Il faut un `handlers.onCancel`.
- **`onUp` exige `e.button === 0`**, correct pour la souris et le doigt, à revérifier pour le stylet (bouton de gomme = 5).

### 5.2 `src/build/tools.ts`

Petits ajouts, pas de refonte :

- `pointerCancel()` : abandonne le `drag` sans rien poser.
- `clearHover()` : `hover = null`, pour que `ghost()` renvoie un fantôme vide quand aucun pointeur n'est présent.
- `elbowSwap` (booléen) + `toggleElbow()` : `beltPlan` utilise `this.ctrl !== this.elbowSwap` au lieu de `this.ctrl`.
- Pour l'option B du collage : un état `pending` (position du fantôme) et `confirm()`. Le glisser déplace le fantôme au lieu de créer une rangée. La rangée de copies reste disponible à la souris.
- `pick()` prend une tuile en paramètre au lieu de lire `hover` (appui long).

### 5.3 `src/main.ts`

- **Boucle de rendu** : la ligne `tools.pointerMove(hover.x, hover.y, …)` s'exécute à chaque image avec la dernière position connue. Au doigt, elle fige le fantôme là où le doigt s'est levé. À conditionner par `pointer.hasHover`, sinon `tools.clearHover()`.
- **Info-bulle et barre d'état** : utiliser la tuile épinglée (appui bref) quand il n'y a pas de survol.
- **Audio** : voir §6.3.
- **Redimensionnement** : écouter aussi `visualViewport` (`resize`) et le changement d'orientation.
- **Sauvegarde** : ajouter `pagehide` (voir §6.4).
- Câbler la barre d'actions, le bouton pause, l'appui long.

### 5.4 `src/ui/`

| Fichier                      | Changement                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `toolHint.ts`                | Devient la barre d'actions contextuelle (§4.1)                                                                                   |
| `buildBar.ts`                | Barre défilable horizontalement, voir §5.5                                                                                       |
| `topBar.ts`                  | Bouton Pause. Sur écran étroit, Marqueur (doublon de la barre du bas), Niveaux et Nombres livrés passent dans un bouton « Plus » |
| `hud.ts`                     | Mode compact sur écran étroit : une ligne (niveau, cible, compte), appui pour déplier                                            |
| `tooltip.ts`                 | Épinglage sur une tuile                                                                                                          |
| `statusBar.ts`               | Coordonnées masquées sans survol                                                                                                 |
| `panels/panel.ts`            | Sur écran étroit : feuille en bas de l'écran, pleine largeur, défilement interne                                                 |
| `markerEditor.ts`, `menu.ts` | Tenir compte du clavier virtuel (§6.2), cibles tactiles plus grandes                                                             |
| `help.ts`                    | Position revue sur écran étroit, textes adaptés                                                                                  |

### 5.5 `src/ui/styles.css` et `index.html`

**Plomberie tactile (prioritaire, quelques lignes)** :

- `#world { touch-action: none; }` : rend les gestes au jeu. C'est la ligne qui débloque tout le reste.
- `html, body { overscroll-behavior: none; }` : pas de tirer-pour-rafraîchir ni de rebond.
- `body { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }` : pas de sélection de texte ni de menu sur appui long. Réactiver la sélection dans les champs de saisie.
- `#ui-root > * { touch-action: manipulation; }` et `pan-y` / `pan-x` sur les zones défilables : pas de zoom de page en pinçant l'interface.
- `index.html` : ajouter `viewport-fit=cover` à la balise viewport. **Ne pas** mettre `user-scalable=no` (mauvais pour l'accessibilité, et ignoré par Safari iOS).

**Mise en page** :

- Remplacer `100vh` par `100dvh` (`.panel`, `.menu-card`).
- Marges avec `env(safe-area-inset-*)` sur les quatre bords.
- Styles `:hover` placés sous `@media (hover: hover)` (sinon ils restent collés après un appui).
- Cibles tactiles à 44 × 44 px minimum sous `@media (pointer: coarse)`.
- Champs de saisie à `font-size: 16px` minimum sous `@media (pointer: coarse)` (voir §6.2).
- Points de rupture par largeur **et** par hauteur (le paysage téléphone fait 342 px de haut).
- Barre de construction : `overflow-x: auto`, `scroll-snap`, largeur max = écran, icônes seules sous un certain seuil. 16 boutons de 48 px font environ 870 px : défilement nécessaire sur téléphone, tout tient sur tablette paysage.

### 5.6 `src/i18n/fr.ts` et `en.ts`

- Textes qui disent « Clic » ou citent des touches : `hint.*`, certaines bulles `help.*`. Les reformuler de façon neutre (« Appuyer ou cliquer ») ou les remplacer par les boutons du §4.1.
- Nouvelles clés pour les boutons d'action et pour une section « Tactile » dans Options > Commandes.
- Les tests `i18n.test.ts` (parité FR/EN) et `noHardcodedText.test.ts` s'appliquent aux nouvelles clés.

### 5.7 Ce qui ne change pas

`src/sim/`, `src/world/`, `src/save/` (format de sauvegarde inchangé, pas de migration), `src/render/` hors détails du §6.1, `src/build/` hors `tools.ts`.

---

## 6. Points techniques transverses

### 6.1 Performance et rendu

- Le ratio de pixels est déjà plafonné à 2 (`MAX_DPR`). Un iPhone à 3 rend donc en 780 × 1328, ce qui est raisonnable.
- Pendant un pincement le zoom change à chaque image, donc les caches (`RegionCache`) sont désactivés (`STABLE_FRAMES`). C'est le pire cas de rendu, et il devient le geste le plus courant. **À mesurer sur un Android milieu de gamme** avec le scénario de référence (`loadReference`). Repli possible : plafonner le ratio à 1,5 pendant le geste.
- La boucle tourne à 60 images/s en continu. Sur batterie, envisager de ne redessiner que si quelque chose a changé quand le jeu est en pause.

### 6.2 Clavier virtuel

- **Safari iOS zoome la page quand on touche un champ dont la police fait moins de 16 px.** `.marker-input` est à 14 px, `.opt-select` à 13 px. Passer à 16 px sur écran tactile.
- Le clavier virtuel réduit la zone visible. L'éditeur de marqueur est centré, donc potentiellement caché : l'aligner en haut de l'écran, ou suivre `visualViewport`.
- `input.focus()` dans `MarkerEditor.open` est appelé depuis un geste utilisateur, donc le clavier s'ouvrira. À vérifier sur appareil.

### 6.3 Audio

- Le contexte audio est créé au premier `pointerdown` (`{ once: true }`). Or, selon la spécification HTML, **un `pointerdown` tactile n'est pas une activation utilisateur** (seul celui de la souris l'est). Le contexte risque de rester suspendu, et l'écouteur ne retentera pas.
- Correction : déverrouiller aussi sur `pointerup` et `click`, et appeler `ctx.resume()` si l'état est `suspended`.
- iOS interrompt le contexte au passage en arrière-plan : `resume()` au retour (`visibilitychange`).
- À vérifier sur appareil.

### 6.4 Sauvegarde sur mobile

- `beforeunload` n'est pas fiable sur mobile. La sauvegarde sur `visibilitychange` existe déjà, mais elle est asynchrone (`void saves.save()`) et l'onglet peut être tué avant la fin. Ajouter `saves.saveSync()` sur `pagehide`.
- **Risque de perte de partie sur Safari iOS** : le stockage local d'un site non installé peut être effacé après 7 jours sans visite. Parades : `navigator.storage.persist()`, installation sur l'écran d'accueil (jalon T5), rappel d'export.
- Export : le lien `download` sur un blob fonctionne sur Safari iOS récent (enregistre dans Fichiers). À vérifier sur appareil. Repli : `navigator.share` avec un fichier.
- Le rattrapage au retour d'arrière-plan (`queueCatchUp`) existe déjà. Il servira beaucoup plus sur mobile.

### 6.5 Accessibilité

- Le canvas est `aria-hidden`. Rien ne change pour les lecteurs d'écran.
- Les nouveaux boutons ont un `aria-label` et un état `aria-pressed` comme les existants.
- Le test de contraste (`contrastIssues`) doit tourner aussi sur les nouveaux gabarits.

---

## 7. Tests

### 7.1 Unitaires (Vitest, Node)

- `gestures.test.ts` : appui bref, glisser sans outil = déplacement, glisser avec outil = construction, deuxième doigt = annulation sans pose, pas de retour en construction après pincement, appui long, `pointercancel`, seuil de mouvement.
- `camera.test.ts` : pincement (le point sous le milieu reste fixe, bornes de zoom, déplacement à deux doigts sans changement d'écart).
- `editing.test.ts` : `pointerCancel`, `clearHover`, `toggleElbow`, validation du collage.

### 7.2 e2e (Playwright)

- Deux projets ajoutés à `playwright.config.ts` : tablette (`iPad (gen 7)`) et téléphone paysage, avec `hasTouch`. Les tests existants restent sur le projet desktop.
- `page.touchscreen` ne sait faire que l'appui simple. Les gestes multi-doigts passent par CDP (`Input.dispatchTouchEvent`), méthode validée pendant cette étude. Elle ne marche que sur Chromium, le seul navigateur de la CI.
- `touch.spec.ts` : déplacement à un doigt, pincement (zoom du jeu modifié **et** `visualViewport.scale` resté à 1), tracé de tapis, deuxième doigt qui annule, appui long = pipette, boutons d'action.
- `layout.spec.ts`, par gabarit : chaque bouton visible est dans l'écran ou dans une zone défilable, fait au moins 44 px, et aucun bloc n'en recouvre un autre.

### 7.3 Manuel, sur appareils réels

L'émulation ne reproduit pas Safari. Liste à dérouler sur un iPhone, un iPad et un téléphone Android :

- Pincement et glisser sans zoom ni défilement de page, y compris en partant d'un bouton.
- Pas de menu ni de sélection sur appui long.
- Pas de zoom à la saisie d'un marqueur.
- Son audible après le premier appui, et après un retour d'arrière-plan.
- Rotation de l'écran, encoche, barre d'accueil.
- Export et import d'une sauvegarde.
- Partie retrouvée après fermeture brutale de l'onglet.
- Fluidité du pincement sur le scénario de référence.

---

## 8. Jalons

Chaque jalon laisse le jeu jouable à la souris, tests verts.

| Jalon                                | Contenu                                                                                                                                                | Taille  | Critère de fin                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| **T0 Plomberie**                     | CSS tactile (§5.5), `viewport-fit`, `pointerCancel` et `clearHover`, audio (§6.3), `pagehide`                                                          | Petite  | Pincer ne zoome plus la page. Appui simple pose toujours un objet. Aucun test existant ne casse |
| **T1 Gestes caméra et construction** | `gestures.ts`, `pointer.ts`, pincement, déplacement à un doigt, annulation par deuxième doigt, fantôme effacé au relâchement                           | Moyenne | Sur tablette : se déplacer, zoomer, tracer un tapis, poser un extracteur, livrer au Hub         |
| **T2 Remplacement du clavier**       | Barre d'actions contextuelle, bouton pause, appui long = pipette, info-bulle épinglée, `toggleElbow`                                                   | Moyenne | Toutes les lignes du tableau §1.3 ont un équivalent tactile                                     |
| **T3 Mise en page**                  | Points de rupture, barre défilable, HUD compact, panneaux en feuille, cibles de 44 px, zones sûres, `dvh`, clavier virtuel                             | Grande  | `layout.spec.ts` vert sur les gabarits visés                                                    |
| **T4 Confort**                       | Collage « placer puis valider », défilement au bord, textes d'aide et section Commandes, inertie du déplacement (coupée si « Réduire les animations ») | Moyenne | Une partie complète jusqu'au niveau 10 sans clavier ni souris                                   |
| **T5 Installation (optionnel)**      | Manifeste web, icônes, plein écran, `storage.persist()`, mesure de performance mobile                                                                  | Petite  | Installable sur l'écran d'accueil, sauvegarde durable                                           |

**Première version utile** : T0 + T1 + T2, sur tablette en paysage (là où la mise en page actuelle tient presque).

**Documents à mettre à jour en même temps** : PLAN.md (§0, §3.3, §8, §9.1, §16), `docs/DECISIONS.md` (modèle de gestes), `README.md` (tableau des commandes), `docs/PROGRESS.md`.

---

## 9. Décisions à prendre

| #   | Question                                         | Recommandation                                                                              | Impact si autre choix                                                                                          |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | **Cible** : tablette seule, ou téléphone aussi ? | Tablette + téléphone paysage en premier. Téléphone portrait « utilisable » sans être soigné | Tablette seule : T3 fond de moitié. Téléphone portrait soigné : T3 double (HUD, barres et panneaux à repenser) |
| 2   | Modèle de gestes (§3.1)                          | Un doigt construit quand un outil est actif                                                 | L'alternative ralentit chaque tracé                                                                            |
| 3   | Pose (§3.4)                                      | Directe, sauf collage avec validation                                                       | Validation partout : plus sûr, plus lent, plus de code dans `ToolController`                                   |
| 4   | Barre d'actions visible aussi à la souris ?      | Oui                                                                                         | Sinon il faut détecter le type d'entrée et gérer la bascule                                                    |
| 5   | Installation sur l'écran d'accueil (T5)          | Oui, après T3                                                                               | Sans elle, risque de perte de sauvegarde sur iOS après 7 jours d'absence                                       |

---

## 10. Risques

| Risque                                             | Gravité | Parade                                                         |
| -------------------------------------------------- | ------- | -------------------------------------------------------------- |
| Comportements Safari iOS différents de l'émulation | Élevée  | Test sur appareil dès T0, avant d'écrire les gestes            |
| Poses accidentelles au doigt                       | Moyenne | Seuil de 10 px, annulation par deuxième doigt, Annuler visible |
| Pincement saccadé sur grosses usines               | Moyenne | Mesure en T1, ratio de pixels réduit pendant le geste          |
| Perte de sauvegarde sur iOS                        | Moyenne | `pagehide`, `storage.persist()`, T5                            |
| Régression du jeu à la souris                      | Faible  | Chemin souris inchangé, e2e existants conservés                |
| Mise en page téléphone qui gonfle le chantier      | Moyenne | Décision 1, tablette d'abord                                   |
