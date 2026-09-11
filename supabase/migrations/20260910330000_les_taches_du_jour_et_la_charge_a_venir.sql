-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LES TÂCHES DU JOUR, ET LA CHARGE DES TROIS PROCHAINES SEMAINES
--
-- William, 10/09/2026 : une seconde zone sous « Offres du jour », avec un tableau de tâches et une
-- matrice de quinze jours ouvrés à droite.
--
-- ── LE TABLEAU : MES TÂCHES DUES, EN TROIS STATUTS ──
--
--   EN_RETARD    échéance passée
--   DU_JOUR      échéance aujourd'hui, SANS heure choisie
--   PROGRAMMEE   échéance aujourd'hui, AVEC une heure
--
-- « Programmée (pour les tâches du jour avec une heure précise) ». La distinction a un support
-- réel : au 10/09/2026, 443 tâches ouvertes sont à minuit — donc sans heure — et 14 portent une
-- vraie heure. C'est la convention posée le 08/09/2026 quand l'heure est devenue facultative à la
-- saisie : minuit ne veut pas dire « à minuit », il veut dire « pas d'heure ».
--
-- MINUIT SE JUGE À PARIS, PAS EN UTC. La base tourne en UTC, où minuit à Paris vaut 22:00 la veille.
-- Comparer l'heure UTC classerait toutes les tâches sans heure comme « programmées à 22 h ».
--
-- ── L'OBJET PORTEUR : CINQ COLONNES, UNE SEULE RÉPONSE ──
--
-- `actions` porte cinq clés étrangères possibles — piste, opportunité, recommandation, suivi de
-- contrat, requête — dont une seule est renseignée en pratique. On les résout en un couple
-- (type, nom) plutôt que de renvoyer cinq colonnes vides sur six : l'écran affiche une cartouche,
-- pas une matrice de trous.
--
-- L'ORDRE DU `case` EST CELUI DU CYCLE DE VIE, du plus amont au plus aval. Si une tâche portait
-- deux rattachements — rien ne l'interdit en base — c'est le plus avancé qui compte, parce que
-- c'est là que le travail se joue.
--
-- ── LA MATRICE : ON REND LES JOURS, PAS LES JOURS OUVRÉS ──
--
-- La fonction rend le décompte pour les 30 prochains jours calendaires, et c'est VOLONTAIRE :
-- l'écran choisit ensuite les quinze premiers jours ouvrés avec `estJourOuvreFR`, qui connaît déjà
-- les fériés français — Pâques comprise, calculée et non listée.
--
-- Réimplémenter l'algorithme de Meeus en PL/pgSQL aurait créé une seconde vérité sur « quel jour
-- est ouvré », et c'est exactement le genre de doublon qui finit par diverger un lundi de
-- Pentecôte. 30 jours calendaires couvrent toujours 15 jours ouvrés, fériés compris.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create or replace function lister_taches_du_jour()
returns table (
  id            uuid,
  titre         text,
  statut        text,
  type_code     text,
  type_libelle  text,
  porteur_type  text,
  porteur_id    uuid,
  porteur_nom   text,
  contact_id    uuid,
  contact_nom   text,
  date_prevue   timestamptz,
  a_une_heure   boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  jour as (select (now() at time zone 'Europe/Paris')::date as aujourdhui)
  select
    a.id,
    a.titre,
    case
      when (a.date_prevue at time zone 'Europe/Paris')::date < j.aujourdhui then 'EN_RETARD'
      when (a.date_prevue at time zone 'Europe/Paris')::time <> '00:00:00'  then 'PROGRAMMEE'
      else 'DU_JOUR'
    end                                                     as statut,
    ta.code, ta.libelle,
    case
      when r.id  is not null then 'RECOMMANDATION'
      when sc.id is not null then 'SUIVI_CONTRAT'
      when rq.id is not null then 'REQUETE'
      when op.id is not null then 'OPPORTUNITE'
      when pi.id is not null then 'PISTE'
      else 'AUCUN'
    end                                                     as porteur_type,
    coalesce(r.id, sc.id, rq.id, op.id, pi.id)              as porteur_id,
    -- CHAQUE PORTEUR A SON PROPRE CHAMP LISIBLE, relevé dans le schéma le 10/09/2026 : seules les
    -- recommandations ont un `nom`, les requêtes ont un `objet`, les trois autres n'ont que leur
    -- référence. Le repli garde toujours la référence, qui existe partout.
    coalesce(
      r.nom,  r.reference,
      sc.reference,
      rq.objet, rq.reference,
      op.reference,
      pi.reference, pi.contact_nom
    )                                                       as porteur_nom,
    c.id,
    nullif(trim(coalesce(c.prenom, '') || ' ' || coalesce(c.nom, '')), ''),
    a.date_prevue,
    (a.date_prevue at time zone 'Europe/Paris')::time <> '00:00:00'
  from actions a
  join statuts_actions sa on sa.id = a.statut_id
  cross join moi
  cross join jour j
  left join types_actions ta      on ta.id = a.type_action_id
  left join recommandations r     on r.id  = a.recommandation_id and r.actif
  left join suivis_contrats sc    on sc.id = a.suivi_contrat_id
  left join requetes rq           on rq.id = a.requete_id
  left join opportunites op       on op.id = a.opportunite_id and op.actif
  left join pistes pi             on pi.id = a.piste_id and pi.actif
  left join contacts c            on c.id  = a.contact_id
  where a.actif
    and sa.code not in ('TERMINEE', 'ANNULEE')
    and a.responsable_profil_id = moi.profil_id
    and a.date_prevue < (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day')
                          at time zone 'Europe/Paris';
$$;

comment on function lister_taches_du_jour is
  'Mes tâches ouvertes en retard ou dues aujourd''hui, avec leur objet porteur résolu et leur statut (en retard, du jour, programmée). Filtré sur responsable_profil_id = auth.uid().';

-- ── La charge à venir, jour par jour ──
create or replace function compter_charge_a_venir()
returns table (
  jour   date,
  taches integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with moi as (select auth.uid() as profil_id),
  depart as (select (now() at time zone 'Europe/Paris')::date + 1 as premier)
  select d::date, count(a.id)::integer
  from depart
  cross join generate_series(depart.premier, depart.premier + 29, interval '1 day') d
  left join actions a
    on (a.date_prevue at time zone 'Europe/Paris')::date = d::date
   and a.actif
   and a.responsable_profil_id = (select profil_id from moi)
   and exists (select 1 from statuts_actions sa
               where sa.id = a.statut_id and sa.code not in ('TERMINEE', 'ANNULEE'))
  group by d::date
  order by d::date;
$$;

comment on function compter_charge_a_venir is
  'Le nombre de mes tâches ouvertes prévues chaque jour, sur 30 jours calendaires à partir de demain. L''écran retient les 15 premiers jours ouvrés — les fériés sont écartés côté application, par estJourOuvreFR.';

grant execute on function lister_taches_du_jour() to authenticated;
grant execute on function compter_charge_a_venir() to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE APRÈS APPLICATION
--
--   select statut, count(*) from lister_taches_du_jour() group by 1;
--   select * from compter_charge_a_venir() where taches > 0;
--
--   -- Sans filtre d'utilisateur, au 10/09/2026 : la pire journée à venir est celle de Matthieu,
--   -- avec 47 tâches ; la moyenne tourne autour de 12.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
