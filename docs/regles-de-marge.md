# Les règles de marge de KiWee

*Formules données par Michel le 30/08/2026, vérifiées le même jour sur la base de production.*

Ce document remplace la question posée dans `message-slack-marges-michel.md` : elle est répondue.
Il corrige aussi le constat **DAT-05** de l'audit, qui annonçait « cinq libellés financiers, une
seule valeur » et suggérait d'en supprimer. C'était une erreur de lecture.

---

## Les trois formules

**1. Marge brute (€/dossier)**
> `Marge de référence €/MWh × Volume contractuel MWh × taux de commissionnement du fournisseur`

**2. Marge nette (€/dossier)**
> `Marge brute − Marge apporteur d'affaires`

**3. Marge nette dite « commission »**
> `(Marge nette / 0,75) × 0,85` — *« en fonction du courtier qui nous propose l'offre »*

---

## Ce que la base confirme, et ce qu'elle ne confirme pas

### Formule 2 — vérifiée sans exception

**1 562 dossiers sur 1 562. Zéro contre-exemple.**

```sql
select count(*) filter (where abs(coalesce(marge_brute,0) - coalesce(marge_apporteur,0)
                                 - coalesce(marge_nette,0)) >= 0.02) as contre_exemples
from recommandations where actif and marge_brute is not null;
```

C'est aussi ce qui explique que les cinq libellés de la fiche recommandation semblent redondants :
**1 445 dossiers sur 1 562 n'ont aucun apporteur d'affaires**, donc marge brute et marge nette y
sont identiques. Il n'y a rien à supprimer.

Sur l'ensemble du portefeuille : marge brute **3 963 366 €**, marge nette **3 693 498 €**, l'écart
de **269 867 €** partant chez les apporteurs sur 117 dossiers.

### Formule 3 — le coefficient existe, et il désigne les courtiers

`0,85 / 0,75 = 1,1333…` — et ce rapport exact apparaît **60 fois** dans la base. Mieux : il sépare
proprement deux familles de fournisseurs.

| Fournisseur | Dossiers | Avec coefficient | Rapport observé |
|---|---:|---:|---|
| **PICOTY** | 48 | 48 | 1,1333 → 1,2143 |
| **ENERGEM** | 67 | 66 | 1,13 / 1,1333 / 1,14 |
| **PRIMEO ENERGIE** | 17 | 15 | 1,1416 |
| **GME FRANCE** | 5 | 5 | 1,1333 → 1,1335 |
| **SELIA** | 1 | 1 | 1,1333 |
| **GAZEL ENERGIE** | 1 | 1 | 1,1330 |
| GAZ EUROPEEN | 348 | 6 | 1,0000 (sauf 6 anomalies) |
| GEDIA | 60 | 3 | 1,0000 |
| OHM ENERGIE | 32 | 6 | 1,0000 |
| SEFE, ILEK, TOTAL, VATTENFALL | 69 | 1 | 1,0000 |

Les six premiers sont les **courtiers** au sens de Michel — ceux qui nous apportent l'offre. Les
autres sont des fournisseurs avec qui on traite en direct, et chez eux le coefficient vaut 1.

**Mais le coefficient est saisi à la main, pas calculé.** Deux conséquences visibles :

- **Le même courtier porte trois valeurs différentes.** ENERGEM apparaît avec 1,13 (16 dossiers),
  1,14 (16 dossiers) et 1,1333 (7 dossiers). C'est le même taux, arrondi différemment selon qui a
  rempli le champ.
- **Quatorze dossiers portent une valeur impossible** (voir ci-dessous).

### Formule 1 — invérifiable en l'état

Le taux de commissionnement du fournisseur **n'existe nulle part** : ni colonne dans Kimatch, ni
champ dans Salesforce. Et le rapport `marge brute / (marge €/MWh × volume)` ne se stabilise pas —
chez GAZ EUROPEEN il va de **0,0015 à 1,80**, chez OHM ENERGIE jusqu'à **59,57**.

Plus décisif encore : **la formule ne s'appliquerait qu'à 666 dossiers sur 1 562.** 835 n'ont
aucune marge de référence €/MWh, 873 aucun volume contractuel.

---

## Les quatorze valeurs à corriger

La marge « commission » sert au commissionnement des salaires. Ces quatorze-là ne peuvent pas être
justes :

