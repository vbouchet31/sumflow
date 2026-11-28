# <Nom de l'objet> (`<id>`)

> **État** : idée | en discussion | codé | réglé | validé en jeu
> Fiche à copier pour chaque nouvel objet (`docs/objets/<id>.md`). La skill `ajouter-objet` la remplit avec l'auteur, une question à la fois. Une section sans réponse reste « à discuter ».

## 1. Idée et effet

- **En une phrase** : ce que l'objet fait pour le joueur.
- **Pourquoi il rend les parties différentes** : la stratégie qu'il ouvre.
- **Exemples** : 1 à 3 situations de jeu où il change la donne.

## 2. Carte

| Champ                     | Valeur                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| Genre                     | `special` / `edition` / `passive` / `meta` (le fil rouge garde le reste)      |
| Filet de sécurité         | `pity` : forcé après N offres sans lui, ou aucun                              |
| Exemplaires par carte     | (genre `special`)                                                             |
| Carte unique (`maxPicks`) | oui / non                                                                     |
| Prérequis                 | ex. : `+` débloqué, niveau 8                                                  |
| Niveau minimum            |                                                                               |
| Courbe de poids de départ | ex. : `[(8, 2), (15, 6)]`                                                     |
| **Niveau repère**         | niveau avant lequel on veut l'avoir vu dans 50 à 80 % des parties (critère 3) |

## 3. Bâtiment (si l'objet en est un)

| Champ                | Valeur                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Opération            | entrée du registre (`src/config/operations.ts`) : règle de calcul exacte, cas limites (négatifs, 0, saturation) |
| Empreinte et ports   | schéma comme PLAN §6.3 (A, B, O, Q, R)                                                                          |
| Piste d'amélioration | existante (laquelle) ou nouvelle                                                                                |
| Vitesse de base      | en multiple de la vitesse de sa piste                                                                           |
| Dessin               | couleur de craie, symbole                                                                                       |

## 4. Éditions

| Édition    | Effet                                                   |
| ---------- | ------------------------------------------------------- |
| Brillante  | effet commun (vitesse × 1,25) ou effet propre           |
| Légendaire | effet commun (vitesse × 1,5) plus effet propre éventuel |

## 5. Boutons du régleur et bornes

Seuls ces paramètres peuvent être changés par `npm run tune`. Ils vivent dans le fichier des valeurs réglées.

| Bouton                       | Valeur de départ | Borne basse | Borne haute |
| ---------------------------- | ---------------- | ----------- | ----------- |
| Facteur de poids de la carte | 1                | 0,2         | 3           |
| Facteur de vitesse           | 1                | 0,3         | 1,5         |

## 6. Critères particuliers

Les 4 critères de `PLAN-objets.md` §4 et `PLAN-paliers.md` §5.3 s'appliquent. Noter ici un seuil différent et sa justification, sinon « aucun ».

## 7. Historique des simulations

| Date | Commande | Verdict (1 / 2 / 3) | Valeurs | Remarque |
| ---- | -------- | ------------------- | ------- | -------- |

## 8. Décisions

-

## 9. Retours de parties de test

-
