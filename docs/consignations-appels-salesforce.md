# Pourquoi les appels ne remontent pas tous dans Kimatch

*Mesuré le 31/08/2026 sur la base de production et sur l'org Salesforce KiweeOrg.*

Michel a signalé que les consignations d'appels ne remontent pas toutes. C'est vrai, et la cause
n'est pas un bug d'import.

---

## Les chiffres

| | Appels |
|---|---:|
| Dans Salesforce (`Task` de sous-type `Call`) | **16 610** |
| Dans Kimatch | **8 786** |
| **Absents de Kimatch** | **7 824** |

Les 8 786 appels présents ont **tous** un compte *et* un contact. Aucune exception. C'est la clé du
diagnostic : l'import précédent n'a gardé que ce qu'il savait rattacher.

---

## Ce que sont les 7 824 appels absents

| Situation dans Salesforce | Appels | Récupérable ? |
|---|---:|---|
| Appel sur un **Lead** (prospection) | **3 570** | Non — voir ci-dessous |
| **Aucun rattachement**, même dans Salesforce | **3 034** | Non, par nature |
| Un compte, pas de contact | 1 102 | 899 oui |
| Un contact | 118 | 111 oui |
| | | **1 010 récupérables** |

### Les 3 570 appels de prospection

C'est le plus gros bloc, et le plus instructif. Ces appels portent sur des **Leads** Salesforce :
des prospects pas encore transformés en compte. Dans Kimatch, un Lead correspond à une **piste**.

Or :

- Kimatch compte **4 pistes** au total ;
- la table `pistes` n'a **aucune colonne d'identifiant Salesforce** ;
- la table `interactions` n'a **aucune colonne `piste_id`**.

Ces appels n'ont donc littéralement nulle part où aller. Les récupérer suppose trois chantiers dans
cet ordre : importer les Leads Salesforce comme pistes, ajouter `interactions.piste_id`, puis
réimporter les appels. C'est un projet, pas un correctif — **d'où la décision à prendre**.

### Les 3 034 sans rattachement

Ni contact, ni compte, ni Lead dans Salesforce non plus. Les importer produirait des lignes
invisibles sur toutes les fiches : une consignation qui n'apparaît nulle part ne consigne rien.

### Les 1 010 récupérables

Prêts à être importés, script en place. Ils appartiennent à des comptes et des contacts qui existent
déjà dans Kimatch.

---

## Comment le rattachement a été retrouvé

Ni `comptes` ni `contacts` ne portent de colonne `id_salesforce` : rien ne permettait, a priori, de
savoir quel compte Salesforce correspond à quel compte Kimatch.

Le dictionnaire a donc été **appris sur les données** : chacune des 31 793 interactions déjà
importées porte à la fois l'identifiant de la `Task` Salesforce et les identifiants Kimatch du compte
et du contact. Le rapprochement se fait sur ces faits.

Résultat : **1 809 contacts** reconnus avec **0 conflit**, et **1 330 comptes** dont 86 pointent vers
deux comptes Kimatch — ceux-là sont écartés plutôt que tranchés au hasard. Même méthode pour les
**8 profils** commerciaux, sans aucune ambiguïté.

Vérification indépendante : sur les 839 « contacts » que les appels absents désignent, **804 sont des
Leads** et les **35 contacts restants existent tous dans Kimatch** (retrouvés par e-mail). Aucun
contact n'est réellement manquant — c'est bien la prospection qui n'a pas été reprise.

---

## Une anomalie de classement, au passage

701 lignes de Kimatch sont de type `APPEL` alors que la `Task` Salesforce correspondante n'est pas de
sous-type `Call`. Sans conséquence visible, mais cela explique pourquoi une simple soustraction de
totaux (16 610 − 9 487 = 7 123) donnait un écart faux : le bon chiffre est 7 824.

---

## Ce qui est prêt, et ce qui attend une décision

**Prêt** — `scripts/importer-appels-salesforce.cjs` importe les 1 010 appels récupérables.
Idempotent (la clé est `source_externe_id`), transactionnel, et réversible : chaque ligne écrite
porte son identifiant Salesforce, la liste est sauvegardée, un `delete` la retire.

```bash
node scripts/importer-appels-salesforce.cjs <dossier-des-exports> --simulation
```

La simulation a été lancée et donne les chiffres ci-dessus. **L'écriture n'a pas été faite** : elle
ajoute 1 010 lignes d'historique client en production.

**À décider par Michel** — les 3 570 appels de prospection. Reprendre les Leads Salesforce comme
pistes est un chantier à part entière ; sans lui ces appels resteront absents.
