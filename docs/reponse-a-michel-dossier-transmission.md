# Réponse au dossier de transmission KiMatch

**De :** Naoëlle Ghouma
**À :** Michel Obame
**Objet :** Lot 0 — écarts cible / existant, réponses aux questions ouvertes
**Date :** 31 août 2026

---

Michel,

J'ai lu le dossier. Il est clair et directement exploitable : le fait que tu spécifies les statuts,
les automatisations et les critères de recette me permet de comparer ligne à ligne avec ce qui
existe, au lieu d'interpréter.

Voici le **livrable 1 sur 6** — l'audit des écarts — et mes réponses aux **quatre questions dont je
suis responsable**. Chaque chiffre cité vient d'un relevé sur la base de production fait aujourd'hui.

Le détail complet est dans `docs/lot0-ecarts-cible-existant.md`. Ce message en donne la substance en
trois minutes.

---

## Ce qui est déjà en place

Le modèle de données n'est pas à refaire. Les objets de la chaîne existent tous, avec leurs statuts
et leurs liaisons.

**Trois de tes six principes non négociables sont déjà tenus, et vérifiés :**

- **Les statuts résultent des données.** L'étape d'une recommandation est recalculée par un
  déclencheur depuis sa version active — j'ai écrit le banc d'essai cette semaine, 8 scénarios sur 8
  passent. Le statut de vie d'un contrat est déduit de ses dates, vérifié sur 1 565 contrats sur
  1 565 sans un contre-exemple.
- **L'historique distingue l'humain de l'automatique.** 20 tables tracées, **0 ligne muette sur
  122 683**, et une colonne qui nomme le traitement quand ce n'est personne.
- **Aucune perte ni écrasement silencieux.** Traçabilité avant/après complète.

**Et la bascule « Mes dossiers / Équipe » est posée sur les 16 listes**, avec tri et filtres sur les
quatre vues kanban. C'était fait avant de recevoir ton dossier.

Ton vert d'action `#0D7A5F` est d'ailleurs **déjà celui de KiMatch** — la palette ne part pas de zéro.

---

## Le point dur : le suivi de contrat n'existe pas

C'est le plus gros écart du dossier, et de loin.

Aucune table. Ni les huit étapes, ni les onze automatisations datées, ni l'indicateur de santé, ni
les dix rattachements obligatoires. Deux chapitres entiers de ta cible sont à construire.

**Dans ton plan, il est au lot 4 avec Pricing et Requêtes.** Je propose de lui donner **son propre
lot** : c'est un objet métier complet avec son cycle de vie et sa mécanique d'automatisation, pas une
page de plus.

---

## Les quatre réponses

### Quels objets et statuts existent déjà ?

133 tables, dont **39 entièrement vides**. Je les ai documentées la semaine dernière, parce qu'en
lisant le schéma on croit qu'il existe un moteur de calcul tarifaire et un second modèle de
permissions : **ni l'un ni l'autre n'existe.**

Les volumes réels, qui comptent plus que le schéma :

| Objet | Lignes |
|---|---:|
| Comptes / Sites / Compteurs | 2 767 / 6 364 / 7 905 |
| Contrats | 1 600 |
| Signaux | 1 456 |
| Recommandations / Versions | 1 712 / 2 030 |
| Consultations pricing | 3 533 |
| **Pistes** | **4** |
| **Opportunités** | **1** |
| **Requêtes** | **2** |
| **Suivis de contrat** | **inexistant** |

Les trois objets que tu spécifies le plus finement — pistes, opportunités, requêtes — sont
**pratiquement inutilisés**. Le risque n'est pas technique : c'est de développer un parcours que
personne n'emprunte encore.

### Comment versionne-t-on une recommandation aujourd'hui ?

Exactement selon ton modèle : le dossier est durable, la version est l'unité de travail. 2 030
versions sur 1 514 dossiers, une seule courante par dossier, et un déclencheur qui remonte son état
au dossier.

**Un seul écart, mais il touche à la valeur de ce qu'on montre au client.** Tu écris qu'une nouvelle
version « ne supprime ni ne réécrit les précédentes ». La colonne prévue pour ça — `est_figee` —
**vaut `false` sur les 2 030 versions**. Rien n'empêche donc aujourd'hui de modifier une version déjà
présentée. Petit développement, enjeu réel.

### Quel moteur exécute les recalculs horaires ?

**Aucun — et ce n'est pas un oubli technique.** Nos trois tâches planifiées tournent toutes à 3 h du
matin, une fois par jour, parce que **le plan Vercel actuel limite les crons à une exécution
quotidienne**.

Passer à l'heure demande l'un de ces trois chemins :

1. **`pg_cron` chez Supabase** — le recalcul devient une fonction SQL déclenchée en base. C'est ma
   recommandation : aucune dépendance à Vercel, aucune limite de durée, et le calcul vit à côté des
   données qu'il lit. Coût : réécrire la logique en SQL.
