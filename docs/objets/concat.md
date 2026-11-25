# Concaténateur (`concat`)

> **État** : codé (réglage : le régleur garde les valeurs de départ ; partie de test à faire)
> Pilote de l'étape 2b (`PLAN-objets.md`). Proposition par défaut de l'auteur (2026-11-25), questions tranchées une à une en section 8.

## 1. Idée et effet

- **En une phrase** : un opérateur qui écrit les chiffres de B après ceux de A (4 ‖ 7 = 47, 89 ‖ 1 = 891).
- **Pourquoi il rend les parties différentes** : le joueur peut découper une cible en morceaux de chiffres au lieu de seulement la factoriser. Un même niveau a deux familles de solutions.
- **Exemples** :
  - 47 passe de « 5 × 9 + 2 » (2 opérateurs) à « 4 ‖ 7 » (1 opérateur) ;
  - 891 : il n'aide pas (9 × 9 × 11 reste plus court) ;
  - les cibles contenant des 0 limitent les découpes (aucun 0 extractible, 0 seulement par a − a au niveau 13).

## 2. Carte

| Champ                     | Valeur                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Genre                     | `special` (décidé, Q1)                                                                                        |
| Emplacement               | Atelier (décidé, Q3)                                                                                          |
| Exemplaires par carte     | 1 (décidé, Q2)                                                                                                |
| Carte unique (`maxPicks`) | non, reprise possible                                                                                         |
| Prérequis                 | × débloquée (`requires: [{ building: 'multiplier' }]`)                                                        |
| Niveau minimum            | 8 (décidé, Q10)                                                                                               |
| Courbe de poids de départ | `[(8, 2), (12, 5), (20, 5), (30, 3)]` (décidé, Q10). Repères : valeur 20, déblocage ≤ 20, Édition brillante 3 |
| **Niveau repère**         | 15                                                                                                            |

## 3. Bâtiment

| Champ                | Valeur                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Opération            | `concat` : A ‖ B = A × 10^(chiffres de \|B\|) + signe(A) × \|B\|. B = 0 donne 10 × A ; A = 0 donne \|B\| (décidé, Q5) ; signe de A gardé, signe de B ignoré (décidé, Q4) ; saturé à [INT_MIN ; INT_MAX] ; une sortie `O` ; non commutative |
| Empreinte et ports   | 2×2 pivotable : A en haut à gauche, B en bas à gauche, `O` sur la colonne de droite (« A puis B ») (décidé, Q9)                                                                                                                            |
| Piste d'amélioration | multiplicateur (décidé, Q6)                                                                                                                                                                                                                |
| Vitesse de base      | × 1 (décidé, Q7)                                                                                                                                                                                                                           |
| Dessin               | craie sarcelle, symbole ‖                                                                                                                                                                                                                  |

## 4. Éditions

| Édition    | Effet                                     |
| ---------- | ----------------------------------------- |
| Brillante  | effet commun : vitesse × 1,25             |
| Légendaire | effet commun : vitesse × 1,5 (décidé, Q8) |

## 5. Boutons du régleur et bornes

| Bouton                       | Valeur de départ | Borne basse | Borne haute                    |
| ---------------------------- | ---------------- | ----------- | ------------------------------ |
| Facteur de poids de la carte | 1                | 0,2         | 3                              |
| Facteur de vitesse           | 1                | 0,3         | 1,5 (standard, décidé, Q7 bis) |

## 6. Critères particuliers

Aucun (les 3 critères standard, niveau repère 15).

## 7. Historique des simulations

| Date       | Commande                 | Verdict (1 / 2 / 3)                                         | Valeurs                        | Remarque                                                                              |
| ---------- | ------------------------ | ----------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| 2026-11-25 | `npm run sim`            | ✓ 100 % / ✓ 89 % / ✓ 75 %                                   | `weightScale` = 1, `speed` = 1 | indice après prise 0,97 (`once`), 0,90 (`object`) ; 1re offre au niveau 12 en médiane |
| 2026-11-25 | `npm run tune -- concat` | réglage ✓ / ✓ / ✓ 75 % ; contrôle ✓ 100 % / ✓ 86 % / ✓ 75 % | inchangées (1 et 1)            | les valeurs de départ respectent déjà les critères : rien à appliquer                 |

## 8. Décisions