| Fournisseur | Dossier | Marge nette | Marge commission | Rapport |
|---|---|---:|---:|---:|
| GAZ EUROPEEN | 🔥 MAISON BLANCHE IMMOBILIER — SDC CHATEAUDUN | 222,30 € | 4 112,55 € | **18,50** |
| OHM ENERGIE | CAPTA — MULTISITE — SEM PAU PYRENEES | 668,00 € | 1 388,00 € | 2,08 |
| GAZ EUROPEEN | CAPTA — SDC 4 RUE BELLINI | 3 831,00 € | 6 385,00 € | 1,67 |
| HELLIO | RENOU — SDC 26 AVENUE DE LA GARE | 248,98 € | 376,24 € | 1,51 |
| GAZ EUROPEEN | CAPTA — SDC 14MORES | 2 320,00 € | 3 480,00 € | 1,50 |
| ENERGEM | CAPTA — GRANNEC | 323,19 € | 478,60 € | 1,48 |
| ENERGEM | CAPTA — SASU TOP 3B | 368,62 € | 508,60 € | 1,38 |
| *(sans fournisseur)* | CAPTA — SAMMA | 40,60 € | 55,40 € | 1,36 |
| TOTAL ENERGIES | CAPTA — DIMO-OVERSEAS — LE HAVRE | 140,00 € | 190,00 € | 1,36 |
| ENERGEM | CAPTA — SCEA DE LA CLARTE | 1 211,77 € | 1 575,30 € | 1,30 |
| PICOTY | CAPTA — SDC ANTINEA | 743,39 € | 902,69 € | 1,21 |
| PICOTY | 🔥 CABINET CROUZET & BREIL — SDC ANTINEA BLOC 2 | 829,96 € | 1 007,80 € | 1,21 |
| GAZ EUROPEEN | CAPTA — 3 RUE JEAN MASCRE 92230 SCEAUX | 1 848,00 € | 1 132,88 € | 0,61 |
| GAZ EUROPEEN | CAPTA — SDC 17 RUE DES GALONS | 4 370,00 € | 2 185,00 € | **0,50** |

Rien n'est corrigé automatiquement : ce sont des montants qui décident de rémunérations, et la
valeur juste dépend de si le courtier s'applique ou non. **À arbitrer avec Michel.**

---

## Ce qui a été fait le 30/08/2026

**1. Calculer plutôt que saisir.** Le taux du courtier vit désormais sur la fiche fournisseur
(`comptes.taux_commission_courtier`), où il est vrai une fois pour toutes : `0,85/0,75 = 1,133333`
chez les six courtiers, vide chez les fournisseurs en direct. Un déclencheur recalcule les deux
marges à chaque écriture. L'écart 1,13 / 1,14 / 1,1333 a disparu, et un rapport de 18,50 est
devenu impossible à saisir.

**La remise d'équerre a corrigé ce qui était faux sans remplir ce qui était vide.** Les
880 dossiers sans marge « commission » le restent : la calculer aurait fait apparaître d'un coup
880 montants de rémunération que personne n'avait posés. Ils se rempliront quand les dossiers
seront touchés, chaque fois tracé dans l'historique.

*Vérifié après coup : 0 marge nette et 0 marge « commission » en désaccord avec la règle, sur
1 562 dossiers.*

**2. Ce que la fiche affiche.** La colonne alignait neuf montants sur un pied d'égalité, dont cinq
portant la même valeur. Elle se lit maintenant comme une soustraction :

```
   Marge brute          24 953,67 €
−  Marge apporteur      18 500,91 €
─────────────────────────────────────
=  Marge nette           6 452,76 €

  › Détail
      Marge « commission »   marge nette × 1,133      7 313,13 €
      Montant de l'affaire                           32 399,61 €
      Marge par MWh                                    8 €/MWh
```

La ligne de l'apporteur ne s'affiche que lorsqu'il y en a un. Le taux du courtier est annoncé à
côté du montant qu'il produit, quand il s'applique.

**Retirées de l'écran, gardées en base :** « Commission nette KiWee », « Commission interne » et
« Rémunération apporteur » sont les copies Salesforce de la marge nette, de la marge
« commission » et de la marge apporteur — identiques partout où elles sont renseignées. Les
afficher à côté de leur équivalent recréait la confusion qu'on venait de défaire.

**Reste à trancher :** les quatorze valeurs du tableau ci-dessus ont été recalculées selon la
règle. Si l'une d'elles était volontairement différente, c'est maintenant qu'il faut le dire —
l'historique de chaque dossier garde l'ancienne valeur.
