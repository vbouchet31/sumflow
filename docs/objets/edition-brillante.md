# Édition brillante (`edition-brillante`)

> **État** : réglé
> Objet de la phase 1 (`PLAN-recompenses.md` §3.4 et §3.5), fiche créée lors de son premier rééquilibrage.

## 1. Idée et effet

- **En une phrase** : une carte Édition brillante, à appliquer sur un bâtiment posé (outil `G` ou bulle de sélection) ; démolir le bâtiment ou « Retirer l'édition » la rend.
- **Pourquoi il rend les parties différentes** : le joueur choisit quel bâtiment accélérer, au lieu de prendre le fil rouge.
- **Exemples** : un multiplicateur goulot d'étranglement passe à × 1,25 de vitesse.

## 2. Carte

| Champ                     | Valeur                               |
| ------------------------- | ------------------------------------ |
| Genre                     | `edition`                            |
| Emplacement               | Atelier                              |
| Exemplaires par carte     | 1 carte Édition                      |
| Carte unique (`maxPicks`) | non                                  |
| Prérequis                 | aucun                                |
| Niveau minimum            | aucun                                |
| Courbe de poids de départ | 6 à tous les niveaux                 |
| **Niveau repère**         | 15 (valeur par défaut du simulateur) |

## 3. Bâtiment (si l'objet en est un)

Sans objet : la carte s'applique sur un bâtiment existant.

## 4. Éditions

| Édition   | Effet                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| Brillante | effets provisoires de la phase 1 : opérateurs vitesse × 1,25, extracteur débit × 1,25, stockage capacité × 1,25 |

## 5. Boutons du régleur et bornes

| Bouton                       | Valeur de départ | Borne basse | Borne haute |
| ---------------------------- | ---------------- | ----------- | ----------- |
| Facteur de poids de la carte | 1                | 0,2         | 3           |

## 6. Critères particuliers

Aucun.

## 7. Historique des simulations

| Date       | Commande                                    | Verdict (1 / 2 / 3)                                             | Valeurs             | Remarque                                                                             |
| ---------- | ------------------------------------------- | --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| 2026-11-25 | `npm run sim`                               | ✓ 100 % / ✓ 85 % / ✗ 95 %                                       | `weightScale` = 1   | trop visible avant le niveau 15 (cible 50 à 80 %)                                    |
| 2026-11-25 | `npm run tune -- edition-brillante --apply` | réglage ✓ / ✓ / ✓ 73 % ; contrôle ✓ / ✓ / ✗ 83 % (à surveiller) | `weightScale` = 0,5 | appliqué après accord de l'auteur ; l'écart du contrôle reste dans la marge de bruit |

## 8. Décisions

- 2026-11-25 : poids de la carte divisé par 2 (`weightScale` = 0,5), proposé par le régleur et validé par l'auteur. La carte reste proposée souvent, mais moins systématiquement avant le niveau 15.

## 9. Retours de parties de test

-
