# Handoff « Fiche Compte » — KiWee OS

## Contenu du dossier

| Fichier | À quoi ça sert |
|---|---|
| `00-PROMPT-CLAUDE-CODE.md` | **Le prompt à coller dans Claude Code.** C'est le point d'entrée. |
| `01-REFERENCE-fiche-compte.html` | La page, autonome, sans dépendance. **Référence visuelle absolue** : ouvre-la dans un navigateur. |
| `02-design-tokens.ts` | Couleurs, typo, espacements, rayons, ombres, animations, charte iconographique. |
| `03-API-CONTRACT.md` | La forme des données attendue par la page + endpoints suggérés. |
| `04-source/` | Le source lisible de la page (markup + logique, valeurs exactes à lire). |

## Mode d'emploi

1. Copie tout le dossier `handoff-fiche-compte/` à la racine de ton dépôt.
2. Ouvre `01-REFERENCE-fiche-compte.html` dans un navigateur et garde-le ouvert.
3. Dans Claude Code, colle le contenu de `00-PROMPT-CLAUDE-CODE.md`.
4. Compare le rendu à la référence à chaque étape, corrige avant d'avancer.

## Pourquoi le premier essai a échoué

Le zip du projet entier contient **9 pages** de plusieurs milliers de lignes chacune.
Demander la conversion de tout d'un coup dépasse ce qui peut être traité en une passe :
le modèle en réimplémente une fraction et improvise le reste.

Ce paquet ne traite **qu'une page**, avec sa référence visuelle exacte, ses jetons de design
et son contrat de données. Il faut refaire la même chose page par page — dans cet ordre :

1. **Fiche Compte** ← ce paquet
2. Fiche Site
3. Fiche Compteur
4. Fiche Contact
5. Fiche Contrat
6. Fiche Mandat
7. Fiche Recommandation
8. Fiche Version
9. Étude client (front-office)

Les jetons de design et le système d'édition inline construits à l'étape 1 sont réutilisés
par toutes les suivantes : le paquet 2 sera beaucoup plus rapide que le paquet 1.
