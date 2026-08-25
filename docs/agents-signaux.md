# Les agents de Kimatch — ce qui existe, ce qui manque, trois montages possibles

Préparé le 25/08/2026, d'après l'appel de Michel de 16 h 27. À relire avec lui avant de coder.

## Ce qu'il a décrit

Sa phrase de départ : **« l'élément de base, c'est toujours le contact ou la piste, parce que c'est
la personne qu'on contacte »**. Tout le reste en découle.

Deux agents, et le signal comme point de rencontre :

| Agent | Ce qu'il surveille | Ce qu'il produit |
|---|---|---|
| **Acquisition de pistes** | les pistes non qualifiées | un signal « piste potentiellement à transformer » |
| **Patrimoine** | la donnée des contacts déjà en portefeuille | en nettoyant, il met à jour une échéance — et **cette mise à jour déclenche elle-même un signal** |

Sa règle de répartition, qu'elle a formulée et qu'il a validée : **si le contact existe déjà et
n'est pas une piste, c'est l'agent patrimoine ; les pistes sont à l'agent d'acquisition.**

Et le troisième producteur de signaux existe déjà : le **balayage des échéances**, livré le
24/08 (`api/signaux/echeances.ts`, cron à 3 h 30, un signal par contact, horizon 12 mois).

Les pistes **ne rejoignent pas** le patrimoine — elle a tranché (« c'est un objet qui bouge ») et il
a suivi. Ce sont les **signaux** qui s'élargissent, pas le patrimoine.

## Deux blocages de schéma, à régler avant d'écrire une ligne d'agent

Vérifié en base le 25/08 :

1. **`signaux.site_id` est NOT NULL.** Un signal accroché à une piste n'a pas de site — la piste
   n'en a pas encore. L'insertion échouerait.
2. **`signaux` n'a pas de `piste_id`.** Il a `contact_id` (ajouté le 24/08), `compteur_id`,
   `contrat_id`, `recommandation_id` — mais rien pour une piste.

La migration correspondante, à faire valider par Michel avant de l'appliquer :

```sql
begin;
alter table public.signaux alter column site_id drop not null;
alter table public.signaux add column piste_id uuid references public.pistes(id);
-- Un signal doit s'accrocher à quelqu'un : un contact, ou une piste. Jamais à rien.
alter table public.signaux add constraint signaux_accroche_a_quelquun
  check (contact_id is not null or piste_id is not null or site_id is not null);
commit;
```

La contrainte est le point important : sans elle, on ouvre la porte à des signaux orphelins, et
c'est exactement ce que sa règle interdit.

## Trois montages, du plus sûr au plus autonome

### 1. Déterministe, sans IA — ce qui tourne déjà

Un cron lit la base, applique une règle écrite, insère les signaux manquants. Aucun modèle.

- **Pour quoi :** l'échéance, la donnée manquante, le contrat sans fournisseur. Tout ce qui se
  décide par une comparaison de dates ou un `is null`.
- **Ce qu'on y gagne :** auditable ligne par ligne, rejouable sans doublon (`cle_generation` a un
  index unique partiel), coût nul.
- **Ce qu'on n'y gagne pas :** aucune capacité à juger. Il ne saura jamais dire si *cette* piste
  vaut un appel.

### 2. Déterministe pour trier, IA pour qualifier — le montage que je recommande en premier

Le cron sélectionne les candidats par une règle (une piste sans contact depuis 30 jours, un
compteur dont l'échéance est incohérente), et le modèle n'intervient **que sur les candidats
retenus**, pour rédiger la qualification et proposer la prochaine action.

- **Pourquoi celui-là :** le volume traité par le modèle est borné par la règle, donc le coût et le
  risque le sont aussi. Et si le modèle se tait ou se trompe, le signal existe quand même — il est
  juste moins bien rédigé.
- **Le garde-fou :** le modèle **écrit du texte, il n'écrit pas de décision.** Il ne change ni le
  statut, ni la date d'échéance, ni le contact. Ce que Michel appelle « nettoyer la donnée » reste
  une proposition qu'un humain valide, au moins au début.

### 3. Agent à la demande — le plus facile à faire adopter

Pas de cron : le commercial ouvre une piste et demande « qualifie-la ». L'agent lit, cherche,
propose, il valide.

- **Pourquoi c'est utile même si ce n'est pas ce qu'il a demandé :** c'est le seul montage où
  l'agent se trompe **devant** quelqu'un. Trois semaines de ça, et on saura ce qu'il faut
  automatiser — et surtout ce qu'il ne faut pas.

## Les règles à tenir, quel que soit le montage

- **Idempotence par la base, pas par le code.** `signaux.cle_generation` + index unique partiel :
  rejouer un agent n'insère rien de plus. C'est ce qui a permis de rejouer la génération des
  échéances avec zéro doublon.
- **Toute écriture automatique se signe.** `signaux.origine` vaut déjà `MANUEL` / `AUTOMATIQUE` /
  `IMPORT`. Un signal dont on ne sait pas qui l'a créé est un signal qu'on ne peut pas retirer.
- **Répétition à blanc obligatoire.** Le script des échéances tourne en `--simulation` par défaut :
  il dit ce qu'il ferait, on lit, puis on l'exécute. Aucun agent ne devrait écrire en production
  sans être passé par là.
- **Un interrupteur.** Un agent qui déraille à 3 h du matin doit pouvoir être coupé sans
  déploiement — un drapeau en base, lu à chaque passage.
- **Un signal par personne, pas par objet.** Sa réponse du 24/08 : 1 065 compteurs à échéance
  appartiennent à 593 contacts. Le commercial appelle une personne.

## Ce qu'il faut lui demander avant de commencer

1. L'agent patrimoine **corrige** la donnée, ou **propose** une correction qu'on valide ?
2. Une piste qualifiée par l'agent devient-elle un signal, ou attend-elle l'appel du commercial ?
3. À quelle heure les agents tournent (le balayage des échéances est à 3 h 30) ?
4. Où va ce que l'agent trouve mais ne sait pas trancher — un signal « à vérifier », ou une file à
   part ?