2. **Vercel Pro** — crons libres, coût mensuel récurrent. À ton arbitrage.
3. **Un ordonnanceur externe** — gratuit, mais une dépendance de plus à surveiller.

**Avant de choisir, une question.** Un signal naît d'une échéance de contrat : une donnée qui change
au rythme d'une saisie humaine, pas au rythme du marché. Passer de 24 h à 1 h coûte un chantier ;
passer à 4 h coûte le même. **Si le besoin réel est « avant que le commercial arrive le matin »,
c'est déjà le cas aujourd'hui.** Dis-moi ce que l'heure apporte concrètement et je dimensionne en
conséquence.

### Quel environnement de test et quelles données anonymisées ?

Une sandbox Supabase existe, alimentée depuis la production, toujours à sens unique.

**Elle n'était pas utilisable, je l'ai réparée cette semaine.** Sa liste de tables est écrite à la
main : elle en nommait **107 sur 133**. Les 24 manquantes n'étaient pas recopiées, sans erreur ni
avertissement — dont 3 535 rattachements contact-compte, 2 098 liens recommandation-compteur, et
**quatre jeux de statuts entiers**. Répéter un geste dans une sandbox qui a perdu ses tables de
liaison ne prouve rien. Un contrôle empêche désormais la dérive.

**Il reste un manque qui bloque la recette telle que tu la décris :** les données ne sont **pas
anonymisées**. La sandbox est une copie fidèle — vrais clients, vrais contacts, vrais e-mails. Tu
exiges « des données fictives ou anonymisées ». Il faut donc une étape de brouillage dans la recopie,
et c'est un chantier à part entière. **C'est la condition de toute recette faite hors de notre
équipe.**

---

## Ce qui m'empêche de chiffrer, et qui n'est pas technique

Trois constats à mettre sur la table avant d'ouvrir le développement.

**1. Les offres fournisseurs ne sont presque jamais saisies.** Sur 22 versions « En décision »,
**21 n'ont aucune offre**. Sur les clôturées, 1 975 sur 1 983. Le schéma existe, les données non.

Ton chapitre 6 décrit un pricing riche — comparatif, offres disponibles, offres expirées — et
insiste avec raison sur la distinction *« acceptée ne veut pas dire disponible »*. Ce statut
« disponible » n'existe pas chez nous, je peux le créer. Mais **un écran de comparaison ne servira
personne tant que les offres ne sont pas saisies**, et cette question-là n'est pas la mienne.

**2. 549 contrats n'ont pas de fournisseur.** J'ai vérifié dans Salesforce : **il ne le connaît pas
non plus** pour 511 d'entre eux. Ce n'est pas une perte à la reprise, l'information n'a jamais été
saisie nulle part.

**3. Pistes, opportunités et requêtes comptent 4, 1 et 2 lignes.**

Développer les écrans de la cible sans réponse à ces trois points produira des interfaces exactes et
vides. Je préfère te le dire maintenant qu'après le lot 3.

---

## Ce que je propose

**Trois ajustements à ton plan de lots** — le découpage lui-même est bon :

- **Un lot dédié au suivi de contrat**, sorti du lot 4.
- **Traiter la question de la saisie avant celle des écrans**, pour les trois points ci-dessus.
- **Démarrer le lot 1 « Fondations UI » tout de suite.** Il ne dépend d'aucune décision métier :
  navigation en quatre zones, palette, trame d'espacement, gabarits de liste et de fiche en trois
  colonnes. C'est aussi ce qui rend possible la démonstration que tu demandes en sixième livrable.

**Les cinq autres livrables** — schéma d'architecture, découpage chiffré, liste des migrations, plan
de tests et de retour arrière — découlent des arbitrages ci-dessous. Un lot dont on ne connaît pas le
contenu ne s'estime pas honnêtement, et je préfère ne pas te donner un chiffre que je devrais
corriger.

---

## Les six points à trancher en réunion

Dans cet ordre :

1. **Le suivi de contrat** — objet entier à créer. Quelle priorité par rapport au reste ?
2. **Le recalcul horaire** — l'heure est-elle le vrai besoin ? Trois chemins, dont un payant.
3. **Les trois blocages de saisie** — offres fournisseurs, fournisseurs de contrats, objets vides.
   Ce sont les vrais points durs.
4. **Les cinq validations de piste** — nous en avons quatre, et les axes ne recouvrent qu'à moitié
   les tiens. On refond le modèle, ou on aligne le dossier sur l'existant ?
5. **L'anonymisation de la sandbox** — condition de toute recette externe.
6. **Le mode sombre** — il existe et fonctionne dans l'application, ton dossier ne le mentionne pas.
   On le garde ou on l'abandonne ?

Je suis disponible pour la réunion de lancement quand tu veux. Le lot 1 peut démarrer avant, si tu
me donnes le feu vert sur les fondations UI.

Naoëlle
