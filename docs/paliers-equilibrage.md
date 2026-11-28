# Équilibrage après les paliers (jalon P6)

> Rapport du simulateur (`npm run sim`, 60 graines, niveaux 1 à 60) et du régleur (`npm run tune -- concat`), après les jalons P1 à P5 de [`PLAN-paliers.md`](../PLAN-paliers.md). **Rien n'est appliqué** : chaque changement de valeur attend l'accord de l'auteur (PLAN-objets §5).

---

## 1. Le rythme : dans la cible

Temps entre deux récompenses (un palier ou la fin d'un niveau), dans le modèle, médiane (p10–p90) :

| Stratégie                     | 1–10  | 11–20       | 21–30       | 31–40       | 41–50 | 51–60 |
| ----------------------------- | ----- | ----------- | ----------- | ----------- | ----- | ----- |
| `none` (le fil rouge seul)    | 2 min | 3 min (2–4) | 4 min (4–4) | 3 min (3–4) | 3 min | 2 min |
| `random` (un objet au hasard) | 87 s  | 2 min       | 2 min       | 83 s        | 66 s  | 57 s  |

| Stratégie | Niveau 10 fini | Niveau 20 fini | Niveau 30 fini |
| --------- | -------------- | -------------- | -------------- |
| `none`    | 21 min         | 2,1 h          | 4,7 h          |
| `random`  | 20 min         | 1,5 h          | 2,9 h          |

- **Sans objet, la cible est tenue** : 3 à 4 minutes entre deux récompenses de 11 à 30. Avant les paliers, il fallait 15 à 20 minutes entre deux offres.
- **Le niveau 30 passe de 6 h à 4,7 h** sans objet (quantités × 0,75 dès le niveau 16).
- **Avec des objets, tout s'accélère** : la partie `random` va environ 1,6 fois plus vite au niveau 30, et 2,5 fois plus vite au niveau 60 (chiffres après le retrait du passif factice, §2.1). Le Concaténateur cumulé y est pour beaucoup (§2.2).

---

## 2. Ce qui demande une décision

### 2.1 Le passif factice se cumulait sans limite : **retiré** (décision de l'auteur)

- `passive-operators` (opérateurs + 5 %, objet factice de la phase 1) n'avait pas de `maxPicks`. Avec 3 ou 4 offres par niveau, il revenait sans cesse et se cumulait : la partie `random` allait 10 fois plus vite que `none` au niveau 60.
- **Décision** : la carte est retirée. Le genre « passif » (effet, sauvegarde, fiche tutoriel) reste prêt pour un vrai passif.
- **Après le retrait** : la partie `random` va environ 2,5 fois plus vite que `none` après le niveau 30 (indice 0,40 à 0,46), et finit le niveau 30 en 2,9 h. Le catalogue compte 5 objets (2 éditions, le Concaténateur, 2 Éventail) : une fois les deux Éventail pris, une offre de 4 cartes n'en montre que 3.

### 2.2 Le Concaténateur est trop fort quand on le prend à chaque fois

- Sans `maxPicks`, il peut être pris à chaque palier où il sort. Avec `object:concat`, l'indice descend sous 0,5 plus de 3 niveaux de suite dans 90 % des parties (critère 1 : ✗ 10 %). Il sort aussi dans 42 % des offres où il est disponible (critère 4 : ✗).
- **Le régleur propose `weightScale` = 0,2** (au lieu de 1), `speed` inchangé. Résultat au contrôle : critère 1 ✓ 100 %, critère 4 ✓ 12 %, critère 2 ✓ 98 %. Aucune régression des autres objets.
- **Autre piste** : un nombre d'exemplaires maximal (`maxPicks`), qui garde le Concaténateur fréquent mais borne son cumul.

### 2.3 Le critère 3 « visible » ne peut plus être tenu

- Il demande qu'un objet soit offert avant son niveau repère (15) dans 50 à 80 % des parties.
- Avec une offre toutes les 3 minutes et un catalogue de 5 objets, **tous les objets sont vus avant le niveau 15 dans 85 à 100 % des parties**, quel que soit leur poids. Même à `weightScale` = 0,2, le Concaténateur est vu dans 85 % des parties.
- Les poids ne peuvent pas corriger ça tant que le catalogue est petit : quand il n'y a que 4 cartes disponibles et que l'offre en montre 2 ou 3, chacune sort presque à chaque fois.
- **Propositions** (au choix) :
  - relever la borne haute à 100 % (on garde seulement « au moins 50 % ») ;
  - mesurer autre chose : le niveau médian de la 1re offre, attendu avant le niveau repère ;
  - garder le critère et attendre que le catalogue grossisse.

---

## 3. Ce qui va bien

- **Éventail** : 1re offre au niveau 6 en médiane (Éventail I), au niveau 12 (Éventail II) dès qu'Éventail I est pris. L'objectif « on arrive vite à 3 puis 4 cartes » est atteint avec les poids 8 et 6 et le filet de sécurité à 4 offres. Aucune retouche proposée.
- **Éditions** : critères 1, 2 et 4 ✓. Seul le critère 3 échoue, pour la raison du §2.3.
- **Socle** : chaque niveau donne son fil rouge ; l'ordre des déblocages est celui d'avant.

---

## 4. Commandes pour refaire ces mesures

```sh
npm run sim                                   # tout le catalogue, réglages du jeu
npm run sim -- --strategies random            # rythme avec des objets pris au hasard
npm run sim -- --quantity-factor 0.6          # autre facteur de quantités
npm run sim -- --paliers "6:1/2;12:1/3,2/3"   # autres paliers
npm run tune -- concat                        # proposition du régleur (rien n'est écrit)
```
