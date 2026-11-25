# PLAN-objets.md : ajouter des objets de façon répétable

> **État : phase 2a terminée (outillage) ; prochaine étape 2b, pilote Concaténateur.** Suite de [`PLAN-recompenses.md`](PLAN-recompenses.md) (phase 1 terminée). Les choix faits en cours de route vont dans [`docs/DECISIONS.md`](docs/DECISIONS.md), l'avancement dans [`docs/PROGRESS.md`](docs/PROGRESS.md).

---

## 0. Résumé

- On ne définit pas tous les objets à l'avance. Chaque objet suit **la même recette**, décrite par une skill du dépôt (`.claude/skills/ajouter-objet/`) :
  1. une idée ;
  2. une discussion (effets, poids, bornes) ;
  3. le code ;
  4. une simulation de centaines de parties ;
  5. un réglage automatique **encadré** ;
  6. la validation par l'auteur et ses parties de test.
- **Quatre pièces** :
  - la skill ;
  - une fiche par objet (`docs/objets/<id>.md`) ;
  - un simulateur (`npm run sim`) ;
  - un régleur (`npm run tune`).
- **Étapes** :
  - **2a** : l'outillage, testé sur le catalogue actuel ;
  - **2b** : le pilote, le Concaténateur ;
  - **2c** : le retour d'expérience sur la recette.

---

## 1. Décisions prises

| Sujet                       | Décision                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Contenu                     | Aucun objet n'est défini à l'avance. On en ajoute un à la fois, avec la skill.                                                      |
| Mémoire entre conversations | La skill (dans le dépôt) et la fiche de chaque objet. Une nouvelle conversation relit la fiche.                                     |
| Simulateur                  | Vrais tirages d'offres (le code du jeu) plus un modèle de coût. Pas de simulation d'usine. Graines fixes, résultats reproductibles. |
| Régleur                     | Ne touche que les paramètres réglables déclarés, dans leurs bornes. Il **propose** ; rien n'est commité sans l'accord de l'auteur.  |
| Régression                  | Chaque simulation vérifie tout le catalogue, pas seulement le nouvel objet.                                                         |
| Critères d'équilibre        | Les 3 critères du §4, validés par l'auteur.                                                                                         |

---

## 2. Registre des opérations (prérequis du Concaténateur)

Aujourd'hui, un bâtiment spécial imite un opérateur existant (`SPECIAL_BUILDINGS[type].like`). Un nouvel objet comme le Concaténateur apporte **une nouvelle opération**.

- **Un registre unique** (par exemple `src/config/operations.ts`) déclare chaque opération une seule fois : identifiant, symbole, entrées (A, B), sorties (O, ou Q et R), fonction de calcul pure (bornée comme `intmath.ts`), piste d'amélioration utilisée.
- **Le jeu et le simulateur lisent tous les deux ce registre.** Ajouter une opération ne demande donc qu'une entrée dans le registre (plus l'empreinte du bâtiment, son dessin et ses textes).
- Les opérateurs actuels (+, ×, −, ÷, ^) passent par ce registre, sans changement de comportement.
- Un bâtiment spécial déclare l'opération qu'il effectue (et sa piste), au lieu de seulement « imiter » un opérateur.

---

## 3. Le simulateur (`npm run sim`)

### 3.1 Ce qu'il simule

