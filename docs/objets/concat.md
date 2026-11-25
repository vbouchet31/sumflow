# Concaténateur (`concat`)

> **État** : en discussion
> Pilote de l'étape 2b (`PLAN-objets.md`). Proposition par défaut de l'auteur (2026-11-25), questions tranchées une à une en section 8. Une valeur marquée « (à trancher, Qn) » attend la réponse à la question n.

## 1. Idée et effet

- **En une phrase** : un opérateur qui écrit les chiffres de B après ceux de A (4 ‖ 7 = 47, 89 ‖ 1 = 891).
- **Pourquoi il rend les parties différentes** : le joueur peut découper une cible en morceaux de chiffres au lieu de seulement la factoriser. Un même niveau a deux familles de solutions.
- **Exemples** :
  - 47 passe de « 5 × 9 + 2 » (2 opérateurs) à « 4 ‖ 7 » (1 opérateur) ;
  - 891 : il n'aide pas (9 × 9 × 11 reste plus court) ;
  - les cibles contenant des 0 limitent les découpes (aucun 0 extractible, 0 seulement par a − a au niveau 13).

## 2. Carte

| Champ                     | Valeur                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Genre                     | `special` (décidé, Q1)                                                                                            |
| Emplacement               | Atelier (à trancher, Q3)                                                                                          |
| Exemplaires par carte     | 1 (à trancher, Q2)                                                                                                |
| Carte unique (`maxPicks`) | non, reprise possible                                                                                             |
| Prérequis                 | × débloquée (`requires: [{ building: 'multiplier' }]`)                                                            |
| Niveau minimum            | 8 (à trancher, Q10)                                                                                               |
| Courbe de poids de départ | `[(8, 2), (12, 5), (20, 5), (30, 3)]` (à trancher, Q10). Repères : valeur 20, déblocage ≤ 20, Édition brillante 3 |
| **Niveau repère**         | 15                                                                                                                |

## 3. Bâtiment

| Champ                | Valeur                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opération            | `concat` : A ‖ B = A × 10^(chiffres de \|B\|) + signe(A) × \|B\|. B = 0 donne 10 × A ; A = 0 donne \|B\| (Q5) ; signe de A gardé, signe de B ignoré (Q4) ; saturé à [INT_MIN ; INT_MAX] ; une sortie `O` ; non commutative |
| Empreinte et ports   | 2×2 pivotable : A en haut à gauche, B en bas à gauche, `O` sur la colonne de droite (« A puis B ») (à trancher, Q9)                                                                                                        |
| Piste d'amélioration | multiplicateur (à trancher, Q6)                                                                                                                                                                                            |
| Vitesse de base      | × 1 (à trancher, Q7)                                                                                                                                                                                                       |
| Dessin               | craie sarcelle, symbole ‖                                                                                                                                                                                                  |

## 4. Éditions

| Édition    | Effet                                            |
| ---------- | ------------------------------------------------ |
| Brillante  | effet commun : vitesse × 1,25                    |
| Légendaire | effet commun : vitesse × 1,5 (effet propre ? Q8) |

## 5. Boutons du régleur et bornes

| Bouton                       | Valeur de départ | Borne basse | Borne haute                            |
| ---------------------------- | ---------------- | ----------- | -------------------------------------- |
| Facteur de poids de la carte | 1                | 0,2         | 3                                      |
| Facteur de vitesse           | 1                | 0,3         | 1,2 (au lieu de 1,5 : objet jugé fort) |

## 6. Critères particuliers

Aucun (les 3 critères standard, niveau repère 15).

## 7. Historique des simulations

| Date | Commande | Verdict (1 / 2 / 3) | Valeurs | Remarque |
| ---- | -------- | ------------------- | ------- | -------- |

## 8. Décisions

- 2026-11-25, **Q1** : `special`. Limité ne veut pas dire 1 seul exemplaire : il ne s'obtient que par un choix de fin de niveau, ce qui le limite déjà fortement.
- 2026-11-25, **modèle de coût** : ajouter le **mélange**. Les bâtiments limités qui effectuent une opération qu'aucun bâtiment ordinaire ne fait (ici ‖) forment une ligne en plus, en parallèle de la ligne ordinaire de l'usine : les débits s'additionnent, au lieu d'imposer à tous les items la recette qui passe par le goulot. À coder dans la phase code (`src/simtools/cost.ts`, `src/simtools/config.ts`), avec un test de monotonie (un exemplaire de plus ne coûte jamais plus cher) et une simulation de tout le catalogue pour vérifier l'absence de régression. Estimation sans les items bruts : 1 exemplaire donne un indice d'environ 0,88 au niveau 8 et 0,91 au niveau 15 ; il en faudrait environ 7 (niveau 8) à 11 (niveau 15) pour passer sous 0,5.

Questions ouvertes, la plus importante en premier :

1. ~~`special` ou `unlock`~~ : tranché.
2. 1 ou 2 exemplaires par carte ?
3. Emplacement Atelier ou Nombres ?
4. B négatif : ignorer le signe, refuser l'opération, ou laisser passer A ?
5. A = 0 : sortir |B| ou ne rien sortir ?
6. Piste du multiplicateur ou piste dédiée ?
7. Vitesse de base × 1 ou × 0,75 ?
8. Un effet propre pour la légendaire (par exemple autoriser les zéros de tête) ou rien ?
9. Empreinte « A puis B » ou celle du + à l'identique ?
10. Niveau minimum 8, et baisse du poids en fin de partie ?

Constat à garder en tête (2026-11-25, lecture de `src/simtools/config.ts`) : une opération que seuls des bâtiments limités effectuent coûte `1 / (exemplaires × vitesse)`, alors qu'une opération ordinaire se répartit sur `G(L) = 6 + L` bâtiments (14 au niveau 8, 21 au niveau 15). Un seul Concaténateur à vitesse × 1 est donc un goulot environ 7 à 10 fois plus lent que « × puis + » : le modèle ne le choisira presque jamais (risque d'échec au critère 2).

## 9. Retours de parties de test

-
