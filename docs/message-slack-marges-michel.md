# Message Slack pour Michel — les cinq libellés financiers

*Prêt à coller. Relevé du 30/08/2026 sur la base de production.*

---

Michel, une question sur les marges dans Kimatch. Le bloc « L'affaire » de la fiche recommandation affiche cinq libellés : **commission nette KiWee, commission interne, marge brute, marge nette, marge nette avec coefficient**. Sur la plupart des dossiers ils portent tous le même montant, ce qui donne l'impression que quatre d'entre eux sont inutiles.

En regardant les dossiers où ils diffèrent, on trouve une règle nette :

**marge brute − marge apporteur = marge nette**
Vérifié sur **1 562 dossiers sur 1 562. Zéro contre-exemple.**

Exemple, CAPTA — MULTISITE — KERJEAN :
> marge brute 24 953,67 € − apporteur 18 500,91 € = marge nette 6 452,76 €

Les cinq libellés se confondent simplement parce que **1 445 dossiers sur 1 562 n'ont aucun apporteur**. Il n'y a donc rien à supprimer : la donnée est cohérente, c'est l'affichage qui la rend illisible.

Sur l'ensemble du portefeuille : marge brute **3 963 366 €**, marge nette **3 693 498 €**. L'écart, **269 867 €**, part chez les apporteurs sur 117 dossiers.

**Ce que je voudrais que tu confirmes ou corriges :**

**1. La règle est-elle bien celle-là ?** Marge brute = ce que rapporte l'affaire, marge apporteur = la part rétrocédée, marge nette = ce qui reste à KiWee.

**2. « Commission nette » est-elle autre chose que la marge nette ?** En base, les deux sont identiques partout où la commission nette est renseignée (1 484 dossiers) et vide sur les 78 autres. Si c'est le même chiffre, on garde un seul libellé.

**3. Que représente le coefficient de la « marge nette avec coefficient » ?** Sur 683 dossiers renseignés : **518 avec un coefficient de 1,00**, **95 à 1,13**, **48 à 1,14**, quelques cas isolés (1,21 · 1,36 · 0,50). D'où viennent ces 13–14 % ? C'est ce coefficient qui décide de l'écart entre « commission interne » et « marge nette ».

**4. Lequel de ces chiffres fait foi pour un commercial ?** Aujourd'hui les marges viennent de deux endroits : celles reprises de Salesforce sur la recommandation, et un calcul possible à partir des offres fournisseurs. Rien n'indique lequel prime — et comme les offres ne sont presque jamais saisies, le calcul ne donnerait de toute façon rien.

**5. Lequel doit-on afficher sur la fiche ?** Mon avis : marge brute, marge apporteur, marge nette — trois lignes qui racontent la même histoire de haut en bas. Le reste passe en détail dépliable.

---

## Pour mémoire (ne pas coller)

Ce relevé corrige mon propre constat **DAT-05** de l'audit, qui annonçait « cinq libellés, une seule valeur » et suggérait d'en supprimer. C'était une erreur de lecture : les valeurs coïncident uniquement en l'absence d'apporteur. Le modèle de données est correct, seul l'affichage ne l'est pas.

Requêtes de vérification :

```sql
-- La règle, et ses contre-exemples
select count(*) as dossiers,
       count(*) filter (where abs(coalesce(marge_brute,0) - coalesce(marge_apporteur,0)
                                  - coalesce(marge_nette,0)) >= 0.02) as contre_exemples
from recommandations where actif and marge_brute is not null;

-- Le coefficient
select round((marge_nette_coeff/marge_nette)::numeric,2) as rapport, count(*)
from recommandations where actif and marge_nette > 0 and marge_nette_coeff is not null
group by 1 order by 2 desc;
```
