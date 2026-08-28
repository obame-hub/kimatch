-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LA MIGRATION DES DONNÉES VERS LES NOUVEAUX STATUTS
--
-- Suite de 20260828100000, qui a posé les codes. Ici on déplace les lignes existantes, puis on
-- désactive les anciens codes.
--
-- L'ORDRE COMPTE : versions d'abord, recommandations ensuite. Le statut du dossier se déduit de sa
-- dernière version — le calculer avant d'avoir migré les versions donnerait un résultat faux, et il
-- faudrait le refaire.
--
-- ══ CE QUE CETTE MIGRATION DÉPLACE, MESURÉ AVANT ══
--
--   VERSIONS (2 030)
--     EN_CONSTRUCTION  19  →  En construction
--     DISPONIBLE        6  →  Disponible
--     EN_DECISION      22  →  En décision
--     ACCEPTEE        718  →  Clôturée, résultat Acceptée
--     REFUSEE           1  →  Clôturée, résultat Refusée
--     EXPIREE       1 255  →  Clôturée, résultat Expirée
--     REMPLACEE         9  →  Clôturée, résultat Expirée
--
--   « Remplacée » n'existe plus dans le modèle de Michel. Une version remplacée par une plus récente
--   n'est plus valable : Expirée est le seul résultat qui dise cela sans en inventer un septième.
--
--   CONSULTATIONS (3 533 dont 3 492 avec au moins un suivi)
--     ENVOYEE          1 901  →  Demande envoyée
--     ACCUSE_RECEPTION   151  →  Demande envoyée   (la balle est toujours chez le fournisseur)
--     RELANCEE             5  →  Demande envoyée   (idem)
--     RECUE            1 368  →  Demande acceptée  (voir ci-dessous)
--     ACCEPTEE            10  →  Demande acceptée
--     REFUSEE             57  →  Demande refusée
--
--   POURQUOI « OFFRE REÇUE » DEVIENT « DEMANDE ACCEPTÉE ». Michel fond les deux événements :
--   « Lorsque le fournisseur accepte et transmet sa proposition, l'offre passe à Disponible. »
--   Accepter de coter et envoyer le prix sont un seul geste dans son modèle. Ce sont ces 1 368 lignes
--   qui règlent son bug du Pricing : elles quittent « En attente fournisseur » pour « Offres reçues ».
--
--   OFFRES (67)
--     EN_ATTENTE  53  →  EN_ATTENTE
--     RECUE        6  →  DISPONIBLE
--     ACCEPTEE     6  →  DISPONIBLE
--     REFUSEE      2  →  INDISPONIBLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. LES VERSIONS
-- ════════════════════════════════════════════════════════════════════════════════════════════════

with cible as (
  select
    v.id,
    case
      when a.code in ('EN_CONSTRUCTION', 'BROUILLON', 'A_VALIDER')      then 'EN_CONSTRUCTION'
      when a.code in ('DISPONIBLE', 'VALIDEE')                          then 'DISPONIBLE'
      when a.code in ('EN_DECISION', 'PRESENTEE')                       then 'EN_DECISION'
      else 'CLOTUREE'
    end as code_cible,
    case
      when a.code = 'ACCEPTEE'                                          then 'ACCEPTEE'
      when a.code = 'REFUSEE'                                           then 'REFUSEE'
      when a.code in ('EXPIREE', 'REMPLACEE', 'ARCHIVEE')               then 'EXPIREE'
      -- Une version sans statut lisible est clôturée sans résultat connu : on n'invente pas une fin.
      else null
    end as resultat_cible
  from public.versions_recommandation v
  left join public.statuts_versions_recommandation a on a.id = v.statut_version_id
)
update public.versions_recommandation v
   set statut_version_id = n.id,
       resultat = c.resultat_cible
  from cible c
  join public.statuts_versions_recommandation n on n.code = c.code_cible
 where v.id = c.id
   and (v.statut_version_id is distinct from n.id or v.resultat is distinct from c.resultat_cible);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. LES CONSULTATIONS
