-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE PLAN DU JOUR NE CRÉE PLUS DE TÂCHE SANS LE COMMERCIAL
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Matthieu, 06/10/2026 : 20 tâches « Call - Début prospection » créées pour lui ce matin, sans qu'il
-- ait rien demandé. William : « les tâches auto doivent se faire que si Matthieu décide d'intégrer
-- des pistes ou des opportunités dans son pipe du jour, donc c'est une action manuelle, pas
-- automatique chaque matin. »
--
-- ══ CE QUI SE PASSAIT ══
--
-- À la première ouverture du Cockpit, `construire_pipe_du_jour` remplissait le plan jusqu'au
-- plafond (60) : rappels, puis opportunités DORMANTES, puis pistes FROIDES pour combler. Et le
-- déclencheur du 21/09/2026 donnait une tâche à toute cible qui entrait. Résultat mesuré ce matin :
-- 22 tâches pour Matthieu, 56 pour Fabien (de vieilles pistes Google Ads), 9 pour Thomas. Et la
-- boule de neige : les tâches non traitées revenaient le lendemain en retard, et la place restante
-- se comblait de nouvelles pistes froides, chacune avec sa tâche.
--
-- ══ CE QUI CHANGE ══
--
--   1. LE REMPLISSAGE DU MATIN NE CHOISIT PLUS DE PISTES FROIDES NI D'OPPORTUNITÉS DORMANTES. Il ne
--      reprend que ce qui porte déjà une tâche (rappels avec heure, du jour, en retard) et les pistes
--      Google Ads jamais appelées. Les froides et les dormantes, c'est le commercial qui décide de
--      les faire entrer — boutons « Compléter » et « Ajouter » du Cockpit.
--   2. LE DÉCLENCHEUR NE CRÉE PLUS DE TÂCHE QUE POUR UNE ENTRÉE MANUELLE : sources `AJOUT_MANUEL`
--      (depuis ses pistes) et `VIVIER` (depuis le vivier). Une ligne posée par le remplissage du
--      matin ne crée rien.
--   3. LES 94 TÂCHES AUTOMATIQUES JAMAIS TOUCHÉES passent en Annulée — rien n'est supprimé. Celles
--      qu'un commercial a reportées sont gardées : il les a faites siennes.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 · LE DÉCLENCHEUR N'ÉCOUTE PLUS QUE LES ENTRÉES MANUELLES ──
create or replace function public.fn_entree_pipe_ouvre_sa_tache()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  /* Seul un ajout décidé par le commercial ouvre une tâche (William, 06/10/2026). Les sources
     posées par `construire_pipe_du_jour` — INBOUND, RAPPEL_HEURE, RAPPEL_JOUR — n'en créent pas. */
  if new.source in ('AJOUT_MANUEL', 'VIVIER') then
    perform creer_tache_debut_prospection(new.cible_type, new.cible_id, new.profil_id);
  end if;
  return null;
end;
$function$;

-- ── 2 · LE REMPLISSAGE DU MATIN SANS FROIDES NI DORMANTES ──
create or replace function public.construire_pipe_du_jour()
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_moi      uuid := auth.uid();
  v_jour     date := (now() at time zone 'Europe/Paris')::date;
  v_plafond  integer;
  v_deja     integer;
  v_rang     integer;