- **Une partie** est une graine plus une **stratégie de choix** :
  - `natural` : la carte fil rouge quand elle est proposée, sinon la première ;
  - `random` : une carte au hasard ;
  - `new` : toujours une nouveauté ;
  - `minimal` : refuse les valeurs ;
  - `object:<id>` : prend l'objet testé chaque fois qu'il est proposé, sinon le fil rouge (test d'abus, critères 1 et 3) ;
  - `once:<id>` : prend l'objet testé la première fois qu'il est proposé, puis joue `natural` (utilité, critère 2).
- Les offres sont tirées **avec le vrai code** (`drawOffer`, `chooseCard`, état du jeu), du niveau 1 au niveau maximum de la simulation (réglable, environ 60 par défaut).

### 3.2 Le modèle de coût

À chaque niveau, avec les outils obtenus (valeurs extractibles, opérations débloquées, bâtiments spéciaux et leur nombre d'exemplaires, éditions, passifs) :

1. **Coût de fabrication d'une cible** : le nombre d'opérations (par opération, pondéré par sa durée) et d'items bruts nécessaires pour fabriquer **un** item de la cible. C'est une recherche heuristique, mémorisée et déterministe (décompositions par facteurs, sommes, différences, puissances et, demain, concaténations). Elle n'est pas forcément optimale, mais elle doit être **monotone** : plus d'outils ne coûte jamais plus cher.
2. **Temps du niveau** : `quantité × coût par item`, divisé par une capacité d'usine supposée (constante documentée). Les bâtiments **en nombre limité** imposent un plafond de débit : `exemplaires × vitesse / utilisations par item`.
3. **Améliorations** : une progression type des pistes en fonction du niveau, documentée et identique pour toutes les stratégies.
4. **Indice de difficulté** : le temps du niveau divisé par le temps du même niveau, pour la même graine, avec la stratégie `natural`. 1,0 veut dire « comme la partie de référence ».

Les constantes du modèle sont regroupées dans un seul fichier de configuration du simulateur.

### 3.3 Sorties

- **Un rapport Markdown dans le terminal**, avec un résumé par objet et par stratégie : indices par tranche de niveaux (médiane, p10, p90), fréquence d'apparition, taux de prise, verdict des critères du §4.
- **Un fichier JSON détaillé** dans un dossier ignoré par git, pour aller plus loin.
- **Options** : nombre de graines, niveau maximum, objet ciblé, stratégies.
- **Performance** : quelques centaines de parties doivent tourner en une à deux minutes au plus.

---

## 4. Critères d'équilibre (validés)

Pour chaque objet du catalogue, sauf les objets factices (signalés à part) et le **socle** : les cartes de la suite du fil rouge (`naturalSequence()`), qui sont le chemin de référence et apparaissent dans un tableau d'information. Un effet que le modèle ne voit pas (pont, priorités, stockage, Éventail…) est listé dans `UNMODELED` avec sa raison : son critère 2 vaut « n/a ».

1. **Pas indispensable** : avec la stratégie `object:<id>`, l'indice ne descend pas sous **0,5** (pas plus de 2 fois plus facile que la référence) pendant plus de **3 niveaux de suite**, pour au moins 90 % des parties.
2. **Pas inutile** : avec la stratégie `once:<id>`, l'indice est **sous 1** sur au moins **un tiers** des niveaux qui suivent sa première prise (en médiane sur les parties).
3. **Visible** : l'objet apparaît au moins une fois dans une offre dans **50 à 80 %** des parties, avant son **niveau repère** (déclaré dans sa fiche, par exemple 15 pour le Concaténateur).

Les seuils (0,5 ; 3 niveaux ; un tiers ; 50 à 80 %) sont des constantes de configuration, modifiables objet par objet si la fiche le justifie.

**Bruit** : 60 graines par défaut. Une bascule d'un autre objet n'est une régression que si la mesure bouge de plus de max(7 points, 2 écarts types d'une proportion) ; sinon elle est « à surveiller » et ne bloque pas.

---

## 5. Le régleur (`npm run tune -- <id>`)

- **Paramètres réglables** : chaque objet déclare ses « boutons » et leurs bornes, discutés avec l'auteur. Par exemple :
  - facteur sur la courbe de poids de sa carte (entre 0,2 et 3) ;
  - vitesse de son opération, en multiple de la vitesse de la piste (entre 0,3 et 1) ;
  - effets de ses éditions, si la fiche le prévoit.
- **Où vivent les valeurs** : dans un seul fichier de valeurs réglées (par exemple `src/config/tuning.ts`). Le jeu lit ces valeurs, et le régleur n'écrit **que** dans ce fichier.
- **Méthode** : une recherche simple et déterministe (descente coordonnée ou grille réduite) qui minimise l'écart aux critères du §4, puis une simulation de contrôle sur **d'autres graines** que celles du réglage, pour éviter le surapprentissage.
- **Sortie** : les valeurs proposées, un rapport avant / après et le verdict des critères pour **tout le catalogue**. Par défaut, rien n'est écrit. `--apply` écrit les valeurs proposées dans le fichier des valeurs réglées, et seulement après l'accord de l'auteur.
- **Si aucune valeur dans les bornes ne respecte les critères**, le régleur le dit clairement (le critère qui échoue, la meilleure valeur trouvée). C'est alors à l'auteur et à l'agent de revoir l'objet.

---

## 6. La fiche d'un objet (`docs/objets/<id>.md`)

Un modèle (`docs/objets/_modele.md`) avec les sections :

- identité ;
- idée et effet ;
- genre de carte ;
- bâtiment (empreinte, ports, opération) ;
- éditions ;
- prérequis ;
- poids de départ ;
- niveau repère ;
- boutons et bornes ;
- critères particuliers ;
- historique des simulations (date, commande, verdict, valeurs) ;
- décisions ;
- retours de parties de test.

---

## 7. La skill (`.claude/skills/ajouter-objet/SKILL.md`)

Elle se déclenche quand l'auteur veut ajouter, modifier ou rééquilibrer un objet. Elle décrit :

1. **Discussion**, une question à la fois : remplir la fiche à partir du modèle.
2. **Code** : la liste des fichiers à toucher pour chaque genre d'objet, et les tests obligatoires.
3. **Simulation** avant et après, puis **réglage** (`npm run tune`), avec un rapport montré à l'auteur.
4. **Validation** par l'auteur, puis `--apply`, mise à jour de la fiche, vérifications, commit, pull request.
5. **Parties de test** de l'auteur, et retours notés dans la fiche.

---

## 8. Étape 2a : livrables et critères de fin

| Livrable                 | Fin quand                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Registre des opérations  | +, ×, −, ÷, ^ et l'Additionneur ancien passent par lui ; tous les tests existants restent verts                                       |
| Simulateur `npm run sim` | rapport et JSON produits sur le catalogue actuel ; reproductible ; temps dans la cible ; tests du modèle (monotonie, cas connus)      |
| Régleur `npm run tune`   | tourne sur un objet du catalogue actuel ; sans `--apply` rien n'est écrit ; avec `--apply` seul le fichier des valeurs réglées change |
| Valeurs réglées          | le jeu les lit ; les valeurs actuelles donnent exactement le jeu actuel                                                               |
| Fiche modèle et skill    | présentes et cohérentes avec les commandes                                                                                            |

**Vérification de bon sens sur le catalogue actuel** : la stratégie `natural` donne un indice de 1 par définition ; les objets factices sont signalés comme tels. Le régleur lancé sur une carte existante doit rester dans des valeurs proches des actuelles, ou expliquer pourquoi il s'en écarte.