--
-- On réécrit les ÉVÉNEMENTS DE SUIVI, pas un statut porté par la consultation : c'est l'historique
-- qui fait foi, et la vue du Pricing lit le dernier événement. Réécrire le passé n'est pas anodin —
-- mais laisser des événements pointant vers des statuts désactivés le serait davantage : le dernier
-- événement d'une consultation deviendrait illisible, et la consultation disparaîtrait des colonnes.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update public.suivis_consultations_fournisseurs f
   set statut_id = n.id
  from public.statuts_consultations_fournisseurs a,
       public.statuts_consultations_fournisseurs n
 where f.statut_id = a.id
   and n.code = case
         when a.code in ('ENVOYEE', 'ACCUSE_RECEPTION', 'RELANCEE', 'INFOS_DEMANDEES') then 'ENVOYEE'
         when a.code in ('ACCEPTEE', 'RECUE', 'ACCEPTEE_PARTIELLE')                     then 'ACCEPTEE'
         when a.code = 'REFUSEE'                                                        then 'REFUSEE'
         else a.code
       end
   and n.id <> a.id;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. LES OFFRES
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update public.offres_fournisseurs
   set statut = case statut
         when 'RECUE'    then 'DISPONIBLE'
         when 'ACCEPTEE' then 'DISPONIBLE'
         when 'REFUSEE'  then 'INDISPONIBLE'
         else 'EN_ATTENTE'
       end
 where statut not in ('EN_ATTENTE', 'DISPONIBLE', 'INDISPONIBLE');

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. LES RECOMMANDATIONS — déduites, jamais recopiées
--
-- La règle de Michel, mot pour mot :
--   · Aucune version                                              → Brouillon
--   · Dernière version En construction, Disponible ou En décision → Active
--   · Dernière version Clôturée, mais recommandation non terminée → À réactiver
--   · Résultat gagné, perdu ou abandonné                          → Clôturée
--
-- « Recommandation terminée » se lit sur `finalite_cloture`, le champ qui portait déjà ce fait, ou à
-- défaut sur l'ancienne étape terminale. Sans ce repli, les 1 605 dossiers déjà clos sans finalité
-- renseignée basculeraient tous en « À réactiver ».
--
-- LA DERNIÈRE VERSION est celle marquée `version_actuelle`, et à défaut le plus grand numéro. Trier
-- sur le numéro seul suffirait presque, mais `version_actuelle` est le fait que l'application écrit :
-- c'est lui qui doit primer, sinon l'écran et le calcul se contrediraient.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

with derniere as (
  select distinct on (v.recommandation_id)
    v.recommandation_id,
    s.code as statut_version
  from public.versions_recommandation v
  left join public.statuts_versions_recommandation s on s.id = v.statut_version_id
  order by v.recommandation_id, v.version_actuelle desc nulls last, v.numero_version desc nulls last
),
cible as (
  select
    r.id,
    case
      when d.recommandation_id is null then 'BROUILLON'
      when d.statut_version in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION') then 'ACTIVE'
      when r.finalite_cloture is not null then 'CLOTUREE'
      when a.code in ('ACCEPTEE', 'REFUSEE', 'ABANDONNEE') then 'CLOTUREE'
      else 'A_REACTIVER'
    end as code_cible
  from public.recommandations r
  left join derniere d on d.recommandation_id = r.id
  left join public.etapes_recommandation a on a.id = r.etape_id
)
update public.recommandations r
   set etape_id = n.id
  from cible c
  join public.etapes_recommandation n on n.code = c.code_cible
 where r.id = c.id
   and r.etape_id is distinct from n.id;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 5. DÉSACTIVER LES ANCIENS CODES
--
-- Après la migration seulement : les désactiver avant aurait fait pointer des lignes vers des codes
-- inactifs le temps de la transaction, et un `join ... where actif` intermédiaire les aurait perdues.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

update public.etapes_recommandation set actif = false
 where code not in ('BROUILLON', 'ACTIVE', 'A_REACTIVER', 'CLOTUREE');

update public.statuts_versions_recommandation set actif = false
 where code not in ('EN_CONSTRUCTION', 'DISPONIBLE', 'EN_DECISION', 'CLOTUREE');

update public.statuts_consultations_fournisseurs set actif = false
 where code not in ('ENVOYEE', 'ACCEPTEE', 'REFUSEE');

commit;