begin
  if v_moi is null then return 0; end if;

  select coalesce(plafond_pipe_du_jour, 60) into v_plafond from profils where id = v_moi;
  v_plafond := coalesce(v_plafond, 60);

  select count(*), coalesce(max(rang), 0) into v_deja, v_rang
    from pipe_du_jour where profil_id = v_moi and jour = v_jour;
  if v_deja >= v_plafond then return v_deja; end if;

  with
  inbound as (
    select 1 as seau, 'PISTE'::text as cible_type, p.id as cible_id, 'INBOUND'::text as source,
           extract(epoch from p.date_creation)::double precision as tri
      from pistes p
     where p.proprietaire_id = v_moi
       and public.fn_piste_ligne_ouverte(p.actif, p.statut_id)
       and p.source in ('Google Ads avec facture (Inbound)', 'Google Ads sans facture (Inbound)')
       and p.date_premier_appel is null
  ),
  taches as (
    select
      a.date_prevue,
      (a.date_prevue at time zone 'Europe/Paris')::time  as heure,
      (a.date_prevue at time zone 'Europe/Paris')::date  as jour_du,
      case when a.opportunite_id is not null then 'OPPORTUNITE' else 'PISTE' end as cible_type,
      coalesce(a.opportunite_id, a.piste_id)             as cible_id
    from actions a
    join statuts_actions sa on sa.id = a.statut_id
    where a.actif
      and a.responsable_profil_id = v_moi
      and sa.code not in ('TERMINEE', 'ANNULEE')
      and a.date_prevue < (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day')
                            at time zone 'Europe/Paris'
      and (a.opportunite_id is not null or a.piste_id is not null)
      and (a.opportunite_id is null or public.fn_opportunite_est_ouverte(a.opportunite_id))
      and (a.piste_id is null or public.fn_piste_est_ouverte(a.piste_id))
  ),
  rappel_heure as (
    select 2 as seau, t.cible_type, t.cible_id, 'RAPPEL_HEURE'::text as source,
           extract(epoch from t.date_prevue)::double precision as tri
      from taches t
     where t.jour_du = v_jour and t.heure <> '00:00:00'
  ),
  rappel_jour as (
    select 3 as seau, t.cible_type, t.cible_id, 'RAPPEL_JOUR'::text as source,
           extract(epoch from t.date_prevue)::double precision as tri
      from taches t
     where t.jour_du < v_jour or t.heure = '00:00:00'
  ),
  /* LES SEAUX « OPPORTUNITÉ DORMANTE » ET « PISTE FROIDE » SONT PARTIS (06/10/2026) : les faire
     entrer est une décision du commercial, plus un comblement automatique. */
  candidats as (
    select * from inbound
    union all select * from rappel_heure
    union all select * from rappel_jour
  ),
  nouveaux as (
    select * from candidats c
     where not exists (
       select 1 from pipe_du_jour l
        where l.profil_id = v_moi and l.jour = v_jour
          and l.cible_type = c.cible_type and l.cible_id = c.cible_id
     )
  ),
  dedoublonnes as (
    select distinct on (cible_type, cible_id) *
      from nouveaux
     order by cible_type, cible_id, seau, tri nulls last
  ),
  classes as (
    select *, row_number() over (order by seau, tri nulls last, cible_id) as pos
      from dedoublonnes
  )
  insert into pipe_du_jour (profil_id, jour, cible_type, cible_id, rang, source)
  select v_moi, v_jour, c.cible_type, c.cible_id, (v_rang + c.pos)::integer, c.source
    from classes c
   where c.pos <= (v_plafond - v_deja)
      on conflict (profil_id, jour, cible_type, cible_id) do nothing;

  select count(*) into v_deja from pipe_du_jour where profil_id = v_moi and jour = v_jour;
  return v_deja;
end;
$function$;

-- ── 3 · LES TÂCHES AUTOMATIQUES JAMAIS TOUCHÉES S'ANNULENT ──
-- Reconnues par trois traits à la fois : le commentaire posé par `creer_tache_debut_prospection`,
-- une entrée du plan du jour AUTOMATIQUE née au même instant sur la même cible, et aucune
-- modification depuis (une tâche reportée a été prise en main : elle reste).
update public.actions a
   set statut_id = (select id from public.statuts_actions where code = 'ANNULEE'),
       commentaire = a.commentaire || ' — Annulée le 06/10/2026 : le plan du jour ne crée plus de tâche sans le commercial.'
  from public.statuts_actions sa
 where sa.id = a.statut_id and sa.code = 'A_FAIRE'
   and a.actif
   and a.date_realisation is null
   and a.commentaire = 'Créée automatiquement par Kimatch : toute cible du plan du jour porte une tâche.'
   and (a.date_modification is null or a.date_modification <= a.date_creation + interval '1 minute')
   and exists (
     select 1 from public.pipe_du_jour d
      where d.profil_id = a.responsable_profil_id
        and d.ajoute_le = a.date_creation
        and d.source in ('PISTE_FROIDE', 'OPPORTUNITE_DORMANTE', 'INBOUND')
        and ((d.cible_type = 'PISTE' and d.cible_id = a.piste_id)
          or (d.cible_type = 'OPPORTUNITE' and d.cible_id = a.opportunite_id))
   );