- 2026-11-25, **Q1** : `special`. Limité ne veut pas dire 1 seul exemplaire : il ne s'obtient que par un choix de fin de niveau, ce qui le limite déjà fortement.
- 2026-11-25, **modèle de coût** : ajouter le **mélange**. Les bâtiments limités qui effectuent une opération qu'aucun bâtiment ordinaire ne fait (ici ‖) forment une ligne en plus, en parallèle de la ligne ordinaire de l'usine : les débits s'additionnent, au lieu d'imposer à tous les items la recette qui passe par le goulot. À coder dans la phase code (`src/simtools/cost.ts`, `src/simtools/config.ts`), avec un test de monotonie (un exemplaire de plus ne coûte jamais plus cher) et une simulation de tout le catalogue pour vérifier l'absence de régression. Estimation sans les items bruts : 1 exemplaire donne un indice d'environ 0,88 au niveau 8 et 0,91 au niveau 15 ; il en faudrait environ 7 (niveau 8) à 11 (niveau 15) pour passer sous 0,5.
- 2026-11-25, **Q2** : 1 exemplaire par carte, reprise possible. Dosage fin (chaque reprise ajoute environ 1/7 de débit au niveau 8), marge laissée au régleur (poids, vitesse), chaque carte a sa propre édition d'origine.
- 2026-11-25, **Q3** : Atelier. Il est proposé à côté du fil rouge (presque toujours dans Nombres entre les niveaux 8 et 19) : le prendre ne retarde pas la progression, et il croise des cartes plus légères que le fil rouge (poids au moins 50), donc il reste visible.
- 2026-11-25, **Q4** : le signe de B est ignoré (4 ‖ −7 = 47), celui de A est gardé (−4 ‖ 7 = −47). Le jeu suit la règle « un opérateur produit toujours un résultat » (÷ 0 et ^ négatif aussi). |INT_MIN| est ramené à INT_MAX avant le calcul, puis le résultat est saturé.
- 2026-11-25, **Q5** : A = 0 sort |B| (0 ‖ 7 = 0 ‖ −7 = 7 ; 0 ‖ 0 = 0). Règle écrite à part, la formule donnant 0 avec signe(0) = 0. Effet de bord accepté : une machine à valeur absolue, sans effet sur la simulation (le modèle ne fabrique pas de négatifs).
- 2026-11-25, **Q6** : piste du multiplicateur (`track: 'multiplier'`). Déjà active (× est un prérequis), cohérente (A ‖ B ≈ A × 10^k + B), sans nouvelle ligne d'interface ni nouveau calendrier dans le modèle.
- 2026-11-25, **Q7** : vitesse de base × 1. La vitesse se règle par le seul bouton `speed` du régleur, au lieu d'empiler une constante et un bouton ; le régleur peut descendre à 0,3.
- 2026-11-25, **Q7 bis** : borne haute du bouton `speed` à 1,5 (standard) au lieu de 1,2. Avec le mélange, le risque est plutôt l'inutilité ; même à 1,5, l'indice reste loin de 0,5 (il faudrait environ × 7 avec 1 exemplaire). Pas d'entrée dans `KNOB_OVERRIDES`.
- 2026-11-25, **Q8** : rien pour la légendaire, effet commun seulement (brillante vitesse × 1,25, légendaire × 1,5), simulé tel quel. Idée gardée pour plus tard si la légendaire paraît fade en partie de test : autoriser des zéros de tête (par exemple B écrit sur au moins 2 chiffres). Peu utile en l'état (405 = 40 ‖ 5, 1003 = 100 ‖ 3) et demanderait un calcul par édition.
- 2026-11-25, **Q9** : empreinte « A puis B » (2×2 pivotable : A en haut à gauche, B en bas à gauche, `O` sur la colonne de droite). Écart connu : c'est le reflet du + et elle s'écarte de la règle « A à gauche de B » des autres opérateurs. Facile à changer après les parties de test : l'empreinte n'entre pas dans le modèle de coût, donc ni poids ni réglage à refaire.
- 2026-11-25, **Q10** : niveau minimum 8 et courbe `[(8, 2), (12, 5), (20, 5), (30, 3)]` gardés. Le niveau minimum sert : la carte × peut sortir dès le niveau 3, et ‖ n'apporte rien sur des cibles à 1 ou 2 chiffres. La baisse après le niveau 20 évite d'encombrer les offres avec une carte qui pèse de moins en moins face à une usine qui grandit ; elle ne touche aucun critère. Le régleur ne change que l'échelle de la courbe, pas sa forme.

Constat à l'origine du mélange (2026-11-25, lecture de `src/simtools/config.ts`) : une opération que seuls des bâtiments limités effectuent coûte `1 / (exemplaires × vitesse)`, alors qu'une opération ordinaire se répartit sur `G(L) = 6 + L` bâtiments (14 au niveau 8, 21 au niveau 15). Un seul Concaténateur à vitesse × 1 est donc un goulot environ 7 à 10 fois plus lent que « × puis + » : le modèle actuel ne le choisirait presque jamais (risque d'échec au critère 2). Le mélange décidé plus haut corrige ce biais.

- 2026-11-25, **code** : l'Additionneur ancien (objet factice) est retiré, sans reprise des sauvegardes qui en contiennent (elles sont refusées au chargement : nouvelle partie, l'ancienne gardée à part). Conséquence mesurée : l'Atelier s'allège et l'Édition brillante passe de 73 % à 92 % de visibilité avant le niveau 15 (graines 1 à 60) ; le régleur propose `weightScale` = 0,3 pour elle (68 à 72 %), en attente de l'accord de l'auteur.
- 2026-11-25, **mélange, mise en œuvre** : la recette qui passe par la ligne est cherchée avec la ligne au prix de 2 fois l'opération ordinaire la moins chère (`LINE_SEARCH_SCALES`), puis mélangée au prix réel. Les essais avec 0,5, 1 et 2 donnent les mêmes verdicts que 2 seul, trois fois plus lentement. Simulation complète : 37 s (environ 35 s avant).

## 9. Retours de parties de test

-
